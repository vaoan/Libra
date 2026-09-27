/**
 * Mint a real Clerk session JWT for a user without a browser.
 *
 * Development instances allow `POST /v1/sessions` on the Backend API.
 * Production instances refuse it ("Request only valid for development
 * instances"), so there the Backend API issues a sign-in token and the
 * Frontend API consumes it in native mode (`_is_native=1`, client token in
 * the `Authorization` header) and signs the session JWT. The key prefix
 * picks the path. Every failure throws — the caller owns a user to delete.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §7.
 */

const BACKEND_API = "https://api.clerk.com/v1";

export interface MintArgs {
  secretKey: string;
  domain?: string;
  userId: string;
  fetchImpl?: typeof fetch;
}

export async function mintSessionToken({
  secretKey,
  domain,
  userId,
  fetchImpl = fetch,
}: MintArgs): Promise<string> {
  const backend = async (path: string, body: unknown) => {
    const res = await fetchImpl(`${BACKEND_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      throw new Error(
        `${path} -> HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    return json;
  };

  if (!secretKey.startsWith("sk_live_")) {
    const session = await backend("/sessions", { user_id: userId });
    const minted = await backend(
      `/sessions/${session.id as string}/tokens`,
      {},
    );
    return (minted.jwt ?? minted.token) as string;
  }

  if (!domain) {
    throw new Error(
      "CLERK_DOMAIN is required to mint on a production instance.",
    );
  }
  const ticket = await backend("/sign_in_tokens", {
    user_id: userId,
    expires_in_seconds: 300,
  });
  const fapi = `https://${domain}/v1`;
  const signIn = await fetchImpl(`${fapi}/client/sign_ins?_is_native=1`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      strategy: "ticket",
      ticket: ticket.token as string,
    }),
  });
  const clientToken = signIn.headers.get("authorization");
  const signInBody = (await signIn.json().catch(() => ({}))) as {
    response?: { created_session_id?: string };
  };
  if (!signIn.ok || !clientToken) {
    throw new Error(
      `${fapi}/client/sign_ins -> HTTP ${signIn.status}: ${JSON.stringify(signInBody).slice(0, 200)}`,
    );
  }
  const sessionId = signInBody.response?.created_session_id;
  if (!sessionId) {
    throw new Error("the sign-in completed without creating a session.");
  }
  const minted = await fetchImpl(
    `${fapi}/client/sessions/${sessionId}/tokens?_is_native=1`,
    { method: "POST", headers: { Authorization: clientToken } },
  );
  const mintedBody = (await minted.json().catch(() => ({}))) as {
    jwt?: string;
  };
  if (!minted.ok || !mintedBody.jwt) {
    throw new Error(
      `${fapi}/client/sessions/…/tokens -> HTTP ${minted.status}`,
    );
  }
  return mintedBody.jwt;
}
