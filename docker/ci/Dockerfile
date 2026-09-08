# =============================================================================
# Libra — CI / local-dev image (all apps, built from source)
# Builds all 6 apps in standalone mode, runs them behind nginx via supervisord.
# Exposes port 8080 (nginx) for E2E testing all routes.
# Build: docker build -f docker/ci/Dockerfile -t libra-ci .
# Run:   docker run -p 8088:8080 libra-ci
# =============================================================================

# ── Stage 1: install deps ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/store/package.json ./apps/store/
COPY apps/auth/package.json ./apps/auth/
COPY apps/admin/package.json ./apps/admin/
COPY apps/landing/package.json ./apps/landing/
COPY apps/payments/package.json ./apps/payments/
COPY apps/studio/package.json ./apps/studio/
COPY packages/api/package.json ./packages/api/
COPY packages/ui/package.json ./packages/ui/
COPY packages/shared/package.json ./packages/shared/
COPY packages/auth/package.json ./packages/auth/
COPY packages/app-components/package.json ./packages/app-components/

RUN pnpm install --frozen-lockfile

COPY . .

# ── Build args baked into bundles at build time ───────────────────────────────
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_STORE_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_LANDING_URL
ARG NEXT_PUBLIC_PAYMENTS_URL
ARG NEXT_PUBLIC_STUDIO_URL
ARG NEXT_PUBLIC_BUILD_HASH=ci
ARG NEXT_PUBLIC_AUTH_HOST_URL
ARG NEXT_PUBLIC_ENABLE_TEST_IDS
ARG NEXT_PUBLIC_ENV_DEBUG
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_DOMAIN

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_AUTH_HOST_URL=$NEXT_PUBLIC_AUTH_HOST_URL
ENV NEXT_PUBLIC_STORE_URL=$NEXT_PUBLIC_STORE_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_LANDING_URL=$NEXT_PUBLIC_LANDING_URL
ENV NEXT_PUBLIC_PAYMENTS_URL=$NEXT_PUBLIC_PAYMENTS_URL
ENV NEXT_PUBLIC_STUDIO_URL=$NEXT_PUBLIC_STUDIO_URL
ENV NEXT_PUBLIC_BUILD_HASH=$NEXT_PUBLIC_BUILD_HASH
ENV NEXT_PUBLIC_ENABLE_TEST_IDS=$NEXT_PUBLIC_ENABLE_TEST_IDS
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_DOMAIN=$NEXT_PUBLIC_CLERK_DOMAIN
ENV STANDALONE=true

# ── Stage 2: build each app ───────────────────────────────────────────────────
FROM deps AS builder
RUN pnpm --filter store run build && \
    pnpm --filter auth-app run build && \
    pnpm --filter admin run build && \
    pnpm --filter landing run build && \
    pnpm --filter payments run build && \
    pnpm --filter studio run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache nginx supervisor netcat-openbsd curl && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /var/log/nginx /var/log/supervisor /var/run/nginx /run/nginx && \
    chown -R nextjs:nodejs /var/lib/nginx /var/log/nginx /var/log/supervisor /var/run/nginx /run/nginx

# Copy standalone builds for each app
COPY --from=builder /app/apps/store/.next/standalone    /app/store/
COPY --from=builder /app/apps/store/.next/static        /app/store/apps/store/.next/static
COPY --from=builder /app/apps/store/public              /app/store/apps/store/public

COPY --from=builder /app/apps/auth/.next/standalone     /app/auth/
COPY --from=builder /app/apps/auth/.next/static         /app/auth/apps/auth/.next/static
COPY --from=builder /app/apps/auth/public               /app/auth/apps/auth/public

COPY --from=builder /app/apps/admin/.next/standalone    /app/admin/
COPY --from=builder /app/apps/admin/.next/static        /app/admin/apps/admin/.next/static
COPY --from=builder /app/apps/admin/public              /app/admin/apps/admin/public

COPY --from=builder /app/apps/landing/.next/standalone  /app/landing/
COPY --from=builder /app/apps/landing/.next/static      /app/landing/apps/landing/.next/static
COPY --from=builder /app/apps/landing/public            /app/landing/apps/landing/public

COPY --from=builder /app/apps/payments/.next/standalone /app/payments/
COPY --from=builder /app/apps/payments/.next/static     /app/payments/apps/payments/.next/static
COPY --from=builder /app/apps/payments/public           /app/payments/apps/payments/public

COPY --from=builder /app/apps/studio/.next/standalone   /app/studio/
COPY --from=builder /app/apps/studio/.next/static       /app/studio/apps/studio/.next/static
COPY --from=builder /app/apps/studio/public             /app/studio/apps/studio/public

# Copy nginx and supervisord configs from prod (shared config)
COPY docker/prod/nginx.conf /etc/nginx/nginx.conf
COPY docker/prod/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy the warm-up loop — supervisord.conf (shared with docker/prod/Dockerfile)
# declares [program:warmer], so it must be present or it crash-loops forever:
# `startsecs=0` means supervisord treats every immediate exit as a completed
# start, so `autorestart=true` respawns it as fast as the shell can fork — no
# `startretries` backoff ever applies. That CPU storm starved the app's own
# request handling, which is why apps/store/e2e/auth.setup.ts's
# `/en/callback` navigation could intermittently see the container refuse
# connections even though the earlier `/en/login` navigation had succeeded.
COPY docker/warmer.sh /app/warmer.sh

RUN chown -R nextjs:nodejs /app && \
    chmod +x /app/warmer.sh

EXPOSE 8080

USER nextjs
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
