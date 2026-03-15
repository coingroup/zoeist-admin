# Zoeist Donation Management System

## What This Is
501(c)(3) nonprofit (EIN: 92-0954601, Georgia) donation processing: Stripe payments, IRS-compliant PDF receipts, automated thank-you emails (SendGrid), year-end giving statements, recurring donation management, compliance automation (Form 990, Schedule B, GA C-200). Admin at admin.zoeist.org, donation site at zoeist.org. LIVE IN PRODUCTION.

## Tech Stack
- React + Vite (frontends), Deno (Edge Functions), Supabase PostgreSQL
- Stripe (test mode, API 2023-10-16), SendGrid (from: focus@zoeist.org)
- 11+ Supabase Edge Functions, DigitalOcean App Platform (auto-deploy on push to main)
- Repos: github.com/coingroup/zoeist-admin, github.com/coingroup/zoeist-website
- Local admin repo: ~/Downloads/admin-dashboard/

## Phases 1–9: COMPLETE AND VERIFIED
Full pipeline works end-to-end. See brief for complete list.

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
