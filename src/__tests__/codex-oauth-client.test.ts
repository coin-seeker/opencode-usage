import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchCodexUsage } from "../codex-oauth-client.js"

describe("fetchCodexUsage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  it("returns null when accessToken is empty", async () => {
    const result = await fetchCodexUsage("", "acct-1")
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns null when accountId is empty", async () => {
    const result = await fetchCodexUsage("tok", "")
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns null on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))
    expect(await fetchCodexUsage("bad", "acct-1")).toBeNull()
  })

  it("returns null on 403", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }))
    expect(await fetchCodexUsage("scope-missing", "acct-1")).toBeNull()
  })

  it("returns null on 5xx", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))
    expect(await fetchCodexUsage("tok", "acct-1")).toBeNull()
  })

  it("returns null on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNRESET"))
    expect(await fetchCodexUsage("tok", "acct-1")).toBeNull()
  })

  it("parses snake_case wham/usage response into camelCase", async () => {
    const body = JSON.stringify({
      user_id: "user-1",
      account_id: "user-1",
      email: "u@example.com",
      plan_type: "prolite",
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 27,
          limit_window_seconds: 18000,
          reset_after_seconds: 680,
          reset_at: 1779479756,
        },
        secondary_window: {
          used_percent: 23,
          limit_window_seconds: 604800,
          reset_after_seconds: 477199,
          reset_at: 1779956275,
        },
      },
      credits: { has_credits: false, balance: "0" },
      rate_limit_reached_type: null,
    })
    vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 200 }))

    const result = await fetchCodexUsage("tok", "acct-1")
    expect(result).not.toBeNull()
    expect(result?.planType).toBe("prolite")
    expect(result?.email).toBe("u@example.com")
    expect(result?.rateLimit?.primaryWindow?.usedPercent).toBe(27)
    expect(result?.rateLimit?.primaryWindow?.limitWindowSeconds).toBe(18000)
    expect(result?.rateLimit?.primaryWindow?.resetAt).toBe(1779479756)
    expect(result?.rateLimit?.secondaryWindow?.usedPercent).toBe(23)
    expect(result?.credits?.hasCredits).toBe(false)
    expect(result?.rateLimitReachedType).toBeNull()
  })

  it("sends correct headers (Authorization, ChatGPT-Account-Id, User-Agent)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    await fetchCodexUsage("my-token", "my-acct")
    expect(fetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/wham/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-token",
          "ChatGPT-Account-Id": "my-acct",
          "User-Agent": "codex-cli",
        }),
      }),
    )
  })
})
