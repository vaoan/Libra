# One Component Per File Rule

> "Each file should have a single responsibility - one React component per file."

---

## Rule

**Each `.tsx` file MUST export only ONE React component as its primary export.**

This keeps components focused, improves readability, and makes the codebase easier to navigate.

---

## What Counts as a Component

A React component is a function that:

- Returns JSX (or null)
- Has a PascalCase name
- Can receive props

```typescript
// This is a component
function UserCard({ user }: UserCardProps) {
  return <div>{user.name}</div>;
}

// This is NOT a component (utility function)
function formatUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
```

---

## Valid Patterns

### Single Component Per File (Required)

```typescript
// UserCard.tsx - CORRECT
export function UserCard({ user }: UserCardProps) {
  return (
    <div className="card">
      <Avatar src={user.avatar} />
      <span>{user.name}</span>
    </div>
  );
}
```

### Component + Internal Helpers (Allowed)

Internal helper functions that serve the component are fine:

```typescript
// UserCard.tsx - CORRECT
// Internal helper (not exported)
function formatDisplayName(user: User): string {
  return user.nickname || user.name;
}

export function UserCard({ user }: UserCardProps) {
  const displayName = formatDisplayName(user);
  return <div>{displayName}</div>;
}
```

### Component + Variant Definitions (Allowed)

Exporting variant/style definitions alongside the component is acceptable:

```typescript
// Button.tsx - CORRECT
import { cva } from 'class-variance-authority';

export const buttonVariants = cva('rounded-md font-medium', {
  variants: {
    variant: {
      primary: 'bg-primary text-primary-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
    },
  },
});

export function Button({ variant, ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant })} {...props} />;
}
```

### Component + Types (Allowed)

Co-located types are expected:

```typescript
// UserCard.tsx - CORRECT
export interface UserCardProps {
  user: User;
  onClick?: (user: User) => void;
}

export function UserCard({ user, onClick }: UserCardProps) {
  return <div onClick={() => onClick?.(user)}>{user.name}</div>;
}
```

---

## Exceptions

### shadcn/ui Components

The `src/shared/presentation/components/ui/` directory contains third-party shadcn/ui components:

```typescript
// dropdown-menu.tsx - shadcn/ui pattern (ONLY exception)
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuContent = React.forwardRef(...);
// etc.
```

**Why this exception exists:**

- These are copy-pasted from shadcn/ui library
- Modifying them increases maintenance burden when updating
- The compound component pattern is part of their design

### Test Files

Test files (`*.test.tsx`, `*.spec.tsx`) are excluded from this rule:

```typescript
// LoginForm.test.tsx - Mock components allowed
vi.mock("@/shared/presentation/components/NavigationMenu", () => ({
  NavigationMenu: ({ isCollapsed }: { isCollapsed: boolean }) => (
    <nav data-testid="navigation-menu">Mock Nav</nav>
  ),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  // ... multiple mock components are fine in tests
}));
```

**Why this exception exists:**

- Tests often need multiple mock components for `vi.mock()` factory functions
- Mock components are test utilities, not production code
- Forcing separate files for mocks would create unnecessary test complexity

---

## Invalid Patterns

### Multiple Unrelated Components

```typescript
// BAD - Multiple unrelated components in one file
// UserComponents.tsx

export function UserCard({ user }: UserCardProps) {
  return <div>{user.name}</div>;
}

export function UserList({ users }: UserListProps) {  // VIOLATION
  return <ul>{users.map(u => <UserCard key={u.id} user={u} />)}</ul>;
}

export function UserForm({ onSubmit }: UserFormProps) {  // VIOLATION
  return <form onSubmit={onSubmit}>...</form>;
}
```

**Fix:** Split into separate files:

- `UserCard.tsx`
- `UserList.tsx`
- `UserForm.tsx`

### "Index" Component Files

```typescript
// BAD - Putting all components in one file for "convenience"
// components.tsx

export function Header() { ... }
export function Footer() { ... }
export function Sidebar() { ... }
export function MainContent() { ... }
```

**Fix:** One file per component, use `index.ts` for barrel exports.

### Nested Component Definitions

```typescript
// BAD - Component defined inside another component
export function UserPage() {
  // This creates a new component on every render!
  function UserCard({ user }) {  // VIOLATION
    return <div>{user.name}</div>;
  }

  return <UserCard user={currentUser} />;
}
```

**Fix:** Extract to separate file or define outside the parent:

```typescript
// GOOD - Component defined outside
function UserCard({ user }: UserCardProps) {
  return <div>{user.name}</div>;
}

export function UserPage() {
  return <UserCard user={currentUser} />;
}
```

---

## Detection Patterns

### What to Flag

| Pattern                                         | Severity   | Description                        |
| ----------------------------------------------- | ---------- | ---------------------------------- |
| Multiple `export function` returning JSX        | 🟠 Warning | Multiple component exports         |
| Multiple `export const X = () =>` returning JSX | 🟠 Warning | Multiple arrow function components |
| Component defined inside another component      | 🟠 Warning | Nested component definition        |
| File with 2+ PascalCase exports returning JSX   | 🟠 Warning | Multiple component exports         |

### What to Allow

| Pattern                                 | Description                      |
| --------------------------------------- | -------------------------------- |
| Single component + internal helpers     | Helper functions not exported    |
| Single component + types                | Props interfaces co-located      |
| Single component + variants             | CVA or style variants            |
| shadcn/ui patterns in `ui/` folder only | Third-party framework convention |
| Mock components in test files           | `vi.mock()` factory functions    |

---

## Why This Matters

### 1. Readability

- Each file has one purpose
- Easy to find components by filename
- Clear component boundaries

### 2. Maintainability

- Changes to one component don't affect others
- Easier to refactor or delete
- Clear ownership

### 3. Testing

- One test file per component
- Isolated unit tests
- Clear test scope

### 4. Performance

- Better code splitting
- Smaller bundle chunks
- Easier tree shaking

### 5. Navigation

- File name matches component name
- IDE "Go to file" works intuitively
- Import paths are clear

---

## Enforcement

### Severity

| Violation                                 | Severity      |
| ----------------------------------------- | ------------- |
| Multiple unrelated components             | 🟠 Warning    |
| Nested component definitions              | 🟠 Warning    |
| Compound components without clear pattern | 🟡 Suggestion |

### Automated Checks

This rule is checked by:

- **ESLint** - `react/no-multi-comp` rule (see `eslint.config.mjs`)
- `/full-review` - COMP agent
- `/code-review` - Component structure check
- `/commit-push` - Pre-commit review
- `/sync-with-develop` - Merge review

### ESLint Configuration

The rule is enforced in `eslint.config.mjs`:

```javascript
{
  files: ["src/**/*.tsx"],
  ignores: [
    // Only shadcn/ui components excluded (third-party compound component pattern)
    "src/shared/presentation/components/ui/**",
    // Test files may have mock components
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx",
  ],
  rules: {
    "react/no-multi-comp": ["error", { ignoreStateless: false }],
  },
}
```

---

## Quick Reference

| Allowed                       | Not Allowed                   |
| ----------------------------- | ----------------------------- |
| 1 component + helpers         | 2+ unrelated components       |
| 1 component + types           | Components in index file      |
| 1 component + variants        | Nested component definitions  |
| shadcn/ui only (`ui/` folder) | Compound components elsewhere |
| Mock components in test files | "Convenience" groupings       |

---

## Related

- [Component Patterns](./component-patterns.md) - Component structure rules
- [Naming Conventions](./naming-conventions.md) - File naming rules
- [SOLID Principles](./solid-principles.md) - Single Responsibility
- [Architecture Rules](./architecture.md) - File organization
