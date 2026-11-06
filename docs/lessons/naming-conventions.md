# Naming Conventions

## Files & Folders

### Folders

| Type              | Convention               | Example                   |
| ----------------- | ------------------------ | ------------------------- |
| Feature folders   | kebab-case               | `user-management/`        |
| Layer folders     | lowercase                | `domain/`, `application/` |
| Component folders | PascalCase (if grouping) | `LoginForm/`              |

### Files

| Type             | Convention                  | Example              |
| ---------------- | --------------------------- | -------------------- |
| React Components | PascalCase                  | `LoginForm.tsx`      |
| Hooks            | camelCase with `use` prefix | `useAuth.ts`         |
| Utilities        | camelCase                   | `formatDate.ts`      |
| Types/Interfaces | PascalCase                  | `UserTypes.ts`       |
| Constants        | camelCase                   | `apiEndpoints.ts`    |
| Services         | PascalCase with suffix      | `AuthService.ts`     |
| Repositories     | PascalCase with suffix      | `UserRepository.ts`  |
| Test files       | Same as source + `.test`    | `LoginForm.test.tsx` |

**Exception:** Shared UI component files under `src/shared/presentation/components/ui/` may use lowercase filenames to match shadcn/ui conventions.

### Special Files

| File           | Purpose                   |
| -------------- | ------------------------- |
| `index.ts`     | Barrel exports for folder |
| `types.ts`     | Local type definitions    |
| `constants.ts` | Local constants           |
| `schema.ts`    | Validation schemas        |

---

## Code Elements

### Variables & Functions

```typescript
// Variables: camelCase
const userName = "John";
const isLoading = true;
const userList = [];

// Functions: camelCase, verb prefix
function getUserById(id: string) {}
function validateEmail(email: string) {}
function handleSubmit(event: FormEvent) {}

// Boolean variables: is/has/can/should prefix
const isActive = true;
const hasPermission = false;
const canEdit = true;
const shouldRefetch = false;
```

### Constants

```typescript
// Local constants: camelCase
const maxRetries = 3;
const defaultPageSize = 10;

// Global/exported constants: SCREAMING_SNAKE_CASE
export const API_BASE_URL = "/api/v1";
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const DEFAULT_TIMEOUT = 30000;

// Enum-like objects: PascalCase keys
export const UserRole = {
  Admin: "admin",
  User: "user",
  Guest: "guest",
} as const;
```

### Types & Interfaces

```typescript
// Interfaces: PascalCase, noun
interface User {
  id: string;
  email: string;
}

// Type aliases: PascalCase
type UserRole = "admin" | "user" | "guest";
type UserId = string;

// Props interfaces: ComponentName + Props
interface LoginFormProps {
  onSubmit: (data: LoginData) => void;
  isLoading?: boolean;
}

// DTOs: PascalCase + DTO suffix
interface CreateUserDTO {
  email: string;
  password: string;
}

// API responses: PascalCase + Response suffix
interface LoginResponse {
  token: string;
  user: User;
}
```

### React Components

```typescript
// Component: PascalCase function
export function LoginForm({ onSubmit }: LoginFormProps) {
  return <form>...</form>;
}

// Page component: PascalCase + Page suffix
export function LoginPage() {
  return <LoginForm />;
}

// Layout component: PascalCase + Layout suffix
export function DashboardLayout({ children }: LayoutProps) {
  return <div>{children}</div>;
}

// Provider component: PascalCase + Provider suffix
export function AuthProvider({ children }: ProviderProps) {
  return <AuthContext.Provider>{children}</AuthContext.Provider>;
}
```

### Hooks

```typescript
// Custom hooks: camelCase with use prefix
function useAuth() {}
function useLocalStorage(key: string) {}
function useDebounce<T>(value: T, delay: number) {}

// Return objects with clear naming
function useAuth() {
  return {
    user, // noun for data
    isLoading, // boolean with is/has prefix
    login, // verb for actions
    logout,
    isAuthenticated,
  };
}
```

### Event Handlers

```typescript
// Handler functions: handle + Event
const handleClick = () => {};
const handleSubmit = (e: FormEvent) => {};
const handleChange = (value: string) => {};
const handleUserSelect = (user: User) => {};

// Callback props: on + Event
interface Props {
  onClick: () => void;
  onSubmit: (data: FormData) => void;
  onChange: (value: string) => void;
  onUserSelect: (user: User) => void;
}
```

---

## Import Order

Organize imports in this order:

```typescript
// 1. React and Next.js
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 2. Third-party libraries
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

// 3. Shared/global imports
import { Button } from "@/shared/presentation/components";
import { formatDate } from "@/shared/application/utils";

// 4. Feature imports (same feature - use absolute paths for cross-layer)
import { useAuth } from "@/features/auth/application/hooks/useAuth";
import { LoginFormProps } from "./LoginForm.types"; // Same directory OK

// 5. Types (type-only imports last)
import type { User } from "@/features/auth/domain/types";
```

> **Note**: Cross-layer imports in features MUST use absolute paths (`@/features/...`).
> Same-directory relative imports (`./types`) are allowed.

---

## Enforcement

When generating or reviewing code:

1. Verify file names match conventions
2. Check variable/function naming
3. Ensure consistent import ordering
4. Validate type/interface naming patterns
