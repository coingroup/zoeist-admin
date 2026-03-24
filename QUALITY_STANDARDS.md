# QUALITY_STANDARDS.md — Mandatory Checks for Every Claude Code Session

*This file lives in the repo root. Claude Code must read and follow these standards.*
*Every session must complete ALL checks before the final commit.*

---

## 1. Code Quality

### Before writing any code:
- Read CLAUDE.md and this file for project context and standards

### During development:
- No `any` types in TypeScript — use proper typing or `unknown` with type guards
- No `console.log` in production code — use structured logging
- No hardcoded secrets, API keys, URLs, or magic numbers — use env vars or constants
- No unused imports, variables, or dead code
- No commented-out code blocks — delete them
- All functions must have explicit return types (TypeScript) or type hints (Python)
- Error handling on every async operation — no unhandled promise rejections
- All user-facing strings must be meaningful error messages, not technical jargon

### After writing code:
- Run the linter and fix all issues before committing:
  ```bash
  # TypeScript
  npx turbo lint
  npx turbo typecheck
  
  # Python
  cd workers && ruff check . --fix
  mypy . --ignore-missing-imports
  ```

---

## 2. Functional Verification

### Every new feature must be verified:
- Does it compile/build without errors?
- Does it handle the happy path correctly?
- Does it handle error states? (network failure, empty data, null values, unauthorized)
- Does it handle edge cases? (empty lists, very long strings, special characters, zero values)
- Does it handle loading states? (show spinner/skeleton, not blank screen)
- Are all database queries using proper indexes? (check against schema)
- Are all API calls authenticated where required?
- Are all forms validated before submission?

### Run these checks:
```bash
# Full build verification
npx turbo build
cd apps/mobile && npx expo export --platform all
cd apps/web && npm run build

# Type safety
npx turbo typecheck
```

---

## 3. Security Audit

### Authentication & Authorization:
- [ ] All API endpoints verify authentication (Supabase JWT or service role)
- [ ] All Supabase tables have RLS enabled — no table without policies
- [ ] RLS policies enforce user-scoped access (users can only read/write their own data unless explicitly public)
- [ ] Service role key is NEVER exposed to client-side code
- [ ] Supabase anon key is used on client, service role only in server/workers
- [ ] No sensitive data in client-side logs or error messages

### Input Validation:
- [ ] All user inputs are validated and sanitized before database insertion
- [ ] File uploads validate: file type, file size, content type header matches actual content
- [ ] SQL injection is prevented (Supabase client handles this, but verify raw SQL in migrations)
- [ ] XSS prevention — no dangerouslySetInnerHTML, no raw HTML injection from user content
- [ ] Rate limiting on sensitive endpoints (login, signup, upload, report)

### Data Protection:
- [ ] Passwords are never stored in plain text (Supabase Auth handles this)
- [ ] API keys and secrets are only in .env, never in code
- [ ] .env is in .gitignore
- [ ] No secrets in migration files or seed data
- [ ] Payout/financial data is only accessible to the owning creator
- [ ] Moderation results are not exposed to end users (only pass/fail status)

### Content Security:
- [ ] Uploaded videos go through moderation before being visible to other users
- [ ] Livestreams have real-time moderation active before going live
- [ ] Chat messages are moderated in real-time
- [ ] Report system cannot be abused (rate limit reports per user)
- [ ] Suspended creators cannot upload, stream, or earn

### Infrastructure:
- [ ] S3 buckets are not publicly writable — presigned URLs only
- [ ] CloudFront distribution restricts origin access
- [ ] Docker containers run as non-root user
- [ ] No debug mode enabled in production configs
- [ ] CORS is configured correctly (not wildcard * in production)

### Run this check:
```bash
# Check for hardcoded secrets
grep -rn "sk_live\|sk_test\|password\|secret" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.js" --exclude-dir=node_modules --exclude-dir=.git --exclude=".env*" .

# Check .env is gitignored
grep ".env" .gitignore

# Check no .env files are tracked
git ls-files | grep ".env"

# Check all tables have RLS
grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql
```

---

## 4. Bug Hunting

### Common React Native / Expo bugs to check:
- Memory leaks from unsubscribed listeners (Supabase Realtime, notifications)
- Missing cleanup in useEffect return functions
- FlashList key extraction — every item needs a stable unique key
- Video player not pausing when navigating away
- Keyboard covering input fields on Android
- Safe area handling on notched devices (iPhone 14+, etc.)
- Back button behavior on Android (hardware back)

### Common Next.js bugs to check:
- Hydration mismatches (client vs server rendering)
- Missing "use client" directive on interactive components
- API routes returning wrong status codes
- Missing error boundaries
- Image optimization — using next/image not raw img tags

### Common Supabase bugs to check:
- Missing `.maybeSingle()` vs `.single()` — single throws on no results
- RLS policies that are too restrictive (blocking legitimate access)
- RLS policies that are too permissive (leaking data across users)
- Missing indexes on frequently queried columns
- Realtime subscriptions not filtered properly (receiving all table changes)

### Common Python worker bugs to check:
- Unhandled exceptions crashing the worker process
- Missing retry logic on API calls
- File handles not closed (use `with` statements)
- Temporary files not cleaned up after processing
- Timezone issues (all timestamps should be UTC)

---

## 5. Performance Check

- [ ] No N+1 queries — use joins or batch fetches
- [ ] Paginated queries use proper LIMIT/OFFSET or cursor-based pagination
- [ ] Images are optimized (expo-image with caching, next/image with optimization)
- [ ] Video feed preloads correctly (2 ahead, 1 behind, not all at once)
- [ ] Bundle size is reasonable — no giant unused libraries
- [ ] No synchronous blocking calls in render path
- [ ] Lists use virtualization (FlashList, not FlatList or ScrollView for long lists)
- [ ] Heavy computations are memoized (useMemo, useCallback where appropriate)

### Run:
```bash
# Check bundle size (mobile)
cd apps/mobile && npx expo export --dump-assetmap

# Check web bundle
cd apps/web && npm run build 2>&1 | grep "First Load JS"
```

---

## 6. Accessibility Check

- [ ] All images have alt text (web) or accessibilityLabel (mobile)
- [ ] Touch targets are at least 44x44 points (mobile)
- [ ] Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text)
- [ ] Screen reader can navigate the app (test with VoiceOver/TalkBack)
- [ ] Forms have proper labels
- [ ] Error messages are announced to screen readers

---

## 7. Documentation

Every session must update or create:
- [ ] `CLAUDE.md` — if architecture changed
- [ ] `.env.example` — if new env vars were added
- [ ] `docs/` — for any new system (moderation, earnings, notifications, etc.)
- [ ] Inline comments on complex logic (not obvious code)
- [ ] README update if setup steps changed

---

## 8. Final Audit Checklist

Before the final commit of every session, run this complete check:

```bash
echo "=== 1. LINT ==="
npx turbo lint 2>&1 | tail -5
cd workers && ruff check . 2>&1 | tail -5
cd ..

echo "=== 2. TYPE CHECK ==="
npx turbo typecheck 2>&1 | tail -5

echo "=== 3. BUILD ==="
cd apps/web && npm run build 2>&1 | tail -5
cd ..

echo "=== 4. SECRETS CHECK ==="
grep -rn "sk_live\|sk_test\|apikey.*=.*['\"]" --include="*.ts" --include="*.tsx" --include="*.py" --exclude-dir=node_modules --exclude-dir=.git --exclude="*.example" --exclude="*.md" . | head -10

echo "=== 5. ENV CHECK ==="
git ls-files | grep "^\.env$" | head -5

echo "=== 6. RLS CHECK ==="
echo "Tables with RLS:"
grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql
echo "Tables created:"
grep -c "CREATE TABLE" supabase/migrations/*.sql

echo "=== 7. UNUSED CODE ==="
grep -rn "console\.log" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "// debug" | head -10

echo "=== 8. TODO/FIXME ==="
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.ts" --include="*.tsx" --include="*.py" --exclude-dir=node_modules --exclude-dir=.git . | head -20
```

Report the results of this audit in the session's status document. Any failures must be fixed before committing.

---

## 9. Session Completion Template

Every session must end with a status file containing:

```markdown
# Session [X] — [Name] Status

## What was built
- [list features]

## Quality checks passed
- [ ] Lint clean
- [ ] Type check clean
- [ ] Build successful
- [ ] No hardcoded secrets
- [ ] No .env files tracked
- [ ] All tables have RLS
- [ ] No console.log in production code
- [ ] Error handling on all async operations
- [ ] Loading states for all data-fetching screens

## Security audit
- [ ] Auth verified on all endpoints
- [ ] RLS policies reviewed
- [ ] Input validation present
- [ ] No XSS vectors
- [ ] File upload validation

## Known issues
- [list any, with severity]

## Next session should
- [list what comes next]
```
