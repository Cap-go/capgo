# Pull Request Quality Checklist

This checklist ensures your PRs meet Capgo's high standards. Use this before submitting ANY pull request.

---

## 📋 Pre-Submission Checklist

### ✅ Code Quality (CRITICAL - Always Check)

- [ ] **Ran `bun lint:fix`** - Auto-fixes all linting issues (MANDATORY before commit)
- [ ] **Ran `bun lint`** - Verified no linting errors remain
- [ ] **Ran `bun lint:backend`** - If backend files were modified
- [ ] **Ran `bun typecheck`** - TypeScript type checking passes
- [ ] Code follows Vue 3 Composition API with `<script setup>` syntax
- [ ] Single quotes, no semicolons (ESLint @antfu/eslint-config style)
- [ ] No `TODO`, `FIXME`, or `XXX` comments added (resolve or create issue instead)
- [ ] **No `v-html` usage in Vue files** - Globally disallowed for security (XSS prevention)

### 🧪 Testing (CRITICAL)

- [ ] **Ran relevant tests locally and ALL PASS**:
  - [ ] `bun test:backend` - For backend changes
  - [ ] `bun test:front` - For frontend changes
  - [ ] `bun test:cloudflare:backend` - If Cloudflare Workers affected
- [ ] **Added new tests** for new features or bug fixes
- [ ] **Database changes covered** with Postgres-level tests
- [ ] **E2E tests added** for user-facing flows (Playwright in `playwright/e2e/`)
- [ ] Manually tested the feature (not just unit tests)
- [ ] Provided manual test steps in PR description

### 🗄️ Database & Migrations

- [ ] **Created ONE migration file** using `supabase migration new <feature_slug>`
- [ ] **Never edited committed migrations** (only the new migration file)
- [ ] **Ran `supabase db reset`** to test migration applies cleanly
- [ ] **Updated `supabase/seed.sql`** if test fixtures need changes
- [ ] **Ran `bun types`** after schema changes to regenerate TypeScript types
- [ ] **No new cron jobs** - Updated `process_all_cron_tasks` function instead

### 🎨 Frontend Standards

- [ ] Used **Tailwind CSS utility classes** (not custom CSS)
- [ ] Used **DaisyUI components** (`d-btn`, `d-input`, etc.) for interactive elements
- [ ] **Konsta components ONLY for safe area** helpers (not general UI)
- [ ] Followed color palette from `src/styles/style.css` (azure-500, primary-500)
- [ ] No inline styles or `<style>` blocks unless absolutely necessary
- [ ] Proper file-based routing in `src/pages/` (if adding routes)
- [ ] Frontend imports use **`~/` alias** for src directory (configured in tsconfig.json)

### 🔧 Backend Standards

- [ ] Used shared code in `supabase/functions/_backend/` (not platform-specific)
- [ ] Proper logging with `cloudlog({ requestId: c.get('requestId'), ... })`
- [ ] Used Hono `Context` with `MiddlewareKeyVariables` type
- [ ] Proper error handling with `simpleError()` helper
- [ ] Authentication via `middlewareAPISecret` or `middlewareKey` (not manual checks)
- [ ] Used Drizzle ORM patterns from `postgress_schema.ts`
- [ ] Used `getPgClient()` or `getDrizzleClient()` for database access
- [ ] **Always call `closeClient(c, pgClient)`** after database operations (prevents connection leaks)

### 📝 PR Description Quality

- [ ] **Clear Summary section** - Explains what and why
- [ ] **Problem section** - What issue does this solve?
- [ ] **Solution section** - How does it solve the problem?
- [ ] **Test Plan section** - Manual testing steps included
- [ ] **Screenshots/videos** - If frontend/CLI behavior changed
- [ ] **Files Changed section** - Lists all affected files with explanations
- [ ] **Technical Implementation** - Key technical decisions documented
- [ ] **Error Handling** - Edge cases documented
- [ ] Used PR template from `.github/pull_request_template.md`

### 🚫 NEVER DO (Critical Mistakes)

- [ ] **Never commit without running `bun lint:fix`**
- [ ] **Never edit previously committed migrations**
- [ ] **Never modify `CHANGELOG.md`** (CI/CD handles this)
- [ ] **Never modify `version` in `package.json`** (CI/CD handles this)
- [ ] **Never create new cron jobs** (use `process_all_cron_tasks`)
- [ ] **Never use custom CSS** when Tailwind/DaisyUI can do it
- [ ] **Never import `konsta` for general UI** (only safe areas)
- [ ] **Never hard-code URLs/config** (use `getRightKey()` from `scripts/utils.mjs`)
- [ ] **Never forget `requestId` in logs** (always use `c.get('requestId')`)
- [ ] **Never mix backend platforms** (use shared `_backend/` code)
- [ ] **Never hard-code environment-specific URLs or config** (use `getEnv(c, 'KEY')` in backend, `getRightKey()` in scripts)

---

## 📦 PR Description Template

When creating your PR, include these sections (from `.github/pull_request_template.md`):

### Summary
<!-- Write a short description about your PR -->
- [ ] Clear, concise summary of changes
- [ ] Explains WHAT was changed and WHY
- [ ] Links to related issues or tickets

### Test Plan
<!-- Include the steps to test your PR -->
<!-- Any PR that requires a complex setup to test MUST include this -->
- [ ] Step-by-step instructions to test the changes
- [ ] Expected behavior documented
- [ ] Edge cases and error scenarios included
- [ ] Database setup steps if needed (e.g., `supabase db reset`)

### Screenshots
<!-- Include screenshots/videos (if any) of how the PR works -->
<!-- Please include this if CLI/frontend behaviour has changed, can be skipped for backend changes -->
- [ ] Screenshots/videos for UI changes
- [ ] Before/after comparisons if applicable
- [ ] Can be skipped for backend-only changes

### Template Checklist
<!--- Go over all the following points, and put an `x` in all the boxes that apply. -->
<!--- If you're unsure about any of these, don't hesitate to ask. We're here to help! -->

- [ ] My code follows the code style of this project and passes `bun run lint:backend && bun run lint`
- [ ] My change requires a change to the documentation
- [ ] I have [updated the documentation](https://github.com/Cap-go/website) accordingly
- [ ] My change has adequate E2E test coverage
- [ ] I have tested my code manually, and I have provided steps how to reproduce my tests

---

## 🎯 Quality Standards by Change Type

### For Bug Fixes:
- [ ] Added test that reproduces the bug (fails before fix, passes after)
- [ ] Root cause explained in PR description
- [ ] Edge cases considered and tested

### For New Features:
- [ ] Feature fully documented in PR description
- [ ] User flow diagram or explanation included
- [ ] Permission/authorization checks implemented
- [ ] Error states handled gracefully
- [ ] Loading states implemented (if UI)
- [ ] Success/failure feedback to user

### For Database Changes:
- [ ] Migration is idempotent (can be run multiple times safely)
- [ ] Rollback strategy documented (if complex)
- [ ] Performance impact considered (indexes, query plans)
- [ ] Seed data updated to support tests

### For API Changes:
- [ ] API contract documented (request/response schemas)
- [ ] Zod validation schemas used
- [ ] Error responses documented
- [ ] Rate limiting considered
- [ ] Authentication/authorization verified

---

## 🔍 Common Mistakes to Avoid

### Formatting Issues:
- ❌ Mixed tabs and spaces
- ❌ Trailing whitespace
- ❌ Inconsistent import order
- ❌ **Frontend imports not using `~/` alias** (should be `import { x } from '~/services/...'` not `../../`)
- ✅ Run `bun lint:fix` before every commit

### Testing Issues:
- ❌ Tests that only pass locally
- ❌ Tests that depend on timing/order
- ❌ No tests for edge cases
- ✅ Run `supabase db reset` before testing

### Code Quality Issues:
- ❌ Magic numbers/strings (use constants)
- ❌ Commented-out code left in PR
- ❌ **`console.log` statements not removed** (use `cloudlog` in backend, remove in production code)
- ❌ **`console.error` without proper error handling** (frontend: OK for debugging, backend: use `cloudlogErr`)
- ✅ Use proper logging with `cloudlog` and `cloudlogErr` in backend

### Database Issues:
- ❌ Editing old migration files
- ❌ SQL that works locally but fails in production
- ❌ Missing foreign key constraints
- ❌ **Forgetting to call `closeClient()`** after `getPgClient()` (causes connection leaks)
- ✅ Test with `supabase db reset` multiple times

### Documentation Issues:
- ❌ Vague PR description ("fixed bug", "updated code")
- ❌ No explanation of WHY changes were made
- ❌ Missing test steps
- ✅ Detailed explanations with context

---

## 🚀 Before Clicking "Create Pull Request"

**Final verification:**

1. [ ] Ran `bun lint:fix && bun lint` one last time
2. [ ] All tests pass locally
3. [ ] PR description is complete and clear
4. [ ] No debug code or `console.log` statements left (production code)
5. [ ] No commented-out code blocks
6. [ ] Branch is up to date with `main`
7. [ ] Reviewed your own diff one more time
8. [ ] Checked for sensitive data (API keys, secrets, hard-coded URLs)
9. [ ] No `v-html` usage in Vue components (security risk)
10. [ ] Database connections properly closed with `closeClient()`
11. [ ] Ready to explain your changes in code review

---

## 💡 Pro Tips

- **Small PRs > Large PRs**: Break features into smaller, reviewable chunks
- **Context matters**: Explain WHY, not just WHAT changed
- **Show, don't tell**: Include screenshots/videos for visual changes
- **Test thoroughly**: Think like a QA engineer trying to break it
- **Be proactive**: Document edge cases and limitations upfront
- **Review yourself first**: Catch mistakes before reviewers do
- **Ask questions**: If unsure, ask in PR description or Discord

---

## 📚 Reference Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [AGENTS.md](./AGENTS.md) - Best practices for Supabase, frontend, testing
- [CLAUDE.md](./CLAUDE.md) - Development commands reference
- [.github/copilot-instructions.md](./.github/copilot-instructions.md) - Architecture patterns
- [CLOUDFLARE_TESTING.md](./CLOUDFLARE_TESTING.md) - Cloudflare Workers testing

---

## 🆘 Getting Help

- **Discord**: Join for real-time help from the team
- **GitHub Issues**: Search existing issues for similar problems
- **Code Review**: Ask for early feedback by marking PR as draft
- **Documentation**: Check [Capgo/website](https://github.com/Cap-go/website) docs

---

**Remember**: Quality over speed. A well-tested, properly documented PR merged on the first review is faster than a rushed PR that requires multiple rounds of changes.
