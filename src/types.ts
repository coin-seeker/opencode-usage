// OAuth API response types
export interface OAuthUsageWindow {
  utilization: number | null
  resetsAt: string | null
}

export interface OAuthExtraUsage {
  isEnabled: boolean | null
  monthlyLimit: number | null
  usedCredits: number | null
  utilization: number | null
  currency: string | null
}

export interface OAuthUsageResponse {
  fiveHour: OAuthUsageWindow | null
  sevenDay: OAuthUsageWindow | null
  sevenDaySonnet: OAuthUsageWindow | null
  sevenDayOpus: OAuthUsageWindow | null
  sevenDayDesign: OAuthUsageWindow | null
  sevenDayRoutines: OAuthUsageWindow | null
  sevenDayOAuthApps: OAuthUsageWindow | null
  extraUsage: OAuthExtraUsage | null
}

// Profile response
export interface ProfileResponse {
  email: string
  plan: string | null
}

// Keychain payload wrapper (actual JSON structure from macOS Keychain)
export interface KeychainPayload {
  claudeAiOauth: {
    accessToken: string
    refreshToken: string
    expiresAt: number // Unix timestamp in milliseconds
    scopes: string[]
    subscriptionType?: string
    rateLimitTier?: string
  }
}

// Parsed credentials with derived fields
export interface OAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix timestamp in milliseconds
  scopes: string[]
  subscriptionType: string | null
  rateLimitTier: string | null
  hasProfileScope: boolean
}

// CLI probe result
export interface CLIProbeResult {
  sessionPercent: number | null
  weeklyPercent: number | null
  opusPercent: number | null
  sonnetPercent: number | null
  sessionReset: string | null
  weeklyReset: string | null
  email: string | null
  org: string | null
}

// Plugin state
export type FetchStatus = "idle" | "loading" | "success" | "error" | "not-configured"
export type AuthMethod = "oauth" | "cookie" | "cli" | "none"
export type ClaudeAuthMethod = AuthMethod

export interface UsageState {
  status: FetchStatus
  data: OAuthUsageResponse | null
  profile: ProfileResponse | null
  authMethod: AuthMethod
  error: string | null
}

export interface CodexUsageWindow {
  usedPercent: number | null
  limitWindowSeconds: number | null
  resetAfterSeconds: number | null
  resetAt: number | null // Unix timestamp in seconds (raw API value, not ms)
}

export interface CodexRateLimit {
  allowed: boolean | null
  limitReached: boolean | null
  primaryWindow: CodexUsageWindow | null
  secondaryWindow: CodexUsageWindow | null
}

export interface CodexCredits {
  hasCredits: boolean | null
  unlimited: boolean | null
  overageLimitReached: boolean | null
  balance: string | null
}

export interface CodexUsageResponse {
  userId: string | null
  accountId: string | null
  email: string | null
  planType: string | null
  rateLimit: CodexRateLimit | null
  credits: CodexCredits | null
  rateLimitReachedType: { type: string } | null
}

export interface CodexProfile {
  email: string | null
  planType: string | null
}

export interface CodexJwtPayload {
  email: string | null
  chatgptPlanType: string | null
  chatgptAccountId: string | null
  chatgptUserId: string | null
  exp: number | null // Unix timestamp in seconds (JWT standard)
}

export interface CodexCredentials {
  accessToken: string
  refreshToken: string
  accountId: string | null
  expiresAt: number // Unix timestamp in milliseconds (normalised from JWT seconds)
}

export type CodexAuthMethod = "oauth-codex-cli" | "oauth-opencode" | "env" | "none"

export interface CodexState {
  status: FetchStatus
  data: CodexUsageResponse | null
  profile: CodexProfile | null
  authMethod: CodexAuthMethod
  error: string | null
}

// Plugin configuration options (from tui.json)
export type DisplayMode = "text" | "bar"

export interface PluginOptions {
  refreshInterval?: number
  displayMode?: DisplayMode
  headerColor?: string
  valueColor?: string
  dimColor?: string
  showClaude?: boolean
  showCodex?: boolean
  codexHeaderColor?: string
}
