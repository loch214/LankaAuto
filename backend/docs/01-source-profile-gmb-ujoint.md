# Source profile — GMB U-Joint price list

**Source document:** `GMB U JOINT-5.pdf` — *GMB-U/JOINT-JAPAN PRICE LIST*
**Supplier:** LAKSHMAN MOTOR HOUSE (PVT) LTD
**Manufacturer brand:** GMB (Japan)
**Price list date:** 2024-07-26
**Rows:** 62 across 2 pages
**Profiled:** 2026-08-24, before the parser was written

This document exists to justify the lexicon. Every special case in
`src/ingest/lexicon/` should be traceable to an observation here. If you are
about to "simplify" one of those special cases, read this first — most of them
look arbitrary and are not.

---

## 1. Two organisations on the page — do not conflate

`LAKSHMAN MOTOR HOUSE (PVT) LTD` is the **supplier/distributor**.
`GMB` is the **manufacturer brand**.

They appear in the same header block. `brands.name` is GMB. The supplier is a
separate concept (not yet modelled) and will matter as soon as a second
supplier sells the same GMB part.

## 2. Structure

No header row exists in the document. The table starts directly at `GUT11`.
**Columns are positional only** — Zod validates a positional tuple, not a
named object.

| Col | Meaning | Notes |
|---|---|---|
| 1 | Manufacturer part code | Always present. Unique within this file (§4). |
| 2 | **Vehicle make** | *Not* the parts brand. Nullable — see `GU 1638`. |
| 3 | Fitment string | Mixed semantics — see §5. |
| 4 | *(layout artifact)* | Populated in exactly 1 of 62 rows. **Not a field.** |
| 5 | Price | `2,460.00` — comma thousands separator, trailing whitespace. |

### Column 4 is not a column

One row uses it:

```
GUT 21 | TOYOTA | HIACE,LH113 | CAB | 4,120.00
```

That is the fitment string overflowing its cell, not a distinct "body type"
field. Modelling it as a column yields one populated cell out of 62 and a
meaningless field forever. **Concatenate columns 3..n-1 into one fitment
string.**

### Make is nullable, and this argues for cell-wise extraction

```
GU 1638 | (blank) | STEERING JOINT | 3,020.00
```

Flattened to text, that row reads `GU 1638 STEERING JOINT 3,020.00`. A
positional whitespace split assigns `STEERING` as the make — silent, plausible,
wrong.

**Extract table cells, never the flattened text line.** Any PDF pipeline that
flattens first is lossy in a way that produces confident bad data rather than
an error.

## 3. Part type is NOT file-level metadata

The file is titled `GMB-U/JOINT-JAPAN`, but the last three rows are
**steering joints**, set off in their own table block on page 2:

```
GU 1538 | MITSUBISHI | STEERING JOINT | 3,020.00
GU 1638 |            | STEERING JOINT | 3,020.00
GU 1948 | ISUZU      | STEERING JOINT | 4,840.00
```

Brand and country of origin come from file metadata. **Part type must stay
row-derivable**, because the file title is wrong for 3 of 62 rows.

## 4. `source_key` — verified, not assumed

`(brand, normalized_code)`. Verified mechanically over this file:

```
raw rows:      62
raw distinct:  62
norm distinct: 62   (after stripping internal spaces)
collisions:    none
```

The key deliberately **excludes the file name and the price-list date**, so
re-ingesting the next GMB list *updates* these rows rather than duplicating
them. That is the Milestone 1B checkpoint ("run twice, zero duplicates").

### Code normalization rules

Internal whitespace is inconsistent in the source: `GUT11` vs `GUT 12`,
`GUKO4` vs `GUKO 12`, `GUMZ 1` vs `GUMZ 9`.

- **Strip** internal spaces.
- **Preserve** `/` — `GU 7280/4` is one code.
- **Preserve** alphabetic suffixes — `GU 1000 HD` → `GU1000HD`.

Do **not** strip general punctuation. See §6.

## 5. Fitment strings mix five semantic categories

This is why the lexicon must be **typed** — each entry declares what kind of
thing it is, and the extractor emits typed spans rather than one "model" string.

| Category | Examples from this file |
|---|---|
| Model name | `COROLLA`, `HIACE`, `PAJERO`, `NAVARA`, `DELICA`, `BONGO`, `CARAVAN` |
| Chassis / body code | `LH113`, `B210/B310`, `U61`, `D21`, `B2200`, `ELF250`, `DA120` |
| Engine code | `15B`, `S05C`, `J05C`, `4M40`, `4HL1`, `R2`, `RF`, `SL`, `TF`, `TM` |
| Body style / drivetrain | `CAB`, `D/CAB`, `VAN`, `TRUCK`, `LORRY`, `JEEP`, `TIPPER`, `4WD` |
| Product type | `STEERING JOINT` |

Rows that break the naive "column 3 = model" assumption:

- `GUT 28 | TOYOTA | DYNA 15B/SO5C/JO5C` — model + three engine codes
- `GUM 99 | MITSUBISHI | 4M40/INTECOOLER` — **no model at all**; engine code + component
- `GUIS 67 | ISUZU | LORRY/TIPER` — two body styles, no model
- `GUKO 12 | KOMATSU | D30` — a bulldozer, not a road vehicle

## 6. Separators are inconsistent — do not blanket-split

Three separators are in use: comma, slash, and bare space.

Slash means "or" **sometimes**:

- `CORONA/CARINA` — two models ✅ split
- `B210/B310` — two chassis codes ✅ split

Slash is **inside a single token** other times:

- `T/ACE` — Toyoace ❌ do not split
- `L/ACE` — Liteace ❌ do not split
- `D/CAB` — double cab ❌ do not split
- `GU 7280/4` — a **part code** ❌ do not split

Space and comma are equally unreliable:

- `TRUCK  SL,TF,TM` — double space, then commas
- `TRUCK,B2200 TM TF` — comma, then space-separated engine codes

**Required order: longest-match against the lexicon first, split only the
residue.** Splitting on `/` before lookup destroys `T/ACE` and `GU 7280/4`.

This also means PLAN.md §4 step 2's "strip punctuation noise" must be
narrowed — punctuation here is load-bearing.

## 7. Source-side misspellings must canonicalize

These are typos in the original document, not extraction errors. The same file
spells one model two ways:

| As printed | Canonical | Evidence |
|---|---|---|
| `HI-LUC,LN85` (GUT 27) | HILUX | `HI-LUX,VIGO` (GUT 29), same file |
| `TROOFER V6` (GUIS 70) | TROOPER | Isuzu Trooper |
| `LORRY/TIPER` (GUIS 67) | TIPPER | — |
| `4M40/INTECOOLER` (GUM 99) | INTERCOOLER | — |
| `SO5C/JO5C` (GUT 28) | `S05C` / `J05C` | Hino engine designations use digit zero |

The `HI-LUC` / `HI-LUX` pair inside a single file is direct evidence that
fuzzy/semantic search has real value here, rather than being a post-hoc
justification for the pgvector decision.

### On `SO5C` / `JO5C`

Letter-O vs digit-zero could not be verified against the PDF glyphs (the file
was supplied through chat, not committed to the repo). It does not need to be:
the Hino engine families are **S05C** and **J05C** with digit zero, so whether
the error is the typist's or the extractor's, the canonical form is the same
and both surface forms must be lexicon aliases. The verbatim string is
preserved in `staging_rows` either way.

## 8. Code prefix is a weak hint, NEVER truth

The prefix looks like it encodes make — and it nearly does:

`GUT`→Toyota, `GUN`→Nissan, `GUIS`→Isuzu, `GUD`→Daihatsu, `GUKO`→Komatsu

It breaks in this very file:

- `GUMZ 1` → **MITSUBISHI** (Lancer)
- `GUMZ 3`, `GUMZ 9`, `GUMZ 12` → **MAZDA**
- bare `GU` → Toyota, Isuzu, Austin, Mazda, Mitsubishi — everything

**There is a regression test asserting this.** Do not "optimize" the prefix
into a shortcut for the make column.

## 9. Fitment does not identify a part

The single most important finding, and it constrains the product, not just the
parser.

| Code | Make | Fitment | Price |
|---|---|---|---|
| GUN 45 | NISSAN | SUNNY B210/B310 | 4,260.00 |
| GUN 28 | NISSAN | SUNNY B210/B310 | 2,995.00 |
| GUM 75 | MITSUBISHI | CANTER,ROSA | 7,070.00 |
| GUM 87 | MITSUBISHI | CANTER,ROSA | 5,460.00 |
| GUM 93 | MITSUBISHI | CANTER,ROSA | 5,420.00 |
| GUIS 54 | ISUZU | DA120 | 7,860.00 |
| GUIS 62 | ISUZU | DA120 | 8,290.00 |
| GUKO4/5/6/12 | KOMATSU | D30 | 15,740 – 29,290 |

Identical fitment strings, different parts, prices differing by up to 42%.

**This is correct data, not dirty data.** A U-joint is identified by its
physical dimensions (cross diameter × cap length). Those dimensions are **not
in this file**, and neither is a year range. A Canter has several propshaft
joints.

Consequences:

1. `check_fitment` cannot return *the* part. "Canter U-joint" legitimately
   returns three, and nothing in this dataset ranks or disambiguates them. The
   honest response names all candidates and says what is missing. See PLAN.md §7.
2. `source_key` can **never** be derived from normalized fields —
   `(make, model, part_type)` is not unique. The code column is load-bearing.

## 10. Price

Stored **verbatim as printed**, with `price_as_of` = the price-list date.

Page 2 footer: `** CREDIT LESS 25% - CASH LESS 25% **`

So the printed figure is a **list price**; every real transaction is 25% below
it. Storing `2,460.00` as "the price" makes every price in the system ~33%
high.

The discount is carried as **file-level metadata**, applied by business logic
at display time — not baked into the stored value. Whether that 25% is
universal or customer-tier-specific is an open commercial question for the shop
(PLAN.md §12), not an engineering one, and the layering keeps both answers open.

Prices here are ~2 years stale as of profiling. `price_as_of` is captured now;
surfacing it in any UI is deferred.

## 11. Other observations

- **No stock/quantity column.** Consistent with the §5 availability model —
  status, not counts. Nothing to ingest here.
- **Rows are not sorted.** `GUN 32, 34, 45, 46, 27, 28, 29, 31, 50` — make no
  row-order assumptions.
- **This file is not representative.** Other price lists the shop holds have
  different column layouts — some with no code column, some with brand inline
  in one string. The ingestion design must tolerate **per-file structural
  variation**: a per-file column mapping, not one hardcoded shape.
