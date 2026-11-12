# DRY Principle

> "Don't Repeat Yourself" - Every piece of knowledge must have a single, unambiguous, authoritative representation within a system.

---

## Core Concept

DRY is about **knowledge duplication**, not just code duplication. If you change something in one place, you shouldn't need to change it in multiple places.

### What DRY Is

- Eliminating **knowledge** duplication
- Creating **single sources of truth**
- Making changes in **one place**

### What DRY Is NOT

- Blindly merging similar-looking code
- Creating abstractions for everything
- Sacrificing readability for brevity

---

## Rule of Three

> "Duplicate code once, but not twice."

Before abstracting, wait until you see the **same pattern three times**. This prevents premature abstraction.

```typescript
// First occurrence - just write it
function UserCard({ user }) {
  return <div className="p-4 border rounded">{user.name}</div>;
}

// Second occurrence - note the similarity, but don't abstract yet
function ProductCard({ product }) {
  return <div className="p-4 border rounded">{product.name}</div>;
}

// Third occurrence - NOW abstract
function Card({ children, className }) {
  return <div className={cn("p-4 border rounded", className)}>{children}</div>;
}
```

---

## Types of Duplication

### 1. Knowledge Duplication (ELIMINATE)

The same business rule or data in multiple places:

```typescript
// BAD: Validation rules duplicated
// In form component
const isValidEmail = email.includes("@") && email.includes(".");

// In API layer
if (!email.includes("@") || !email.includes(".")) {
  throw new Error("Invalid email");
}

// In another form
const emailValid = email.includes("@") && email.includes(".");

// GOOD: Single source of truth
// shared/application/utils/validation.ts
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Use everywhere
import { isValidEmail } from "@/shared/application/utils/validation";
```

```typescript
// BAD: API endpoints duplicated
// In userApi.ts
const response = await fetch("https://api.example.com/v2/users");

// In orderApi.ts
const response = await fetch("https://api.example.com/v2/orders");

// In productApi.ts
const response = await fetch("https://api.example.com/v2/products");

// GOOD: Centralized configuration
// shared/infrastructure/config/api.ts
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// shared/infrastructure/api/client.ts
export const api = axios.create({
  baseURL: API_BASE_URL,
});
```

### 2. Structural Duplication (CONSIDER ABSTRACTING)

Similar code structure that may evolve differently:

```typescript
// These LOOK similar but serve different purposes
// Consider if they'll change together before abstracting

// User form - may add role selection later
function UserForm() {
  return (
    <form>
      <input name="name" />
      <input name="email" />
      <button type="submit">Save</button>
    </form>
  );
}

// Contact form - may add message field later
function ContactForm() {
  return (
    <form>
      <input name="name" />
      <input name="email" />
      <button type="submit">Send</button>
    </form>
  );
}

// These are fine as separate - they'll likely diverge
```

### 3. Coincidental Duplication (KEEP SEPARATE)

Code that looks the same but represents different concepts:

```typescript
// BAD: Forcing abstraction on unrelated code
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Trying to reuse for completely different purpose
const userScore = calculateTotal(activities); // Doesn't make sense!

// GOOD: Keep separate - they're different concepts
function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function calculateUserScore(activities: Activity[]): number {
  return activities.reduce((sum, activity) => sum + activity.points, 0);
}
```

---

## DRY Strategies

### 1. Extract Constants

```typescript
// BAD: Magic numbers/strings repeated
if (user.role === "admin") {
}
if (response.status === 200) {
}
if (retries < 3) {
}

// GOOD: Named constants
const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
  GUEST: "guest",
} as const;

const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
} as const;

const MAX_RETRIES = 3;

if (user.role === USER_ROLES.ADMIN) {
}
if (response.status === HTTP_STATUS.OK) {
}
if (retries < MAX_RETRIES) {
}
```

### 2. Extract Utility Functions

```typescript
// BAD: Date formatting repeated
const formattedDate1 = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
const formattedDate2 = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

// GOOD: Utility function
// shared/application/utils/dateUtils.ts
export function formatDate(date: Date, format = "MM/DD/YYYY"): string {
  return format
    .replace("MM", String(date.getMonth() + 1).padStart(2, "0"))
    .replace("DD", String(date.getDate()).padStart(2, "0"))
    .replace("YYYY", String(date.getFullYear()));
}
```

### 3. Extract Custom Hooks

```typescript
// BAD: Same data fetching pattern repeated
function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchUsers()
      .then(setUsers)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
}

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchOrders()
      .then(setOrders)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
}

// GOOD: Reusable hook (or use React Query)
function useFetch<T>(fetchFn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchFn()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [fetchFn]);

  return { data, loading, error };
}

// Usage
const { data: users, loading } = useFetch(fetchUsers);
const { data: orders, loading } = useFetch(fetchOrders);
```

### 4. Extract Components

```typescript
// BAD: Same UI pattern repeated
function UserPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Users</h1>
        <button className="btn-primary">Add User</button>
      </div>
      {/* content */}
    </div>
  );
}

function OrderPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <button className="btn-primary">Add Order</button>
      </div>
      {/* content */}
    </div>
  );
}

// GOOD: Reusable component
function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {action}
    </div>
  );
}

function UserPage() {
  return (
    <div>
      <PageHeader title="Users" action={<Button>Add User</Button>} />
      {/* content */}
    </div>
  );
}
```

### 5. Extract Types

```typescript
// BAD: Same type definition repeated
interface UserListProps {
  items: Array<{ id: string; name: string; email: string }>;
}

interface UserTableProps {
  data: Array<{ id: string; name: string; email: string }>;
}

// GOOD: Shared type
// features/users/domain/types/index.ts
export interface User {
  id: string;
  name: string;
  email: string;
}

interface UserListProps {
  items: User[];
}

interface UserTableProps {
  data: User[];
}
```

---

## When NOT to DRY

### 1. Different Rate of Change

```typescript
// Keep separate if they change for different reasons
function AdminUserCard({ user }) {
  // Admin-specific display, changes with admin requirements
  return (
    <Card>
      <UserAvatar user={user} />
      <AdminBadge />
      <UserPermissions permissions={user.permissions} />
    </Card>
  );
}

function PublicUserCard({ user }) {
  // Public display, changes with public-facing requirements
  return (
    <Card>
      <UserAvatar user={user} />
      <PublicBio bio={user.bio} />
    </Card>
  );
}
```

### 2. Clarity Over Brevity

```typescript
// Sometimes explicit is better than DRY
// BAD: Over-abstracted
const config = {
  user: { endpoint: "/users", transform: transformUser },
  order: { endpoint: "/orders", transform: transformOrder },
};

const fetchEntity = (type) =>
  fetch(config[type].endpoint).then(config[type].transform);

// GOOD: Clear and direct
const fetchUsers = () => fetch("/users").then(transformUser);
const fetchOrders = () => fetch("/orders").then(transformOrder);
```

### 3. Tailwind Utility Classes

```typescript
// Tailwind classes are designed to be repeated inline - this is NOT a DRY violation
// BAD: Extracting Tailwind classes to constants
const CARD_STYLES = "p-4 rounded-lg border bg-card";
const INDICATOR_STYLES = "text-xs flex items-center gap-1";

function Component() {
  return <div className={CARD_STYLES}>...</div>;
}

// GOOD: Keep Tailwind classes inline
function Component() {
  return <div className="p-4 rounded-lg border bg-card">...</div>;
}

// If the same combination repeats many times, create a COMPONENT, not a constant
function Card({ children }) {
  return <div className="p-4 rounded-lg border bg-card">{children}</div>;
}
```

**Why Tailwind classes are an exception:**

- Tailwind's utility-first paradigm is designed for inline usage
- Class strings don't represent "knowledge" - they're styling declarations
- Extracting to constants breaks the visual connection between markup and styles
- If patterns repeat, the solution is a component, not a constant
- The only exception is `cva()` from class-variance-authority for component variants

### 4. CSS Variable Strings

```typescript
// CSS variables in inline styles should stay as strings, not JS constants
// GOOD: CSS variables inline
<div style={{ color: "var(--foreground)" }} />
<XAxis tick={{ fill: "var(--muted-foreground)" }} />

// BAD: Extracting CSS vars to JS constants
const FOREGROUND = "var(--foreground)";
<div style={{ color: FOREGROUND }} />
```

**Why CSS variables should stay as strings:**

- Keeps styling concerns in CSS, not JavaScript
- CSS variables are already the single source of truth (defined in globals.css)
- Extracting to JS constants creates unnecessary indirection
- Changes to colors should happen in CSS, not JS files

### 5. Test Code

```typescript
// Tests can be more explicit/repetitive for clarity
// BAD: Over-DRY tests
const testCases = [
  { input: "admin", expected: true },
  { input: "user", expected: false },
];

testCases.forEach(({ input, expected }) => {
  it(`returns ${expected} for ${input}`, () => {
    expect(isAdmin(input)).toBe(expected);
  });
});

// GOOD: Explicit tests are more readable
it("returns true for admin role", () => {
  expect(isAdmin("admin")).toBe(true);
});

it("returns false for user role", () => {
  expect(isAdmin("user")).toBe(false);
});
```

---

## DRY Checklist

When you see duplication, ask:

1. **Is this knowledge duplication?** → Extract immediately
2. **Have I seen this 3+ times?** → Consider abstracting
3. **Will these change together?** → If yes, abstract
4. **Will these change for different reasons?** → Keep separate
5. **Does abstraction hurt readability?** → Keep explicit

## Quick Reference

| Situation                            | Action                  |
| ------------------------------------ | ----------------------- |
| Same validation rule in 2+ places    | Extract to utility      |
| Same API URL in 2+ places            | Extract to constants    |
| Same fetch pattern in 2+ places      | Extract to hook         |
| Same UI structure in 3+ places       | Extract to component    |
| Same type definition in 2+ places    | Extract to shared types |
| Similar but different business logic | Keep separate           |

---

## Related

- [Single Source of Truth](./single-source-of-truth.md) - Colors, typography, i18n from one source
- [No Hardcoding](./no-hardcoding.md) - Magic numbers, strings, inline types, mocks
- [Architecture Rules](./architecture.md) - Where files should live
- [SOLID Principles](./solid-principles.md) - Design principles
