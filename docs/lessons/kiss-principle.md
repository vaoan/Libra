# KISS Principle

Keep It Simple, Stupid (KISS) means favoring the simplest solution that is clear,
maintainable, and sufficient for the problem at hand.

---

## What KISS Means Here

- Prefer straightforward code over clever abstractions.
- Minimize layers of indirection unless they buy real, near-term value.
- Avoid premature generalization or over-engineering.

---

## KISS vs DRY (Conflict Resolution)

KISS and DRY can conflict. When they do:

- **Favor KISS** if DRY introduces extra abstraction, indirection, or complexity.
- Allow small, localized duplication when it improves clarity.
- Treat DRY opportunities as **suggestions** unless duplication causes real bugs or maintenance risk.

---

## Examples

```typescript
// OK: Simple and clear, even with small duplication
const displayName = user.firstName + " " + user.lastName;
const billingName = billing.firstName + " " + billing.lastName;

// NOT OK (too much indirection for tiny reuse)
const buildFullName = (x: { firstName: string; lastName: string }) =>
  x.firstName + " " + x.lastName;
```

---

## When to Break KISS

Break KISS only when:

- Duplication is widespread and demonstrably error-prone
- The abstraction reduces complexity across multiple call sites
- The change is required for correctness or architecture compliance
