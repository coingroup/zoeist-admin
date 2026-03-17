# Zoeist Donation Management System

## What This Is
501(c)(3) nonprofit (EIN: 92-0954601, Georgia) donation processing: Stripe payments, IRS-compliant PDF receipts, automated thank-you emails (SendGrid), year-end giving statements, recurring donation management, compliance automation (Form 990, Schedule B, GA C-200). Admin at admin.zoeist.org, donation site at zoeist.org. LIVE IN PRODUCTION.

## Tech Stack
- React + Vite (frontends), Deno (Edge Functions), Supabase PostgreSQL
- Stripe (test mode, API 2023-10-16), SendGrid (from: focus@zoeist.org)
- 11+ Supabase Edge Functions, DigitalOcean App Platform (auto-deploy on push to main)
- Repos: github.com/coingroup/zoeist-admin, github.com/coingroup/zoeist-website
- Local admin repo: ~/Downloads/admin-dashboard/

## Phase Status
- **Phases 1–6**: Core pipeline (Stripe payments, PDF receipts, SendGrid emails, admin dashboard) — COMPLETE
- **Phase 7**: Year-end giving statements — COMPLETE
- **Phase 8**: Recurring donations — COMPLETE
- **Phase 9**: Compliance automation (Form 990, Schedule B, GA C-200) — COMPLETE
- **Phase 10**: Donor portal backend (API, magic link auth, verification emails) — COMPLETE
- **Phase 11**: Matching gift tracking — COMPLETE
- **Phase 12**: Events & quid pro quo receipting — COMPLETE
- **Phase 13**: Pledges, in-kind donations, grants, UTM tracking — COMPLETE
- **Phase 14**: Admin tools (acknowledgment letters, refunds, comms, board reports) — COMPLETE
- **Phase 15**: Accounting export, fiscal year config, account mappings — COMPLETE
- **Donor Portal Phase 1**: Frontend (dashboard, profile, history, receipts, subscriptions) — COMPLETE
- **Donor Portal Phase 2**: Bulk receipts, Stripe portal, pledges view, matching gifts view — CODE COMPLETE, awaiting deploy

## HARD RULES — NEVER VIOLATE
1. NEVER commit .env files or log secrets
2. NEVER use PDF libraries — Deno can't use npm. Build raw PDF bytes with TextEncoder
3. NEVER parse Stripe webhook before verifying signature — req.text() first
4. NEVER use url.pathname.replace() for Edge Function routing — use indexOf()
5. NEVER store dollars — always cents (integer/bigint), divide by 100 only for display
6. NEVER create receipt numbers manually — use DB sequence: nextval('receipt_number_seq')
7. NEVER skip RLS — every new table gets ENABLE ROW LEVEL SECURITY + policies
8. NEVER use anon key server-side — service_role only
9. Dashboard colors ONLY: #0f172a (bg), #1e293b (card), #c8a855 (gold)
10. ALWAYS set bypass_list_management: true in SendGrid for transactional emails
11. ALWAYS attach PDFs as base64 in SendGrid emails

## Supabase
- Project ref: qesjmvgihxhfbieivuvd
- URL: https://qesjmvgihxhfbieivuvd.supabase.co
- Deploy: supabase functions deploy <name> --project-ref qesjmvgihxhfbieivuvd
