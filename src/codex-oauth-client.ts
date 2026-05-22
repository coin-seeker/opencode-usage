import type { CodexUsageResponse } from "./types"
import { snakeToCamel } from "./oauth-client"

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const USER_AGENT = "codex-cli"
const TIMEOUT_MS = 10_000

function makeHeaders(accessToken: string, accountId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "ChatGPT-Account-Id": accountId,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  }
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchCodexUsage(
  accessToken: string,
  accountId: string,
): Promise<CodexUsageResponse | null> {
  if (!accessToken || !accountId) return null
  try {
    const response = await fetchWithTimeout(USAGE_URL, makeHeaders(accessToken, accountId))
    if (!response || !response.ok) return null
    const raw = (await response.json()) as Record<string, unknown>
    return snakeToCamel(raw) as CodexUsageResponse
  } catch {
    return null
  }
}
