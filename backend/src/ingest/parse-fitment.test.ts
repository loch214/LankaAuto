import { describe, it, expect } from 'vitest';
import { parseFitment } from './parse-fitment.js';

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
