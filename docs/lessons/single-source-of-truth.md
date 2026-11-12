# Single Source of Truth Rule

> **Every value in the codebase MUST come from its designated single source of truth.**

This rule enforces KISS (Keep It Simple, Stupid) by ensuring all values originate from one authoritative location.

---

## Sources of Truth

| Domain           | Single Source      | Location                                         |
| ---------------- | ------------------ | ------------------------------------------------ |
| **Colors**       | Tailwind CSS Theme | `globals.css` CSS variables                      |
| **Typography**   | Tailwind CSS Theme | `globals.css` CSS variables + utility classes    |
| **Spacing**      | Tailwind CSS Theme | Tailwind defaults                                |
| **Translations** | Locale files       | `src/shared/infrastructure/i18n/messages/*.json` |
| **Constants**    | Domain constants   | `domain/constants.ts` files                      |
| **Types**        | Domain types       | `domain/types/` directories                      |

---

## Colors: Semantic Only

### Rule

**All colors MUST be semantic.** Never use arbitrary color values or Tailwind palette colors directly.

### Allowed

```tsx
// Semantic color classes (from theme)
<div className="bg-background text-foreground" />
<div className="bg-primary text-primary-foreground" />
<div className="bg-muted text-muted-foreground" />

// Status colors
<span className="text-success">Healthy</span>
<span className="text-warning">Attention needed</span>
<span className="text-destructive">Critical error</span>
<span className="text-info">Information</span>

// Semantic utility classes
<div className="status-healthy" />
<div className="indicator-success" />
<div className="surface-warning" />
```

### Forbidden

```tsx
// Arbitrary colors
<div className="bg-[#f5f5f5]" />
<div className="text-[rgb(51,51,51)]" />

// Direct Tailwind palette colors
<span className="text-green-500">Healthy</span>    // Use text-success
<span className="text-yellow-500">Warning</span>   // Use text-warning
<span className="text-red-500">Error</span>        // Use text-destructive
<span className="text-blue-500">Info</span>        // Use text-info

// Non-semantic chart colors
stroke="#8884d8"                                   // Use var(--chart-1)
fill="blue"                                        // Use var(--primary)
```

### When to Create New Semantic Colors

If no existing semantic color fits your use case:

1. **Check existing colors first** - Review `globals.css` for existing semantic colors
2. **Define in theme** - Add new CSS variable in `globals.css`
3. **Create utility class** - Add semantic class in `@layer utilities`
4. **Document purpose** - Comment explaining when to use it

```css
/* globals.css */
:root {
  --my-semantic-color: oklch(0.7 0.15 200);
}

@layer utilities {
  .my-semantic-class {
    color: var(--my-semantic-color);
  }
}
```

---

## Typography: Semantic Only

### Rule

**All typography MUST use semantic classes.** Typography values come from Tailwind theme only.

### Allowed

```tsx
// Semantic typography classes
<h1 className="text-page-title">Page Title</h1>
<h2 className="text-section-title">Section</h2>
<h3 className="text-card-title">Card Title</h3>
<p className="text-body">Body text</p>
<span className="text-caption">Caption</span>
<span className="text-label">Label</span>

// Metric-specific typography
<span className="text-metric-value">142</span>
<span className="text-metric-label">loans/day</span>
<span className="text-metric-change">+12%</span>
```

### Forbidden

```tsx
// Arbitrary font sizes
<span className="text-[13px]">Text</span>
<span style={{ fontSize: '14px' }}>Text</span>

// Non-semantic size classes without context
<span className="text-sm">Some text</span>  // What is this text's role?
```

### Recharts Exception

Recharts requires numeric values for inline styles. Use `UI_CONSTANTS`:

```tsx
// CORRECT: Use constants for Recharts
<XAxis tick={{ fontSize: UI_CONSTANTS.CHART.FONT_SIZE }} />
<Tooltip wrapperStyle={{ fontSize: UI_CONSTANTS.CHART.LEGEND_FONT_SIZE }} />

// WRONG: Tailwind classes in Recharts (won't work)
<XAxis tick={{ className: "text-xs" }} />  // Recharts ignores className
```

---

## Internationalization (i18n): Complete Translations

### Rule

**Every translation key MUST have translations in ALL locale files before use.**

### Workflow

1. **Add key to ALL locale files first**
2. **Then use the key in code**
3. **Never commit code with missing translations**

### Locale Files

```
src/shared/infrastructure/i18n/messages/
├── en.json    # English (required)
└── es.json    # Spanish (required)
```

### Checklist Before Using a Translation Key

- [ ] Key exists in `en.json`
- [ ] Key exists in `es.json`
- [ ] Key is in the correct namespace
- [ ] Namespace matches `useTranslations()` call

### Common Mistakes

```tsx
// WRONG: Using key that doesn't exist
const t = useTranslations("charts");
t("healthy"); // Error if charts.healthy doesn't exist!

// WRONG: Using object key as string
const t = useTranslations("metrics");
t("slaBreaches"); // Error if slaBreaches is an object, not string!
// Should be: t("slaBreaches.title")

// WRONG: Wrong namespace
const t = useTranslations("aiInsights"); // Namespace doesn't exist!
// Should check: Does "aiInsights" exist as top-level key in JSON?
```

### Namespace Structure

```json
{
  "namespace": {
    "key": "Translation",
    "nested": {
      "key": "Nested translation"
    }
  }
}
```

```tsx
// Access patterns
const t = useTranslations("namespace");
t("key"); // "Translation"
t("nested.key"); // "Nested translation"

// Or use nested namespace
const t = useTranslations("namespace.nested");
t("key"); // "Nested translation"
```

---

## Constants: Centralized Values

### Rule

**All magic numbers and configuration values MUST be in constants files.**

### Location by Type

| Value Type                       | Location                                 |
| -------------------------------- | ---------------------------------------- |
| UI constants (chart sizes, etc.) | `shared/presentation/theme/constants.ts` |
| Feature business constants       | `features/[feature]/domain/constants.ts` |
| API configuration                | `shared/infrastructure/config/`          |

### Example

```typescript
// CORRECT: Centralized constant
import { UI_CONSTANTS } from "@/shared/presentation/theme/constants";

<div style={{ height: UI_CONSTANTS.CHART.SPARKLINE_HEIGHT }} />

// WRONG: Magic number
<div style={{ height: 32 }} />
```

---

## Enforcement Checklist

Before committing code, verify:

### Colors

- [ ] No arbitrary color values (`bg-[#xxx]`, `text-[rgb()]`)
- [ ] No direct Tailwind palette colors for semantic purposes
- [ ] All status indicators use semantic classes

### Typography

- [ ] No arbitrary font sizes (`text-[13px]`)
- [ ] Semantic classes used for all text roles
- [ ] Recharts uses `UI_CONSTANTS` for numeric values

### i18n

- [ ] All new keys exist in `en.json`
- [ ] All new keys exist in `es.json`
- [ ] Correct namespace used in `useTranslations()`
- [ ] No object-as-string key access errors

### Constants

- [ ] No magic numbers in components
- [ ] Configuration values in appropriate constants files

---

## Related

- [Tailwind Rules](./tailwind.md) - Color and styling standards
- [No Hardcoding Rule](./no-hardcoding.md) - Magic numbers and strings
- [DRY Principle](./dry-principle.md) - Single source of truth
- [Architecture Rules](./architecture.md) - Where files should live
