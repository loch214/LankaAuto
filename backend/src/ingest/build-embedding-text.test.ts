import { describe, expect, it } from 'vitest';
import { buildEmbeddingText, parseEmbeddingAttributes, type EmbeddingTextInput } from './build-embedding-text.js';

const base: EmbeddingTextInput = {
  rawName: 'TOYOTA COROLLA',
  partNumber: 'GUT11',
  brandName: 'GMB',
  categoryName: 'U-Joints',
  attributes: { make: 'TOYOTA', model: [], chassisCode: [], engine: [], body: [], inlineMake: [], fuel: [] },
  fitmentVehicles: [],
};

describe('buildEmbeddingText', () => {
  it('includes brand, category, make, raw name, and part number', () => {
    const text = buildEmbeddingText(base);
    expect(text).toContain('GMB');
    expect(text).toContain('U-Joints');
    expect(text).toContain('TOYOTA');
    expect(text).toContain('TOYOTA COROLLA');
    expect(text).toContain('GUT11');
  });

  it('describes resolved fitment vehicles, chassis code in parens', () => {
    const text = buildEmbeddingText({
      ...base,
      fitmentVehicles: [{ make: 'TOYOTA', model: 'HI-LUC', chassisCode: 'LN85' }],
    });
    expect(text).toContain('TOYOTA HI-LUC (LN85)');
  });

  it('describes a fitment vehicle with no chassis code without empty parens', () => {
    const text = buildEmbeddingText({
      ...base,
      fitmentVehicles: [{ make: 'AUSTIN', model: 'LD', chassisCode: null }],
    });
    expect(text).toContain('AUSTIN LD');
    expect(text).not.toContain('()');
  });

  // Real row: GU1638, "STEERING JOINT" with a blank make cell in the source
  // PDF (docs/01-source-profile-gmb-ujoint.md). No brand-column make, no
  // fitments, no attribute spans — must not crash and must still produce
  // something a query could plausibly match against ("steering joint").
  it('handles a part with no make, no fitments, and no attribute spans', () => {
    const text = buildEmbeddingText({
      rawName: 'STEERING JOINT',
      partNumber: 'GU1638',
      brandName: 'GMB',
      categoryName: 'Steering Joints',
      attributes: { make: null, model: [], chassisCode: [], engine: [], body: [], inlineMake: [], fuel: [] },
      fitmentVehicles: [],
    });
    expect(text).toContain('Steering Joints');
    expect(text).toContain('STEERING JOINT');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });

  it('handles a null brand and a null part number without literal "null" in the text', () => {
    const text = buildEmbeddingText({ ...base, brandName: null, partNumber: null });
    expect(text).not.toContain('null');
  });

  // Real row: GU2000, make=ISUZU, inlineMake=['BMC'] (a second make-like
  // token found inside the fitment text itself, not the dedicated column).
  // Both should surface, deduplicated, not doubled.
  it('merges attributes.make and attributes.inlineMake without duplicating a repeated make', () => {
    const text = buildEmbeddingText({
      ...base,
      rawName: 'ISUZU BMC LORRY',
      attributes: {
        make: 'ISUZU',
        model: [],
        chassisCode: [],
        engine: [],
        body: ['LORRY'],
        inlineMake: ['BMC', 'ISUZU'],
        fuel: [],
      },
    });
    expect(text).toContain('ISUZU');
    expect(text).toContain('BMC');
    expect(text.match(/ISUZU/g)?.length).toBe(2); // once in "for ISUZU", once in the raw name
  });

  it('folds remaining attribute spans (model, chassis, engine, body, fuel) into one sentence', () => {
    const text = buildEmbeddingText({
      ...base,
      attributes: {
        make: 'TOYOTA',
        model: ['DYNA'],
        chassisCode: ['LN85'],
        engine: ['15B'],
        body: ['CAB'],
        inlineMake: [],
        fuel: ['DIESEL'],
      },
    });
    expect(text).toContain('model DYNA');
    expect(text).toContain('chassis code LN85');
    expect(text).toContain('engine 15B');
    expect(text).toContain('body type CAB');
    expect(text).toContain('fuel DIESEL');
  });

  it('deduplicates repeated fitment descriptions (same vehicle linked twice)', () => {
    const text = buildEmbeddingText({
      ...base,
      fitmentVehicles: [
        { make: 'MITSUBISHI', model: 'CANTER', chassisCode: null },
        { make: 'MITSUBISHI', model: 'CANTER', chassisCode: null },
      ],
    });
    const occurrences = text.match(/MITSUBISHI CANTER/g)?.length ?? 0;
    expect(occurrences).toBe(1);
  });

  it('parseEmbeddingAttributes reads a real ingester-shaped JSON blob', () => {
    const parsed = parseEmbeddingAttributes({
      make: 'ISUZU',
      model: [],
      chassisCode: [],
      engine: [],
      body: ['LORRY'],
      inlineMake: ['BMC'],
      fuel: [],
    });
    expect(parsed.make).toBe('ISUZU');
    expect(parsed.body).toEqual(['LORRY']);
    expect(parsed.inlineMake).toEqual(['BMC']);
  });

  it('parseEmbeddingAttributes degrades malformed JSON to empty attributes instead of throwing', () => {
    expect(parseEmbeddingAttributes(null)).toEqual({});
    expect(parseEmbeddingAttributes('not an object')).toEqual({});
    expect(parseEmbeddingAttributes(['array', 'not', 'object'])).toEqual({});
    expect(parseEmbeddingAttributes(42)).toEqual({});
  });

  it('parseEmbeddingAttributes drops non-string entries from an attribute array instead of crashing', () => {
    const parsed = parseEmbeddingAttributes({ model: ['DYNA', 42, null, 'HIACE'] });
    expect(parsed.model).toEqual(['DYNA', 'HIACE']);
  });

  it('never produces an empty string for a part with only a raw name', () => {
    const text = buildEmbeddingText({
      rawName: 'X',
      partNumber: null,
      brandName: null,
      categoryName: 'Y',
      attributes: {},
      fitmentVehicles: [],
    });
    expect(text.length).toBeGreaterThan(0);
  });
});
