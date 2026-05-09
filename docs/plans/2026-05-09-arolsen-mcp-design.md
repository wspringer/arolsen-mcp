# Arolsen Archives MCP Server — Design

**Date:** 2026-05-09
**Status:** Approved, ready for implementation planning

## Goal

Expose search and document retrieval against the [Arolsen Archives online collection](https://collections.arolsen-archives.org/) as MCP tools, so an LLM can locate persons and documents related to Nazi persecution research.

## Background

Reverse-engineered from the live Angular SPA (no public API docs exist; Arolsen's GitHub org is empty).

- **Backend:** ASP.NET ASMX service at `https://collections-server.arolsen-archives.org/ITS-WS.asmx/<Method>`
- **Auth:** none. Required headers: `Content-Type: application/json`, `Accept: application/json`, `Origin: https://collections.arolsen-archives.org`.
- **Wire format:** POST JSON in / `{"d": ...}` JSON out.
- **Search is stateful:** the client mints a `uniqueId` (random string), calls `BuildQueryGlobalForAngular` to register the query, then calls `GetCount` / `GetArchiveList` / `GetPersonList` with the same `uniqueId` to fetch counts and paginated results.
- **Person extraction is server-side async** — `GetPersonList` returns `[]` immediately after `BuildQuery`; results land within ~700ms.

Sample responses captured during reverse-engineering live in the project root and will move to `test/fixtures/`.

### Terms of service flag

Arolsen's [Terms of Use](https://arolsen-archives.org/aroa/documents/terms-of-service_en_2022-11-24.pdf) prohibit "integrating digital versions into another archive without consent." An MCP search client is a query UI, not a republishing system, so this should not apply — but worth noting in the README.

## Tool surface

Five tools, all snake_case, all prefixed `arolsen_` to avoid collisions when multiple MCP servers are loaded together.

### `arolsen_search(query, syn_search?)`

Registers a search and returns counts + an opaque cursor for pagination.

- Wraps `BuildQueryGlobalForAngular` + `GetCount` (called twice: `searchType: "person"` and `searchType: "archive"`).
- `syn_search` defaults to `true` (phonetic/synonym matching, the SPA's default).
- Returns `{ person_count, archive_count, cursor }`.
- The cursor is base64 of `{ uniqueId, offset: 0 }` and is reusable for both kinds — `arolsen_search_results` decides which list to fetch.

### `arolsen_search_results(cursor, kind, order_by?)`

Paginated retrieval of either persons or archive units for a prior search.

- `kind`: `"persons"` | `"archives"`.
- `order_by` for persons: `LastName` (default) | `FirstName` | `BirthName` | `BirthPlace` | `BirthDate` | `PrisonerNo`.
- `order_by` for archives: `RN` (default, relevance) | `Title` | `Signature`.
- Polls `GetPersonList` up to ~2s when `kind=persons` (server-side async extraction).
- Returns `{ results: [...], next_cursor? }`. `next_cursor` is omitted when the page count exhausts the total.
- Cursors are LRU-cached server-side keyed by `uniqueId`; eviction returns `isError: true` with `error_code: "cursor_expired"` and a hint to call `arolsen_search` again.

### `arolsen_get_archive_unit(desc_id)`

Full metadata for an archive unit.

- Wraps `GetArchiveInfo` (`{ descId, level: 1, lang: "en" }`).
- Returns `{ title, ref_code, document_num, breadcrumb: [...], description_data, map_data?, contains_data? }`.
- `breadcrumb` is the `TreeData[]` chain of ancestors with their `desc_id` and `url_id`, so the LLM can climb the tree.

### `arolsen_get_documents_in_unit(desc_id, offset?)`

Paginated documents (image-bearing entries) inside an archive unit.

- First call also issues `getFileByParentCount` to get the total.
- Wraps `GetFileByParent`.
- Returns `{ documents: [{ doc_id, title, image_link, thumbnail_link, related_link }], total, next_cursor? }`.
- `image_link` and `thumbnail_link` are MCP `resource_link` content blocks (`{ type: "resource_link", uri, mimeType: "image/jpeg", name }`) — host fetches lazily, no base64 inlining.

### `arolsen_get_document(doc_id)`

All page images for a single document.

- Wraps `GetFileByObj`.
- Returns `{ pages: [<resource_link per image>] }`.

## Output contract — every tool

- `structuredContent`: typed object matching the tool's `outputSchema` (zod).
- `content[0]`: short markdown summary for the LLM (e.g. "Found 51,497 persons and 3,932 archive units. Use `arolsen_search_results` with the cursor to retrieve them.").
- On upstream failure: `isError: true`, `content[0].text` = human-readable message, `structuredContent = { error_code, retry_after? }`.

`error_code` values: `"upstream_5xx"`, `"upstream_timeout"`, `"rate_limited"`, `"cursor_expired"`, `"not_found"`.

## Stack

- **Runtime:** Node 20+, TypeScript, ESM.
- **MCP:** `@modelcontextprotocol/sdk` (stdio transport only).
- **Schemas:** zod for both input and output schemas.
- **HTTP:** built-in `fetch` (Node 20+ native), with a 30s timeout.
- **Test:** vitest. Unit tests use the captured JSON fixtures against a mocked HTTP layer; one smoke test hits the real API for `arolsen_search("Schmidt")`.

## Project layout

```
arolsen-mcp/
├── package.json
├── tsconfig.json
├── README.md                  # install + claude_desktop_config.json snippet + ToS note
├── src/
│   ├── index.ts               # server entry, tool registration, stdio transport
│   ├── client.ts              # ASMX HTTP wrapper, uniqueId mgmt, retries
│   ├── cursor.ts              # encode/decode + LRU cache
│   ├── schemas.ts             # zod input + output schemas (one per tool)
│   └── tools/
│       ├── search.ts
│       ├── search_results.ts
│       ├── get_archive_unit.ts
│       ├── get_documents_in_unit.ts
│       └── get_document.ts
├── test/
│   ├── fixtures/              # captured JSON moves here
│   ├── client.test.ts
│   ├── cursor.test.ts
│   └── tools/*.test.ts
└── docs/plans/
    └── 2026-05-09-arolsen-mcp-design.md
```

## Out of scope for v1

- **Filter facets.** The reverse-engineering didn't exercise the SPA's Filter UI, so the parameter shape is unknown. Add in v2 after a second Playwright pass.
- **`archiveIds` filtering** on `BuildQueryGlobalForAngular` (restricting search to a subtree). Same reason.
- **HTTP transport.** stdio only; remote hosting can come later if needed.
- **A `health_check` tool.** Reference MCP servers don't ship one; failures surface naturally via `isError`.

## Risks

- **Upstream is undocumented.** Schema changes will break us silently. Mitigation: vitest fixtures fail loudly when shapes drift; smoke test catches network/protocol breakage.
- **Person-list async extraction.** If the ~2s poll budget is too short for very common surnames, results return empty. Mitigation: bump the budget if observed; surface a `still_extracting` hint in `structuredContent`.
- **ToS interpretation.** README will note the Terms of Use and recommend users contact Arolsen for any redistribution use case.
