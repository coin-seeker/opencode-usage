function formatRelativeMs(diffMs: number): string {
  if (diffMs <= 0) return "now"
  const totalMinutes = Math.floor(diffMs / 1000 / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (totalHours > 0) return `${totalHours}h ${minutes}m`
  if (totalMinutes > 0) return `${totalMinutes}m`
  return "now"
}

function parseResetString(text: string): number | null {
  let raw = text.trim()
  if (!/^resets/i.test(raw)) return null

  raw = raw.replace(/^resets?\s*/i, "")

  let tz: string | null = null
  const tzMatch = raw.match(/\(([^)]*)\)?/)
  if (tzMatch) {
    tz = tzMatch[1] || null
    raw = raw.replace(tzMatch[0], "").trim()
  }

  raw = raw.replace(/\bat\b/gi, " ")
  raw = raw.replace(/([A-Za-z]{3})(\d)/g, "$1 $2")
  raw = raw.replace(/,(\d)/g, ", $1")
  raw = raw.replace(/(\d)at(?=\d)/gi, "$1 ")
  raw = raw.replace(/\s+/g, " ").trim()

  const now = new Date()

  const formats = [
    /^([A-Za-z]+)\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
    /^([A-Za-z]+)\s+(\d{1,2})\s+(\d{1,2})\s*(am|pm)$/i,
    /^(\d{1,2}):(\d{2})\s*(am|pm)$/i,
    /^(\d{1,2})\s*(am|pm)$/i,
  ]

  for (const fmt of formats) {
    const m = raw.match(fmt)
    if (!m) continue

    if (m.length >= 6) {
      const [, month, day, hour, min, ampm] = m
      return buildDate(now, month, Number(day), Number(hour), Number(min), ampm, tz)
    }
    if (m.length >= 5 && /^[A-Za-z]/.test(m[1])) {
      const [, month, day, hour, ampm] = m
      return buildDate(now, month, Number(day), Number(hour), 0, ampm, tz)
    }
    if (m.length >= 4 && /^\d/.test(m[1])) {
      const [, hour, min, ampm] = m
      return buildDateToday(now, Number(hour), Number(min), ampm, tz)
    }
    if (m.length >= 3 && /^\d/.test(m[1])) {
      const [, hour, ampm] = m
      return buildDateToday(now, Number(hour), 0, ampm, tz)
    }
  }
  return null
}

function to24h(hour: number, ampm: string): number {
  const h = hour % 12
  return ampm.toLowerCase() === "pm" ? h + 12 : h
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function resolveInTimezone(year: number, month: number, day: number, h24: number, min: number, tz: string | null): number {
  if (tz) {
    try {
      const probe = new Date(Date.UTC(year, month, day, h24, min, 0))
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      })
      const localStr = fmt.format(probe)
      const localParts = localStr.match(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/)
      if (localParts) {
        const tzOffsetMs = probe.getTime() - new Date(
          Number(localParts[3]), Number(localParts[1]) - 1, Number(localParts[2]),
          Number(localParts[4]), Number(localParts[5]), Number(localParts[6]),
        ).getTime()
        return new Date(year, month, day, h24, min, 0, 0).getTime() + tzOffsetMs
      }
    } catch {}
  }
  return new Date(year, month, day, h24, min, 0, 0).getTime()
}

function buildDate(
  now: Date, monthStr: string, day: number, hour: number, min: number, ampm: string, tz: string | null,
): number | null {
  const month = MONTHS[monthStr.toLowerCase().slice(0, 3)]
  if (month === undefined) return null
  const h24 = to24h(hour, ampm)
  const ts = resolveInTimezone(now.getFullYear(), month, day, h24, min, tz)
  if (ts < now.getTime()) return resolveInTimezone(now.getFullYear() + 1, month, day, h24, min, tz)
  return ts
}

function buildDateToday(
  now: Date, hour: number, min: number, ampm: string, tz: string | null,
): number | null {
  const h24 = to24h(hour, ampm)
  const ts = resolveInTimezone(now.getFullYear(), now.getMonth(), now.getDate(), h24, min, tz)
  if (ts < now.getTime()) return resolveInTimezone(now.getFullYear(), now.getMonth(), now.getDate() + 1, h24, min, tz)
  return ts
}

/**
 * Format a reset time string or ISO 8601 timestamp as relative time.
 * Handles both ISO 8601 ("2026-05-01T00:00:00Z") and CLI reset strings ("Resets5pm(Asia/Seoul)").
 */
export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "—"

  const parsed = parseResetString(isoString)
  if (parsed !== null) {
    return formatRelativeMs(parsed - Date.now())
  }

  const now = Date.now()
  const target = new Date(isoString).getTime()

  if (Number.isNaN(target)) return isoString

  return formatRelativeMs(target - now)
}

/**
 * Format a utilization number (0-100) as an integer percentage string.
 * Returns "—%" for null input.
 */
export function formatPercentage(utilization: number | null | undefined): string {
  if (utilization === null || utilization === undefined) return "—%"
  return `${Math.round(utilization)}%`
}

/**
 * Format credit usage as "$X.XX / $Y.YY".
 * All values are in cents (divide by 100 for dollars).
 * Returns "—" if any value is null.
 */
export function formatCost(
  usedCents: number | null | undefined,
  limitCents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (
    usedCents === null || usedCents === undefined ||
    limitCents === null || limitCents === undefined
  ) {
    return "—"
  }
  const symbol = currency === "USD" ? "$" : (currency ?? "$")
  const used = (usedCents / 100).toFixed(2)
  const limit = (limitCents / 100).toFixed(2)
  return `${symbol}${used} / ${symbol}${limit}`
}

/**
 * Build a progress bar string of the given width.
 * Returns { filled, empty } strings for separate coloring in the TUI.
 */
const BAR_WIDTH = 14
const FILLED_CHAR = "█"
const EMPTY_CHAR = "░"

export function formatBar(
  utilization: number | null | undefined,
  width: number = BAR_WIDTH,
): { filled: string; empty: string } {
  if (utilization === null || utilization === undefined) {
    return { filled: "", empty: EMPTY_CHAR.repeat(width) }
  }
  const clamped = Math.max(0, Math.min(100, utilization))
  const filledCount = Math.round((clamped / 100) * width)
  return {
    filled: FILLED_CHAR.repeat(filledCount),
    empty: EMPTY_CHAR.repeat(width - filledCount),
  }
}

/**
 * Map an OAuthUsageResponse field key to a short display label.
 */
export function windowLabel(key: string): string {
  const labels: Record<string, string> = {
    fiveHour: "Session",
    sevenDay: "Weekly",
    sevenDaySonnet: "Sonnet",
    sevenDayOpus: "Opus",
    sevenDayDesign: "Design",
    sevenDayRoutines: "Routines",
    sevenDayOAuthApps: "Apps",
  }
  return labels[key] ?? key
}
