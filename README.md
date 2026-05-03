# opencode-claude-usage

An [opencode](https://opencode.ai) TUI sidebar plugin that displays your Claude account usage. Shows session and weekly rate limits with reset countdowns.

**Text mode** (default):
```
▼ Claude Usage
 juneyoung.kang@wantedlab.com
 via cli
 Session      31%  resets in 3h 16m
 Weekly       11%  resets in 4d 5h
```

**Bar mode** (`"displayMode": "bar"`):
```
▼ Claude Usage
 juneyoung.kang@wantedlab.com
 via cli
 Session  █████░░░░░░░░░  31% (3h 16m)
 Weekly   ██░░░░░░░░░░░░  11% (4d 5h)
```

## Install

Paste this into your LLM agent (Claude Code, opencode, Cursor, etc.):

```
Install and configure opencode-claude-usage by following the instructions here:
https://raw.githubusercontent.com/stevejkang/opencode-claude-usage/refs/heads/main/docs/installation.md
```

### Setup

One config file. Restart. Done.

**`~/.config/opencode/tui.json`**

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-claude-usage", { "enabled": true }]]
}
```

opencode resolves the npm package on startup automatically.

### Options

```json
{
  "plugin": [["opencode-claude-usage", {
    "enabled": true,
    "refreshInterval": 60,
    "displayMode": "text",
    "headerColor": "#E07A3A",
    "valueColor": "#82AAFF",
    "dimColor": "#546E7A"
  }]]
}
```

| Option | Default | Description |
|---|---|---|
| `refreshInterval` | `60` | Seconds between data refreshes |
| `displayMode` | `"text"` | `"text"` shows percentage + reset time, `"bar"` shows progress bar + percentage + reset time |
| `headerColor` | theme text | Color of window labels (Session, Weekly, etc.) |
| `valueColor` | `#82AAFF` | Color of percentage values |
| `dimColor` | theme muted | Color of reset times and secondary text |

## How It Works

Uses a 6-step fallback chain to fetch Claude usage data:

```
1. CLAUDE_CODE_OAUTH_TOKEN env var        → OAuth API (all OS)
2. ~/.claude/.credentials.json            → OAuth API (all OS)
3. OpenCode auth.json + token refresh     → OAuth API (all OS)
4. macOS Keychain                         → OAuth API (macOS)
5. Claude CLI PTY probe (/usage command)  → parse TUI output (macOS/Linux)
6. Browser cookies (Chrome/Firefox)       → claude.ai Web API (macOS/Linux)
```

Results are cached to disk (`~/.cache/opencode-claude-usage/last.json`) for instant startup. Background refresh keeps data current.

### Cross-Platform Support

| Platform | OAuth (steps 1-3) | CLI Probe (step 5) | Cookies (step 6) |
|----------|-------------------|---------------------|-------------------|
| **macOS** | ✅ | ✅ (Python3 required) | ✅ Chrome + Firefox |
| **Linux** | ✅ | ✅ (Python3 required) | ✅ Chrome + Firefox |
| **Windows** | ✅ | ❌ | ❌ |

Windows users: set `CLAUDE_CODE_OAUTH_TOKEN` env var (run `claude setup-token` to generate).

## Features

|   | What | Why it matters |
|:---:|---|---|
| ⏱ | **Auto-refresh** | Configurable interval, default 60 seconds |
| 🛡 | **6-step fallback** | Tries multiple auth methods, always finds a way |
| 💾 | **Disk cache** | Instant startup, no waiting on second launch |
| 🎨 | **Color grading** | White → light orange → orange as usage increases |
| ⏳ | **Loading countdown** | Shows estimated time remaining during initial load |
| 🔄 | **Token refresh** | Automatically refreshes expired tokens via OpenCode auth |

## Requirements

- [opencode](https://opencode.ai) with plugin support (`@opencode-ai/plugin` >= 1.4.3)
- One of: Claude CLI login, `CLAUDE_CODE_OAUTH_TOKEN` env var, or browser session on claude.ai

## Manual Install

Skip npm. Copy the source files directly:

```bash
mkdir -p ~/.config/opencode/plugins/opencode-claude-usage
cp src/tui.tsx src/types.ts src/format.ts src/keychain.ts \
   src/oauth-client.ts src/cookie-reader.ts src/cli-probe.ts src/fetcher.ts \
   ~/.config/opencode/plugins/opencode-claude-usage/
```

Register the local path:

```json
{
  "plugin": [["./plugins/opencode-claude-usage/tui.tsx", { "enabled": true }]]
}
```

## Development

```bash
git clone https://github.com/stevejkang/opencode-claude-usage.git
cd opencode-claude-usage
npm install
```

Run tests:

```bash
npm test
```

Edit, restart opencode, see changes live.

## License

MIT
