# Zoeist Admin — Session Log

## 2026-04-09

**Session goals:** Initialize claude-context tracking system for cross-device/session continuity.

**What was done:**
- Scanned full project: package.json, folder structure, Edge Functions, migrations, CI/CD config, .gitignore, README
- Created `claude-context/` directory with:
  - `memory.md` — fully populated project context (stack, status, conventions, decisions)
  - `session-log.md` — this file, for tracking session-by-session progress
  - `README.md` — workflow instructions for maintaining context across devices
- Updated `.gitignore` to allowlist `claude-context/`
- Committed all context files

**Blockers:** None.

**Next session goals:** Deploy Donor Portal Phase 2 or address any pending tasks.

## 2026-08-18 — Credential handling rules added to CLAUDE.md

- **Change:** standing section in `CLAUDE.md` covering credential recovery, overwriting in place, mode encoding, runtime verification, and handoff. Commit `2ce23e8` on `dev` — committed, not pushed.
- **Store of record:** Supabase Edge Function secrets + DigitalOcean App Platform env. Neither retains a prior value.
- **Mode-encoded credential:** **Effectively yes.** `STRIPE_SECRET_KEY`'s value is the only thing distinguishing test from live — there is no mode variable, and the stack notes say "Stripe (test mode)" on a system marked LIVE IN PRODUCTION. A test key in production takes payments that never settle and raises no error.
- Added as HARD RULES 12–14. All three zoeist CLAUDE.md files are copies of the same document and received identical rules.
- Docs only — no code, no migrations, no deploy.
