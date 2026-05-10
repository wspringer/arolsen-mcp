# arolsen-mcp

[![npm](https://img.shields.io/npm/v/arolsen-mcp.svg)](https://www.npmjs.com/package/arolsen-mcp)

MCP server exposing search and document retrieval against the [Arolsen Archives online collection](https://collections.arolsen-archives.org/) — a German archive of documents on Nazi persecution.

The server is published on npm and runs through `npx`, so there's nothing to clone or build for normal use.

## Install

### Claude Code

Easiest — let the CLI write the config for you:

```bash
claude mcp add --scope user arolsen -- npx -y arolsen-mcp@latest
```

This registers the server in your user-level config (`~/.claude/mcp.json`), so it's available in every project. Drop `--scope user` to scope it to the current project instead (writes to `./.mcp.json`).

After running it, restart your Claude Code session (or run `/mcp` to reconnect) and verify the tools show up:

```
> /mcp
```

You should see `arolsen` listed with five tools (`arolsen_search`, `arolsen_search_results`, `arolsen_get_archive_unit`, `arolsen_get_documents_in_unit`, `arolsen_get_document`).

### Claude Desktop

Open the config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add (or merge) the `arolsen` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "arolsen": {
      "command": "npx",
      "args": ["-y", "arolsen-mcp@latest"]
    }
  }
}
```

Then **fully quit and reopen** Claude Desktop (⌘Q on macOS, not just close window). MCP servers are only picked up at startup.

### Other MCP clients

The same `command` + `args` pair works in any MCP client that speaks stdio — Cline, Cursor, Continue, Zed, etc. Consult your client's docs for where to drop the snippet.

### Verify it works

Ask Claude something like:

> *Search the Arolsen archives for Mathilde born around 1914.*

Claude should call `arolsen_search` with `first_name="Mathilde"` and `birth_year=1914`, then page the results.

### Pinning a version

`arolsen-mcp@latest` always pulls the newest release. If you want determinism, pin a specific version (`arolsen-mcp@0.1.1`) — `npx` will cache and reuse it.

## Tools

| Tool | Purpose |
|---|---|
| `arolsen_search(query, syn_search?, first_name?, last_name?, maiden_name?, birth_year?, ...)` | Free-text query plus optional structured filters (FirstName, LastName, MaidenName, PlaceBirth, Dob year range, Religion, Nationality, last-residence breakdown, etc.). When phonetic surname matching misses, drop the surname and lean on `first_name + birth_year`. Returns counts + an opaque cursor. |
| `arolsen_search_results(cursor, kind, order_by?)` | Paginate persons or archive units. Person rows expose `obj_id`, `desc_id`, and `signature` for drill-down. |
| `arolsen_get_archive_unit(desc_id)` | Full metadata + breadcrumb for an archive unit. |
| `arolsen_get_documents_in_unit(desc_id, offset?)` | Image-bearing documents inside a unit. Uses `offset` / `next_offset` (numeric) because the upstream call is stateless. |
| `arolsen_get_document(doc_id)` | All page images of a single document. Pass the `obj_id` from a person hit. |

## Notes on the upstream

Arolsen does not publish an official API. This server reverse-engineers the Angular SPA's `ITS-WS.asmx` JSON endpoints. Two non-obvious things to know:

- **Phonetic surname search is asymmetric.** Searching `Leeser` and `Leezer` lands you in different phonetic neighborhoods on the upstream — they don't always overlap. If a free-text search misses your target, drop the surname and use `first_name + birth_year` instead.
- **Sessions are cookie-keyed**, not `uniqueId`-keyed. The client persists `ASP.NET_SessionId` across calls automatically; without that, GetCount returns the global archive total.

Schema drift will break the server; tests use captured fixtures so changes fail loudly.

## Terms of use

Arolsen's [Terms of Use](https://arolsen-archives.org/aroa/documents/terms-of-service_en_2022-11-24.pdf) prohibit "integrating digital versions into another archive without consent of the Arolsen Archives" and require citation. This MCP server is a search client (a query UI), not a republishing system; it does not redistribute or re-archive content. If you intend any redistribution, contact Arolsen Archives first.

## Develop locally

```bash
git clone https://github.com/wspringer/arolsen-mcp
cd arolsen-mcp
npm install
npm run build
```

Then point your MCP client at the local build:

```json
{
  "mcpServers": {
    "arolsen": {
      "command": "node",
      "args": ["/absolute/path/to/arolsen-mcp/dist/index.js"]
    }
  }
}
```

## Tests

```bash
npm test           # unit tests against captured fixtures
npm run smoke      # one live request against the Arolsen API
```

## Releases

This project uses the [Knope GitHub Bot](https://github.com/marketplace/knope-bot) for release-PR-style versioning. Conventional-commit messages on `main` (`feat:`, `fix:`, `chore:`, …) drive the next version automatically. Merging the bot's open release PR triggers `.github/workflows/release.yml`, which runs the test suite and publishes to npm with [build provenance](https://docs.npmjs.com/generating-provenance-statements).

## License

MIT — see [LICENSE](./LICENSE).
