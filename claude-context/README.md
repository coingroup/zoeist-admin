# Claude Context Tracking

This folder maintains persistent context for AI-assisted development sessions with Claude Code. It ensures continuity across devices, sessions, and conversations.

## Contents

| File | Purpose |
|---|---|
| `memory.md` | Project knowledge base: stack, status, decisions, conventions |
| `session-log.md` | Chronological log of what was done each session |

## Workflow

1. **Pull before starting** — `git pull` to get the latest context from other devices/sessions
2. **Update during/after work** — Keep `memory.md` current as decisions are made or status changes
3. **Update the timestamp** — Always update the "Last updated" line in `memory.md` at the end of each session
4. **Add a session log entry** — Append to `session-log.md` with date, goals, work done, blockers, and next steps
5. **Commit and push before switching** — `git add claude-context/ && git commit && git push` before closing out

## Rules

- Never leave `memory.md` stale — if you touched the project, update the timestamp
- Session log entries should be concise but complete enough to resume cold
- This folder is version-controlled (allowlisted in `.gitignore`) so it syncs across all clones
