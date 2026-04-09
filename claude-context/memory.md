# Zoeist Admin — Claude Context Memory

## Project Name and Purpose

**Zoeist Admin Dashboard** — Internal admin interface for Zoeist, Inc., a 501(c)(3) nonprofit (EIN: 92-0954601, Georgia). Manages donation processing, IRS-compliant PDF receipts, automated donor communications, recurring donations, compliance reporting (Form 990, Schedule B, GA C-200), year-end giving statements, matching gifts, events, pledges, in-kind donations, grants, UTM tracking, accounting exports, and board reports. Live in production at admin.zoeist.org.

## Tech Stack and Integrations

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 (single-file SPA in `src/App.jsx`) |
| Language | JavaScript (JSX), no TypeScript |
| Routing | react-router-dom v6 |
| Charts | Recharts v2 |
| Database | Supabase PostgreSQL (project ref: `qesjmvgihxhfbieivuvd`) |
| Client SDK | @supabase/supabase-js v2.45 |
| Backend | 18 Supabase Edge Functions (Deno runtime) in `supabase/functions/` |
| Payments | Stripe (test mode, API version 2023-10-16) |
| Email | SendGrid (from: focus@zoeist.org) |
| PDF Generation | Raw PDF bytes via TextEncoder (no npm PDF libraries — Deno constraint) |
| Hosting (Admin) | DigitalOcean App Platform (static site, auto-deploy on push to `main`) |
| Hosting (Donor site) | zoeist.org (separate repo: `coingroup/zoeist-website`) |
| CI/CD | GitHub Actions (`.github/workflows/ci-cd.yml`) — dev → PR → main promotion |
| Version Control | GitHub (`coingroup/zoeist-admin`), branch model: `dev` → `main` |
| Repo | https://github.com/coingroup/zoeist-admin.git |

### Edge Functions (18 total)

accounting-api, admin-api, admin-extras-api, compliance-alerts, compliance-financial-statement, compliance-reports, create-recurring-checkout, donor-portal-api, donor-verification-email, events-api, fundraising-api, generate-year-end-statement, matching-gifts-api, process-pledge-installments, recurring-api, recurring-webhook, send-auth-email, send-year-end-statements

### Database Migrations

4 migration files in `supabase/migrations/` covering compliance alerts, donor portal (phases 1 & 2), and audit gap fixes.

## Current Status / What's Been Done

- **Phases 1–15**: All complete — full donation pipeline, receipts, emails, recurring donations, compliance automation, donor portal backend, matching gifts, events, quid pro quo, pledges, in-kind, grants, UTM, admin tools, accounting export, fiscal year config.
- **Donor Portal Phase 1**: Frontend complete (dashboard, profile, history, receipts, subscriptions).
- **Donor Portal Phase 2**: Code complete (bulk receipts, Stripe portal, pledges view, matching gifts view) — awaiting deployment.
- **CI/CD**: GitHub Actions pipeline operational with dev/staging/prod environments.
- **Architecture**: Single-file SPA (`src/App.jsx`) with all routes/styles/components. Backend is entirely Supabase Edge Functions.

## Active Decisions and Reasoning

- **Single-file SPA architecture**: The entire admin dashboard lives in `src/App.jsx`. This was a deliberate choice for simplicity given the internal-only audience, though it may need splitting as the codebase grows.
- **No TypeScript**: Project uses plain JavaScript/JSX. No plans to migrate observed.
- **Deno for Edge Functions**: Supabase Edge Functions run on Deno, which prohibits npm PDF libraries. All PDF generation uses raw byte construction with TextEncoder.
- **Branch model**: `dev` branch for development, PRs to `main` for production. CI/CD enforces this flow.
- **Cents-only storage**: All monetary values stored as integers (cents). Division by 100 only at display time.
- **Vercel config present but unused**: `vercel.json` exists with SPA rewrites, but deployment is on DigitalOcean App Platform. Vercel deploy step is commented out in CI/CD. [inferred — may be legacy or planned migration]

## Pending Tasks and Next Steps

- **Donor Portal Phase 2 deployment**: Code is complete, awaiting deploy to production.
- **Donor Portal**: Separate repo (`coingroup/zoeist-website` or a dedicated donor portal repo) shares the same Supabase database.
- **Potential refactoring**: The single-file `App.jsx` may benefit from component extraction as features continue to grow. [inferred]

## Key Conventions and Patterns

- **Colors**: Dark theme only — `#0c0b0f` (bg), `#16151b` (card), `#c8a855` (gold accent). CSS custom properties defined in `:root`.
- **API pattern**: Edge Functions accessed via `adminFetch()` helper in `src/supabase.js` using service_role key server-side. Never use anon key server-side.
- **Receipt numbers**: Always use DB sequence `nextval('receipt_number_seq')`, never manual.
- **Stripe webhooks**: Always verify signature before parsing — call `req.text()` first.
- **SendGrid**: Always set `bypass_list_management: true` for transactional emails. PDFs attached as base64.
- **Edge Function routing**: Use `indexOf()` for URL path matching, never `url.pathname.replace()`.
- **RLS**: Every table gets `ENABLE ROW LEVEL SECURITY` + policies. No exceptions.
- **No .env commits**: Environment files are gitignored. Secrets managed via GitHub Secrets and Supabase dashboard.
- **Commit flow**: Work on `dev`, CI runs tests + deploys to dev, PR to `main`, merge triggers prod deploy.

---

**Last updated:** 2026-04-09 | **Device:** Mac-Studio.local
