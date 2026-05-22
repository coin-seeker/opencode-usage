/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import type { TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui"
import type { UsageState, CodexState, PluginOptions } from "./types"
import { createRefreshLoop } from "./fetcher"
import { createCodexRefreshLoop } from "./codex-fetcher"
import { formatRelativeTime, formatPercentage, formatBar, formatCost, windowLabel } from "./format"

const CLAUDE_ORANGE = "#E07A3A"
const CLAUDE_AMBER = "#F0A875"
const CODEX_GREEN = "#10A37F"
const CODEX_AMBER = "#5FC2A8"

const CLAUDE_WINDOW_KEYS = [
  "fiveHour",
  "sevenDay",
  "sevenDaySonnet",
  "sevenDayOpus",
  "sevenDayDesign",
  "sevenDayRoutines",
  "sevenDayOAuthApps",
] as const

const CODEX_WINDOW_KEYS = ["primaryWindow", "secondaryWindow"] as const

type ClaudeWindowKey = (typeof CLAUDE_WINDOW_KEYS)[number]
type CodexWindowKey = (typeof CODEX_WINDOW_KEYS)[number]

const DEFAULT_REFRESH_INTERVAL_S = 60
const EXPECTED_LOAD_S = 25

const tui: TuiPlugin = async (api, rawOptions, _meta) => {
  const options = (rawOptions as PluginOptions | undefined) ?? {}
  const refreshIntervalMs = (options.refreshInterval ?? DEFAULT_REFRESH_INTERVAL_S) * 1000
  const displayMode = options.displayMode ?? "text"
  const showClaude = options.showClaude !== false
  const showCodex = options.showCodex !== false
  const codexHeaderColor = options.codexHeaderColor ?? CODEX_GREEN

  const [claudeState, setClaudeState] = createSignal<UsageState>({
    status: "idle",
    data: null,
    profile: null,
    authMethod: "none",
    error: null,
  })
  const [claudeOpen, setClaudeOpen] = createSignal(true)
  const [claudeCountdown, setClaudeCountdown] = createSignal(EXPECTED_LOAD_S)
  let claudeTickTimer: ReturnType<typeof setInterval> | null = null
  let claudeCountdownStart = Date.now()

  const [codexState, setCodexState] = createSignal<CodexState>({
    status: "idle",
    data: null,
    profile: null,
    authMethod: "none",
    error: null,
  })
  const [codexOpen, setCodexOpen] = createSignal(true)
  const [codexCountdown, setCodexCountdown] = createSignal(EXPECTED_LOAD_S)
  let codexTickTimer: ReturnType<typeof setInterval> | null = null
  let codexCountdownStart = Date.now()

  const wrappedSetClaudeState = (s: UsageState) => {
    if (s.status === "loading" && !s.data) {
      claudeCountdownStart = Date.now()
      setClaudeCountdown(EXPECTED_LOAD_S)
      if (!claudeTickTimer) {
        claudeTickTimer = setInterval(() => {
          const elapsed = Math.floor((Date.now() - claudeCountdownStart) / 1000)
          setClaudeCountdown(Math.max(0, EXPECTED_LOAD_S - elapsed))
        }, 1000)
      }
    } else if (claudeTickTimer) {
      clearInterval(claudeTickTimer)
      claudeTickTimer = null
    }
    setClaudeState(s)
  }

  const wrappedSetCodexState = (s: CodexState) => {
    if (s.status === "loading" && !s.data) {
      codexCountdownStart = Date.now()
      setCodexCountdown(EXPECTED_LOAD_S)
      if (!codexTickTimer) {
        codexTickTimer = setInterval(() => {
          const elapsed = Math.floor((Date.now() - codexCountdownStart) / 1000)
          setCodexCountdown(Math.max(0, EXPECTED_LOAD_S - elapsed))
        }, 1000)
      }
    } else if (codexTickTimer) {
      clearInterval(codexTickTimer)
      codexTickTimer = null
    }
    setCodexState(s)
  }

  const claudeLoop = createRefreshLoop(wrappedSetClaudeState, refreshIntervalMs)
  const codexLoop = createCodexRefreshLoop(wrappedSetCodexState, refreshIntervalMs)

  if (showClaude) claudeLoop.start()
  if (showCodex) codexLoop.start()

  api.lifecycle.onDispose(() => {
    claudeLoop.stop()
    codexLoop.stop()
    if (claudeTickTimer) clearInterval(claudeTickTimer)
    if (codexTickTimer) clearInterval(codexTickTimer)
  })

  api.slots.register({
    order: 50,
    slots: {
      sidebar_content(ctx: TuiSlotContext, _props: unknown) {
        const t = ctx.theme.current
        const dim = options.dimColor ?? t.textMuted ?? "#546E7A"
        const fg = options.headerColor ?? t.text ?? "#EEFFFF"
        const valueFg = options.valueColor ?? "#82AAFF"

        const renderClaude = () => {
          const s = claudeState()

          if (s.status === "not-configured") {
            const hint = process.env.CLAUDE_CODE_OAUTH_TOKEN
              ? "Token invalid or expired"
              : "Set CLAUDE_CODE_OAUTH_TOKEN or run 'claude login'"
            return (
              <box flexDirection="column">
                <box height={1}><text fg={CLAUDE_ORANGE}><b>{"Claude Usage"}</b></text></box>
                <box height={1}><text fg={dim}>{hint}</text></box>
              </box>
            )
          }

          if (s.status === "error" && !s.data) {
            return (
              <box flexDirection="column">
                <box height={1}><text fg={CLAUDE_ORANGE}><b>{"Claude Usage"}</b></text></box>
                <box height={1}><text fg={dim}>{"Failed to fetch usage"}</text></box>
              </box>
            )
          }

          if ((s.status === "idle" || s.status === "loading") && !s.data) {
            const remaining = claudeCountdown()
            const msg = remaining > 0 ? `Loading in ${remaining}s...` : "Loading shortly..."
            return (
              <box flexDirection="column">
                <box height={1}><text fg={CLAUDE_ORANGE}><b>{"Claude Usage"}</b></text></box>
                <box height={1}><text fg={dim}>{msg}</text></box>
              </box>
            )
          }

          const data = s.data
          const isOpen = claudeOpen()

          return (
            <box flexDirection="column">
              <box height={1} flexDirection="row" onMouseDown={() => setClaudeOpen(!claudeOpen())}>
                <text fg={CLAUDE_ORANGE}>
                  <b>{isOpen ? "\u25BC" : "\u25B6"}{" Claude Usage"}</b>
                </text>
              </box>

              {isOpen ? (
                <box flexDirection="column">
                  {data ? (
                    <box flexDirection="column">
                      {CLAUDE_WINDOW_KEYS.map((key) => {
                        const w = data[key as ClaudeWindowKey]
                        if (!w) return null
                        const pct = w.utilization
                        const label = windowLabel(key)
                        const pctColor = pct === null ? valueFg
                          : pct >= 80 ? CLAUDE_ORANGE
                          : pct >= 51 ? CLAUDE_AMBER
                          : valueFg

                        if (displayMode === "bar") {
                          const bar = formatBar(pct)
                          const resetStr = formatRelativeTime(w.resetsAt)
                          const resetSuffix = resetStr && resetStr !== "—" ? ` (${resetStr})` : ""
                          return (
                            <box height={1} flexDirection="row">
                              <text fg={fg}>{` ${label.padEnd(8)}`}</text>
                              <text fg={pctColor}>{bar.filled + bar.empty + formatPercentage(pct).padStart(4)}</text>
                              <text fg={dim}>{resetSuffix}</text>
                            </box>
                          )
                        }

                        const resetStr = formatRelativeTime(w.resetsAt)
                        return (
                          <box height={1} flexDirection="row">
                            <text fg={fg}>{` ${label.padEnd(9)}`}</text>
                            <text fg={pctColor}>{formatPercentage(pct).padStart(5)}</text>
                            <text fg={dim}>{`  resets in ${resetStr}`}</text>
                          </box>
                        )
                      })}

                      {data.extraUsage?.isEnabled ? (
                        <box height={1} flexDirection="row">
                          <text fg={fg}>{"Credit  "}</text>
                          <text fg={valueFg}>
                            {formatCost(data.extraUsage.usedCredits, data.extraUsage.monthlyLimit, data.extraUsage.currency)}
                          </text>
                        </box>
                      ) : null}
                    </box>
                  ) : null}
                </box>
              ) : null}
            </box>
          )
        }

        const renderCodex = () => {
          const s = codexState()

          if (s.status === "not-configured") {
            const hint = process.env.CODEX_OAUTH_ACCESS_TOKEN
              ? "Token invalid or expired"
              : "Run 'codex login' or set CODEX_OAUTH_ACCESS_TOKEN"
            return (
              <box flexDirection="column">
                <box height={1}><text fg={codexHeaderColor}><b>{"Codex Usage"}</b></text></box>
                <box height={1}><text fg={dim}>{hint}</text></box>
              </box>
            )
          }

          if (s.status === "error" && !s.data) {
            return (
              <box flexDirection="column">
                <box height={1}><text fg={codexHeaderColor}><b>{"Codex Usage"}</b></text></box>
                <box height={1}><text fg={dim}>{"Failed to fetch usage"}</text></box>
              </box>
            )
          }

          if ((s.status === "idle" || s.status === "loading") && !s.data) {
            const remaining = codexCountdown()
            const msg = remaining > 0 ? `Loading in ${remaining}s...` : "Loading shortly..."
            return (
              <box flexDirection="column">
                <box height={1}><text fg={codexHeaderColor}><b>{"Codex Usage"}</b></text></box>
                <box height={1}><text fg={dim}>{msg}</text></box>
              </box>
            )
          }

          const data = s.data
          const isOpen = codexOpen()
          const rateLimit = data?.rateLimit

          return (
            <box flexDirection="column">
              <box height={1} flexDirection="row" onMouseDown={() => setCodexOpen(!codexOpen())}>
                <text fg={codexHeaderColor}>
                  <b>{isOpen ? "\u25BC" : "\u25B6"}{" Codex Usage"}</b>
                </text>
              </box>

              {isOpen ? (
                <box flexDirection="column">
                  {rateLimit ? (
                    <box flexDirection="column">
                      {CODEX_WINDOW_KEYS.map((key) => {
                        const w = rateLimit[key as CodexWindowKey]
                        if (!w) return null
                        const pct = w.usedPercent
                        const label = windowLabel(key)
                        const pctColor = pct === null ? valueFg
                          : pct >= 80 ? codexHeaderColor
                          : pct >= 51 ? CODEX_AMBER
                          : valueFg

                        if (displayMode === "bar") {
                          const bar = formatBar(pct)
                          const resetStr = formatRelativeTime(w.resetAt)
                          const resetSuffix = resetStr && resetStr !== "—" ? ` (${resetStr})` : ""
                          return (
                            <box height={1} flexDirection="row">
                              <text fg={fg}>{` ${label.padEnd(8)}`}</text>
                              <text fg={pctColor}>{bar.filled + bar.empty + formatPercentage(pct).padStart(4)}</text>
                              <text fg={dim}>{resetSuffix}</text>
                            </box>
                          )
                        }

                        const resetStr = formatRelativeTime(w.resetAt)
                        return (
                          <box height={1} flexDirection="row">
                            <text fg={fg}>{` ${label.padEnd(9)}`}</text>
                            <text fg={pctColor}>{formatPercentage(pct).padStart(5)}</text>
                            <text fg={dim}>{`  resets in ${resetStr}`}</text>
                          </box>
                        )
                      })}

                      {data?.credits?.hasCredits ? (
                        <box height={1} flexDirection="row">
                          <text fg={fg}>{"Credit  "}</text>
                          <text fg={valueFg}>{data.credits.balance ?? "0"}</text>
                        </box>
                      ) : null}
                    </box>
                  ) : null}
                </box>
              ) : null}
            </box>
          )
        }

        return (
          <box flexDirection="column" gap={1}>
            {showClaude ? renderClaude() : null}
            {showCodex ? renderCodex() : null}
          </box>
        ) as unknown as ReturnType<typeof renderClaude>
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-usage-sidebar",
  tui,
}

export default plugin
