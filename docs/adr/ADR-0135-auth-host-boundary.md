# ADR-0135: Centralized Auth Host Boundary for Microfrontends

## Status

Accepted

## Date

2026-02-17

## Context

The monorepo contains multiple Next.js apps (`landing`, `auth`, `web`, `admin`) that need a common authentication model. We need a mock implementation now, but the architecture must support migration to a production JWT access/refresh system without rewriting every app.

## Decision

We establish an explicit **Auth Host** boundary:

1. `auth` acts as the auth host and owns `/[locale]/login` plus auth routes (`/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`).
2. Protected apps (`web`, `admin`) do not own login UX. They only enforce session checks and redirect unauthenticated users to the auth host.
3. Shared auth contracts and token/session helpers live in `packages/auth`.
4. Cross-app redirect configuration uses `NEXT_PUBLIC_AUTH_HOST_URL` for protected apps and `NEXT_PUBLIC_AUTH_URL` for landing-to-auth links.

## Consequences

### Positive

- Single login/logout UX and flow.
- Less duplication and fewer auth behavior drifts across apps.
- Easier swap from mock auth to real IdP/BFF implementation.
- Consistent middleware behavior and return-to navigation.

### Negative

- Auth host becomes a critical dependency for protected app entry.
- Requires careful URL/origin configuration per environment.

## Migration Plan

1. Keep `auth` as the dedicated auth host for mock phase.
2. Replace auth-host internals with real IdP/BFF flows while preserving:
   - `packages/auth` contracts
   - redirect contract (`returnTo`)
   - protected-app middleware behavior
3. If needed later, split `auth` internals into separate BFF/IdP adapters without changing protected app logic.

## Notes

- `landingUrl` remains for non-auth navigation links.
- `authHostUrl` is the explicit auth boundary configuration for redirects and logout routing.
