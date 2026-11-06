---
name: code-review-standards
description: Severity levels, category codes, issue IDs, per-category checklists and report format for reviewing Libra code. Use when writing or judging review findings, by hand or inside /full-review, /code-review or /fix-full-review.
---

# Code review standards

Worked code examples for each policy: `docs/lessons/code-review-standards.md`.

> Multi-agent code review system for comprehensive codebase analysis.

---

## Overview

The `/full-review` skill performs automated code review using 12 specialized agents that run in parallel. Each agent focuses on a specific aspect of code quality, architecture, or best practices.

---

## Severity Levels

| Level          | Icon | Description                                              | Action Required                     |
| -------------- | ---- | -------------------------------------------------------- | ----------------------------------- |
| **Critical**   | 🔴   | Breaks architecture, security risk, or blocks deployment | Must fix before merge               |
| **Warning**    | 🟠   | Violates standards but doesn't break functionality       | Should fix, document if intentional |
| **Suggestion** | 🟡   | Improvement opportunity, better patterns exist           | Consider for future                 |
| **Info**       | ℹ️   | Informational, pattern discovery, documentation          | Review and acknowledge              |

### Severity Guidelines

**🔴 Critical** - Issues that:

- Break Clean Architecture layer dependencies
- Expose security vulnerabilities (XSS, injection, secrets exposure)
- Cross-feature imports violating isolation
- Missing critical error handling
- Production-breaking patterns

**🟠 Warning** - Issues that:

- Violate SOLID principles significantly
- Have code duplication (DRY violations)
- Missing tests for critical paths
- Hardcoded strings needing i18n
- Non-semantic color usage
- Relative imports crossing architecture layers in features
- CSS out of sync between apps (missing `@source`, different CSS variables)

**🟡 Suggestion** - Issues that:

- Could benefit from better patterns
- Minor naming inconsistencies
- Performance optimization opportunities
- Test coverage improvements
- Documentation gaps

**ℹ️ Info** - Items that:

- Document discovered patterns
- Suggest new rules to create
- Note best practice updates
- Highlight well-implemented code

---

## Review Categories

| Category            | Code    | Agent                     | Rule Reference                                                       |
| ------------------- | ------- | ------------------------- | -------------------------------------------------------------------- |
| Architecture        | `ARCH`  | Architecture Agent        | [architecture.md](../../../docs/lessons/architecture.md)             |
| SOLID               | `SOLID` | SOLID Agent               | [solid-principles.md](../../../docs/lessons/solid-principles.md)     |
| DRY                 | `DRY`   | DRY Agent                 | [dry-principle.md](../../../docs/lessons/dry-principle.md)           |
| KISS                | `KISS`  | All Agents                | [kiss-principle.md](../../../docs/lessons/kiss-principle.md)         |
| Components          | `COMP`  | Component Agent           | [component-patterns.md](../../../docs/lessons/component-patterns.md) |
| Naming              | `NAME`  | Naming Agent              | [naming-conventions.md](../../../docs/lessons/naming-conventions.md) |
| i18n                | `I18N`  | i18n Agent                | [i18n Standards](#i18n-standards)                                    |
| Styling             | `STYLE` | Tailwind Agent            | [tailwind.md](../../../docs/lessons/tailwind.md)                     |
| **CSS Consistency** | `CSS`   | **CSS Consistency Agent** | [css-consistency.md](../../../docs/lessons/css-consistency.md)       |
| Testing             | `TEST`  | Testing Agent             | [testing.md](../../../docs/lessons/testing.md)                       |
| Security            | `SEC`   | Security Agent            | [Security Standards](#security-standards)                            |
| Performance         | `PERF`  | Performance Agent         | [Performance Standards](#performance-standards)                      |
| **Bugs**            | `BUG`   | **Bug Detection Agent**   | [Bug Detection Standards](#bug-detection-standards)                  |
| Best Practices      | `BEST`  | Best Practices Agent      | Web research-based                                                   |
| Patterns            | `PAT`   | Pattern Discovery Agent   | Codebase analysis                                                    |

---

## Global Review Constraints

### KISS Guardrail

- Prefer the simplest fix that resolves the issue.
- Avoid abstractions or refactors that add complexity without clear payoff.
- If KISS conflicts with DRY or other guidance, **favor KISS** and downgrade or omit the DRY suggestion.

### Generated Code Policy

- Treat files as generated if the path includes `generated`/`__generated__` or the header says "auto-generated", "generated by", or "DO NOT EDIT".
- **Never** suggest refactors, cleanups, or improvements in generated files.
- Only report consistency issues (typing, naming, signature/shape mismatches) and point to the generator as the fix path.
- Use **info** or **warning** severity for generated-file findings.

### Tailwind Class Strings Policy

- **Never** suggest extracting Tailwind classes to JS constants or variables.
- Tailwind utility classes are designed to be repeated inline - this is the utility-first paradigm.
- Repeated class strings like `"text-xs flex items-center gap-1"` are **not DRY violations**.
- If the same combination appears many times, consider creating a **component** (not a constant).
- The only exception: component variant definitions using `cva()` from class-variance-authority.

### CSS Variable Strings Policy

- **Never** suggest extracting CSS variable strings to JS constants.
- CSS variables like `"var(--foreground)"` should remain inline as strings.
- The CSS variables are **already the single source of truth** (defined in `globals.css`).
- Extracting to JS constants creates unnecessary indirection and moves styling concerns into JavaScript.
- Color changes should happen in CSS, not in JavaScript constant files.

**Note:** Numeric values for Recharts (font sizes, stroke widths, etc.) **can** be constants because they require JavaScript numbers. Only CSS variable **strings** should stay inline.

## Issue ID Format

All issues are identified with a unique ID:

```
[CATEGORY-NNN]
```

**Examples:**

- `ARCH-001` - First architecture issue
- `SOLID-003` - Third SOLID principle violation
- `SEC-001` - First security concern

---

## Agent Checklists

### Architecture Agent (ARCH)

Validates [Clean Architecture](../../../docs/lessons/architecture.md) compliance:

- [ ] **Layer Dependencies** - Dependencies flow inward only (Presentation → Application → Domain)
- [ ] **Feature Isolation** - No cross-feature imports
- [ ] **App Router Thin Wrappers** - Route files only import and render feature pages
- [ ] **Shared Code Policy** - Shared code is truly generic
- [ ] **Barrel Exports** - Each layer has `index.ts` exporting public API
- [ ] **Domain Independence** - Domain layer has no external dependencies
- [ ] **Absolute Imports** - ALWAYS prefer absolute over relative:
  - Cross-layer: `@/features/[feature]/[layer]` (not `../domain`)
  - Cross-feature: `@/features/[other]` (not `../../other-feature`)
  - Shared: `@/shared/[layer]` (not `../shared`)
  - Same-directory relative (`./types`) is OK
  - Violation patterns: `../..`, `../domain`, `../application`, `../shared`
- [ ] **No Hardcoding** - Values in proper locations:
  - Magic numbers → `domain/constants.ts` (not `=== 200`, `> 3`)
  - Magic strings → enum-like constants (not `=== 'admin'`)
  - Types → `domain/types/` (not inline `{ id: string; name: string }`)
  - Mocks → `src/mocks/data/` (not inline `[{ id: '1' }]`)
  - Config → env variables or config files (not hardcoded URLs)
- [ ] **URL State** - User-facing state in hooks uses nuqs (`useQueryStates`) instead of `useState` when appropriate (filters, pagination, tabs, view modes). See [URL State Rule](../../../docs/lessons/url-state.md)

### SOLID Agent (SOLID)

Validates [SOLID Principles](../../../docs/lessons/solid-principles.md):

- [ ] **Single Responsibility** - Components do one thing well
- [ ] **Open/Closed** - Extensible via props/composition, not modification
- [ ] **Liskov Substitution** - Derived types honor base contracts
- [ ] **Interface Segregation** - Small, focused prop interfaces
- [ ] **Dependency Inversion** - Depend on abstractions (hooks), not implementations

### DRY Agent (DRY)

Validates [DRY Principle](../../../docs/lessons/dry-principle.md):

- [ ] **No Knowledge Duplication** - Same logic in one place only
- [ ] **Rule of Three** - Abstract after 3+ occurrences
- [ ] **No Magic Values** - Constants for repeated numbers/strings
- [ ] **Shared Logic Extraction** - Common patterns extracted to utilities
- [ ] **Type Reuse** - Shared types not duplicated

### Component Patterns Agent (COMP)

Validates [Component Patterns](../../../docs/lessons/component-patterns.md):

- [ ] **One Component Per File** - Each file exports only one React component (see [one-component-per-file.md](../../../docs/lessons/one-component-per-file.md))
- [ ] **Standard Structure** - hooks → derived → handlers → render
- [ ] **Props Interface Co-location** - Types defined with component
- [ ] **'use client' Directive** - Applied correctly for client components
- [ ] **Container/Presenter** - Data fetching separated from UI
- [ ] **Compound Components** - Related sub-components properly grouped (valid exception to one-component rule)

### Naming Conventions Agent (NAME)

Validates [Naming Conventions](../../../docs/lessons/naming-conventions.md):

- [ ] **File Naming** - PascalCase components, camelCase hooks/utils
- [ ] **Variable Naming** - camelCase, boolean prefixes (is/has/can)
- [ ] **Type Naming** - PascalCase, Props suffix for component props
- [ ] **Import Organization** - React → Third-party → Shared → Feature → Types
- [ ] **Constant Naming** - SCREAMING_SNAKE for globals, camelCase for locals

### i18n Agent (I18N)

Validates internationalization standards:

- [ ] **No Hardcoded Strings** - User-facing text uses `useTranslations()`
- [ ] **Translation Keys Exist** - Keys defined in all locale files
- [ ] **Consistent Key Naming** - Hierarchical, scoped keys
- [ ] **Locale File Completeness** - All locales have same keys
- [ ] **Proper Scoping** - `useTranslations('scope')` used correctly

### Tailwind/Styling Agent (STYLE)

Validates [Tailwind CSS](../../../docs/lessons/tailwind.md) patterns:

- [ ] **Semantic Colors** - All colors MUST use semantic tokens, not raw Tailwind palette colors. This includes color maps, style constants, and inline classes. Check the mapping:
  - `red-*` → `destructive` (e.g., `text-destructive` not `text-red-500`)
  - `green-*` → `success` (e.g., `bg-success/10` not `bg-green-500/10`)
  - `amber-*` / `yellow-*` → `warning` (e.g., `text-warning` not `text-amber-500`)
  - `blue-*` → `info` (e.g., `text-info` not `text-blue-500`)
  - `purple-*` → `primary` (e.g., `text-primary` not `text-purple-500`)
  - `slate-*` / `gray-*` → `muted` / `muted-foreground`
- [ ] **OKLCH Format** - Colors use OKLCH in theme
- [ ] **Class Ordering** - Layout → Sizing → Spacing → Typography → Colors
- [ ] **cn() Utility** - Used for conditional classes
- [ ] **No Inline Styles** - Tailwind classes preferred

### CSS Consistency Agent (CSS)

Validates [CSS Consistency](../../../docs/lessons/css-consistency.md) across all apps in the monorepo:

- [ ] **`@source` Directive** - All apps include `@source` for ui package scanning
- [ ] **CSS Variables Sync** - `:root` and `.dark` variables identical across apps
- [ ] **Semantic Classes Sync** - `@layer utilities` definitions match across apps
- [ ] **Theme Configuration Sync** - `@theme inline` blocks identical across apps
- [ ] **No App-Specific Overrides** - No custom styling that diverges between apps
- [ ] **Computed Styles Match** - Same components render with identical CSS in all apps
- [ ] **Mobile-First** - Responsive classes build up from mobile

### Testing Agent (TEST)

Validates [Testing Rules](../../../docs/lessons/testing.md) and [E2E Selectors](../../../docs/lessons/e2e-selectors.md):

- [ ] **Test Files Exist** - Components have `.test.tsx` files
- [ ] **Test IDs with `tid()`** - **Preferred selector** for all testable elements (stability across UI changes)
- [ ] **Stable State Assertions** - Use ARIA/data attributes, NOT Tailwind classes
- [ ] **Async Handling** - `findBy*` for async, proper `waitFor`
- [ ] **TDD Pattern** - Tests written before implementation
- [ ] **Edge Cases** - Loading, error, empty states tested
- [ ] **No Implementation Testing** - Test behavior, not internals
- [ ] **No Class-Based Assertions** - Never assert on CSS classes for state

### Security Agent (SEC)

Validates security standards:

- [ ] **No Secrets in Code** - API keys in env variables
- [ ] **Input Validation** - User input validated before use
- [ ] **XSS Prevention** - No `dangerouslySetInnerHTML` without sanitization
- [ ] **CSRF Protection** - Forms protected against CSRF
- [ ] **SQL/NoSQL Injection** - Parameterized queries only
- [ ] **Secure Dependencies** - No known vulnerabilities

### Performance Agent (PERF)

Validates performance patterns:

- [ ] **Memoization** - `useMemo`/`useCallback` for expensive operations
- [ ] **Lazy Loading** - Heavy components use `React.lazy()`
- [ ] **Image Optimization** - Next.js `Image` component used
- [ ] **Bundle Size** - No large unused dependencies
- [ ] **Re-render Prevention** - Props properly memoized
- [ ] **Data Fetching** - Efficient patterns (parallel, caching)

### Best Practices Agent (BEST)

Researches and validates latest industry best practices:

- [ ] **React 19 Patterns** - Using latest React features correctly
- [ ] **Next.js 16 Patterns** - App Router best practices
- [ ] **TypeScript Best Practices** - Strict typing, inference usage
- [ ] **Accessibility** - WCAG compliance patterns
- [ ] **Modern APIs** - Using current browser/Node APIs

### Pattern Discovery Agent (PAT)

Discovers undocumented patterns:

- [ ] **Pattern Consistency** - Same pattern used everywhere
- [ ] **Undocumented Patterns** - Good patterns worth documenting
- [ ] **Anti-patterns** - Bad patterns being repeated
- [ ] **Rule Suggestions** - New rules to create

### Bug Detection Agent (BUG)

Analyzes code for potential bugs and runtime errors:

- [ ] **Null/Undefined Handling** - Proper checks before access
- [ ] **Array Bounds** - Safe array access patterns
- [ ] **Async/Await Errors** - Missing try/catch, unhandled promises
- [ ] **State Race Conditions** - State updates that may conflict
- [ ] **Effect Dependencies** - Missing or incorrect useEffect deps
- [ ] **Memory Leaks** - Cleanup in useEffect, event listeners
- [ ] **Type Coercion Bugs** - Implicit type conversions
- [ ] **Logic Errors** - Off-by-one, wrong operators, inverted conditions
- [ ] **Event Handler Bugs** - Missing event.preventDefault(), stale closures
- [ ] **Render Bugs** - Infinite loops, conditional hook calls
- [ ] **Data Flow Bugs** - Props not propagating correctly
- [ ] **Edge Cases** - Empty arrays, empty strings, zero values
- [ ] **Error Boundary Gaps** - Unhandled errors in render
- [ ] **API Response Handling** - Missing error/loading states

---

## i18n Standards

---

## Security Standards

### Critical Security Checks

| Check               | Severity    | Description                    |
| ------------------- | ----------- | ------------------------------ |
| Exposed secrets     | 🔴 Critical | API keys, tokens in code       |
| XSS vulnerabilities | 🔴 Critical | Unsanitized user input in HTML |
| SQL injection       | 🔴 Critical | Unparameterized queries        |
| CSRF missing        | 🟠 Warning  | Forms without CSRF protection  |
| Insecure deps       | 🟠 Warning  | Dependencies with CVEs         |

---

## Performance Standards

### Optimization Checklist

| Pattern         | When to Use                          |
| --------------- | ------------------------------------ |
| `useMemo`       | Expensive calculations               |
| `useCallback`   | Functions passed as props            |
| `React.memo`    | Components with stable props         |
| `React.lazy`    | Large components, below-fold content |
| Dynamic imports | Heavy libraries (charts, editors)    |

### Bundle Size Guidelines

- Single component < 50KB gzipped
- Route chunk < 200KB gzipped
- Total initial load < 500KB gzipped

---

## Report Format

Reports are saved to `.ai-context/reviews/` with this structure:

```markdown
# Code Review Report

**Generated:** YYYY-MM-DD HH:MM:SS
**Scope:** [path reviewed]
**Duration:** [time taken]
**Agents:** [X/12 completed]

## Summary

| Severity      | Count |
| ------------- | ----- |
| 🔴 Critical   | X     |
| 🟠 Warning    | X     |
| 🟡 Suggestion | X     |
| ℹ️ Info       | X     |

## Critical Issues

[Issues listed with ID, file, line, description, rule, fix]

## Warnings

[Issues listed...]

## Suggestions

[Issues listed...]

## Info

[Informational items...]

## Pattern Discovery

[New patterns found, rule suggestions]

## Action Items

[Checkboxes for required actions]
```

---

## Bug Detection Standards

### Critical Bug Patterns

| Pattern                     | Severity    | Example                               |
| --------------------------- | ----------- | ------------------------------------- |
| Null pointer access         | 🔴 Critical | `user.name` without null check        |
| Unhandled promise rejection | 🔴 Critical | `async` without try/catch             |
| Infinite render loop        | 🔴 Critical | State update in render body           |
| Missing effect cleanup      | 🟠 Warning  | Event listeners not removed           |
| Stale closure               | 🟠 Warning  | Outdated state in callback            |
| Missing error boundary      | 🟠 Warning  | Component tree without error handling |

---

## Related

- [Full Review Skill](../full-review/SKILL.md) - `/full-review`
- [Fix Full Review Skill](../fix-full-review/SKILL.md) - `/fix-full-review`
- [Architecture](../../../docs/lessons/architecture.md)
- [SOLID Principles](../../../docs/lessons/solid-principles.md)
- [Testing Rules](../../../docs/lessons/testing.md)
