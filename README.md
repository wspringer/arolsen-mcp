# arolsen-mcp

MCP server exposing search and document retrieval against the [Arolsen Archives online collection](https://collections.arolsen-archives.org/) — a German archive of documents on Nazi persecution.

## Install

```bash
git clone <this repo>
cd arolsen-mcp
npm install
npm run build
```

## Configure (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

## Tools

| Tool | Purpose |
|---|---|
| `arolsen_search(query, syn_search?)` | Run a search; returns counts + an opaque cursor. |
| `arolsen_search_results(cursor, kind, order_by?)` | Paginate persons or archive units (opaque `next_cursor`). |
| `arolsen_get_archive_unit(desc_id)` | Full metadata + breadcrumb for an archive unit. |
| `arolsen_get_documents_in_unit(desc_id, offset?)` | Image-bearing documents inside a unit. Uses `offset` / `next_offset` (numeric) because the upstream call is stateless. |
| `arolsen_get_document(doc_id)` | All page images of a single document. |

## Notes on the upstream

Arolsen does not publish an official API. This server reverse-engineers the Angular SPA's `ITS-WS.asmx` JSON endpoints. Schema drift will break the server; tests use captured fixtures so changes fail loudly.

## Terms of use

Arolsen's [Terms of Use](https://arolsen-archives.org/aroa/documents/terms-of-service_en_2022-11-24.pdf) prohibit "integrating digital versions into another archive without consent of the Arolsen Archives" and require citation. This MCP server is a search client (a query UI), not a republishing system; it does not redistribute or re-archive content. If you intend any redistribution, contact Arolsen Archives first.

## Tests

```bash
npm test           # unit tests against captured fixtures
npm run smoke      # one live request against the Arolsen API
```
