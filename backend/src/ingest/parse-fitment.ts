import { LEXICON, type SpanType } from './lexicon.js';

export interface FitmentSpan {
  readonly type: SpanType;
  /** The lexicon's canonical form, or the raw text when type is 'unknown'. */
  readonly canonical: string;
  /** Exactly as it appeared in the source. Never discarded. */
  readonly raw: string;
}

interface Surface {
  readonly surface: string;
  readonly canonical: string;
  readonly type: SpanType;
}

/**
 * All lexicon surface forms, longest first.
 *
 * `T/ACE` and `CORONA/CARINA` cannot be told apart by any rule about the
 * slash character — one is a name, the other is a separator between two
 * names. What resolves both is `T/ACE` being a registered surface form that
 * `isBoundary` matches as a whole, while `CORONA/CARINA` has no such entry,
 * so `CORONA` matches alone and the slash falls through to the splitter.
 *
 * The length sort here is NOT what that distinction rests on — `isBoundary`
 * already rejects a shorter match that doesn't end on a separator (`ELF`
 * cannot match inside `ELF150`, sorted or not, because the char after it is
 * `1`). The sort earns its keep in the narrower case of two DIFFERENT-length
 * surfaces that are BOTH boundary-valid from the same start position — e.g.
 * a future lexicon with both a standalone `STEERING` entry and
 * `STEERING JOINT`, where the space after `STEERING` is itself a boundary.
 * Not exercised by the current corpus; kept as the correct general rule
 * rather than something narrower that happens to work today.
 */
const SURFACES: readonly Surface[] = LEXICON.flatMap((entry) =>
  entry.surfaces.map((surface) => ({
    surface,
    canonical: entry.canonical,
    type: entry.type,
  })),
).sort((a, b) => b.surface.length - a.surface.length);

/**
 * Separators BETWEEN terms. Note the hyphen is absent: `HI-LUX` is one term.
 * A slash is a separator only where no lexicon entry claims it first.
 */
const SEPARATOR = /[,\s/]/;

function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return SEPARATOR.test(text[index] as string);
}

/** Uppercase and collapse runs of whitespace. Punctuation is left alone. */
function normalizeFitment(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Splits a raw fitment string into typed spans.
 *
 * Deterministic and pure — no LLM. Anything it cannot place comes back as an
 * `unknown` span, which is what the LLM fallback is later given, and what the
 * rule-vs-LLM split in the run report is counted from.
 */
export function parseFitment(raw: string): FitmentSpan[] {
  const text = normalizeFitment(raw);
  const spans: FitmentSpan[] = [];
  let i = 0;

  while (i < text.length) {
    if (SEPARATOR.test(text[i] as string)) {
      i += 1;
      continue;
    }

    const matched = SURFACES.find(
      ({ surface }) =>
        text.startsWith(surface, i) &&
        isBoundary(text, i - 1) &&
        isBoundary(text, i + surface.length),
    );

    if (matched) {
      spans.push({
        type: matched.type,
        canonical: matched.canonical,
        raw: text.slice(i, i + matched.surface.length),
      });
      i += matched.surface.length;
      continue;
    }

    // No entry claims this position: consume up to the next separator and
    // hand it on as unparsed residue.
    let end = i;
    while (end < text.length && !SEPARATOR.test(text[end] as string)) end += 1;
    const residue = text.slice(i, end);
    spans.push({ type: 'unknown', canonical: residue, raw: residue });
    i = end;
  }

  return spans;
}
