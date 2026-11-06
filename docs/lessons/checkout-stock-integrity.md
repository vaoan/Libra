# Checkout Stock Integrity

## Rule

Checkout payment information is security-sensitive. It must only be returned
after the backend validates that the current cart quantities are still within
the product stock limit.

## Required behavior

1. Store cart mutations must never increase quantity above `max_quantity`.
2. Checkout must re-validate stock on the server using current product data.
3. If any checkout item exceeds stock, checkout may show a warning but it must
   not return seller payment details, account numbers, or seller notes.
4. UI hiding alone is not a security control. The backend response must also
   omit payment information.
5. Direct browser reads of `seller_payment_methods` must stay restricted to the
   owning seller's management flow, not the buyer checkout flow.

## Testing requirements

Every change touching cart, checkout, or seller payment methods must keep the
following coverage in place:

- unit tests for cart quantity capping
- unit tests for checkout payment-method suppression on stock issues
- route/server tests proving the backend returns no payment methods when stock
  validation fails
- Playwright coverage for a tampered or stale cart reaching checkout

## Review checklist

- Can a normal cart action exceed `max_quantity`?
- Can a tampered cart still cause payment details to be returned?
- Does checkout with stock issues render only the warning state?
- Do database policies still prevent public reads of seller payment methods?
