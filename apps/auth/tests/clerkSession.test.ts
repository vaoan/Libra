import { describe, expect, it, vi } from "vitest";

import { mintProductionSessionToken } from "../e2e/helpers/clerkSession";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return {
    ok: (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: { get: (k: string) => init.headers?.[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const calledUrls = (fetchImpl: ReturnType<typeof vi.fn>) =>
  fetchImpl.mock.calls.map((call) => call[0]);

describe("mintProductionSessionToken", () => {
  it("refuses a development key before any request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      mintProductionSessionToken({
        secretKey: "sk_test_x",
        domain: "clerk.furrycolombia.com",
        userId: "user_1",
        fetchImpl,
      }),
    ).rejects.toThrow(/for sk_live_ keys/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses a sign-in token redeemed through the Frontend API on a live key", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tkt" }))
      .mockResolvedValueOnce(
        jsonResponse(
          { response: { created_session_id: "sess_9" } },
          { headers: { authorization: "client_abc" } },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ jwt: "live.jwt" }));
    const jwt = await mintProductionSessionToken({
      secretKey: "sk_live_x",
      domain: "clerk.furrycolombia.com",
      userId: "user_1",
      fetchImpl,
    });
    expect(jwt).toBe("live.jwt");
    expect(calledUrls(fetchImpl)).toEqual([
      "https://api.clerk.com/v1/sign_in_tokens",
      "https://clerk.furrycolombia.com/v1/client/sign_ins?_is_native=1",
      "https://clerk.furrycolombia.com/v1/client/sessions/sess_9/tokens?_is_native=1",
    ]);
    const tokenInit = fetchImpl.mock.calls[2]?.[1] as RequestInit | undefined;
    expect((tokenInit?.headers as Record<string, string>).Authorization).toBe(
      "client_abc",
    );
  });

  it("refuses a live key without a domain before any request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      mintProductionSessionToken({
        secretKey: "sk_live_x",
        userId: "user_1",
        fetchImpl,
      }),
    ).rejects.toThrow(/CLERK_DOMAIN is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws, never exits, when the sign-in does not create a session", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tkt" }))
      .mockResolvedValueOnce(
        jsonResponse({ response: {} }, { headers: { authorization: "c" } }),
      );
    await expect(
      mintProductionSessionToken({
        secretKey: "sk_live_x",
        domain: "clerk.furrycolombia.com",
        userId: "user_1",
        fetchImpl,
      }),
    ).rejects.toThrow(/without creating a session/);
  });
});
