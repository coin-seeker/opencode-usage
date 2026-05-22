import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CodexCredentials, CodexJwtPayload } from "./types"

const CODEX_AUTH_FILE = join(homedir(), ".codex", "auth.json")
const OPENCODE_AUTH_FILE = process.platform === "win32"
  ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "opencode", "auth.json")
  : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "opencode", "auth.json")

// OAuth client_id for Codex CLI (extracted from id_token `aud` claim in ~/.codex/auth.json)
const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const REFRESH_ENDPOINT = "https://auth.openai.com/oauth/token"
const REFRESH_TIMEOUT_MS = 10_000
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

export function isCodexTokenExpired(expiresAtMs: number): boolean {
  return Date.now() + EXPIRY_BUFFER_MS >= expiresAtMs
}

function base64UrlDecode(input: string): string | null {
  try {
    const padding = "=".repeat((4 - (input.length % 4)) % 4)
    const base64 = (input + padding).replace(/-/g, "+").replace(/_/g, "/")
    return Buffer.from(base64, "base64").toString("utf8")
  } catch {
    return null
  }
}

export function decodeAccessTokenJwt(token: string): CodexJwtPayload | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const decoded = base64UrlDecode(parts[1])
  if (!decoded) return null
  try {
    const raw = JSON.parse(decoded) as Record<string, unknown>
    const authClaim = raw["https://api.openai.com/auth"]
    const profileClaim = raw["https://api.openai.com/profile"]
    const auth = (authClaim && typeof authClaim === "object" ? authClaim : {}) as Record<string, unknown>
    const profile = (profileClaim && typeof profileClaim === "object" ? profileClaim : {}) as Record<string, unknown>
    const emailFromProfile = typeof profile.email === "string" ? profile.email : null
    const emailFromTop = typeof raw.email === "string" ? raw.email : null
    return {
      email: emailFromProfile ?? emailFromTop,
      chatgptPlanType: typeof auth.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : null,
      chatgptAccountId: typeof auth.chatgpt_account_id === "string" ? auth.chatgpt_account_id : null,
      chatgptUserId: typeof auth.chatgpt_user_id === "string" ? auth.chatgpt_user_id : null,
      exp: typeof raw.exp === "number" ? raw.exp : null,
    }
  } catch {
    return null
  }
}

function jwtExpiresAtMs(token: string): number {
  const payload = decodeAccessTokenJwt(token)
  if (payload?.exp && Number.isFinite(payload.exp)) {
    return payload.exp * 1000
  }
  return 0
}

export function readCodexAuthFile(): CodexCredentials | null {
  try {
    const raw = readFileSync(CODEX_AUTH_FILE, "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const tokens = parsed.tokens as Record<string, unknown> | null | undefined
    if (!tokens) return null
    const accessToken = typeof tokens.access_token === "string" ? tokens.access_token : null
    const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token : null
    if (!accessToken) return null
    const accountId = typeof tokens.account_id === "string" ? tokens.account_id : null
    return {
      accessToken,
      refreshToken: refreshToken ?? "",
      accountId,
      expiresAt: jwtExpiresAtMs(accessToken),
    }
  } catch {
    return null
  }
}

export function readOpenCodeCodexAuth(): CodexCredentials | null {
  try {
    const raw = readFileSync(OPENCODE_AUTH_FILE, "utf8")
    const data = JSON.parse(raw) as Record<string, unknown>
    const openai = data.openai as Record<string, unknown> | undefined
    if (!openai) return null
    const accessToken = typeof openai.access === "string" ? openai.access : null
    if (!accessToken) return null
    const refresh = typeof openai.refresh === "string" ? openai.refresh : ""
    const accountId = typeof openai.accountId === "string" ? openai.accountId : null
    const expires = typeof openai.expires === "number" ? openai.expires : jwtExpiresAtMs(accessToken)
    return { accessToken, refreshToken: refresh, accountId, expiresAt: expires }
  } catch {
    return null
  }
}

export async function refreshCodexToken(refreshTokenStr: string): Promise<CodexCredentials | null> {
  if (!refreshTokenStr) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenStr,
      client_id: OAUTH_CLIENT_ID,
    })
    const response = await fetch(REFRESH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!response.ok) return null
    const data = (await response.json()) as Record<string, unknown>
    const accessToken = typeof data.access_token === "string" ? data.access_token : null
    if (!accessToken) return null
    const newRefresh = typeof data.refresh_token === "string" ? data.refresh_token : refreshTokenStr
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : null
    const expiresAt = expiresIn !== null
      ? Date.now() + expiresIn * 1000
      : jwtExpiresAtMs(accessToken)
    const payload = decodeAccessTokenJwt(accessToken)
    return {
      accessToken,
      refreshToken: newRefresh,
      accountId: payload?.chatgptAccountId ?? null,
      expiresAt,
    }
  } catch {
    return null
  }
}
