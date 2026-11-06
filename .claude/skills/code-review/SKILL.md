---
name: code-review
description: Review code for DRY, SOLID, KISS, and architecture rule violations with actionable feedback and suggested fixes; use when asked to review code quality or principles.
---

# Code Review

## Description

Reviews code for violations of DRY, SOLID, KISS principles, and project architecture rules. Provides actionable feedback with specific suggestions for improvement.

## Usage

```
/code-review [file-or-folder]
```

or

```
Review this code for principle violations
Review the orders feature for SOLID compliance
Check if this component follows DRY
```

## Parameters

| Parameter        | Required | Description                                                   |
| ---------------- | -------- | ------------------------------------------------------------- |
| `file-or-folder` | No       | Specific path to review (defaults to recent changes)          |
| `--principles`   | No       | Focus on specific principles (dry, solid, kiss, architecture) |
| `--fix`          | No       | Automatically suggest fixes                                   |

## Review Checklist

### 1. SOLID Principles

#### Single Responsibility (SRP)

- [ ] Does each component/hook do one thing?
- [ ] Are there multiple reasons this code might change?
- [ ] Is the file over 200 lines? (warning sign)

**Red flags:**

- Component with multiple `useEffect` for unrelated data
- Service with methods for different domains
- Hook that manages multiple unrelated states

#### Open/Closed (OCP)

- [ ] Can new variants be added without modification?
- [ ] Are there long if/else or switch chains?
- [ ] Is behavior configurable via props/parameters?

**Red flags:**

- Adding new features requires modifying existing code
- Type checking with `if (type === 'x')` patterns
- Hard-coded behaviors that should be configurable

#### Liskov Substitution (LSP)

- [ ] Do derived types honor base contracts?
- [ ] Are optional props silently ignored?
- [ ] Do implementations match interface promises?

**Red flags:**

- Components ignoring passed handlers
- Implementations throwing for interface methods
- Props that don't work as expected

#### Interface Segregation (ISP)

- [ ] Are interfaces focused and minimal?
- [ ] Are components forced to accept unused props?
- [ ] Are hook returns bloated with unused values?

**Red flags:**

- Components with 10+ props where most are optional
- Hooks returning objects with 10+ properties
- Interfaces with methods that aren't all used together

#### Dependency Inversion (DIP)

- [ ] Are components depending on abstractions (hooks)?
- [ ] Are services depending on interfaces?
- [ ] Are external services injected, not imported?

**Red flags:**

- Direct API calls in components
- Importing concrete implementations in services
- Hard-coded external dependencies

### 2. DRY Principle

- [ ] Is the same logic repeated in multiple places?
- [ ] Are there duplicated type definitions?
- [ ] Are magic numbers/strings repeated?
- [ ] Is the same validation repeated?

**Red flags:**

- Copy-pasted code blocks
- Same regex in multiple files
- Duplicated API endpoints
- Repeated formatting logic

### 3. KISS Principle

- [ ] Is the solution as simple as possible without being brittle?
- [ ] Are abstractions justified by real reuse or risk?
- [ ] Would small duplication be clearer than added indirection?

**Red flags:**

- Abstractions created for a single use
- Deep indirection for trivial logic
- DRY refactors that make the code harder to read

### 4. Architecture Rules

- [ ] Are layer dependencies correct (inward only)?
- [ ] Is the `/app` directory thin (routing only)?
- [ ] Are features self-contained?
- [ ] Is shared code truly generic?
- [ ] Are cross-feature imports avoided?

**Red flags:**

- Importing from `features/X` in `features/Y`
- Business logic in route files
- Feature-specific code in shared
- Infrastructure importing from presentation

### 5. One Component Per File

- [ ] Does each `.tsx` file export only ONE component?
- [ ] Are multiple unrelated components split into separate files?
- [ ] Are compound components properly grouped (valid exception)?

**Red flags:**

- Multiple `export function` returning JSX in one file
- "Index" files with many component exports
- Nested component definitions inside other components

See [One Component Per File Rule](../../rules/one-component-per-file.md).

### 6. Styling Policies

#### Semantic Colors Only

- [ ] Are all colors using semantic tokens from the theme (`text-destructive`, `bg-success`, `text-warning`, `bg-info`, `text-primary`)?
- [ ] Are raw Tailwind palette colors avoided (`text-red-500`, `bg-green-500`, `text-blue-400`, `bg-amber-500`)?
- [ ] Do color maps and style constants reference semantic tokens, not palette colors?

**Red flags:**

- `text-red-500` instead of `text-destructive`
- `bg-green-500/10` instead of `bg-success/10`
- `text-blue-500` instead of `text-info`
- `bg-amber-500` instead of `bg-warning`
- `text-purple-500` instead of `text-primary`
- Color maps using raw palette: `{ iconColor: "text-red-500", bg: "bg-red-950/90" }`

**Semantic color mapping:**

| Raw Palette | Semantic Token               |
| ----------- | ---------------------------- |
| `red-*`     | `destructive`                |
| `green-*`   | `success`                    |
| `amber-*`   | `warning`                    |
| `blue-*`    | `info`                       |
| `purple-*`  | `primary`                    |
| `slate-*`   | `muted` / `muted-foreground` |

**Key principle:** All colors must come from the theme's semantic tokens defined in `packages/ui/src/styles/colors.css`. This ensures colors adapt correctly to light/dark mode and theme changes. See [Single Source of Truth](../../../docs/lessons/single-source-of-truth.md#colors-semantic-only).

#### Tailwind Classes Stay Inline

- [ ] Are Tailwind classes kept inline (not extracted to JS constants)?
- [ ] If class patterns repeat often, is a component created instead of a constant?

**Red flags:**

- `const CARD_STYLES = "rounded-lg border p-4";` - Tailwind classes in constants
- Extracting Tailwind class strings to variables

**Allowed exception:** `cva()` from class-variance-authority for component variants.

#### CSS Variables Stay as Strings

- [ ] Are CSS variables used as inline strings (not extracted to JS constants)?
- [ ] Is styling kept in CSS rather than JavaScript?

**Red flags:**

- `const MUTED_COLOR = "var(--muted-foreground)";` - CSS vars in JS constants
- Creating `COLORS` objects with CSS variable strings
- Moving color definitions from CSS to JavaScript

**Key principle:** Anything that exists as a CSS variable must be used as a CSS variable string directly. CSS variables are already the single source of truth in `globals.css`.

See [Code Review Standards](../../../docs/lessons/code-review-standards.md#tailwind-class-strings-policy) for full policies.

## Steps

1. **Identify scope**
   - Single file, folder, or feature
   - Recent changes or full review

2. **Check SOLID violations**
   - Run through each principle
   - Note specific line numbers
   - Categorize by severity (critical, warning, suggestion)

3. **Check DRY violations**
   - Search for duplicated code patterns
   - Check for repeated constants/types
   - Identify abstraction opportunities

4. **Apply KISS guardrail**
   - Prefer simpler fixes over new abstractions
   - Downgrade or skip DRY suggestions that add complexity

5. **Check Architecture violations**
   - Verify import directions
   - Check layer placement
   - Validate feature isolation

6. **Generate report**

   ```markdown
   ## Code Review: [scope]

   ### Critical Issues

   - [ ] Issue description (file:line)

   ### Warnings

   - [ ] Warning description (file:line)

   ### Suggestions

   - [ ] Suggestion description (file:line)

   ### Summary

   - X critical issues
   - Y warnings
   - Z suggestions
   ```

7. **Provide fixes (if --fix)**
   - Show before/after code
   - Explain the improvement

## Examples

### Example 1: Review a feature

```
/code-review src/features/orders
```

Output:

```markdown
## Code Review: src/features/orders

### Critical Issues

- [ ] **SRP Violation**: `OrderPage.tsx` handles fetching, filtering, AND modal state (lines 15-89)
  - Split into `OrderList`, `OrderFilters`, and use `useOrderModal` hook

### Warnings

- [ ] **DRY**: Order status colors defined in 3 places
  - `OrderCard.tsx:23`
  - `OrderTable.tsx:45`
  - `OrderBadge.tsx:12`
  - Extract to `orderConstants.ts`

### Suggestions

- [ ] **OCP**: `OrderCard` uses switch for status styling
  - Consider a status-to-style map for extensibility

### Summary

- 1 critical issue
- 1 warning
- 1 suggestion
```

### Example 2: Review for specific principle

```
/code-review src/features/users --principles=dry
```

### Example 3: Review with fixes

```
/code-review src/shared/components/Button.tsx --fix
```

Output includes:

```typescript
// BEFORE (line 15-25)
if (variant === "primary") {
  return "bg-blue-500";
} else if (variant === "secondary") {
  return "bg-gray-500";
} else if (variant === "danger") {
  return "bg-red-500";
}

// AFTER
const variantStyles = {
  primary: "bg-blue-500",
  secondary: "bg-gray-500",
  danger: "bg-red-500",
} as const;

return variantStyles[variant];
```

## Severity Levels

| Level          | Description                                  | Action          |
| -------------- | -------------------------------------------- | --------------- |
| **Critical**   | Architectural violation, will cause problems | Fix immediately |
| **Warning**    | Principle violation, technical debt          | Fix soon        |
| **Suggestion** | Improvement opportunity                      | Consider fixing |

## Generated Code Policy

- Treat files in `generated`/`__generated__` or with "auto-generated" headers as generated.
- **Never** suggest refactors or improvements in generated files.
- Only report consistency issues (typing, naming, signature/shape mismatches).

## Notes

- Focus on actionable feedback with specific locations
- Provide code examples for fixes
- Consider context - not all "violations" need fixing
- Balance principles with pragmatism
- Flag false positives as acceptable when justified
