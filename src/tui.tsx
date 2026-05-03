/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import type { TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui"
import type { UsageState, PluginOptions } from "./types"
import { createRefreshLoop } from "./fetcher"
import { formatRelativeTime, formatPercentage, formatBar, formatCost, windowLabel } from "./format"

const CLAUDE_ORANGE = "#E07A3A"

const WINDOW_KEYS = [
  "fiveHour",
  "sevenDay",
  "sevenDaySonnet",
  "sevenDayOpus",
  "sevenDayDesign",
  "sevenDayRoutines",
  "sevenDayOAuthApps",
] as const

type WindowKey = (typeof WINDOW_KEYS)[number]

const DEFAULT_REFRESH_INTERVAL_S = 60

const tui: TuiPlugin = async (api, rawOptions, _meta) => {
  const options = (rawOptions as PluginOptions | undefined) ?? {}
  const refreshIntervalMs = (options.refreshInterval ?? DEFAULT_REFRESH_INTERVAL_S) * 1000
  const displayMode = options.displayMode ?? "text"

  const [state, setState] = createSignal<UsageState>({
    status: "idle",
    data: null,
    profile: null,
    authMethod: "none",
    error: null,
  })
  const [open, setOpen] = createSignal(true)

  const EXPECTED_LOAD_S = 25
  const [countdown, setCountdown] = createSignal(EXPECTED_LOAD_S)
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const wrappedSetState = (s: UsageState) => {
    if (s.status === "loading" && !s.data) {
      setCountdown(EXPECTED_LOAD_S)
      if (!tickTimer) {
        tickTimer = setInterval(() => {
          setCountdown((prev) => Math.max(0, prev - 1))
        }, 1000)
      }
    } else if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
    setState(s)
  }

  const loop = createRefreshLoop(wrappedSetState, refreshIntervalMs)
  loop.start()

  api.lifecycle.onDispose(() => {
    loop.stop()
    if (tickTimer) clearInterval(tickTimer)
  })

  api.slots.register({
    order: 50,
    slots: {
      sidebar_content(ctx: TuiSlotContext, _props: unknown) {
        const t = ctx.theme.current
        const dim = options.dimColor ?? t.textMuted ?? "#546E7A"
        const fg = options.headerColor ?? t.text ?? "#EEFFFF"
        const valueFg = options.valueColor ?? "#82AAFF"

        const s = state()

        if (s.status === "not-configured") {
          const hint = process.env.CLAUDE_CODE_OAUTH_TOKEN
            ? "Token invalid or expired"
            : "Set CLAUDE_CODE_OAUTH_TOKEN or run 'claude login'"
          return (
            <box flexDirection="column">
              <box height={1}><text fg={CLAUDE_ORANGE}><b>{"Claude Usage"}</b></text></box>
              <box height={1}>
                <text fg={dim}>{hint}</text>
              </box>
            </box>
          ) as any
        }

        if (s.status === "error" && !s.data) {
          return (
            <box flexDirection="column">
              <box height={1}><text fg={CLAUDE_ORANGE}><b>{"Claude Usage"}</b></text></box>
              <box height={1}>
                <text fg={dim}>{"Failed to fetch usage"}</text>
              </box>
            </box>
          ) as any
        }

        if ((s.status === "idle" || s.status === "loading") && !s.data) {
          const remaining = countdown()
          const msg = remaining > 0 ? `Loading in ${remaining}s...` : "Loading shortly..."
          return (
            <box flexDirection="column">
              <box height={1}><text fg={CLAUDE_ORANGE}><b>{"Claude Usage"}</b></text></box>
              <box height={1}>
                <text fg={dim}>{msg}</text>
              </box>
            </box>
          ) as any
        }

        const data = s.data
        const profile = s.profile
        const isOpen = open()

        return (
          <box flexDirection="column">
            <box height={1} flexDirection="row" onMouseDown={() => setOpen(!open())}>
                <text fg={CLAUDE_ORANGE}>
                    <b>{isOpen ? "\u25BC" : "\u25B6"}{" Claude Usage"}</b>
                </text>
            </box>

            {isOpen ? (
              <box flexDirection="column">
                {profile?.email ? (
                  <box height={1}>
                    <text fg={dim}>{` ${profile.email}`}</text>
                  </box>
                ) : null}

                {profile?.email ? (
                  <box height={1}>
                    <text fg={dim}>{` via ${s.authMethod}`}</text>
                  </box>
                ) : null}

                {data ? (
                  <box flexDirection="column">
                    {WINDOW_KEYS.map((key) => {
                      const w = data[key as WindowKey]
                      if (!w) return null
                      const pct = w.utilization
                      const label = windowLabel(key)
                      const pctColor = pct === null ? valueFg
                        : pct >= 80 ? CLAUDE_ORANGE
                        : pct >= 51 ? "#F0A875"
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
        ) as any
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-claude-usage",
  tui,
}

export default plugin
