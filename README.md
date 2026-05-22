# opencode-usage

An [opencode](https://opencode.ai) TUI sidebar plugin that displays your **Claude** and **Codex (ChatGPT)** account usage side by side. Shows session and weekly rate limits with reset countdowns for both providers.

**Text mode** (default):
```
▼ Claude Usage
 Session      31%  resets in 3h 16m
 Weekly       11%  resets in 4d 5h
 Sonnet        2%  resets in 6d 21h

▼ Codex Usage
 Session       1%  resets in 4h 51m
 Weekly       23%  resets in 5d 12h
```

**Bar mode** (`"displayMode": "bar"`):
```
▼ Claude Usage
 Session  █████░░░░░░░░░  31% (3h 16m)
 Weekly   ██░░░░░░░░░░░░  11% (4d 5h)

▼ Codex Usage
 Session  ░░░░░░░░░░░░░░   1% (4h 51m)
 Weekly   ███░░░░░░░░░░░  23% (5d 12h)
```

Click either header (`▼`/`▶`) to collapse that section independently.

## Install

Paste below into your OpenCode.

```
Install and configure opencode-usage-sidebar by following the instructions here:
https://raw.githubusercontent.com/coin-seeker/opencode-usage/refs/heads/main/docs/installation.md
```

### Setup

One config file. Restart. Done.

**`~/.config/opencode/tui.json`**

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-usage-sidebar", { "enabled": true }]]
}
```

opencode resolves the npm package on startup automatically.

### Options

```json
{
  "plugin": [["opencode-usage-sidebar", {
    "enabled": true,
    "refreshInterval": 60,
    "displayMode": "text",
    "headerColor": "#E07A3A",
    "valueColor": "#82AAFF",
    "dimColor": "#546E7A",
    "showClaude": true,
    "showCodex": true,
    "codexHeaderColor": "#10A37F"
  }]]
}
```

| Option | Default | Description |
|---|---|---|
| `refreshInterval` | `60` | Seconds between data refreshes (applies to both providers) |
| `displayMode` | `"text"` | `"text"` shows percentage + reset time, `"bar"` shows progress bar + percentage + reset time |
| `headerColor` | theme text | Color of window labels (Session, Weekly, etc.) |
| `valueColor` | `#82AAFF` | Color of percentage values |
| `dimColor` | theme muted | Color of reset times and secondary text |
| `showClaude` | `true` | Show the Claude section. Set to `false` to hide and stop polling. |
| `showCodex` | `true` | Show the Codex section. Set to `false` to hide and stop polling. |
| `codexHeaderColor` | `#10A37F` | Color of the Codex header label and high-usage percentage |

## How It Works

### Claude

Uses a 6-step fallback chain to fetch Claude usage data:

```
1. CLAUDE_CODE_OAUTH_TOKEN env var        → OAuth API (all OS)
2. ~/.claude/.credentials.json            → OAuth API (all OS)
3. OpenCode auth.json + token refresh     → OAuth API (all OS)
4. macOS Keychain                         → OAuth API (macOS)
5. Claude CLI PTY probe (/usage command)  → parse TUI output (macOS/Linux)
6. Browser cookies (Chrome/Firefox)       → claude.ai Web API (macOS/Linux)
```

### Codex

Uses a 3-step fallback chain to fetch Codex (ChatGPT) usage data:

```
1. CODEX_OAUTH_ACCESS_TOKEN + CODEX_ACCOUNT_ID env vars → /wham/usage (all OS)
2. ~/.codex/auth.json (Codex CLI native)               → /wham/usage (all OS)
3. OpenCode auth.json (openai key)                     → /wham/usage (all OS)
```

The plugin calls `GET https://chatgpt.com/backend-api/wham/usage` with `Authorization: Bearer <access_token>` and `ChatGPT-Account-Id: <account_id>`. Expired access tokens are automatically refreshed via `https://auth.openai.com/oauth/token`.

Results for both providers are cached to disk (`~/.cache/opencode-usage/last.json`, namespaced) for instant startup. Background refresh keeps data current at the same `refreshInterval`.

### Cross-Platform Support

| Platform | Claude OAuth | Claude CLI Probe | Claude Cookies | Codex (all 3 steps) |
|----------|--------------|------------------|----------------|---------------------|
| **macOS** | ✅ | ✅ (Python3 required) | ✅ Chrome + Firefox | ✅ |
| **Linux** | ✅ | ✅ (Python3 required) | ✅ Chrome + Firefox | ✅ |
| **Windows** | ✅ | ❌ | ❌ | ✅ |

Windows users: set `CLAUDE_CODE_OAUTH_TOKEN` for Claude (run `claude setup-token` to generate). Codex works out of the box if `~/.codex/auth.json` exists from `codex login`.

## Features

|   | What | Why it matters |
|:---:|---|---|
| ⏱ | **Auto-refresh** | Configurable interval, default 60 seconds, applied to both providers |
| 🛡 | **Robust fallback** | 6-step chain for Claude, 3-step chain for Codex — always finds a way |
| 💾 | **Disk cache** | Instant startup, no waiting on second launch |
| 🎨 | **Color grading** | Per-provider color gradients (Claude orange / Codex green) as usage rises |
| ⏳ | **Loading countdown** | Shows estimated time remaining during initial load |
| 🔄 | **Token refresh** | Automatically refreshes expired tokens for both Anthropic and OpenAI OAuth |
| 🔀 | **Independent sections** | Click either `▼`/`▶` header to collapse Claude or Codex independently |
| 🎚 | **Per-provider toggle** | `showClaude: false` or `showCodex: false` to disable a section entirely |

## Requirements

- [opencode](https://opencode.ai) with plugin support (`@opencode-ai/plugin` >= 1.4.3)
- For **Claude**: Claude CLI login, `CLAUDE_CODE_OAUTH_TOKEN` env var, or browser session on claude.ai
- For **Codex**: Codex CLI login (`codex login`), `CODEX_OAUTH_ACCESS_TOKEN` + `CODEX_ACCOUNT_ID` env vars, or OpenCode `openai` provider auth

Either provider can be missing — the section will simply show "Token invalid or expired" or similar hint, and the other section continues to work.

## Manual Install

Skip npm. Copy the source files directly:

```bash
mkdir -p ~/.config/opencode/plugins/opencode-usage-sidebar
cp src/tui.tsx src/types.ts src/format.ts src/cache.ts \
   src/keychain.ts src/oauth-client.ts src/cookie-reader.ts src/cli-probe.ts src/fetcher.ts \
   src/codex-auth.ts src/codex-oauth-client.ts src/codex-fetcher.ts \
   ~/.config/opencode/plugins/opencode-usage-sidebar/
```

Register the local path:

```json
{
  "plugin": [["./plugins/opencode-usage-sidebar/tui.tsx", { "enabled": true }]]
}
```

## Development

```bash
git clone https://github.com/coin-seeker/opencode-usage.git
cd opencode-usage
npm install
```

Run tests:

```bash
npm test
```

Edit, restart opencode, see changes live.

## License

MIT — see [LICENSE](LICENSE).

This project is a fork of [stevejkang/opencode-claude-usage](https://github.com/stevejkang/opencode-claude-usage) (MIT). The original copyright is preserved alongside this fork's modifications (Codex support, refactor).
