import {
  isCodexTokenExpired,
  readCodexAuthFile,
  readOpenCodeCodexAuth,
  refreshCodexToken,
  decodeAccessTokenJwt,
} from "./codex-auth"
import { fetchCodexUsage } from "./codex-oauth-client"
import { readNamespacedCache, writeNamespacedCache } from "./cache"
import type {
  CodexState,
  CodexUsageResponse,
  CodexProfile,
  CodexAuthMethod,
  CodexCredentials,
} from "./types"

interface CodexFetchResult {
  usage: CodexUsageResponse | null
  profile: CodexProfile | null
  authMethod: CodexAuthMethod
}

const failedTokens = new Set<string>()

function profileFromUsage(usage: CodexUsageResponse | null, accessToken: string): CodexProfile | null {
  if (usage?.email || usage?.planType) {
    return { email: usage.email, planType: usage.planType }
  }
  const jwt = decodeAccessTokenJwt(accessToken)
  if (!jwt) return null
  if (!jwt.email && !jwt.chatgptPlanType) return null
  return { email: jwt.email, planType: jwt.chatgptPlanType }
}

async function tryCredentials(
  creds: CodexCredentials | null,
  method: CodexAuthMethod,
): Promise<CodexFetchResult | null> {
  if (!creds || !creds.accountId) return null
  let token = creds.accessToken
  if (failedTokens.has(token)) return null

  if (isCodexTokenExpired(creds.expiresAt) && creds.refreshToken) {
    const refreshed = await refreshCodexToken(creds.refreshToken)
    if (refreshed?.accessToken) {
      token = refreshed.accessToken
      const refreshedAccountId = refreshed.accountId ?? creds.accountId
      if (failedTokens.has(token)) return null
      try {
        const usage = await fetchCodexUsage(token, refreshedAccountId)
        if (usage) {
          return { usage, profile: profileFromUsage(usage, token), authMethod: method }
        }
        failedTokens.add(token)
      } catch {
        failedTokens.add(token)
      }
      return null
    }
  }

  try {
    const usage = await fetchCodexUsage(token, creds.accountId)
    if (usage) {
      return { usage, profile: profileFromUsage(usage, token), authMethod: method }
    }
    failedTokens.add(token)
  } catch {
    failedTokens.add(token)
  }
  return null
}

export async function fetchCodexUsageData(): Promise<CodexFetchResult> {
  failedTokens.clear()

  const envToken = process.env.CODEX_OAUTH_ACCESS_TOKEN
  const envAccountId = process.env.CODEX_ACCOUNT_ID
  if (envToken && envAccountId) {
    const result = await tryCredentials(
      { accessToken: envToken, refreshToken: "", accountId: envAccountId, expiresAt: Number.MAX_SAFE_INTEGER },
      "env",
    )
    if (result) return result
  }

  try {
    const fileCreds = readCodexAuthFile()
    const result = await tryCredentials(fileCreds, "oauth-codex-cli")
    if (result) return result
  } catch {}

  try {
    const ocCreds = readOpenCodeCodexAuth()
    const result = await tryCredentials(ocCreds, "oauth-opencode")
    if (result) return result
  } catch {}

  return { usage: null, profile: null, authMethod: "none" }
}

function readCodexCache(): CodexFetchResult | null {
  const cached = readNamespacedCache<CodexFetchResult>("codex")
  if (!cached?.usage) return null
  return cached
}

function writeCodexCache(result: CodexFetchResult): void {
  writeNamespacedCache("codex", result)
}

export function createCodexRefreshLoop(
  setState: (state: CodexState) => void,
  intervalMs: number,
): { start: () => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null
  let refreshing = false
  let lastData: CodexState["data"] = null
  let lastProfile: CodexState["profile"] = null
  let lastAuthMethod: CodexState["authMethod"] = "none"
  let isFirstRun = true

  async function refresh(): Promise<void> {
    if (refreshing) return
    refreshing = true

    if (isFirstRun) {
      const cached = readCodexCache()
      if (cached?.usage) {
        lastData = cached.usage
        lastProfile = cached.profile
        lastAuthMethod = cached.authMethod
        setState({
          status: "success",
          data: cached.usage,
          profile: cached.profile,
          authMethod: cached.authMethod,
          error: null,
        })
      }
    }

    if (!lastData) {
      setState({
        status: "loading",
        data: null,
        profile: null,
        authMethod: "none",
        error: null,
      })
    }

    try {
      const result = await fetchCodexUsageData()

      if (result.authMethod === "none") {
        if (lastData) {
          setState({
            status: "success",
            data: lastData,
            profile: lastProfile,
            authMethod: lastAuthMethod,
            error: null,
          })
        } else {
          setState({
            status: "not-configured",
            data: null,
            profile: null,
            authMethod: "none",
            error: null,
          })
        }
      } else {
        lastData = result.usage
        lastProfile = result.profile
        lastAuthMethod = result.authMethod
        writeCodexCache(result)
        setState({
          status: "success",
          data: result.usage,
          profile: result.profile,
          authMethod: result.authMethod,
          error: null,
        })
      }
    } catch (err) {
      setState({
        status: lastData ? "success" : "error",
        data: lastData,
        profile: lastProfile,
        authMethod: lastAuthMethod,
        error: lastData ? null : String(err),
      })
    } finally {
      refreshing = false
      isFirstRun = false
    }
  }

  return {
    start() {
      if (timer !== null) return
      void refresh()
      timer = setInterval(() => { void refresh() }, intervalMs)
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
