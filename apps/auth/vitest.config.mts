import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      // Stubs for the $secret: references in .env.dev that
      // apps/auth/e2e/helpers/session.ts pulls in transitively (via its
      // require of scripts/app-url-resolver.js -> scripts/load-root-env.cjs).
      // load-root-env.cjs's CI-strict branch (CI=true) accepts any non-empty
      // process.env value under the secret's own name — it never re-reads
      // .secrets — so these values only need to be present, not real. Vitest
      // writes `test.env` into process.env before test files (and their
      // imports) run, so these are already set by the time session.ts's
      // module body executes. Keeping them here (rather than in the CI
      // workflow's env: block) keeps unit tests independent of real repo
      // secrets, matching the Supabase stubs above.
      CLERK_PUBLISHABLE_KEY: "test-clerk-publishable-key",
      CLERK_SECRET_KEY: "sk_test_stub",
      CLERK_DOMAIN: "test.clerk.accounts.dev",
      TALLY_FORM_ID: "test-tally-form-id",
      GOOGLE_TEST_EMAIL: "test@example.com",
      GOOGLE_TEST_PASSWORD: "test-password",
    },
    include: ["**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    exclude: [
      ".next/**",
      "node_modules/",
      "src/test/",
      "**/*.d.ts",
      "**/*.config.*",
      "**/index.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        ".next/**",
        "node_modules/",
        ".next/**",
        "src/test/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/index.ts",
        "src/shared/infrastructure/i18n/messages/**",
        "src/shared/infrastructure/i18n/request.ts",
        "src/shared/infrastructure/i18n/routing.ts",
        "src/shared/infrastructure/config/**",
        "src/shared/infrastructure/providers/**",
        "src/mocks/**",
        "src/app/**",
        "src/proxy.ts",
        "e2e/**",
        "public/**",
        "**/*.spec.ts",
        "**/domain/types.ts",
        "**/domain/types/**",
        // Supabase auth shim — thin wrappers around Supabase SDK, tested via integration/E2E
        "**/auth/application/hooks/useSupabaseAuth.ts",
        "**/auth/presentation/components/ProtectedRoute.tsx",
      ],
      cleanOnRerun: false,
      thresholds: {
        branches: 85, functions: 85, lines: 85, statements: 85,
      },
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    allowOnly: false,
    bail: 0,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@api": path.resolve(__dirname, "../../packages/api/src"),
      "@app-components": path.resolve(
        __dirname,
        "../../packages/app-components/src",
      ),
      shared: path.resolve(__dirname, "../../packages/shared/src"),
      ui: path.resolve(__dirname, "../../packages/ui/src"),
      api: path.resolve(__dirname, "../../packages/api/src"),
      "@monorepo/app-components": path.resolve(
        __dirname,
        "../../packages/app-components/src",
      ),
    },
  },
});
