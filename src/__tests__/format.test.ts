import { describe, it, expect } from "vitest"
import { formatRelativeTime, formatPercentage, formatCost, windowLabel } from "../format.js"

describe("formatRelativeTime", () => {
  it("returns — for null input", () => {
    expect(formatRelativeTime(null)).toBe("—")
  })

  it("returns now for past timestamps", () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(formatRelativeTime(past)).toBe("now")
  })

  it("formats minutes only when < 1 hour", () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(future)).toBe("5m")
  })

  it("formats hours and minutes when < 1 day", () => {
    const future = new Date(Date.now() + (1 * 60 + 19) * 60 * 1000).toISOString()
    expect(formatRelativeTime(future)).toBe("1h 19m")
  })

  it("formats days and hours when >= 1 day", () => {
    const future = new Date(Date.now() + (4 * 24 + 20) * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(future)).toBe("4d 20h")
  })

  it("accepts unix seconds (Codex resetAt) and formats relative", () => {
    const futureSeconds = Math.floor(Date.now() / 1000) + 2 * 60 * 60 + 30 * 60
    expect(formatRelativeTime(futureSeconds)).toMatch(/^2h (29|30)m$/)
  })

  it("accepts unix milliseconds when value >= 1e12", () => {
    const futureMs = Date.now() + (2 * 60 * 60 + 30 * 60) * 1000
    expect(formatRelativeTime(futureMs)).toMatch(/^2h (29|30)m$/)
  })

  it("treats past unix seconds as now", () => {
    const pastSeconds = Math.floor(Date.now() / 1000) - 60
    expect(formatRelativeTime(pastSeconds)).toBe("now")
  })

  it("returns — for non-finite number", () => {
    expect(formatRelativeTime(Number.NaN)).toBe("—")
    expect(formatRelativeTime(Number.POSITIVE_INFINITY)).toBe("—")
  })
})

describe("formatPercentage", () => {
  it("returns —% for null", () => {
    expect(formatPercentage(null)).toBe("—%")
  })

  it("rounds decimal to integer", () => {
    expect(formatPercentage(45.7)).toBe("46%")
  })

  it("handles 0", () => {
    expect(formatPercentage(0)).toBe("0%")
  })

  it("handles 100", () => {
    expect(formatPercentage(100)).toBe("100%")
  })
})

describe("formatCost", () => {
  it("returns — for null inputs", () => {
    expect(formatCost(null, null, null)).toBe("—")
  })

  it("converts cents to dollars with 2 decimals", () => {
    expect(formatCost(12345, 50000, "USD")).toBe("$123.45 / $500.00")
  })

  it("handles zero cost", () => {
    expect(formatCost(0, 10000, "USD")).toBe("$0.00 / $100.00")
  })
})

describe("windowLabel", () => {
  it("maps fiveHour → Session", () => {
    expect(windowLabel("fiveHour")).toBe("Session")
  })

  it("maps sevenDay → Weekly", () => {
    expect(windowLabel("sevenDay")).toBe("Weekly")
  })

  it("maps sevenDaySonnet → Sonnet", () => {
    expect(windowLabel("sevenDaySonnet")).toBe("Sonnet")
  })

  it("maps sevenDayOpus → Opus", () => {
    expect(windowLabel("sevenDayOpus")).toBe("Opus")
  })

  it("maps primaryWindow → Session for Codex", () => {
    expect(windowLabel("primaryWindow")).toBe("Session")
  })

  it("maps secondaryWindow → Weekly for Codex", () => {
    expect(windowLabel("secondaryWindow")).toBe("Weekly")
  })

  it("returns the key unchanged when unknown", () => {
    expect(windowLabel("unknown_key")).toBe("unknown_key")
  })
})
