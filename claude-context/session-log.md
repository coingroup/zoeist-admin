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

## 2026-10-26 — Supabase security cleanup (handoff from fitnneka session)

- **Source:** advisor run 10-26 on ref qesjmvgihxhfbieivuvd: 8 SECURITY DEFINER functions executable by anon and authenticated.
- **Read live (read-only):** all 8 bodies and ACLs. generate_receipt_number is called only by Edge Functions generate-year-end-statement and recurring-webhook (service_role). Six are internal or trigger functions. get_donor_id_for_auth_user and is_admin_user back RLS policies.
- **Done:** migrations `20261026000000_revoke_definer_execute_internal.sql` (6 functions) and `20261026000001_revoke_anon_rls_helpers.sql` (2 RLS helpers, anon only). PR #2, merged to dev by gitpr. NOT applied to production.
- **Production queue:** P401 (6 internal functions), P402 (2 RLS helpers, anon revoke; separate because anon queries on policy tables would error instead of returning zero rows).
- **Decision (agent default):** no Zoeist staging Supabase project exists, so no staging proof; stated in both queue items. Revoke of RLS helpers split from the rest so it can be dropped alone.
- **Not done:** apply P401/P402 (owner window); re-run security advisors afterwards (expected leftover: 2 "signed-in users can execute" entries, accepted); verify donor portal and admin dashboard after P402 (other repos, not readable here).
- **Misleading risk:** `claude-context/session-log.md` 2026-08-18 entry says commit "not pushed"; not rechecked.

## 2026-10-29 — Unattended sprint run (zoeist-admin)

- **Sprint task:** only the owner's umbrella task "Other Supabase databases — security check" is open; this repo's part is the zoeist-admin cleanup (code landed 10-26, PR #2).
- **Verified live (read-only):** `prod-queue list` shows P401 still queued (6 internal functions). Security advisors on qesjmvgihxhfbieivuvd (observed 10-30 01:16 UTC) still list all 8 SECURITY DEFINER functions as anon-executable, so nothing is applied yet.
- **Record was wrong:** the 10-26 entry and handoff said P402 was queued; it is not in the queue list. Re-queued the same migration (20261026000001) as **P489**, group security-cleanup.
- **Not done / whose:** P401 and P489 await the owner's production window; afterwards re-run advisors and check donor portal and admin dashboard logins (other repos). Marking the umbrella task is the owner's.

## 2026-10-29 — P401 applied to production

- Window opened by owner for P401. Applied the SQL of `20261026000000_revoke_definer_execute_internal.sql` unchanged to qesjmvgihxhfbieivuvd with the Supabase `apply_migration` tool (no word-for-word command was available to me for `window-step run`; recorded here).
- Verified with `has_function_privilege`: the 6 functions are no longer executable by anon or authenticated; service_role can execute. `get_donor_id_for_auth_user` and `is_admin_user` still anon/authenticated-executable, as planned (P489).
- `prod-queue done 401` run. Open: P489, then re-run advisors; check donor portal and admin dashboard logins (other repos). Ledger row name is `revoke_definer_execute_internal` with a new timestamp version, not 20261026000000; may differ from the repo file name.

## 2026-10-29 — P489 applied to production

- Window opened for P489. Applied the SQL of `20261026000001_revoke_anon_rls_helpers.sql` unchanged to qesjmvgihxhfbieivuvd via Supabase `apply_migration`.
- Verified: `get_donor_id_for_auth_user` and `is_admin_user` now anon=false, authenticated=true, service_role=true. Security advisors re-run: anon findings gone; only the 2 accepted "signed-in users can execute" entries remain (RLS helpers).
- `prod-queue done 489` run. P401 and P489 both done, so the zoeist-admin cleanup is finished on the database side.
- Open (not mine): check donor portal and admin dashboard logins, since anon queries on policy tables without a TO clause now error instead of returning zero rows. Those are separate repos. Umbrella Asana task is the owner's to mark.

## 11-17-2026 — Unattended sprint run: dev CI red (handoff from coingroup-tooling, item 3932)

- **Cause found:** CI/CD Pipeline job `test-dev` fails at `supabase link --project-ref $SUPABASE_DEV_REF`, which answers "Resource has been removed" (run https://github.com/coingroup/zoeist-admin/actions/runs/44157039134). The Supabase account has no Zoeist dev or staging project (only prod `zoeist-admin`, qesjmvgihxhfbieivuvd). The GitHub secret `SUPABASE_DEV_DB_PASSWORD`, read by the `db push` step, was never set; the repo has only SUPABASE_ACCESS_TOKEN, SUPABASE_DEV_REF and SUPABASE_PROD_REF. Dev CI has been red on every run since the first one on 10-08 (runs 37794021933, 37829089994, 40429237657, 42119242710, 44157039134).
- **Not fixed (needs owner):** item 3973 asks the owner to choose A (create a zoeist-dev project and set SUPABASE_DEV_REF and SUPABASE_DEV_DB_PASSWORD) or B (make the Supabase steps conditional and add `npm run build`; this weakens a check, so only on the owner's word). Agent default: leave CI unchanged until answered. Dev is NOT green.
- **Warning:** never set SUPABASE_DEV_REF to the prod ref. Every push to dev would then push migrations and deploy functions to production. `deploy-prod` also needs SUPABASE_PROD_DB_PASSWORD, which is not set either.
- **Verified live:** security advisors on qesjmvgihxhfbieivuvd (observed 11-17 23:12 UTC) list only the 2 accepted authenticated SECURITY DEFINER entries (get_donor_id_for_auth_user, is_admin_user). This matches 11-02.
- **Sprint task:** only the umbrella "Other Supabase databases — security check" is open. The Zoeist part is done. Its Done-when covers seven projects in other repos, so I did not send sprint-ready.
- **Unverified (no record in the last 400 hours of Sprint Control):** the owner's live/parked/delete-later classification of Zoeist, and the donor portal and admin dashboard login check.
- **Tooling note:** `launch-status` refuses because zoeist-admin is not listed in ops/sprint-sessions.txt, so nothing was recorded there.
- **11-17-2026, owner answer to item 3973: A.** The owner created Supabase project `zoeist-dev` (ref jimmumdsfmiacbqnsvfo, created 23:22 UTC) and set the GitHub secrets SUPABASE_DEV_REF (23:30:17 UTC) and SUPABASE_DEV_DB_PASSWORD (23:30:33 UTC). Verified by list_projects and gh secret list (names and times only).
- **11-17-2026, CI rerun of run 44157039134 (23:31 UTC):** link to zoeist-dev passes. `supabase db push` fails on 20260304000000_compliance_alert_log.sql with `relation "compliance_deadlines" does not exist`. Root cause: the repo has no migration for the base schema (phases 1 to 8); production was built before migrations were used. Dev CI is still red.
- **Record drift found (production ledger, read-only):** production has 20260722130042 restrict_donation_views_to_service_role, 20260722130207 pin_function_search_path and 20260722132402 restrict_public_bucket_listing, and none of the three is in the repo. The revoke migrations are recorded as 20261030011854 and 20261030012119, not the repo's 20261026000000 and 20261026000001.
- **Plan posted, item 3981 (waits for the owner's go):** A = the owner runs a read-only schema-only dump of production, then I write the baseline, add the 3 missing migrations, open a PR into dev, and queue a production ledger-only repair. B = rebuild from catalog queries. C = stop. The local supabase CLI cannot run in the sandbox (EPERM writing ~/.supabase).
- **11-17-2026, owner answer to item 3981: A.** The owner wrote a schema-only production dump to supabase/prod_schema_dump.sql (not to be committed).
- **11-17-2026, baseline built:** supabase/migrations/20260301000000_baseline_schema.sql (the owner's schema-only dump, plus a qa_readonly NOLOGIN role for fresh projects, plus an ACL reconciliation block computed from the dump's GRANT lines that matches the 3 earlier ACL migrations) and 20260301000001_baseline_storage.sql (4 buckets and 9 storage.objects policies read from production). The 6 old migration files were removed because the baseline supersedes them (they remain in git history). The dump file was deleted and not committed. Chosen over the plan's "add the 3 missing July migrations": a squash avoids double-creating objects. Production needs a ledger-only repair (prod-queue) before any production db push.
- **Production guard note:** read-only execute_sql queries on production whose text contains privilege words (the revoke keyword and the update/delete/insert words in string literals) are blocked as writes. I worked from the dump instead and did not try to get around the guard.
- **Security finding, item 3983 (owner decision):** the production storage policies "Service role can upload/update website files" have no TO clause, so anon can write to the public website bucket. Recommended A: drop both (service_role bypasses RLS). This needs a second PR plus prod-queue.
- **11-17-2026, owner answer to item 3983: A.** Drop both website write policies. This lands as a second PR after the baseline, gets proven on zoeist-dev, then goes to prod-queue.
- **11-17-2026, independent review of the baseline (subagent, read-only):** no blocking issue for dev. Blocking for production sequencing: deploy-prod's `db push` fails until the production ledger is repaired (mark 20260301000000 and 20260301000001 applied, revert the 6 old versions), so the repair must precede any staging-to-main release. It already fails today (no SUPABASE_PROD_DB_PASSWORD, and versions differ). Applied the review's notes: restored the 2 system_config seed rows from audit_gap_fixes. Open notes for later: storage CREATE POLICY may hit "must be owner of table objects" on newer projects (check on the first dev run); the code uses a `receipts` bucket that production does not have (generate-year-end-statement, send-year-end-statements, src/App.jsx), owner item to come; anon/authenticated hold ALL on receipt_number_seq (matches production).
- **11-17-2026, DEV CI GREEN:** commit 9da3651 was pushed to dev by gitpr (no PR needed). CI/CD Pipeline run https://github.com/coingroup/zoeist-admin/actions/runs/44202092915 passed: test-dev linked zoeist-dev, applied both baseline migrations and deployed the Edge Functions. Verified on zoeist-dev with execute_sql and advisors: 30 public tables, 0 without RLS; anon cannot execute generate_receipt_number or is_admin_user, authenticated can execute is_admin_user; anon has no SELECT on v_recent_donations; 4 buckets and 9 storage.objects policies; 2 system_config rows; ledger shows 20260301000000 and 20260301000001. The security advisors show the same 2 accepted entries as production.
