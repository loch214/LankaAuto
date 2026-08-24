# CLAUDE.md

Instructions for Claude Code when working in this repo.

## Start of every session

**Read `HANDOFF.md` first**, before doing anything else. It is kept current
at the end of each session and says what's running, what's untested, and
what's next. `PLAN.md` is the full spec (architecture, schema, phased build
order, settled decisions) — read it for the "why," not `git log`.

Also load the persistent memory index at
`C:\Users\loch2\.claude\projects\D--Doc-Visual-Studio-Projects-LankaAuto\memory\MEMORY.md`
if not already in context — it carries user preferences and cross-session
decisions that HANDOFF.md doesn't repeat.

## Project shape

- **Backend**: `backend/` — Node/Express/TypeScript, PostgreSQL + pgvector
  via Prisma, JWT auth (staff only). Dev: `cd backend && npm run dev`
  (port 3000). DB: `npm run db:up` (Docker Compose, `pgvector/pgvector:pg16`,
  port 5433).
- **Frontend**: `frontend/` — React 19 + TypeScript + Vite + Tailwind v4 +
  React Router + TanStack Query. Dev: `cd frontend && npm run dev`
  (port 5173).
- Design system lives in `frontend/src/index.css` (`@theme` tokens:
  graphite/steel/chalk/safety-orange/signal-yellow) — industrial "parts
  counter," not generic SaaS. `PartTag` (`frontend/src/components/PartTag.tsx`)
  is the signature element for rendering part numbers.

## Standing decisions — don't re-litigate

- **No signup page, by design.** Customers never log in. Staff accounts are
  admin-provisioned only (`npm run seed:admin` bootstraps the first admin);
  there is no self-registration flow and none should be added.
- **No exact stock counts** — availability is a status enum
  (`IN_STOCK`/`LOW`/`OUT_OF_STOCK`/`UNVERIFIED`) plus a `last_verified_at`
  freshness timestamp, never a number. See PLAN.md §5 for why.
- **No price column on `parts`** — deliberately out of scope for now.
- Embeddings are Gemini `gemini-embedding-001` truncated to **768 dims**,
  baked into the `vector(768)` migration column — changing it means a
  migration plus a full re-embed. Don't casually swap embedding models.
- `cross_references` and `part_documents` tables are **cut/deferred**
  pending open data questions (PLAN.md §6, §12) — don't build features on
  top of tables that don't exist yet.

## How to work with the user

- Software engineering undergraduate; this is a learning + portfolio
  project. Explain the *why*, not just the *what* — no silent code dumps.
- **Be critical, not agreeable.** Push back on weak ideas. Verify claims
  mechanically (actually run tests, actually check in a browser) rather
  than asserting something works.
- For UI changes, actually load the page in a browser and look at it before
  calling it done — this project has been burned by "looks right in the
  code" not matching what's rendered.
- Prefer making and flagging reasonable calls over stopping to ask, except
  for genuine business decisions (e.g. real shop contact info, pricing
  policy) or destructive/hard-to-reverse actions (e.g. a real DB
  migration, force-push).

## End of every session

Update `HANDOFF.md` with what changed, what's running, what's verified vs.
untested, and what's next — the next session (or a fresh context window)
depends on it instead of re-deriving state from `git log`.
