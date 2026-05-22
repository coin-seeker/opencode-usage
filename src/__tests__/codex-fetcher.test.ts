import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../codex-auth.js", () => ({
  readCodexAuthFile: vi.fn(),
  readOpenCodeCodexAuth: vi.fn(),
  refreshCodexToken: vi.fn(),
  isCodexTokenExpired: vi.fn(),
  decodeAccessTokenJwt: vi.fn(),
}))
vi.mock("../codex-oauth-client.js", () => ({
  fetchCodexUsage: vi.fn(),
}))
vi.mock("../cache.js", () => ({
  readNamespacedCache: vi.fn(),
  writeNamespacedCache: vi.fn(),
}))

import {
  readCodexAuthFile,
  readOpenCodeCodexAuth,
  refreshCodexToken,
  isCodexTokenExpired,
  decodeAccessTokenJwt,
} from "../codex-auth.js"
import { fetchCodexUsage } from "../codex-oauth-client.js"
import { fetchCodexUsageData } from "../codex-fetcher.js"
import type { CodexUsageResponse } from "../types"

const sampleUsage: CodexUsageResponse = {
  userId: "user-1",
  accountId: "acct-1",
  email: "u@example.com",
  planType: "pro",
  rateLimit: {
    allowed: true,
    limitReached: false,
    primaryWindow: { usedPercent: 27, limitWindowSeconds: 18000, resetAfterSeconds: 680, resetAt: 1779479756 },
    secondaryWindow: { usedPercent: 23, limitWindowSeconds: 604800, resetAfterSeconds: 477199, resetAt: 1779956275 },
  },
  credits: null,
  rateLimitReachedType: null,
}

describe("fetchCodexUsageData fallback chain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readCodexAuthFile).mockReturnValue(null)
    vi.mocked(readOpenCodeCodexAuth).mockReturnValue(null)
    vi.mocked(fetchCodexUsage).mockResolvedValue(null)
    vi.mocked(refreshCodexToken).mockResolvedValue(null)
    vi.mocked(isCodexTokenExpired).mockReturnValue(false)
    vi.mocked(decodeAccessTokenJwt).mockReturnValue(null)
    delete process.env.CODEX_OAUTH_ACCESS_TOKEN
    delete process.env.CODEX_ACCOUNT_ID
  })

  it("returns authMethod none when all methods fail", async () => {
    const result = await fetchCodexUsageData()
    expect(result.authMethod).toBe("none")
    expect(result.usage).toBeNull()
  })

  it("uses env vars first when both are set", async () => {
    process.env.CODEX_OAUTH_ACCESS_TOKEN = "env-tok"
    process.env.CODEX_ACCOUNT_ID = "env-acct"
    vi.mocked(fetchCodexUsage).mockResolvedValue(sampleUsage)

    const result = await fetchCodexUsageData()
    expect(fetchCodexUsage).toHaveBeenCalledWith("env-tok", "env-acct")
    expect(result.authMethod).toBe("env")
    expect(result.usage).toEqual(sampleUsage)
  })

  it("skips env path when only one env var present", async () => {
    process.env.CODEX_OAUTH_ACCESS_TOKEN = "env-tok"
    const result = await fetchCodexUsageData()
    expect(result.authMethod).toBe("none")
  })

  it("uses codex-cli credentials when non-expired and fetch succeeds", async () => {
    vi.mocked(readCodexAuthFile).mockReturnValue({
      accessToken: "cli-tok",
      refreshToken: "rt",
      accountId: "acct-cli",
      expiresAt: Date.now() + 10 * 60 * 1000,
    })
    vi.mocked(fetchCodexUsage).mockResolvedValue(sampleUsage)

    const result = await fetchCodexUsageData()
    expect(fetchCodexUsage).toHaveBeenCalledWith("cli-tok", "acct-cli")
    expect(result.authMethod).toBe("oauth-codex-cli")
    expect(result.usage).toEqual(sampleUsage)
  })

  it("refreshes expired codex-cli token before fetching", async () => {
    vi.mocked(readCodexAuthFile).mockReturnValue({
      accessToken: "old-tok",
      refreshToken: "rt",
      accountId: "acct-cli",
      expiresAt: Date.now() - 1000,
    })
    vi.mocked(isCodexTokenExpired).mockReturnValue(true)
    vi.mocked(refreshCodexToken).mockResolvedValue({
      accessToken: "new-tok",
      refreshToken: "rt-new",
      accountId: "acct-refreshed",
      expiresAt: Date.now() + 3600 * 1000,
    })
    vi.mocked(fetchCodexUsage).mockResolvedValue(sampleUsage)

    const result = await fetchCodexUsageData()
    expect(refreshCodexToken).toHaveBeenCalledWith("rt")
    expect(fetchCodexUsage).toHaveBeenCalledWith("new-tok", "acct-refreshed")
    expect(result.authMethod).toBe("oauth-codex-cli")
  })

  it("falls back to OpenCode auth when codex-cli auth fails", async () => {
    vi.mocked(readCodexAuthFile).mockReturnValue(null)
    vi.mocked(readOpenCodeCodexAuth).mockReturnValue({
      accessToken: "oc-tok",
      refreshToken: "rt",
      accountId: "acct-oc",
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
    vi.mocked(fetchCodexUsage).mockResolvedValue(sampleUsage)

    const result = await fetchCodexUsageData()
    expect(fetchCodexUsage).toHaveBeenCalledWith("oc-tok", "acct-oc")
    expect(result.authMethod).toBe("oauth-opencode")
  })

  it("returns none when credentials present but accountId is null", async () => {
    vi.mocked(readCodexAuthFile).mockReturnValue({
      accessToken: "tok",
      refreshToken: "rt",
      accountId: null,
      expiresAt: Date.now() + 60_000,
    })
    const result = await fetchCodexUsageData()
    expect(result.authMethod).toBe("none")
    expect(fetchCodexUsage).not.toHaveBeenCalled()
  })

  it("builds profile from JWT when usage payload lacks email/planType", async () => {
    vi.mocked(readCodexAuthFile).mockReturnValue({
      accessToken: "tok-with-jwt",
      refreshToken: "rt",
      accountId: "acct",
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
    vi.mocked(fetchCodexUsage).mockResolvedValue({
      ...sampleUsage,
      email: null,
      planType: null,
    })
    vi.mocked(decodeAccessTokenJwt).mockReturnValue({
      email: "jwt@example.com",
      chatgptPlanType: "plus",
      chatgptAccountId: "acct",
      chatgptUserId: "user-1",
      exp: 1780000000,
    })

    const result = await fetchCodexUsageData()
    expect(result.profile).toEqual({ email: "jwt@example.com", planType: "plus" })
  })

  it("memoises failed tokens within one fetch attempt", async () => {
    vi.mocked(readCodexAuthFile).mockReturnValue({
      accessToken: "bad-tok",
      refreshToken: "rt",
      accountId: "acct",
      expiresAt: Date.now() + 60_000,
    })
    vi.mocked(readOpenCodeCodexAuth).mockReturnValue({
      accessToken: "bad-tok",
      refreshToken: "rt",
      accountId: "acct",
      expiresAt: Date.now() + 60_000,
    })
    vi.mocked(fetchCodexUsage).mockResolvedValue(null)

    await fetchCodexUsageData()
    expect(fetchCodexUsage).toHaveBeenCalledTimes(1)
  })
})
