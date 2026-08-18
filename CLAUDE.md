# Zoeist Donation Management System

## What This Is
501(c)(3) nonprofit (EIN: 92-0954601, Georgia) donation processing: Stripe payments, IRS-compliant PDF receipts, automated thank-you emails (SendGrid), year-end giving statements, recurring donation management, compliance automation (Form 990, Schedule B, GA C-200). Admin at admin.zoeist.org, donation site at zoeist.org. LIVE IN PRODUCTION.

## Tech Stack
- React + Vite (frontends), Deno (Edge Functions), Supabase PostgreSQL
- Stripe (test mode, API 2023-10-16), SendGrid (from: focus@zoeist.org)
- 11+ Supabase Edge Functions, DigitalOcean App Platform (auto-deploy on push to main)
- Repos: github.com/coingroup/zoeist-admin, github.com/coingroup/zoeist-website
- Local admin repo: ~/Projects/zoeist-admin/

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

12. NEVER overwrite a credential in place without first reading the outgoing value and keeping it. There is no undo here — Supabase Edge Function secrets are write-only (`supabase secrets` offers only `list`, `set` and `unset`; `list` returns names and digests, never values, and there is no version-history subcommand), and DigitalOcean App Platform env vars keep no prior value either. An overwrite is final. A value that exists in exactly one place is one command away from gone, so the snapshot is the whole safety net, not a formality.
13. NEVER treat a vendor reissue as the first move. Stripe and SendGrid store keys hashed, so they cannot look up what a key used to be — a reissue is a **new** credential, meaning new distribution, a fresh rollout, and a second imposition on whoever handled it the first time. Exhaust every local copy first. It only comes to this because neither store here retains history; where a store does keep removed values, read them instead.
14. NEVER let `STRIPE_SECRET_KEY` be the only thing that says which mode you are in. Its value is the sole distinction between test and live today — no mode variable exists, and the stack notes above say "Stripe (test mode)" on a system marked LIVE IN PRODUCTION. That combination is the failure this rule guards: a test key in production takes payments that never settle and raises no error, and swapping the key to rehearse destroys the key you are not using. Add an explicit mode variable that the Edge Functions read (they all pull the key the same way — `Deno.env.get('STRIPE_SECRET_KEY')` at the top of each function), write each key once, and never overwrite either. Until that exists, verify mode by asking the deployed function what it sees — a value set in the Supabase dashboard is not the same fact as a deployed function reading it, and when handing a credential to anyone, name the variable the code reads and the file that reads it.

## Supabase
- Project ref: qesjmvgihxhfbieivuvd
- URL: https://qesjmvgihxhfbieivuvd.supabase.co
- Deploy: supabase functions deploy <name> --project-ref qesjmvgihxhfbieivuvd
