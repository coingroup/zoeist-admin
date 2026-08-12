# Zoeist Admin Dashboard — Work Progress Tracker

> **Purpose**: Single source of truth for in-progress and pending work across all devices.
> Claude Code should read this at the start of every session and update it when work is completed, added, or blocked.
> Commit changes to this file so all machines stay in sync.

---

## In Progress

_(Items actively being worked on)_

---

## Pending

### Post-Build Review

- [ ] **Phases 10–15 completion** — Verify all phases are stable: accounting export, fiscal year config, admin tools, pledges/grants/in-kind, events/receipting, matching gifts, donor portal
- [ ] **RLS audit fixes** — Confirm all RLS audit findings have been resolved
- [ ] **IRS-compliant receipts** — Verify receipt generation meets IRS requirements end-to-end

---

## Done

- [x] **Coolify migration & Docker setup** — Created Dockerfile and nginx.conf for Coolify deployment (multi-stage node:20 → nginx:alpine, port 80). Added Docker HEALTHCHECK (wget -qO- http://127.0.0.1/ pattern for Coolify compatibility). Successfully deployed to Coolify, healthcheck passing. Updated CLAUDE.md and README.md to replace DigitalOcean references with Coolify. No AI metadata found, branding verified as "Zoeist Admin". DigitalOcean App Platform can be decommissioned. Completed: 2026-08-12.
- [x] **AI metadata & scaffold cleanup** — Added meta description. Added Zoeist branded favicon (favicon.ico, favicon.svg, favicon-transparent.svg, apple-touch-icon.png copied from zoeist-website). Pushed to main. Completed: 2026-08-10.

---

## Notes

- **Status:** LIVE IN PRODUCTION.
- 501(c)(3) nonprofit donation management with Stripe and IRS-compliant receipts (SendGrid for email).
- Recent work: Phases 10–15 (accounting export, fiscal year config, admin tools, pledges/grants/in-kind, events/receipting, matching gifts, donor portal), RLS audit fixes.
