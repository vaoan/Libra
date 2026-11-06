# CSS Consistency Rule

> **All apps in the monorepo MUST have identical theme and styling.**

---

## Rule

When making any CSS change - creating semantic classes, changing colors, spacing, typography, or any styling - **all apps must be updated to match**.

---

## What Must Be Consistent

| Element                 | Location                       | Sync Required |
| ----------------------- | ------------------------------ | ------------- |
| **Colors**              | `globals.css` CSS variables    | All apps      |
| **Typography**          | `globals.css` semantic classes | All apps      |
| **Spacing**             | Tailwind theme                 | All apps      |
| **Semantic classes**    | `@layer utilities`             | All apps      |
| **Theme configuration** | `@theme inline` block          | All apps      |
| **UI package scanning** | `@source` directive            | All apps      |

---

## Required: UI Package Scanning

Every app that uses the shared `ui` package MUST include this `@source` directive in `globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

/* Scan the shared ui package for Tailwind classes */
@source "../../../../packages/ui/src/**/*.{ts,tsx}";
```

**Why:** Tailwind v4 uses JIT compilation and only generates CSS for classes it finds in scanned files. Without this directive, classes used in the `ui` package (like `inline-flex`) won't be generated, causing layout bugs.

---

## Verification Process

When making CSS changes:

1. **Make the change in one app**
2. **Copy to all other apps** - Ensure `globals.css` files are synchronized
3. **Verify with Playwright** - Use browser automation to compare computed styles:
   ```javascript
   // Compare CSS between apps
   const styles = getComputedStyle(element);
   // Check: display, width, height, padding, colors, etc.
   ```
4. **Visual comparison** - Take screenshots of both apps and compare

---

## Common Issues

### Missing Utility Classes

**Symptom:** Element has class `inline-flex` but computed style shows `display: block`

**Cause:** Tailwind didn't generate the `.inline-flex` rule because it didn't scan the file containing that class

**Fix:** Add `@source` directive to scan the ui package

### Inconsistent Colors

**Symptom:** Same component looks different between apps

**Cause:** CSS variables differ between app `globals.css` files

**Fix:** Sync the `:root` and `.dark` CSS variable definitions

### Missing Semantic Classes

**Symptom:** Class like `.text-heading-large` doesn't apply styles

**Cause:** The `@layer utilities` block differs between apps

**Fix:** Sync the utility class definitions in `globals.css`

---

## Enforcement

### During Development

- After any CSS change, diff `globals.css` files across apps
- Run both apps and visually compare affected components
- Use Playwright to verify computed styles match

### During Code Review

The code review agent checks:

- [ ] CSS changes are applied to ALL apps
- [ ] `@source` directives include ui package in all apps
- [ ] CSS variables are identical across apps
- [ ] Semantic utility classes are identical across apps
- [ ] No app-specific styling overrides (unless explicitly justified)

---

## Quick Sync Command

To check if `globals.css` files are in sync:

```bash
diff apps/store/src/app/globals.css apps/admin/src/app/globals.css
```

The only expected differences should be:

- App-specific comments (if any)
- The relative path in `@source` (may vary by app location)

---

## Anti-Patterns

### DON'T: Add CSS to only one app

```css
/* BAD: Only in apps/store/globals.css */
.my-new-class {
  @apply text-primary font-bold;
}
```

### DO: Add CSS to all apps

```css
/* GOOD: In ALL apps/*/
globals.css files */ .my-new-class {
  @apply text-primary font-bold;
}
```

### DON'T: Forget the @source directive

```css
/* BAD: Missing ui package scanning */
@import "tailwindcss";
```

### DO: Include @source for ui package

```css
/* GOOD: Scans ui package for classes */
@import "tailwindcss";
@source "../../../../packages/ui/src/**/*.{ts,tsx}";
```

---

## Related

- [Tailwind Rules](./tailwind.md) - Tailwind CSS standards
- [Single Source of Truth](./single-source-of-truth.md) - Theme consistency
- [Code Review Standards](./code-review-standards.md) - Review checklist
