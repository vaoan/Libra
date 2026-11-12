# Tailwind CSS Rules

> Tailwind CSS v4 configuration and usage standards for this project.

---

## Configuration

This project uses **Tailwind CSS v4** with CSS-first configuration:

| Approach         | Location                                         |
| ---------------- | ------------------------------------------------ |
| Theme definition | `src/app/globals.css` using `@theme inline`      |
| PostCSS plugin   | `postcss.config.mjs` with `@tailwindcss/postcss` |
| Animations       | `tw-animate-css` (not `tailwindcss-animate`)     |

**No `tailwind.config.js` is needed** - all configuration lives in CSS.

---

## Color System

### Use OKLCH Colors

```css
/* CORRECT: OKLCH format */
--primary: oklch(0.205 0 0);

/* AVOID: Legacy formats */
--primary: hsl(0 0% 20%);
--primary: #333333;
```

### Use Semantic Color Names

```tsx
// CORRECT: Semantic colors from theme
<div className="bg-background text-foreground" />
<div className="bg-primary text-primary-foreground" />
<div className="bg-muted text-muted-foreground" />

// CORRECT: Status colors for states
<span className="text-success">Healthy</span>
<span className="text-warning">Attention</span>
<span className="text-destructive">Critical</span>
<span className="text-info">Information</span>

// AVOID: Arbitrary or hard-coded colors
<div className="bg-[#f5f5f5] text-[#333]" />
<span className="text-green-600">Healthy</span>  // Use text-success instead
<span className="text-red-500">Error</span>      // Use text-destructive instead
```

### WCAG Contrast Requirements

All color pairings MUST meet WCAG 2.1 AA contrast ratios:

| Element                                  | Minimum Ratio  | WCAG Level |
| ---------------------------------------- | -------------- | ---------- |
| **Normal text** (< 18px)                 | **4.5:1**      | AA         |
| **Large text** (>= 18px bold or >= 24px) | **3:1**        | AA         |
| **UI components & icons**                | **3:1**        | AA         |
| **Focus indicators**                     | **3:1**        | AA         |
| **Decorative elements**                  | No requirement | —          |

#### Rules

1. **Every text element must be readable** against its background. If `text-*` is used on a `bg-*`, verify the contrast ratio meets the threshold above.
2. **Foreground tokens must pair with their background tokens.** Use `text-primary-foreground` on `bg-primary`, `text-muted-foreground` on `bg-muted`, etc.
3. **Low-opacity text is risky.** `text-foreground/50` or similar opacity modifiers can drop below WCAG thresholds - verify computed contrast.
4. **Dark mode must also pass.** Check both `:root` and `.dark` variable values for contrast compliance.
5. **Theme tokens must be defined before use.** If a Tailwind utility like `bg-primary` or `text-primary` is used, the corresponding `--color-primary` CSS variable MUST exist in the theme. Undefined tokens produce no CSS output, making content invisible.

#### Common Violations

```tsx
// BAD: Low contrast - light gray text on white
<p className="text-muted-foreground/40 bg-background">Hard to read</p>

// BAD: Using color tokens that don't exist in theme
<div className="bg-primary text-primary-foreground" />
// If --color-primary is NOT defined in theme.css, this renders as transparent

// BAD: Decorative opacity on functional text
<span className="text-foreground/30">Important label</span>

// GOOD: Proper semantic pairing with sufficient contrast
<div className="bg-primary text-primary-foreground">Readable</div>
<div className="bg-muted text-muted-foreground">Also readable</div>
<div className="bg-brand text-white">Brand CTA</div>
```

#### Verification

When defining or changing theme colors:

1. Calculate contrast ratio between foreground and background values
2. Use browser DevTools (Accessibility panel) or [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
3. Test both light and dark modes
4. Verify all token pairs: `background`/`foreground`, `primary`/`primary-foreground`, `muted`/`muted-foreground`, `brand`/white, etc.

---

## Class Naming Conventions

### Order of Classes

Apply classes in this order for consistency:

1. **Layout** - `flex`, `grid`, `block`, `hidden`
2. **Positioning** - `relative`, `absolute`, `fixed`
3. **Sizing** - `w-*`, `h-*`, `size-*`
4. **Spacing** - `p-*`, `m-*`, `gap-*`
5. **Typography** - `text-*`, `font-*`
6. **Colors** - `bg-*`, `text-*`, `border-*`
7. **Effects** - `shadow-*`, `opacity-*`
8. **Transitions** - `transition-*`, `duration-*`
9. **Responsive** - `sm:`, `md:`, `lg:`, `xl:`
10. **States** - `hover:`, `focus:`, `active:`

```tsx
// Example following the order
<button
  className="
  flex items-center justify-center    {/* Layout */}
  relative                             {/* Positioning */}
  h-10 px-4                           {/* Sizing & Spacing */}
  text-sm font-medium                  {/* Typography */}
  bg-primary text-primary-foreground   {/* Colors */}
  rounded-md shadow-sm                 {/* Effects */}
  transition-colors duration-200       {/* Transitions */}
  hover:bg-primary/90                  {/* States */}
"
/>
```

### Use Modern Utilities

```tsx
// DO: Use size-* for square elements
<div className="size-4" />
<div className="size-8" />

// DON'T: Use separate w-* h-*
<div className="w-4 h-4" />
```

---

## Responsive Design

### Mobile-First Approach

Always design for mobile first, then add larger breakpoints:

```tsx
// CORRECT: Mobile-first
<div className="
  flex flex-col      {/* Mobile: column */}
  md:flex-row        {/* Tablet: row */}
  lg:gap-8           {/* Desktop: larger gap */}
"/>

// AVOID: Desktop-first (overriding down)
<div className="
  flex-row
  sm:flex-col
"/>
```

### Breakpoints

| Prefix | Min Width | Usage            |
| ------ | --------- | ---------------- |
| (none) | 0px       | Mobile (default) |
| `sm:`  | 640px     | Small tablets    |
| `md:`  | 768px     | Tablets          |
| `lg:`  | 1024px    | Laptops          |
| `xl:`  | 1280px    | Desktops         |
| `2xl:` | 1536px    | Large screens    |

---

## Component Styling

### Use cn() for Conditional Classes

```tsx
import { cn } from "@/shared/application/utils";

function Button({ variant, className, ...props }) {
  return (
    <button
      className={cn(
        // Base styles (always applied)
        "rounded-md px-4 py-2 font-medium transition-colors",
        // Variant styles (conditional)
        {
          "bg-primary text-primary-foreground": variant === "primary",
          "bg-secondary text-secondary-foreground": variant === "secondary",
          "bg-destructive text-white": variant === "destructive",
        },
        // External className (allows overrides)
        className,
      )}
      {...props}
    />
  );
}
```

### Avoid @apply in Components

```css
/* AVOID: @apply creates hidden dependencies */
.card {
  @apply rounded-lg border bg-card p-6;
}

/* PREFER: Use CSS variables directly if needed */
.card {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--card);
  padding: 1.5rem;
}
```

---

## Performance

### Minimize Arbitrary Values

```tsx
// AVOID: Many arbitrary values
<div className="w-[347px] mt-[23px] text-[13px]" />

// PREFER: Use design system values
<div className="w-80 mt-6 text-sm" />
```

### Extract Repeated Patterns

```tsx
// If a pattern repeats 3+ times, extract it
const cardStyles = "rounded-lg border bg-card p-6 shadow-sm";
const headingStyles = "text-lg font-semibold tracking-tight";

// Use consistently
<div className={cardStyles}>
  <h2 className={headingStyles}>Title</h2>
</div>;
```

---

## Dark Mode

### Class-Based Dark Mode

```tsx
// Use dark: prefix for dark mode variants
<div className="
  bg-white dark:bg-gray-900
  text-gray-900 dark:text-gray-100
"/>

// Or use semantic colors (recommended)
<div className="bg-background text-foreground" />
```

### Theme Configuration

```css
/* globals.css */
@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
}
```

---

## Animation

### Use tw-animate-css

```tsx
// Entrance animations
<div className="animate-in fade-in slide-in-from-bottom-2" />

// Exit animations
<div className="animate-out fade-out slide-out-to-top-2" />

// With duration
<div className="animate-in fade-in duration-300" />
```

### Common Animation Patterns

| Pattern  | Classes                                                |
| -------- | ------------------------------------------------------ |
| Fade in  | `animate-in fade-in`                                   |
| Slide up | `animate-in slide-in-from-bottom-2`                    |
| Scale in | `animate-in zoom-in-95`                                |
| Combined | `animate-in fade-in zoom-in-95 slide-in-from-bottom-2` |

---

## Anti-Patterns

### DON'T: Inline style objects

```tsx
// AVOID
<div style={{ backgroundColor: '#f5f5f5', padding: '1rem' }} />

// USE
<div className="bg-muted p-4" />
```

### DON'T: Mix Tailwind with CSS-in-JS

```tsx
// AVOID: Mixing approaches
<div className="p-4" css={{ backgroundColor: 'red' }} />

// USE: One consistent approach
<div className="p-4 bg-destructive" />
```

### DON'T: Override with !important

```tsx
// AVOID
<div className="!p-4 !bg-red-500" />

// FIX: Use proper specificity or cn() for overrides
<div className={cn('p-4', overrideClass && 'p-6')} />
```

---

## Related

- [Single Source of Truth](./single-source-of-truth.md) - Colors, typography, i18n from one source
- [Tailwind Skill](../skills/tailwind/SKILL.md) - Full skill documentation
- [Figma to Code Skill](../skills/figma/SKILL.md) - Convert Figma designs to components
- [Component Patterns](./component-patterns.md) - Component structure rules
- [Frontend Design Skill](../skills/frontend-design/SKILL.md) - Design implementation
