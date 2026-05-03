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

export interface UsageState {
  status: FetchStatus
  data: OAuthUsageResponse | null
  profile: ProfileResponse | null
  authMethod: AuthMethod
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
}
