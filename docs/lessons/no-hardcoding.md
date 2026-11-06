# No Hardcoding Rule

> **Hardcoding is strictly prohibited.** All values must be properly located in configuration, type, constant, or mock files.

---

## Overview

Hardcoded values make code brittle, hard to maintain, and difficult to test. Every value should have a single source of truth in an appropriate location.

---

## What is Hardcoding?

| Type          | Example (BAD)                               | Why It's Bad                             |
| ------------- | ------------------------------------------- | ---------------------------------------- |
| Magic numbers | `if (status === 3)`                         | Meaning unclear, changes require hunting |
| Magic strings | `role === 'admin'`                          | Typos cause bugs, no autocomplete        |
| Inline types  | `user: { id: string; name: string }`        | Duplicated, inconsistent                 |
| Inline mocks  | `const data = [{ id: '1', name: 'Test' }]`  | Scattered, hard to maintain              |
| Inline config | `const API_URL = 'https://api.example.com'` | Environment-specific, security risk      |

---

## Where Values Should Live

### 1. Magic Numbers & Strings → Constants

```typescript
// ❌ BAD: Magic numbers
if (retries > 3) {
}
if (status === 200) {
}
setTimeout(() => {}, 5000);

// ✅ GOOD: Named constants
// In: features/[feature]/domain/constants.ts or shared/domain/constants.ts
export const MAX_RETRIES = 3;
export const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;
export const POLLING_INTERVAL_MS = 5000;

// Usage
if (retries > MAX_RETRIES) {
}
if (status === HTTP_STATUS.OK) {
}
setTimeout(() => {}, POLLING_INTERVAL_MS);
```

```typescript
// ❌ BAD: Magic strings
if (user.role === "admin") {
}
if (status === "pending") {
}

// ✅ GOOD: Enum-like constants
// In: features/[feature]/domain/constants.ts
export const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
  GUEST: "guest",
} as const;

export const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
} as const;

// Usage
if (user.role === USER_ROLES.ADMIN) {
}
if (status === ORDER_STATUS.PENDING) {
}
```

### 2. Types & Interfaces → Type Files

```typescript
// ❌ BAD: Inline types in components
function UserCard({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {}

// ❌ BAD: Inline types in hooks
function useUsers(): {
  users: Array<{ id: string; name: string }>;
  loading: boolean;
} {}

// ✅ GOOD: Types in domain layer
// In: features/users/domain/types/index.ts
export interface User {
  id: string;
  name: string;
  email: string;
}

// In: features/users/domain/types/index.ts
export interface UseUsersReturn {
  users: User[];
  loading: boolean;
}

// Usage
import type { User, UseUsersReturn } from "@/features/users/domain/types";

function UserCard({ user }: { user: User }) {}
function useUsers(): UseUsersReturn {}
```

### 3. Mock Data → Mock Files

```typescript
// ❌ BAD: Inline mock data in components
function UserList() {
  const mockUsers = [
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  ];
  return <List items={mockUsers} />;
}

// ❌ BAD: Inline mock data in tests
it('renders users', () => {
  const users = [
    { id: '1', name: 'Test User', email: 'test@example.com' },
  ];
  render(<UserList users={users} />);
});

// ✅ GOOD: Centralized mock data
// In: src/mocks/data/users.ts
import type { User } from '@/features/users/domain/types';

export const mockUsers: User[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
];

export const createMockUser = (overrides?: Partial<User>): User => ({
  id: crypto.randomUUID(),
  name: 'Test User',
  email: 'test@example.com',
  ...overrides,
});

// Usage in tests
import { mockUsers, createMockUser } from '@/mocks/data/users';

it('renders users', () => {
  render(<UserList users={mockUsers} />);
});

it('renders single user', () => {
  const user = createMockUser({ name: 'Custom Name' });
  render(<UserCard user={user} />);
});
```

### 4. Configuration → Config Files

```typescript
// ❌ BAD: Hardcoded configuration
const API_URL = 'https://api.example.com';
const FEATURE_FLAGS = { newDashboard: true };
const THEME = { primaryColor: '#007bff' };

// ✅ GOOD: Environment variables for runtime config
// In: .env.local
NEXT_PUBLIC_API_URL=https://api.example.com

// In: shared/infrastructure/config/env.ts
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  enableMocks: process.env.NEXT_PUBLIC_ENABLE_MOCKS === 'true',
} as const;

// ✅ GOOD: Feature flags in config
// In: shared/infrastructure/config/features.ts
export const featureFlags = {
  newDashboard: true,
  experimentalFeature: false,
} as const;

// ✅ GOOD: Theme in theme config
// In: shared/presentation/theme/tokens.ts or globals.css
export const themeTokens = {
  colors: {
    primary: 'oklch(0.6 0.15 250)',
  },
} as const;
```

### 5. API Endpoints → API Config

```typescript
// ❌ BAD: Hardcoded endpoints scattered in code
const response = await fetch("/api/v1/users");
const data = await fetch("/api/v1/orders/123");

// ✅ GOOD: Centralized endpoint definitions
// In: features/[feature]/infrastructure/api/endpoints.ts
export const USER_ENDPOINTS = {
  list: "/api/v1/users",
  detail: (id: string) => `/api/v1/users/${id}`,
  create: "/api/v1/users",
} as const;

// Usage
import { USER_ENDPOINTS } from "./endpoints";
const response = await fetch(USER_ENDPOINTS.list);
const data = await fetch(USER_ENDPOINTS.detail("123"));
```

---

## File Organization

| Value Type         | Location                                             | Example Path                                     |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| Domain constants   | `features/[feature]/domain/constants.ts`             | `features/orders/domain/constants.ts`            |
| Shared constants   | `shared/domain/constants.ts`                         | `shared/domain/constants.ts`                     |
| Feature types      | `features/[feature]/domain/types/index.ts`           | `features/users/domain/types/index.ts`           |
| Shared types       | `shared/domain/types/index.ts`                       | `shared/domain/types/index.ts`                   |
| Mock data          | `src/mocks/data/[entity].ts`                         | `src/mocks/data/users.ts`                        |
| Mock handlers      | `src/mocks/handlers/[feature].ts`                    | `src/mocks/handlers/users.ts`                    |
| Environment config | `shared/infrastructure/config/env.ts`                | `shared/infrastructure/config/env.ts`            |
| Feature flags      | `shared/infrastructure/config/features.ts`           | `shared/infrastructure/config/features.ts`       |
| API endpoints      | `features/[feature]/infrastructure/api/endpoints.ts` | `features/users/infrastructure/api/endpoints.ts` |
| Theme tokens       | `shared/presentation/theme/` or `globals.css`        | CSS variables or theme file                      |

---

## Detection Patterns

### Magic Numbers to Flag

```typescript
// Flag numbers that aren't obvious (0, 1, -1 may be OK contextually)
> 1 && < 100           // Likely magic number
=== 200, 404, 500      // HTTP status - use constants
setTimeout(*, 5000)    // Timing - use named constant
.slice(0, 10)          // Pagination - use constant
```

### Magic Strings to Flag

```typescript
// Flag string comparisons
=== 'admin'            // Role - use constant
=== 'pending'          // Status - use constant
=== 'success'          // State - use constant
'/api/v1/*'            // Endpoint - use config
'https://*'            // URL - use env variable
```

### Inline Types to Flag

```typescript
// Flag inline object types in function signatures
: { id: string; ...}   // Should be named interface
Array<{ ... }>         // Should reference domain type
Promise<{ ... }>       // Should reference domain type
```

### Inline Mocks to Flag

```typescript
// Flag array/object literals that look like mock data
= [{ id: '1', ...      // Mock array - move to mocks/
= { id: 'test', ...    // Mock object - move to mocks/
```

---

## Exceptions

Some values are acceptable inline:

| Acceptable        | Example                | Reason            |
| ----------------- | ---------------------- | ----------------- |
| Array indices     | `arr[0]`, `arr[i + 1]` | Standard patterns |
| Math operations   | `n * 2`, `n / 2`       | Clear intent      |
| Boolean defaults  | `false`, `true`        | Self-documenting  |
| Empty collections | `[]`, `{}`             | Initialization    |
| CSS classes       | `'flex items-center'`  | Tailwind classes  |
| Test descriptions | `'renders correctly'`  | Test-specific     |

---

## Enforcement

When reviewing code:

1. **Search for magic numbers**: Numbers > 1 in comparisons or assignments
2. **Search for string comparisons**: `=== '...'` or `!== '...'` patterns
3. **Search for inline types**: `{ prop: type }` in function signatures
4. **Search for inline mocks**: Array/object literals with test-like data
5. **Verify constants exist**: Check domain/constants.ts files
6. **Verify types exist**: Check domain/types/ directories

### Severity

| Violation                       | Severity      |
| ------------------------------- | ------------- |
| Hardcoded secrets/credentials   | 🔴 Critical   |
| Hardcoded API URLs              | 🔴 Critical   |
| Magic numbers in business logic | 🟠 Warning    |
| Magic strings for status/roles  | 🟠 Warning    |
| Inline types (duplicated)       | 🟠 Warning    |
| Inline mock data                | 🟡 Suggestion |
| Single-use inline type          | 🟡 Suggestion |

---

## Related

- [Single Source of Truth](./single-source-of-truth.md) - Colors, typography, i18n from one source
- [Architecture Rules](./architecture.md) - Where files should live
- [DRY Principle](./dry-principle.md) - Single source of truth
- [Naming Conventions](./naming-conventions.md) - How to name constants
