# opencode-usage Installation Guide

> This guide is designed for LLM agents to follow step-by-step. Each step includes expected outcomes for verification.

## What is opencode-usage?

An opencode TUI plugin that displays Claude account usage statistics in the sidebar. Shows session and weekly rate limits with reset countdowns.

## Prerequisites

- [opencode](https://opencode.ai) installed and working
- Plugin support (`@opencode-ai/plugin` >= 1.4.3)
- Claude CLI logged in (`claude auth login`) — or `CLAUDE_CODE_OAUTH_TOKEN` env var set

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
  "displayMode": "text"
}]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshInterval` | `number` | `60` | Seconds between data refreshes |
| `displayMode` | `string` | `"text"` | `"text"` shows percentage + reset time, `"bar"` shows progress bar + percentage + reset time |
| `headerColor` | `string` | theme text | Color of window labels (Session, Weekly, etc.) |
| `valueColor` | `string` | `#82AAFF` | Color of percentage values |
| `dimColor` | `string` | theme muted | Color of reset times and secondary text |

## Step 2: Restart opencode

The plugin loads at startup. Restart opencode to activate.

## Verification

After restart, the sidebar should show a "Claude Usage" section with usage rows:

**Text mode** (default):
```
▼ Claude Usage
 user@example.com
 via cli
 Session      31%  resets in 3h 16m
 Weekly       11%  resets in 4d 5h
```

**Bar mode** (`"displayMode": "bar"`):
```
▼ Claude Usage
 user@example.com
 via cli
 Session  █████░░░░░░░░░  31% (3h 16m)
 Weekly   ██░░░░░░░░░░░░  11% (4d 5h)
```

If no auth method is available, you will see:

```
Claude Usage
Set CLAUDE_CODE_OAUTH_TOKEN or run 'claude login'
```

During initial load (first time only, ~20 seconds for CLI probe):

```
Claude Usage
Loading in 20s...
```

## Auth Methods

The plugin tries multiple authentication methods in order:

| Priority | Method | Platforms | Setup |
|----------|--------|-----------|-------|
| 1 | `CLAUDE_CODE_OAUTH_TOKEN` env var | All | Run `claude setup-token`, set env var |
| 2 | `~/.claude/.credentials.json` | All | Automatic if Claude CLI stores credentials here |
| 3 | OpenCode `auth.json` + token refresh | All | Automatic if logged in via opencode |
| 4 | macOS Keychain | macOS | Automatic after `claude auth login` |
| 5 | Claude CLI PTY probe | macOS, Linux | Automatic, requires Python3 |
| 6 | Browser cookies (Chrome/Firefox) | macOS, Linux | Log into claude.ai in your browser |

**Windows users**: Methods 1-3 work. Set `CLAUDE_CODE_OAUTH_TOKEN` for the most reliable experience.

## Troubleshooting

- **Plugin not showing**: Verify `tui.json` exists at `~/.config/opencode/tui.json` and contains the plugin entry. Restart opencode after editing.
- **"Set CLAUDE_CODE_OAUTH_TOKEN or run 'claude login'" message**: No auth method succeeded. Run `claude auth login` or set the env var.
- **Shows 0% usage**: The CLI probe may not have parsed the output correctly. Wait for a refresh cycle (60s).
- **Data not updating**: Default refresh is 60 seconds. Wait or lower `refreshInterval` in options.
- **Slow initial load (~20s)**: First load uses CLI PTY probe which takes time. Subsequent launches use cached data for instant display.
- **"Loading shortly..."**: The countdown reached zero but the probe is still running. It will appear when ready.

## Uninstall

1. Remove `["opencode-usage", { "enabled": true }]` from `~/.config/opencode/tui.json` plugin array
2. Restart opencode
3. Optionally delete cache: `rm -rf ~/.cache/opencode-usage/`
