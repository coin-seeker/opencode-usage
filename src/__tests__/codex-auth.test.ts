import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  decodeAccessTokenJwt,
  isCodexTokenExpired,
  readCodexAuthFile,
  readOpenCodeCodexAuth,
  refreshCodexToken,
} from "../codex-auth.js"

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}))

import { readFileSync } from "node:fs"
const mockReadFile = vi.mocked(readFileSync)

function buildJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.sig`
}

describe("decodeAccessTokenJwt", () => {
  it("returns null for empty token", () => {
    expect(decodeAccessTokenJwt("")).toBeNull()
  })

  it("returns null for non-JWT token (no dots)", () => {
    expect(decodeAccessTokenJwt("not-a-jwt")).toBeNull()
  })

  it("decodes nested OpenAI auth + profile claims", () => {
    const token = buildJwt({
      exp: 1780000000,
      "https://api.openai.com/auth": {
        chatgpt_plan_type: "pro",
        chatgpt_account_id: "acct-abc",
        chatgpt_user_id: "user-1",
      },
      "https://api.openai.com/profile": {
        email: "x@example.com",
        email_verified: true,
      },
    })
    const result = decodeAccessTokenJwt(token)
    expect(result?.email).toBe("x@example.com")
    expect(result?.chatgptPlanType).toBe("pro")
    expect(result?.chatgptAccountId).toBe("acct-abc")
    expect(result?.exp).toBe(1780000000)
  })

  it("falls back to top-level email when profile claim missing", () => {
    const token = buildJwt({ exp: 1, email: "top@example.com" })
    expect(decodeAccessTokenJwt(token)?.email).toBe("top@example.com")
  })

  it("returns null when payload is not valid JSON", () => {
    const header = Buffer.from("{}").toString("base64url")
    const garbage = Buffer.from("not-json{").toString("base64url")
    expect(decodeAccessTokenJwt(`${header}.${garbage}.sig`)).toBeNull()
  })
})

describe("isCodexTokenExpired", () => {
  it("returns true for past timestamps", () => {
    expect(isCodexTokenExpired(Date.now() - 1000)).toBe(true)
  })

  it("returns true when within 5min buffer", () => {
    expect(isCodexTokenExpired(Date.now() + 60 * 1000)).toBe(true)
  })

  it("returns false for tokens valid beyond buffer", () => {
    expect(isCodexTokenExpired(Date.now() + 30 * 60 * 1000)).toBe(false)
  })
})

describe("readCodexAuthFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when file does not exist", () => {
    mockReadFile.mockImplementation(() => {
      throw new Error("ENOENT")
    })
    expect(readCodexAuthFile()).toBeNull()
  })

  it("returns null when JSON malformed", () => {
    mockReadFile.mockReturnValue("{not-json")
    expect(readCodexAuthFile()).toBeNull()
  })

  it("returns null when tokens block missing", () => {
    mockReadFile.mockReturnValue(JSON.stringify({ auth_mode: "chatgpt" }))
    expect(readCodexAuthFile()).toBeNull()
  })

  it("parses chatgpt OAuth credentials with JWT-derived expiresAt", () => {
    const accessToken = buildJwt({ exp: 1780000000 })
    mockReadFile.mockReturnValue(JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        id_token: "ignored",
        access_token: accessToken,
        refresh_token: "rt_abc",
        account_id: "acct-xyz",
      },
    }))
    const result = readCodexAuthFile()
    expect(result).not.toBeNull()
    expect(result?.accessToken).toBe(accessToken)
    expect(result?.refreshToken).toBe("rt_abc")
    expect(result?.accountId).toBe("acct-xyz")
    expect(result?.expiresAt).toBe(1780000000 * 1000)
  })

  it("returns null when access_token missing", () => {
    mockReadFile.mockReturnValue(JSON.stringify({ tokens: { refresh_token: "rt" } }))
    expect(readCodexAuthFile()).toBeNull()
  })
})

describe("readOpenCodeCodexAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when openai key absent", () => {
    mockReadFile.mockReturnValue(JSON.stringify({ anthropic: {} }))
    expect(readOpenCodeCodexAuth()).toBeNull()
  })

  it("parses openai oauth block with explicit expires (ms)", () => {
    mockReadFile.mockReturnValue(JSON.stringify({
      openai: {
        type: "oauth",
        access: "tok",
        refresh: "rt",
        expires: 1779712219801,
        accountId: "acct-1",
      },
    }))
    const result = readOpenCodeCodexAuth()
    expect(result?.accessToken).toBe("tok")
    expect(result?.expiresAt).toBe(1779712219801)
    expect(result?.accountId).toBe("acct-1")
  })

  it("falls back to JWT exp when expires field missing", () => {
    const tok = buildJwt({ exp: 1780000000 })
    mockReadFile.mockReturnValue(JSON.stringify({
      openai: { access: tok, refresh: "rt", accountId: "x" },
    }))
    expect(readOpenCodeCodexAuth()?.expiresAt).toBe(1780000000 * 1000)
  })
})

describe("refreshCodexToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  it("returns null when refresh token empty", async () => {
    expect(await refreshCodexToken("")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns null on 401 response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))
    expect(await refreshCodexToken("rt")).toBeNull()
  })

  it("returns null on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ENETDOWN"))
    expect(await refreshCodexToken("rt")).toBeNull()
  })

  it("returns parsed credentials on success with expires_in", async () => {
    const newAccess = buildJwt({
      exp: 1780000000,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-2" },
    })
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      access_token: newAccess,
      refresh_token: "rt_new",
      expires_in: 3600,
    }), { status: 200 }))
    const before = Date.now()
    const result = await refreshCodexToken("rt_old")
    expect(result?.accessToken).toBe(newAccess)
    expect(result?.refreshToken).toBe("rt_new")
    expect(result?.accountId).toBe("acct-2")
    expect(result?.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100)
  })

  it("falls back to JWT exp when expires_in missing", async () => {
    const newAccess = buildJwt({ exp: 1780000000 })
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      access_token: newAccess,
    }), { status: 200 }))
    expect((await refreshCodexToken("rt"))?.expiresAt).toBe(1780000000 * 1000)
  })
})
