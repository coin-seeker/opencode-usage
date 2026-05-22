import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { readKeychainCredentials, readCredentialsFile, readOpenCodeAuth, refreshToken, isTokenExpired } from "./keychain"
import { fetchOAuthUsage, fetchOAuthProfile } from "./oauth-client"
import { extractSessionKey, fetchWebUsage } from "./cookie-reader"
import { detectClaude, probeCLIUsage, probeStatus } from "./cli-probe"
import type { UsageState, OAuthUsageResponse, ProfileResponse, AuthMethod } from "./types"

interface FetchResult {
  usage: OAuthUsageResponse | null
  profile: ProfileResponse | null
  authMethod: AuthMethod
}

const CACHE_DIR = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "opencode-usage")
const CACHE_FILE = join(CACHE_DIR, "last.json")
const CACHE_MAX_AGE_MS = 10 * 60 * 1000

interface CachedResult {
  timestamp: number
  result: FetchResult
}

function readCache(): FetchResult | null {
  try {
    const raw = readFileSync(CACHE_FILE, "utf8")
    const cached = JSON.parse(raw) as CachedResult
    if (Date.now() - cached.timestamp > CACHE_MAX_AGE_MS) return null
    if (!cached.result?.usage) return null
    return cached.result
  } catch {
    return null
  }
}

function writeCache(result: FetchResult): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    const cached: CachedResult = { timestamp: Date.now(), result }
    const tmpFile = `${CACHE_FILE}.${process.pid}.tmp`
    writeFileSync(tmpFile, JSON.stringify(cached), { encoding: "utf8", mode: 0o600 })
    renameSync(tmpFile, CACHE_FILE)
  } catch {}
}

/**
 * Fetch Claude usage data via 6-step fallback chain:
 * 0. Environment variable token (CLAUDE_CODE_OAUTH_TOKEN)
 * 1. Credentials file (~/.claude/.credentials.json)
 * 2. OpenCode auth.json + token refresh
 * 3. Keychain (macOS only, user:profile scope required)
 * 4. CLI PTY probe (macOS/Linux, Python3 required)
 * 5. Browser cookies (Chrome/Firefox)
 *
 * Never throws. Always returns a FetchResult.
 */
const failedTokens = new Set<string>()
let lastRefreshedToken: string | null = null

async function tryOAuthToken(token: string): Promise<FetchResult | null> {
  if (failedTokens.has(token)) return null
  try {
    const [usage, profile] = await Promise.all([
      fetchOAuthUsage(token),
      fetchOAuthProfile(token),
    ])
    if (usage) {
      return { usage, profile, authMethod: "oauth" }
    }
    failedTokens.add(token)
  } catch {
    failedTokens.add(token)
  }
  return null
}

export async function fetchUsageData(): Promise<FetchResult> {
  failedTokens.clear()

  // ── Step 0: Environment variable token (works on all OS)
  try {
    const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
    if (envToken) {
      const result = await tryOAuthToken(envToken)
      if (result) return result
    }
  } catch {}

  // ── Step 1: Credentials file (~/.claude/.credentials.json, cross-platform)
  try {
    const fileCreds = readCredentialsFile()
    if (fileCreds) {
      const result = await tryOAuthToken(fileCreds.accessToken)
      if (result) return result
    }
  } catch {}

  // ── Step 2: OpenCode auth.json + token refresh (cross-platform)
  try {
    const ocAuth = readOpenCodeAuth()
    if (ocAuth) {
      let token = lastRefreshedToken ?? ocAuth.accessToken
      if ((!lastRefreshedToken && isTokenExpired(ocAuth.expiresAt)) && ocAuth.refreshToken) {
        const refreshed = await refreshToken(ocAuth.refreshToken)
        if (refreshed) {
          token = refreshed.accessToken
          lastRefreshedToken = token
        }
      }
      const result = await tryOAuthToken(token)
      if (result) return result
    }
  } catch {}

  // ── Step 3: Keychain (macOS only, skip if no user:profile scope)
  try {
    const credentials = await readKeychainCredentials()
    if (credentials?.hasProfileScope) {
      const result = await tryOAuthToken(credentials.accessToken)
      if (result) return result
    }
  } catch {}

  // ── Step 4: CLI PTY probe (macOS/Linux, primary when OAuth unavailable)
  try {
    const installed = await detectClaude()
    if (installed) {
      const [probeResult, statusResult] = await Promise.all([
        probeCLIUsage(),
        probeStatus(),
      ])

      if (probeResult) {
        // Map CLIProbeResult → OAuthUsageResponse (best-effort)
        const usage: OAuthUsageResponse = {
          fiveHour: probeResult.sessionPercent !== null
            ? { utilization: probeResult.sessionPercent, resetsAt: probeResult.sessionReset }
            : null,
          sevenDay: probeResult.weeklyPercent !== null
            ? { utilization: probeResult.weeklyPercent, resetsAt: probeResult.weeklyReset }
            : null,
          sevenDaySonnet: probeResult.sonnetPercent !== null
            ? { utilization: probeResult.sonnetPercent, resetsAt: null }
            : null,
          sevenDayOpus: probeResult.opusPercent !== null
            ? { utilization: probeResult.opusPercent, resetsAt: null }
            : null,
          sevenDayDesign: null,
          sevenDayRoutines: null,
          sevenDayOAuthApps: null,
          extraUsage: null,
        }

        const profile: ProfileResponse | null = statusResult
          ? {
              email: statusResult.email,
              plan: statusResult.org,
            }
          : null

        return { usage, profile, authMethod: "cli" }
      }
    }
  } catch {
    // continue
  }

  // ── Step 5: Browser cookies (macOS/Linux)
  try {
    const sessionKey = await extractSessionKey()
    if (sessionKey) {
      const usage = await fetchWebUsage(sessionKey)
      if (usage) {
        return { usage, profile: null, authMethod: "cookie" }
      }
    }
  } catch {
    // continue
  }

  // ── All failed ───────────────────────────────────────────────────────
  return { usage: null, profile: null, authMethod: "none" }
}


/**
 * Create a refresh loop that calls fetchUsageData() on an interval.
 * Prevents duplicate concurrent fetches with a refreshing flag.
 * Preserves stale data during loading to prevent UI flicker.
 */
export function createRefreshLoop(
  setState: (state: UsageState) => void,
  intervalMs: number,
): { start: () => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null
  let refreshing = false
  let lastData: UsageState["data"] = null
  let lastProfile: UsageState["profile"] = null
  let lastAuthMethod: UsageState["authMethod"] = "none"
  let isFirstRun = true

  async function refresh(): Promise<void> {
    if (refreshing) return
    refreshing = true

    if (isFirstRun) {
      const cached = readCache()
      if (cached && cached.usage) {
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
      const result = await fetchUsageData()

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
          lastData = null
          lastProfile = null
          lastAuthMethod = "none"
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
        writeCache(result)
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
