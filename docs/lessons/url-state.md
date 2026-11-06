# URL State Management

> **All user-facing navigation state MUST be persisted in the URL using nuqs.**

---

## Rule

Any state that represents a user's view configuration — filters, pagination, tabs, sorting, view modes, search queries — must use `useQueryState` or `useQueryStates` from **nuqs** instead of `useState`.

This enables:

- Bookmarkable and shareable URLs
- Browser back/forward navigation
- Page refresh preservation
- Deep linking to specific views

---

## When to Use nuqs vs useState

| State Type                    | Use          | Example                                |
| ----------------------------- | ------------ | -------------------------------------- |
| Filters, search               | **nuqs**     | `activeSeverity`, `globalFilter`       |
| Pagination (page, offset)     | **nuqs**     | `currentPage`, `offset`                |
| Active tab                    | **nuqs**     | `activeTab`                            |
| View mode                     | **nuqs**     | `viewMode` (list/grid/live/historical) |
| Sort order                    | **nuqs**     | `sortBy`, `sortDirection`              |
| Panel open/close (shareable)  | **nuqs**     | `isOpen` for side sheets               |
| Chat messages, session IDs    | **useState** | Ephemeral runtime data                 |
| File attachments              | **useState** | Binary/blob references                 |
| Animation progress            | **useState** | Transient UI state                     |
| TanStack Table internal state | **useState** | Complex serialization, transient       |
| Form input (pre-submit)       | **useState** | Draft state before committing          |

---

## Architecture

### Parser Location

Each feature defines its URL search params in the domain layer:

```
features/[feature]/domain/searchParams.ts
```

This follows Clean Architecture — parsers are domain-level definitions that describe the shape of URL state.

### File Pattern

```typescript
// features/anomalies/domain/searchParams.ts
import { parseAsInteger, parseAsString, parseAsStringEnum } from "nuqs";

import type { AnomalySeverity } from "./types";

const SEVERITY_VALUES: AnomalySeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
];

export const anomaliesSearchParams = {
  severity: parseAsStringEnum<AnomalySeverity>(SEVERITY_VALUES),
  stage: parseAsString,
  page: parseAsInteger.withDefault(1),
};
```

### Hook Usage

```typescript
// features/anomalies/application/hooks/useAnomaliesFilters.ts
import { useQueryStates } from "nuqs";

import { anomaliesSearchParams } from "@/features/anomalies/domain/searchParams";

export function useAnomaliesFilters() {
  const [params, setParams] = useQueryStates(anomaliesSearchParams);
  // params.severity, params.stage, params.page are type-safe
}
```

---

## History Mode

| State Type       | History Mode | Reason                                   |
| ---------------- | ------------ | ---------------------------------------- |
| Pagination, tabs | `push`       | Back button navigates between pages/tabs |
| Filters, search  | `replace`    | No history entry per keystroke           |
| View mode        | `push`       | Back button returns to previous view     |

```typescript
// push: creates history entry (back button works)
setParams({ page: 2 }, { history: "push" });

// replace: no history entry (default for most filters)
setParams({ severity: "high" }, { history: "replace" });
```

---

## Param Naming

Use **kebab-case**, scoped by feature context to prevent collisions:

| Feature     | Param                       | URL Example               |
| ----------- | --------------------------- | ------------------------- |
| Anomalies   | `severity`, `stage`, `page` | `?severity=high&page=2`   |
| Suggestions | `filter`, `offset`          | `?filter={...}&offset=10` |
| Dashboard   | `period`                    | `?period=Weekly`          |
| BPM         | `tab`                       | `?tab=tasks`              |

---

## Testing

### Test Adapter

`NuqsTestingAdapter` is already included in the test `AllProviders` wrapper (`src/test/utils.tsx`). All existing tests work without modification.

### Testing URL State

```typescript
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

it("initializes from URL params", () => {
  render(
    <NuqsTestingAdapter searchParams={{ severity: "high", page: "2" }}>
      <AnomaliesPage />
    </NuqsTestingAdapter>
  );
  // Component should render with severity=high and page=2
});
```

---

## Anti-Patterns

### DON'T: Use useState for navigation state

```typescript
// BAD: Not shareable, lost on refresh
const [currentPage, setCurrentPage] = useState(1);
const [activeTab, setActiveTab] = useState("instances");
```

### DO: Use nuqs for navigation state

```typescript
// GOOD: URL-persisted, shareable, back/forward works
const [currentPage, setCurrentPage] = useQueryState(
  "page",
  parseAsInteger.withDefault(1),
);
const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringEnum(["instances", "tasks"]).withDefault("instances"),
);
```

### DON'T: Put parsers in hooks or components

```typescript
// BAD: Parser definition mixed with hook logic
function useFilters() {
  const [severity, setSeverity] = useQueryState("severity", parseAsStringEnum([...]));
}
```

### DO: Define parsers in domain/searchParams.ts

```typescript
// GOOD: Parsers in domain layer
// domain/searchParams.ts
export const filtersSearchParams = {
  severity: parseAsStringEnum([...]),
};

// application/hooks/useFilters.ts
import { filtersSearchParams } from "@/features/.../domain/searchParams";
const [params, setParams] = useQueryStates(filtersSearchParams);
```

---

## Related

- [Architecture Rules](./architecture.md) - Clean Architecture layers
- [Component Patterns](./component-patterns.md) - Hook patterns
- [KISS Principle](./kiss-principle.md) - Keep serialization simple
