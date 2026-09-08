# =============================================================================
# Libra — Production runner (pre-built artifacts)
# Copies standalone .next/ dirs that were built by CI and rsynced to the server.
# Used by deploy-production.sh — never builds from source on the server.
# Build context: monorepo root (after CI has rsynced apps/*/.next/)
# =============================================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache nginx supervisor netcat-openbsd curl && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /var/log/nginx /var/log/supervisor /var/run/nginx /run/nginx && \
    chown -R nextjs:nodejs /var/lib/nginx /var/log/nginx /var/log/supervisor /var/run/nginx /run/nginx

# Stable infrastructure config — placed BEFORE volatile app layers so these
# layers keep identical hashes across deploys and are cache-hit by both CI
# (--cache-from :latest) and the VM's local layer store.
COPY docker/prod/nginx.conf           /etc/nginx/nginx.conf
COPY docker/prod/supervisord.conf     /etc/supervisor/conf.d/supervisord.conf
COPY docker/boot-reporter.mjs         /app/boot-reporter.mjs
COPY docker/warmer.sh                 /app/warmer.sh

# Standalone builds pre-built by CI (rsynced to server before this runs)
COPY apps/store/.next/standalone      /app/store/
COPY apps/store/.next/static          /app/store/apps/store/.next/static
COPY apps/store/public                /app/store/apps/store/public

COPY apps/auth/.next/standalone       /app/auth/
COPY apps/auth/.next/static           /app/auth/apps/auth/.next/static
COPY apps/auth/public                 /app/auth/apps/auth/public

COPY apps/admin/.next/standalone      /app/admin/
COPY apps/admin/.next/static          /app/admin/apps/admin/.next/static
COPY apps/admin/public                /app/admin/apps/admin/public

COPY apps/landing/.next/standalone    /app/landing/
COPY apps/landing/.next/static        /app/landing/apps/landing/.next/static
COPY apps/landing/public              /app/landing/apps/landing/public

COPY apps/payments/.next/standalone   /app/payments/
COPY apps/payments/.next/static       /app/payments/apps/payments/.next/static
COPY apps/payments/public             /app/payments/apps/payments/public

COPY apps/studio/.next/standalone     /app/studio/
COPY apps/studio/.next/static         /app/studio/apps/studio/.next/static
COPY apps/studio/public               /app/studio/apps/studio/public

# pnpm workspace linking creates stub node_modules inside each app directory
# (package.json only, no dist/) that shadow the complete packages at the
# standalone root node_modules/. Remove them so Node resolves from root.
RUN rm -rf \
    /app/store/apps/store/node_modules \
    /app/auth/apps/auth/node_modules \
    /app/admin/apps/admin/node_modules \
    /app/landing/apps/landing/node_modules \
    /app/payments/apps/payments/node_modules \
    /app/studio/apps/studio/node_modules && \
    chown -R nextjs:nodejs /app && \
    chmod +x /app/warmer.sh

EXPOSE 8080

USER nextjs
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
