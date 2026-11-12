# Libraries Over Manual Code

## Rule

**Always prefer well-known, community-backed libraries over hand-rolled implementations.** If a battle-tested, actively maintained package exists for the problem, use it instead of writing custom code.

## Why

- Community libraries are tested by thousands of projects and edge cases we'd never think of
- They handle browser quirks, SSR, accessibility, and security issues
- They receive ongoing maintenance, security patches, and performance improvements
- Manual implementations create maintenance burden and introduce subtle bugs
- Linters (like `unicorn/no-document-cookie`) exist specifically because raw APIs are error-prone

## How to Apply

### Before writing any utility or helper:

1. **Search** for an established library that solves the problem
2. **Evaluate**: Is it actively maintained? Does it support Next.js / React 19? Is the bundle size reasonable?
3. **Use it** — install it, import it, follow its docs
4. **Never suppress linter warnings** to use raw APIs when a library alternative exists

### Preferred libraries by domain:

| Domain        | Library                            | Instead of                   |
| ------------- | ---------------------------------- | ---------------------------- |
| Cookies       | `cookies-next`                     | Raw `document.cookie`        |
| i18n          | `next-intl`                        | Custom translation system    |
| Forms         | `react-hook-form`                  | Custom form state            |
| Validation    | `zod` or `valibot`                 | Manual type guards           |
| Dates         | `date-fns` or `dayjs`              | Custom date formatting       |
| HTTP state    | `@tanstack/react-query`            | Custom fetch wrappers        |
| URL state     | `nuqs`                             | Custom searchParams parsing  |
| API codegen   | `orval` / `graphql-codegen`        | Hand-typed API clients       |
| UI primitives | Radix UI / shadcn                  | Custom accessible components |
| Class names   | `clsx` + `tailwind-merge`          | Manual string concatenation  |
| Icons         | `lucide-react`                     | Inline SVGs                  |
| Tables        | `@tanstack/react-table`            | Custom table logic           |
| Animations    | `tw-animate-css` / `framer-motion` | Custom CSS keyframes         |
| Testing mocks | `msw`                              | Custom fetch mocks           |

### When custom code IS appropriate:

- **Domain-specific business logic** — no library can solve your unique business rules
- **Trivial one-liners** — `const isEven = (n: number) => n % 2 === 0` doesn't need a library
- **Thin wrappers** — a 5-line wrapper around a library to add project-specific defaults is fine
- **No suitable library exists** — document why in a comment

### Red flags that you should use a library instead:

- You're writing `document.cookie`, `localStorage`, `XMLHttpRequest`, or `fetch` wrappers
- You're writing date parsing, timezone handling, or relative time formatting
- You're writing form validation, input masking, or debouncing
- You're writing intersection observer, resize observer, or mutation observer hooks
- You're writing drag-and-drop, virtual scrolling, or infinite loading
- You're writing CSV/PDF/Excel export logic
- An ESLint rule is warning you about the raw API you're using
