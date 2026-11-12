# Component Patterns

> Component names and files follow [Naming Conventions](./naming-conventions.md#files--folders).
> **One component per file** - See [One Component Per File Rule](./one-component-per-file.md).

## Component Structure

### Standard Component Template

```typescript
'use client'; // Only if component needs client-side features

import { useState, useCallback } from 'react';

// External imports
import { Button } from '@/shared/presentation/components';

// Feature imports (use absolute paths for cross-layer imports)
import { useFeatureHook } from '@/features/[feature]/application/hooks';

// Local imports
import { ComponentProps } from './Component.types';
import { validationSchema } from './Component.schema';
import styles from './Component.module.css'; // if using CSS modules

/**
 * Brief description of what the component does.
 */
export function Component({ prop1, prop2, onAction }: ComponentProps) {
  // 1. Hooks (all hooks at the top)
  const [state, setState] = useState<StateType>(initialState);
  const { data, isLoading } = useFeatureHook();

  // 2. Derived state / memoization
  const derivedValue = useMemo(() => computeValue(data), [data]);

  // 3. Event handlers
  const handleClick = useCallback(() => {
    // handler logic
    onAction?.();
  }, [onAction]);

  // 4. Early returns (loading, error states)
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!data) {
    return <EmptyState />;
  }

  // 5. Main render
  return (
    <div className={styles.container}>
      {/* Component JSX */}
    </div>
  );
}
```

### Co-located Files

Group related files together:

```
features/auth/presentation/components/
└── LoginForm/
    ├── index.ts              # Re-export
    ├── LoginForm.tsx         # Component
    ├── LoginForm.types.ts    # Props & local types
    ├── LoginForm.schema.ts   # Validation schema
    ├── LoginForm.test.tsx    # Tests
    └── LoginForm.module.css  # Styles (if CSS modules)
```

```typescript
// LoginForm/index.ts
export { LoginForm } from "./LoginForm";
export type { LoginFormProps } from "./LoginForm.types";
```

---

## Component Types

### Page Components

Full page compositions that orchestrate feature logic:

```typescript
// features/auth/presentation/pages/LoginPage.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/application/hooks/useAuth';
import { LoginForm } from '../components/LoginForm';
import { PageLayout } from '@/shared/presentation/layouts';

export function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error } = useAuth();

  const handleSuccess = () => {
    router.push('/dashboard');
  };

  return (
    <PageLayout title="Login">
      <LoginForm
        onSubmit={login}
        onSuccess={handleSuccess}
        isLoading={isLoading}
        error={error}
      />
    </PageLayout>
  );
}
```

### Feature Components

Components specific to a feature's business logic:

```typescript
// features/users/presentation/components/UserCard.tsx
import { User } from '../../domain/types';
import { Avatar } from '@/shared/presentation/components';

interface UserCardProps {
  user: User;
  onSelect?: (user: User) => void;
}

export function UserCard({ user, onSelect }: UserCardProps) {
  return (
    <div onClick={() => onSelect?.(user)}>
      <Avatar src={user.avatar} alt={user.name} />
      <span>{user.name}</span>
      <span>{user.role}</span>
    </div>
  );
}
```

### Shared UI Components

Generic, reusable components with no business logic:

```typescript
// shared/presentation/components/Button/Button.tsx
import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? <Spinner /> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

---

## Patterns

### Compound Components

For complex UI with related sub-components:

```typescript
// shared/presentation/components/Card/Card.tsx
interface CardProps {
  children: ReactNode;
}

function Card({ children }: CardProps) {
  return <div className="card">{children}</div>;
}

function CardHeader({ children }: { children: ReactNode }) {
  return <div className="card-header">{children}</div>;
}

function CardBody({ children }: { children: ReactNode }) {
  return <div className="card-body">{children}</div>;
}

function CardFooter({ children }: { children: ReactNode }) {
  return <div className="card-footer">{children}</div>;
}

// Attach sub-components
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export { Card };

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

### Render Props / Children as Function

For flexible rendering control:

```typescript
interface DataListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string;
}

function DataList<T>({ data, renderItem, keyExtractor }: DataListProps<T>) {
  return (
    <ul>
      {data.map((item, index) => (
        <li key={keyExtractor(item)}>
          {renderItem(item, index)}
        </li>
      ))}
    </ul>
  );
}

// Usage
<DataList
  data={users}
  keyExtractor={(user) => user.id}
  renderItem={(user) => <UserCard user={user} />}
/>
```

### Container/Presenter Pattern

Separate data fetching from presentation:

```typescript
// Container (handles data)
// features/users/presentation/components/UserListContainer.tsx
export function UserListContainer() {
  const { users, isLoading, error } = useUsers();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;

  return <UserList users={users} />;
}

// Presenter (pure UI)
// features/users/presentation/components/UserList.tsx
interface UserListProps {
  users: User[];
}

export function UserList({ users }: UserListProps) {
  return (
    <ul>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </ul>
  );
}
```

---

## Server vs Client Components

### Server Components (Default in App Router)

Use for:

- Data fetching
- Accessing backend resources
- Keeping sensitive info on server
- Large dependencies

```typescript
// No 'use client' directive = Server Component
import { getUsers } from '@/features/users/infrastructure/api';

export async function UserListServer() {
  const users = await getUsers();
  return <UserList users={users} />;
}
```

### Client Components

Use for:

- Interactivity (onClick, onChange)
- State (useState, useReducer)
- Effects (useEffect)
- Browser APIs

```typescript
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### Mixing Server and Client

```typescript
// Server Component
import { ClientInteractiveComponent } from './ClientComponent';

export async function ServerPage() {
  const data = await fetchData();

  return (
    <div>
      <h1>Server rendered: {data.title}</h1>
      <ClientInteractiveComponent initialData={data} />
    </div>
  );
}
```

---

## Anti-Patterns to Avoid

### 1. Props Drilling

```typescript
// BAD: Passing props through many levels
<GrandParent user={user}>
  <Parent user={user}>
    <Child user={user}>
      <GrandChild user={user} />  // Finally used here
    </Child>
  </Parent>
</GrandParent>

// GOOD: Use Context or composition
<UserProvider user={user}>
  <GrandParent>
    <Parent>
      <Child>
        <GrandChild />  // Uses useUser() hook
      </Child>
    </Parent>
  </GrandParent>
</UserProvider>
```

### 2. God Components

```typescript
// BAD: Component doing too much
function Dashboard() {
  // 200 lines of hooks, state, handlers...
  return (/* 500 lines of JSX */);
}

// GOOD: Split into focused components
function Dashboard() {
  return (
    <DashboardLayout>
      <DashboardHeader />
      <DashboardStats />
      <DashboardCharts />
      <DashboardRecentActivity />
    </DashboardLayout>
  );
}
```

### 3. Business Logic in Components

```typescript
// BAD: Business logic in component
function OrderForm() {
  const calculateTotal = (items) => {
    // Complex pricing logic here...
  };
}

// GOOD: Extract to service/hook
function OrderForm() {
  const { calculateTotal } = useOrderCalculations();
}
```

### 4. Multiple Components in One File

```typescript
// BAD: Multiple unrelated components in one file
// UserComponents.tsx
export function UserCard() { ... }
export function UserList() { ... }
export function UserForm() { ... }

// GOOD: One component per file
// UserCard.tsx
export function UserCard() { ... }

// UserList.tsx
export function UserList() { ... }

// UserForm.tsx
export function UserForm() { ... }
```

See [One Component Per File Rule](./one-component-per-file.md) for complete guidelines and exceptions (compound components, etc.).
