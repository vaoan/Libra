/**
 * E2E creates and deletes real Clerk users. Against a production instance
 * that would pollute real user data and count toward MAU, so this refuses to
 * run rather than trusting configuration to be correct.
 */
export function assertNotProductionClerk(secretKey: string): void {
  if (secretKey.startsWith("sk_live_")) {
    throw new Error(
      "[e2e] refusing to run against a production Clerk instance " +
        "(CLERK_SECRET_KEY starts with sk_live_). E2E creates and deletes " +
        "real users; point it at the development instance.",
    );
  }
}
