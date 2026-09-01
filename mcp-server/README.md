# Nourish MCP Server

Gives an agent (Claude Code, Claude Desktop, or any MCP client) the same read/write
access to a Nourish plan that the app's UI has — nutrient fetch, full plan data,
computed stats, and every plan/recipe/targets mutation — without needing the browser.

Design and rationale: `../../knowledge/mcp-server/`.

## Setup

```bash
cd mcp-server
npm install
```

No required configuration — it works with defaults out of the box.

## Running standalone

```bash
npm start
```

Talks MCP over stdio. Data persists to `~/.nourish/data.json` by default.

## Configuration (all optional, via environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `NOURISH_DATA_FILE` | `~/.nourish/data.json` | Where the plan is read from / saved to |
| `USDA_API_KEY` | `DEMO_KEY` | USDA FoodData Central key — the server's own, independent of the browser's Config-page key |
| `NOURISH_BRIDGE_ENABLED` | `1` (on) | Set to `0` to disable the live WebSocket sync with an open browser tab |
| `NOURISH_BRIDGE_PORT` | `8137` | Port the sync bridge listens on |

## Registering with Claude Code

Registered via `.mcp.json` at the repo root — but project-scoped `.mcp.json` is
discovered by exact working directory, not by walking up the tree, so this only
takes effect for a Claude Code session actually started from inside `repo/`
(`claude mcp list` from `repo/` shows it; from the project's own outer directory,
where this project's `knowledge/`-tree convention says sessions normally start,
it does not).

For a session started from the outer directory instead, register it as a local
(personal, unshared) server from there:

```bash
claude mcp add --scope local nourish -- node repo/mcp-server/src/server.js
```

To register in another project or client manually:

```bash
claude mcp add --transport stdio nourish -- node /path/to/repo/mcp-server/src/server.js
```

## Live sync with the browser (optional)

The app has an "Agent Access (MCP)" section on its Config page, off by default.
Enable it and it connects to `ws://localhost:8137` (or whatever port you set) and
keeps the open tab's plan live-synced with whatever this server has loaded — edits
from either side appear on the other within about a second. Leaving it off (the
default) means zero difference from running the app without this server at all.

## Tools

See `../../knowledge/mcp-server/plan.md` for the full tool list and what each one
maps to in the app's own source.

## Tests

```bash
npm test
```

Spawns the real server over stdio via `@modelcontextprotocol/client` and drives it
through the actual tool-call protocol — not unit tests of the handlers in isolation.
