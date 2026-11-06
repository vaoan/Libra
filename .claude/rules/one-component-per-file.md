---
paths:
  - "**/presentation/**/*.tsx"
  - "packages/ui/**"
  - "packages/app-components/**"
---

# One component per file

Loaded when a component is read. ESLint enforces this as an error (`react/no-multi-comp` with `ignoreStateless: false`), so a small unexported helper component in the same file fails too. Full text: `docs/lessons/one-component-per-file.md`.

- **One `.tsx` file, one component. Move a second one to its own file** and use `index.ts` for barrels, never a convenience `components.tsx`. → `docs/lessons/one-component-per-file.md` (Invalid Patterns)
- **In the same file you may keep unexported helper functions, its props types and `cva()` variants.** → `docs/lessons/one-component-per-file.md` (Valid Patterns)
- **Never define a component inside another**: it is a new component on every render. → `docs/lessons/one-component-per-file.md` (Nested Component Definitions)
- **Compound components are allowed only where ESLint exempts them**: `packages/ui/src/` and `**/shared/presentation/components/ui/`, which follow shadcn. Mock components in test files are exempt too. → `docs/lessons/one-component-per-file.md` (Exceptions)
