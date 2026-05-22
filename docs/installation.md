# opencode-usage Installation Guide

> This guide is designed for LLM agents to follow step-by-step. Each step includes expected outcomes for verification.

## What is opencode-usage?

An opencode TUI plugin that displays **Claude** and **Codex (ChatGPT)** account usage statistics in the sidebar. Each provider gets its own collapsible section, showing session and weekly rate limits with reset countdowns.

## Prerequisites

- [opencode](https://opencode.ai) installed and working
- Plugin support (`@opencode-ai/plugin` >= 1.4.3)
- At least one of the following auth sources (both are optional — each provider is shown independently):
  - **Claude**: Claude CLI logged in (`claude auth login`) or `CLAUDE_CODE_OAUTH_TOKEN` env var
  - **Codex**: Codex CLI logged in (`codex login`) or `CODEX_OAUTH_ACCESS_TOKEN` + `CODEX_ACCOUNT_ID` env vars

## Step 1: Configure the TUI plugin

Edit `~/.config/opencode/tui.json`. Create the file if it doesn't exist.

Add `["opencode-usage", { "enabled": true }]` to the `plugin` array:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["opencode-usage", { "enabled": true }]
  ]
}
```

**If the file already exists with other plugins**, append to the existing array. Do not replace existing entries:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["existing-plugin", { "enabled": true }],
    ["opencode-usage", { "enabled": true }]
  ]
}
```

### Options

All options are optional. Defaults shown:

```json
["opencode-usage", {
  "enabled": true,
  "refreshInterval": 60,
  "displayMode": "text",
  "showClaude": true,
  "showCodex": true,
  "codexHeaderColor": "#10A37F"
}]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshInterval` | `number` | `60` | Seconds between data refreshes (applies to both providers) |
| `displayMode` | `string` | `"text"` | `"text"` shows percentage + reset time, `"bar"` shows progress bar + percentage + reset time |
| `headerColor` | `string` | theme text | Color of window labels (Session, Weekly, etc.) |
| `valueColor` | `string` | `#82AAFF` | Color of percentage values |
| `dimColor` | `string` | theme muted | Color of reset times and secondary text |
| `showClaude` | `boolean` | `true` | Show the Claude section. Set to `false` to hide and stop polling. |
| `showCodex` | `boolean` | `true` | Show the Codex section. Set to `false` to hide and stop polling. |
| `codexHeaderColor` | `string` | `"#10A37F"` | Color of the Codex header and high-usage percentage |

## Step 2: Restart opencode

The plugin loads at startup. Restart opencode to activate.

## Verification

After restart, the sidebar should show both **Claude Usage** and **Codex Usage** sections with usage rows.

**Text mode** (default):
```
▼ Claude Usage
 user@example.com
 via cli
 Session      31%  resets in 3h 16m
 Weekly       11%  resets in 4d 5h
▼ Codex Usage
 user@example.com
 via oauth-codex-cli
 Session       1%  resets in 4h 51m
 Weekly       23%  resets in 5d 12h
```

**Bar mode** (`"displayMode": "bar"`):
```
▼ Claude Usage
 user@example.com
 via cli
 Session  █████░░░░░░░░░  31% (3h 16m)
 Weekly   ██░░░░░░░░░░░░  11% (4d 5h)
▼ Codex Usage
 user@example.com
 via oauth-codex-cli
 Session  ░░░░░░░░░░░░░░   1% (4h 51m)
 Weekly   ███░░░░░░░░░░░  23% (5d 12h)
```

Click `▼` / `▶` on either header to collapse that section independently.

If a provider has no auth method available, you will see:

```
Claude Usage
Set CLAUDE_CODE_OAUTH_TOKEN or run 'claude login'

Codex Usage
Run 'codex login' or set CODEX_OAUTH_ACCESS_TOKEN
```

The other section continues to work — failure of one provider does not affect the other.

During initial load (first time only, ~20 seconds for Claude CLI probe path; Codex is typically sub-second):

```
Claude Usage
Loading in 20s...
```

## Auth Methods

### Claude

The plugin tries Claude auth methods in this order:

| Priority | Method | Platforms | Setup |
|----------|--------|-----------|-------|
| 1 | `CLAUDE_CODE_OAUTH_TOKEN` env var | All | Run `claude setup-token`, set env var |
| 2 | `~/.claude/.credentials.json` | All | Automatic if Claude CLI stores credentials here |
| 3 | OpenCode `auth.json` + token refresh | All | Automatic if logged in via opencode |
| 4 | macOS Keychain | macOS | Automatic after `claude auth login` |
| 5 | Claude CLI PTY probe | macOS, Linux | Automatic, requires Python3 |
| 6 | Browser cookies (Chrome/Firefox) | macOS, Linux | Log into claude.ai in your browser |

**Windows users**: Methods 1-3 work. Set `CLAUDE_CODE_OAUTH_TOKEN` for the most reliable experience.

### Codex

The plugin tries Codex auth methods in this order:

| Priority | Method | Platforms | Setup |
|----------|--------|-----------|-------|
| 1 | `CODEX_OAUTH_ACCESS_TOKEN` + `CODEX_ACCOUNT_ID` env vars | All | Export both env vars (useful for CI/headless) |
| 2 | `~/.codex/auth.json` (Codex CLI native) | All | Automatic after `codex login` |
| 3 | OpenCode `auth.json` (`openai` provider key) | All | Automatic if logged in via opencode's OpenAI provider |

Expired access tokens are refreshed automatically via `https://auth.openai.com/oauth/token` for both file-based methods. The HTTP API used is `GET https://chatgpt.com/backend-api/wham/usage` with `Authorization: Bearer <access_token>` and `ChatGPT-Account-Id: <account_id>`.

## Troubleshooting

- **Plugin not showing**: Verify `tui.json` exists at `~/.config/opencode/tui.json` and contains the plugin entry. Restart opencode after editing.
- **"Set CLAUDE_CODE_OAUTH_TOKEN or run 'claude login'" message**: No Claude auth method succeeded. Run `claude auth login` or set the env var. The Codex section is unaffected.
- **"Run 'codex login' or set CODEX_OAUTH_ACCESS_TOKEN" message**: No Codex auth method succeeded. Run `codex login` to create `~/.codex/auth.json`. The Claude section is unaffected.
- **Shows 0% usage** (Claude only): The CLI probe may not have parsed the output correctly. Wait for a refresh cycle (60s).
- **Data not updating**: Default refresh is 60 seconds. Wait or lower `refreshInterval` in options.
- **Slow initial load (~20s)** (Claude only): First load may use the Claude CLI PTY probe which takes time. Subsequent launches use cached data for instant display.
- **"Loading shortly..."**: The countdown reached zero but the fetch is still running. It will appear when ready.
- **Codex shows "Token invalid or expired"**: Run `codex login` again. The `id_token` JWT in `~/.codex/auth.json` may have expired; the plugin will use the `refresh_token` automatically if present.

## Uninstall

1. Remove `["opencode-usage", { "enabled": true }]` from `~/.config/opencode/tui.json` plugin array
2. Restart opencode
3. Optionally delete cache: `rm -rf ~/.cache/opencode-usage/`
