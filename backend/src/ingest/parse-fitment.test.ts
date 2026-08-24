import { describe, it, expect } from 'vitest';
import { parseFitment } from './parse-fitment.js';
import { GMB_UJOINT_ROWS } from './__fixtures__/gmb-ujoint-rows.js';

describe('parseFitment — slash is not a separator', () => {
  it('splits CORONA/CARINA into two models', () => {
    expect(parseFitment('CORONA/CARINA')).toEqual([
      { type: 'model', canonical: 'CORONA', raw: 'CORONA' },
      { type: 'model', canonical: 'CARINA', raw: 'CARINA' },
    ]);
  });

  it('keeps T/ACE and L/ACE whole — the slash is inside the name', () => {
    expect(parseFitment('T/ACE,L/ACE')).toEqual([
      { type: 'model', canonical: 'TOYOACE', raw: 'T/ACE' },
      { type: 'model', canonical: 'LITEACE', raw: 'L/ACE' },
    ]);
  });
});

describe('parseFitment — one column, five kinds of thing', () => {
  it('separates a model from three engine codes', () => {
    expect(parseFitment('DYNA 15B/SO5C/JO5C')).toEqual([
      { type: 'model', canonical: 'DYNA', raw: 'DYNA' },
      { type: 'engine', canonical: '15B', raw: '15B' },
      { type: 'engine', canonical: 'S05C', raw: 'SO5C' },
      { type: 'engine', canonical: 'J05C', raw: 'JO5C' },
    ]);
  });

  it('canonicalizes a source typo while keeping the raw text', () => {
    expect(parseFitment('HI-LUC,LN85 4WD')).toEqual([
      { type: 'model', canonical: 'HILUX', raw: 'HI-LUC' },
      { type: 'chassis', canonical: 'LN85', raw: 'LN85' },
      { type: 'body', canonical: '4WD', raw: '4WD' },
    ]);
  });

  it('matches a multi-word surface form as one span', () => {
    expect(parseFitment('STEERING JOINT')).toEqual([
      { type: 'product_type', canonical: 'STEERING JOINT', raw: 'STEERING JOINT' },
    ]);
  });

  it('handles a row with no model at all', () => {
    expect(parseFitment('4M40/INTECOOLER')).toEqual([
      { type: 'engine', canonical: '4M40', raw: '4M40' },
      { type: 'unknown', canonical: 'INTECOOLER', raw: 'INTECOOLER' },
    ]);
  });
});

describe('parseFitment — coverage over the real corpus', () => {
  // PLAN.md §10 wants the run report to print the rule / LLM / flagged split.
  // This is that metric, asserted as a floor rather than printed, so the
  // lexicon cannot silently regress. The threshold is deliberately not 100%:
  // some residue is genuine (INTECOOLER is a component qualifier, not a
  // fitment term) and belongs in the LLM fallback.
  it('places at least 90% of tokens by rule alone', () => {
    const spans = GMB_UJOINT_ROWS.flatMap((row) => parseFitment(row.fitment));
    const unknown = spans.filter((s) => s.type === 'unknown');
    const coverage = (spans.length - unknown.length) / spans.length;

    if (coverage < 0.9) {
      console.log('unresolved:', [...new Set(unknown.map((s) => s.raw))].sort());
    }
    expect(coverage).toBeGreaterThanOrEqual(0.9);
  });

  it('never returns an empty span list for a non-empty row', () => {
    for (const row of GMB_UJOINT_ROWS) {
      expect(parseFitment(row.fitment).length).toBeGreaterThan(0);
    }
  });
});

describe('parseFitment — boundary checking, not just literal matching', () => {
  // ELF is a prefix of ELF150/ELF250, declared shortest-first in lexicon.ts
  // on purpose. This does NOT test the longest-first sort (verified by
  // mutation: removing that sort leaves this test green) — it tests that
  // isBoundary rejects a bare ELF match here, because ELF150's '1' is not a
  // separator. The sort's own job is documented in parse-fitment.ts and is
  // not yet exercised by any case in this corpus.
  it('matches ELF150 whole, not as ELF + residue 150', () => {
    expect(parseFitment('ELF150')).toEqual([
      { type: 'model', canonical: 'ELF150', raw: 'ELF150' },
    ]);
  });

  it('still matches bare ELF on its own', () => {
    expect(parseFitment('ELF,NKR')).toEqual([
      { type: 'model', canonical: 'ELF', raw: 'ELF' },
      { type: 'chassis', canonical: 'NKR', raw: 'NKR' },
    ]);
  });
});
