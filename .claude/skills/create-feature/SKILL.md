---
name: create-feature
description: Scaffold full feature modules with Clean Architecture layers, types, and initial files; use when asked to create a new feature structure.
---

# Create Feature

## Description

Scaffolds a complete feature module following Clean Architecture with all required layers, types, and initial files.

## Usage

```
/create-feature [feature-name]
```

or

```
Create a new feature called [feature-name]
```

## Parameters

| Parameter      | Required | Description                                                 |
| -------------- | -------- | ----------------------------------------------------------- |
| `feature-name` | Yes      | Name of the feature in kebab-case (e.g., `user-management`) |

## Steps

1. **Validate feature name**
   - Must be kebab-case
   - Must not already exist in `src/features/`

2. **Create folder structure**

   ```
   src/features/[feature-name]/
   ├── domain/
   │   ├── entities/
   │   ├── types/
   │   ├── errors/
   │   └── index.ts
   ├── application/
   │   ├── hooks/
   │   ├── services/
   │   ├── mappers/
   │   └── index.ts
   ├── infrastructure/
   │   ├── api/
   │   ├── repositories/
   │   └── index.ts
   ├── presentation/
   │   ├── components/
   │   ├── pages/
   │   └── index.ts
   └── index.ts
   ```

3. **Create initial files**

   **domain/types/index.ts**

   ```typescript
   /**
    * [FeatureName] domain types
    */

   export interface [FeatureName] {
     id: string;
     // Add entity properties
   }
   ```

   **domain/index.ts**

   ```typescript
   export * from "./types";
   ```

   **application/hooks/use[FeatureName].ts**

   ```typescript
   'use client';

   import { useState } from 'react';

   export function use[FeatureName]() {
     // Feature hook implementation
     return {
       // Return values
     };
   }
   ```

   **application/index.ts**

   ```typescript
   export * from "./hooks/use[FeatureName]";
   ```

   **infrastructure/api/[featureName]Api.ts**

   ```typescript
   import { api } from '@/shared/infrastructure/api';

   export const [featureName]Api = {
     // API methods
   };
   ```

   **infrastructure/index.ts**

   ```typescript
   export * from "./api/[featureName]Api";
   ```

   **presentation/pages/[FeatureName]Page.tsx**

   ```typescript
   'use client';

   export function [FeatureName]Page() {
     return (
       <div>
         <h1>[FeatureName]</h1>
       </div>
     );
   }
   ```

   **presentation/index.ts**

   ```typescript
   export * from "./pages/[FeatureName]Page";
   ```

   **index.ts (feature root)**

   ```typescript
   // Domain
   export * from "./domain";

   // Application
   export * from "./application";

   // Presentation
   export * from "./presentation";
   ```

4. **Create route file (optional)**

   If user confirms, create `app/(protected)/[feature-name]/page.tsx`:

   ```typescript
   import { [FeatureName]Page } from '@/features/[feature-name]';

   export default function Page() {
     return <[FeatureName]Page />;
   }
   ```

## Examples

### Example 1: Create user-management feature

```
/create-feature user-management
```

Creates:

```
src/features/user-management/
├── domain/
│   ├── types/
│   │   └── index.ts          # UserManagement interface
│   └── index.ts
├── application/
│   ├── hooks/
│   │   └── useUserManagement.ts
│   └── index.ts
├── infrastructure/
│   ├── api/
│   │   └── userManagementApi.ts
│   └── index.ts
├── presentation/
│   ├── pages/
│   │   └── UserManagementPage.tsx
│   └── index.ts
└── index.ts
```

### Example 2: Create orders feature

```
Create a new feature called orders
```

Creates a complete `src/features/orders/` structure.

## Notes

- Feature name should describe a business domain, not a UI concept
- Each layer has its own `index.ts` for clean exports
- The feature `index.ts` only exports public API
- Infrastructure layer is optional initially (can be added later)

## Related

- [Architecture Rules](../../rules/architecture.md) - Folder structure and layer responsibilities
- [Naming Conventions](../../../docs/lessons/naming-conventions.md) - File and folder naming rules
- [Component Patterns](../../rules/component-patterns.md) - Component structure guidelines
