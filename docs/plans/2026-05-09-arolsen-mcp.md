# Arolsen MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A TypeScript MCP server that exposes Arolsen Archives search and document retrieval to LLMs via five tools over stdio.

**Architecture:** Thin HTTP wrapper around the undocumented ASP.NET ASMX backend at `collections-server.arolsen-archives.org/ITS-WS.asmx/`. Stateful upstream queries are hidden behind an opaque `cursor` (LRU-cached server-side). All tools return both `structuredContent` (typed) and a markdown summary in `content`. Errors surface as `isError: true` with an `error_code`.

**Tech Stack:** Node 20+, TypeScript (ESM), `@modelcontextprotocol/sdk`, zod, vitest. Built-in `fetch`. No persistence.

**Reference design:** `docs/plans/2026-05-09-arolsen-mcp-design.md`.

**Captured fixture files** (currently in repo root, will move to `test/fixtures/` in Task 2):
- `archive_info.json`, `arolsen_archive_list.json`, `count_person.json`, `file_by_obj.json`, `file_by_parent.json`, `file_by_parent_count.json`, `person_list.json` (empty — needs re-capture), `person_list_docid.json` (empty), `tree_node.json`.

---

## Task 1: Initialize repo, scaffold project, commit design

**Files:**
- Create: `/Users/wilfred/workspace/arolsen-mcp/.gitignore`
- Create: `/Users/wilfred/workspace/arolsen-mcp/package.json`
- Create: `/Users/wilfred/workspace/arolsen-mcp/tsconfig.json`
- Create: `/Users/wilfred/workspace/arolsen-mcp/vitest.config.ts`

**Step 1: Initialize git**

```bash
cd /Users/wilfred/workspace/arolsen-mcp
git init -b main
```

**Step 2: Write `.gitignore`**

```
node_modules/
dist/
.env
.DS_Store
*.log
coverage/
```

**Step 3: Write `package.json`**

```json
{
  "name": "arolsen-mcp",
  "version": "0.1.0",
  "description": "MCP server for searching the Arolsen Archives",
  "type": "module",
  "bin": {
    "arolsen-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "smoke": "vitest run --config vitest.smoke.config.ts",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/smoke/**"],
  },
});
```

**Step 6: Install dependencies**

```bash
cd /Users/wilfred/workspace/arolsen-mcp
npm install
```

Expected: dependencies install without error.

**Step 7: Verify pinned MCP SDK version is real**

```bash
npm view @modelcontextprotocol/sdk version
```

If `^1.0.0` doesn't resolve, update `package.json` to the latest minor and re-run `npm install`.

**Step 8: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vitest.config.ts docs/plans/
git commit -m "chore: scaffold arolsen-mcp project + commit design"
```

---

## Task 2: Move captured JSON fixtures into test/fixtures/

**Files:**
- Move: `/Users/wilfred/workspace/arolsen-mcp/*.json` → `/Users/wilfred/workspace/arolsen-mcp/test/fixtures/`

**Step 1: Create the directory and move files**

```bash
cd /Users/wilfred/workspace/arolsen-mcp
mkdir -p test/fixtures
mv *.json test/fixtures/
```

**Step 2: Verify**

```bash
ls test/fixtures/
```

Expected: 9 `.json` files listed.

**Step 3: Commit**

```bash
git add test/fixtures/
git commit -m "chore: move captured API fixtures into test/fixtures"
```

---

## Task 3: Capture a real GetPersonList fixture

The existing `person_list.json` is `[]` (empty) because the original capture didn't wait for server-side async extraction. We need a non-empty fixture.

**Files:**
- Create/overwrite: `test/fixtures/person_list.json`

**Step 1: Run a manual capture against the live API**

```bash
UID=$(node -e "console.log(Math.random().toString(36).slice(2,22))")
curl -s -X POST 'https://collections-server.arolsen-archives.org/ITS-WS.asmx/BuildQueryGlobalForAngular' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'Origin: https://collections.arolsen-archives.org' \
  -d "{\"uniqueId\":\"$UID\",\"lang\":\"en\",\"archiveIds\":[],\"strSearch\":\"Schmidt\",\"synSearch\":true}"
echo
sleep 3
curl -s -X POST 'https://collections-server.arolsen-archives.org/ITS-WS.asmx/GetPersonList' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'Origin: https://collections.arolsen-archives.org' \
  -d "{\"uniqueId\":\"$UID\",\"lang\":\"en\",\"rowNum\":0,\"orderBy\":\"LastName\",\"orderType\":\"asc\"}" \
  > test/fixtures/person_list.json
head -c 400 test/fixtures/person_list.json
```

Expected: response starts with `{"d":[{"__type":"ITSPannel.classes.` and contains real person records.

**Step 2: If it's still empty, increase sleep to 8 and retry.** Note the actual delay observed in the plan once known.

**Step 3: Commit**

```bash
git add test/fixtures/person_list.json
git commit -m "chore: re-capture non-empty GetPersonList fixture"
```

---

## Task 4: Define ASMX endpoint constants and types

**Files:**
- Create: `src/types.ts`

**Step 1: Write `src/types.ts`**

```ts
export const BASE_URL = "https://collections-server.arolsen-archives.org/ITS-WS.asmx";
export const ORIGIN = "https://collections.arolsen-archives.org";

export type Method =
  | "BuildQueryGlobalForAngular"
  | "GetCount"
  | "GetArchiveList"
  | "GetPersonList"
  | "GetArchiveInfo"
  | "GetFileByParent"
  | "getFileByParentCount"
  | "GetFileByObj"
  | "GetTreeNodeByDocId";

export type SearchType = "person" | "archive";

export type AsmxEnvelope<T> = { d: T };

// Raw upstream shapes (only the fields we actually use)
export interface RawArchiveRow {
  Title: string;
  id: string;          // descId
  RefCode: string;
  Signature: string;
  TreePath: string;
  fileCount: number;
  directFile: number;
  treeLevel: number;
  ReportsTo: string;
  hasChildren?: boolean;
}

export interface RawPersonRow {
  LastName?: string;
  FirstName?: string;
  BirthName?: string;
  BirthPlace?: string;
  BirthDate?: string;
  PrisonerNo?: string;
  // Some payloads use generic columns. Capture as Record so we don't lose data.
  [k: string]: unknown;
}

export interface RawTreeNode {
  Title: string;
  DescId: string;
  Level: number;
  UrlId: string;
  FileCount?: number;
}

export interface RawArchiveInfo {
  DescId: number;
  Title: string;
  RefCode?: string;
  TreeData: RawTreeNode[];
  HeaderItems?: Record<string, unknown>;
  DescriptionData?: Record<string, unknown>;
  MapData?: unknown[];
  ContainsData?: unknown[];
}

export interface RawViewerImage {
  thmbnl: string;
  image: string;
  title: string;
  descId: number;
  docCounter: string;
  relatedLink: string;
}

export type ErrorCode =
  | "upstream_5xx"
  | "upstream_timeout"
  | "rate_limited"
  | "cursor_expired"
  | "not_found"
  | "extraction_timeout";

export class ArolsenError extends Error {
  constructor(public code: ErrorCode, message: string, public retryAfter?: number) {
    super(message);
  }
}
```

**Step 2: Verify it typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: ASMX types and constants"
```

---

## Task 5: HTTP client — happy path against fixtures

We test against the captured fixtures by mocking `fetch`.

**Files:**
- Create: `src/client.ts`
- Create: `test/client.test.ts`

**Step 1: Write the failing test**

`test/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AsmxClient } from "../src/client.js";

const FIX = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

function mockFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split("/").pop()!;
    if (!(method in responses)) throw new Error(`No mock for ${method}`);
    return new Response(JSON.stringify(responses[method]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("AsmxClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("buildQuery posts the right body and headers", async () => {
    const fetch = mockFetch({ BuildQueryGlobalForAngular: { d: true } });
    const client = new AsmxClient({ fetch });
    const ok = await client.buildQuery({ uniqueId: "abc", strSearch: "Schmidt" });
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/BuildQueryGlobalForAngular$/);
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Origin"]).toMatch(/^https:\/\/collections\.arolsen-archives\.org/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      uniqueId: "abc",
      lang: "en",
      strSearch: "Schmidt",
      synSearch: true,
      archiveIds: [],
    });
  });

  it("getCount returns parsed integer", async () => {
    const fetch = mockFetch({ GetCount: FIX("count_person.json") });
    const client = new AsmxClient({ fetch });
    const n = await client.getCount({ uniqueId: "abc", searchType: "person" });
    expect(n).toBe(51497);
  });

  it("getArchiveList returns parsed rows", async () => {
    const fetch = mockFetch({ GetArchiveList: FIX("arolsen_archive_list.json") });
    const client = new AsmxClient({ fetch });
    const rows = await client.getArchiveList({ uniqueId: "abc", offset: 0 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("Title");
    expect(rows[0]).toHaveProperty("id");
  });

  it("getArchiveInfo parses TreeData breadcrumb", async () => {
    const fetch = mockFetch({ GetArchiveInfo: FIX("archive_info.json") });
    const client = new AsmxClient({ fetch });
    const info = await client.getArchiveInfo(1096933);
    expect(info.Title).toMatch(/SCHMIDT/);
    expect(info.TreeData.length).toBeGreaterThan(0);
  });

  it("getFileByParent returns viewer images", async () => {
    const fetch = mockFetch({ GetFileByParent: FIX("file_by_parent.json") });
    const client = new AsmxClient({ fetch });
    const imgs = await client.getFileByParent({ parentId: "1096933", offset: 0 });
    expect(imgs[0].image).toMatch(/^https?:/);
    expect(imgs[0].descId).toBe(1096933);
  });

  it("getFileByParentCount returns int", async () => {
    const fetch = mockFetch({ getFileByParentCount: FIX("file_by_parent_count.json") });
    const client = new AsmxClient({ fetch });
    const n = await client.getFileByParentCount("1096933");
    expect(n).toBe(4);
  });

  it("getFileByObj returns viewer images for one document", async () => {
    const fetch = mockFetch({ GetFileByObj: FIX("file_by_obj.json") });
    const client = new AsmxClient({ fetch });
    const imgs = await client.getFileByObj("77266");
    expect(imgs.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run test/client.test.ts
```

Expected: all tests fail with "Cannot find module '../src/client.js'".

**Step 3: Write minimal `src/client.ts`**

```ts
import {
  BASE_URL, ORIGIN, AsmxEnvelope, ArolsenError,
  RawArchiveRow, RawPersonRow, RawArchiveInfo, RawViewerImage, SearchType,
} from "./types.js";

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetch?: FetchFn;
  timeoutMs?: number;
}

export class AsmxClient {
  private fetch: FetchFn;
  private timeoutMs: number;

  constructor(opts: ClientOptions = {}) {
    this.fetch = opts.fetch ?? (globalThis.fetch as FetchFn);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async post<T>(method: string, body: object): Promise<T> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetch(`${BASE_URL}/${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": ORIGIN,
          "Referer": `${ORIGIN}/`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") {
        throw new ArolsenError("upstream_timeout", `Timeout calling ${method}`);
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "30");
      throw new ArolsenError("rate_limited", "Upstream rate limit", retry);
    }
    if (res.status >= 500) {
      throw new ArolsenError("upstream_5xx", `Upstream ${method} returned ${res.status}`);
    }
    if (!res.ok) {
      throw new ArolsenError("upstream_5xx", `Upstream ${method} returned ${res.status}`);
    }
    const json = (await res.json()) as AsmxEnvelope<T>;
    return json.d;
  }

  buildQuery(args: { uniqueId: string; strSearch: string; synSearch?: boolean; archiveIds?: number[]; lang?: string }): Promise<boolean> {
    return this.post("BuildQueryGlobalForAngular", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      archiveIds: args.archiveIds ?? [],
      strSearch: args.strSearch,
      synSearch: args.synSearch ?? true,
    });
  }

  async getCount(args: { uniqueId: string; searchType: SearchType; lang?: string; useFilter?: boolean }): Promise<number> {
    const v = await this.post<string>("GetCount", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      searchType: args.searchType,
      useFilter: args.useFilter ?? false,
    });
    return parseInt(v, 10);
  }

  getArchiveList(args: { uniqueId: string; offset: number; orderBy?: string; orderType?: "asc"|"desc"; lang?: string }): Promise<RawArchiveRow[]> {
    return this.post("GetArchiveList", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      orderBy: args.orderBy ?? "RN",
      orderType: args.orderType ?? "asc",
      rowNum: args.offset,
    });
  }

  getPersonList(args: { uniqueId: string; offset: number; orderBy?: string; orderType?: "asc"|"desc"; lang?: string }): Promise<RawPersonRow[]> {
    return this.post("GetPersonList", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      rowNum: args.offset,
      orderBy: args.orderBy ?? "LastName",
      orderType: args.orderType ?? "asc",
    });
  }

  getArchiveInfo(descId: number, lang = "en"): Promise<RawArchiveInfo> {
    return this.post("GetArchiveInfo", { descId, level: 1, lang });
  }

  getFileByParent(args: { parentId: string; offset: number; lang?: string }): Promise<RawViewerImage[]> {
    return this.post("GetFileByParent", { parentId: args.parentId, rowNum: args.offset, lang: args.lang ?? "en" });
  }

  async getFileByParentCount(parentId: string, lang = "en"): Promise<number> {
    const v = await this.post<string>("getFileByParentCount", { parentId, lang });
    return parseInt(v, 10);
  }

  getFileByObj(objId: string, lang = "en"): Promise<RawViewerImage[]> {
    return this.post("GetFileByObj", { objId, lang });
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run test/client.test.ts
```

Expected: 7 tests pass.

**Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "feat: ASMX HTTP client with fixture-backed tests"
```

---

## Task 6: Client error-handling tests

**Files:**
- Modify: `test/client.test.ts`

**Step 1: Append failure-mode tests**

Append to `test/client.test.ts`:

```ts
describe("AsmxClient errors", () => {
  it("maps 5xx to upstream_5xx ArolsenError", async () => {
    const fetch = vi.fn(async () => new Response("oops", { status: 503 }));
    const client = new AsmxClient({ fetch });
    await expect(client.getCount({ uniqueId: "x", searchType: "person" }))
      .rejects.toMatchObject({ code: "upstream_5xx" });
  });

  it("maps 429 to rate_limited with retry_after", async () => {
    const fetch = vi.fn(async () => new Response("slow down", { status: 429, headers: { "retry-after": "12" } }));
    const client = new AsmxClient({ fetch });
    await expect(client.getCount({ uniqueId: "x", searchType: "person" }))
      .rejects.toMatchObject({ code: "rate_limited", retryAfter: 12 });
  });

  it("maps abort to upstream_timeout", async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      return new Promise<Response>((_res, rej) => {
        (init.signal as AbortSignal).addEventListener("abort", () => {
          const e = new Error("aborted"); e.name = "AbortError"; rej(e);
        });
      });
    });
    const client = new AsmxClient({ fetch, timeoutMs: 10 });
    await expect(client.getCount({ uniqueId: "x", searchType: "person" }))
      .rejects.toMatchObject({ code: "upstream_timeout" });
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run test/client.test.ts
```

Expected: all tests pass (existing 7 + new 3).

**Step 3: Commit**

```bash
git add test/client.test.ts
git commit -m "test: client error-mode coverage"
```

---

## Task 7: Cursor encode/decode + LRU cache

The cursor opaquely carries `{ uniqueId, offset, kind? }`. The LRU lets us evict old searches; eviction → `cursor_expired` error.

**Files:**
- Create: `src/cursor.ts`
- Create: `test/cursor.test.ts`

**Step 1: Write failing test**

`test/cursor.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { CursorStore } from "../src/cursor.js";

describe("CursorStore", () => {
  let store: CursorStore;
  beforeEach(() => { store = new CursorStore({ max: 3 }); });

  it("issues a cursor and reads it back", () => {
    const c = store.issue("abc", 0);
    const got = store.read(c);
    expect(got).toEqual({ uniqueId: "abc", offset: 0 });
  });

  it("rejects unknown cursor with cursor_expired", () => {
    expect(() => store.read("ZmFrZQ==")).toThrowError(/cursor_expired/);
  });

  it("rejects malformed cursor with cursor_expired", () => {
    expect(() => store.read("not-base64-!!!")).toThrowError(/cursor_expired/);
  });

  it("evicts least-recently-used when over capacity", () => {
    const a = store.issue("A", 0);
    const b = store.issue("B", 0);
    const c = store.issue("C", 0);
    store.read(a); // A is now MRU
    const d = store.issue("D", 0); // should evict B
    expect(() => store.read(b)).toThrowError(/cursor_expired/);
    expect(store.read(a)).toEqual({ uniqueId: "A", offset: 0 });
    expect(store.read(c)).toEqual({ uniqueId: "C", offset: 0 });
    expect(store.read(d)).toEqual({ uniqueId: "D", offset: 0 });
  });

  it("issues a derivative cursor for the same uniqueId at a new offset", () => {
    const c1 = store.issue("X", 0);
    const c2 = store.advance(c1, 25);
    expect(store.read(c2)).toEqual({ uniqueId: "X", offset: 25 });
    expect(store.read(c1)).toEqual({ uniqueId: "X", offset: 0 });
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run test/cursor.test.ts
```

Expected: fails with module-not-found.

**Step 3: Write `src/cursor.ts`**

```ts
import { ArolsenError } from "./types.js";

export interface CursorState {
  uniqueId: string;
  offset: number;
}

export class CursorStore {
  private cache = new Map<string, CursorState>(); // insertion order = LRU order
  private max: number;

  constructor(opts: { max?: number } = {}) {
    this.max = opts.max ?? 256;
  }

  issue(uniqueId: string, offset: number): string {
    const cursor = encode({ uniqueId, offset });
    this.touch(cursor, { uniqueId, offset });
    return cursor;
  }

  advance(prev: string, newOffset: number): string {
    const state = this.read(prev);
    return this.issue(state.uniqueId, newOffset);
  }

  read(cursor: string): CursorState {
    const decoded = tryDecode(cursor);
    if (!decoded) throw new ArolsenError("cursor_expired", "Cursor is malformed or expired");
    if (!this.cache.has(cursor)) {
      throw new ArolsenError("cursor_expired", "Cursor is no longer cached; call arolsen_search again");
    }
    const state = this.cache.get(cursor)!;
    // Refresh LRU position
    this.cache.delete(cursor);
    this.cache.set(cursor, state);
    return state;
  }

  private touch(cursor: string, state: CursorState) {
    if (this.cache.has(cursor)) this.cache.delete(cursor);
    this.cache.set(cursor, state);
    while (this.cache.size > this.max) {
      const firstKey = this.cache.keys().next().value as string;
      this.cache.delete(firstKey);
    }
  }
}

function encode(s: CursorState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

function tryDecode(s: string): CursorState | null {
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.uniqueId !== "string" || typeof parsed?.offset !== "number") return null;
    return parsed;
  } catch { return null; }
}
```

**Step 4: Run tests**

```bash
npx vitest run test/cursor.test.ts
```

Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add src/cursor.ts test/cursor.test.ts
git commit -m "feat: opaque cursor + LRU store"
```

---

## Task 8: Zod input + output schemas for all 5 tools

**Files:**
- Create: `src/schemas.ts`

**Step 1: Write `src/schemas.ts`**

```ts
import { z } from "zod";

// Input schemas
export const SearchInput = z.object({
  query: z.string().min(1).describe("Search term — surname, full name, or other free text."),
  syn_search: z.boolean().default(true).describe("Phonetic/synonym matching. Defaults to true (Arolsen UI default)."),
});

export const SearchResultsInput = z.object({
  cursor: z.string().describe("Opaque cursor returned by arolsen_search or a previous arolsen_search_results call."),
  kind: z.enum(["persons", "archives"]),
  order_by: z.string().optional().describe(
    "Persons: LastName | FirstName | BirthName | BirthPlace | BirthDate | PrisonerNo. Archives: RN | Title | Signature."
  ),
});

export const GetArchiveUnitInput = z.object({
  desc_id: z.number().int().describe("descId of the archive unit (from search results)."),
});

export const GetDocumentsInUnitInput = z.object({
  desc_id: z.number().int(),
  offset: z.number().int().nonnegative().default(0),
});

export const GetDocumentInput = z.object({
  doc_id: z.string().describe("Document ID (numeric string from search results)."),
});

// Output schemas
const ResourceLink = z.object({
  type: z.literal("resource_link"),
  uri: z.string().url(),
  mimeType: z.string(),
  name: z.string(),
});

export const SearchOutput = z.object({
  person_count: z.number().int(),
  archive_count: z.number().int(),
  cursor: z.string(),
});

export const PersonResult = z.object({
  last_name: z.string().nullable(),
  first_name: z.string().nullable(),
  birth_name: z.string().nullable(),
  birth_place: z.string().nullable(),
  birth_date: z.string().nullable(),
  prisoner_no: z.string().nullable(),
});

export const ArchiveResult = z.object({
  desc_id: z.string(),
  title: z.string(),
  ref_code: z.string().nullable(),
  signature: z.string().nullable(),
  tree_path: z.string().nullable(),
  file_count: z.number().int(),
  has_children: z.boolean(),
});

export const SearchResultsOutput = z.object({
  kind: z.enum(["persons", "archives"]),
  results: z.union([z.array(PersonResult), z.array(ArchiveResult)]),
  next_cursor: z.string().optional(),
  still_extracting: z.boolean().optional(),
});

export const BreadcrumbNode = z.object({
  desc_id: z.string(),
  title: z.string(),
  level: z.number().int(),
  url_id: z.string(),
});

export const ArchiveUnitOutput = z.object({
  desc_id: z.number().int(),
  title: z.string(),
  ref_code: z.string().nullable(),
  breadcrumb: z.array(BreadcrumbNode),
  description_data: z.record(z.unknown()),
  contains_data: z.array(z.unknown()),
});

export const DocumentEntry = z.object({
  doc_id: z.string(),
  title: z.string(),
  desc_id: z.number().int(),
  related_link: z.string(),
  image_link: ResourceLink,
  thumbnail_link: ResourceLink,
});

export const DocumentsInUnitOutput = z.object({
  total: z.number().int(),
  documents: z.array(DocumentEntry),
  next_cursor: z.string().optional(),
});

export const DocumentOutput = z.object({
  doc_id: z.string(),
  pages: z.array(ResourceLink),
});

export const ErrorOutput = z.object({
  error_code: z.string(),
  retry_after: z.number().int().optional(),
});
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/schemas.ts
git commit -m "feat: zod input + output schemas"
```

---

## Task 9: Result-mapping helpers (raw → schema-shaped)

**Files:**
- Create: `src/mappers.ts`
- Create: `test/mappers.test.ts`

**Step 1: Write the failing test**

`test/mappers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  toArchiveResult, toPersonResult, toArchiveUnit, toDocumentEntry, toResourceLink,
} from "../src/mappers.js";

const FIX = (n: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", n), "utf8"));

describe("mappers", () => {
  it("toArchiveResult flattens row", () => {
    const row = FIX("arolsen_archive_list.json").d[0];
    const r = toArchiveResult(row);
    expect(r.desc_id).toBe(row.id);
    expect(r.title).toBe(row.Title);
    expect(r.ref_code).toBe(row.RefCode);
    expect(r.file_count).toBe(row.fileCount);
    expect(r.has_children).toBe(false);
  });

  it("toArchiveUnit extracts breadcrumb from TreeData", () => {
    const raw = FIX("archive_info.json").d;
    const u = toArchiveUnit(raw);
    expect(u.title).toMatch(/SCHMIDT/);
    expect(u.breadcrumb.length).toBe(raw.TreeData.length);
    expect(u.breadcrumb[0]).toMatchObject({ desc_id: expect.any(String), level: expect.any(Number) });
  });

  it("toDocumentEntry produces resource_link blocks with usable URLs", () => {
    const raw = FIX("file_by_parent.json").d[0];
    const d = toDocumentEntry(raw);
    expect(d.image_link.type).toBe("resource_link");
    expect(d.image_link.uri).toMatch(/^https:\/\//);
    expect(d.thumbnail_link.uri).toMatch(/^https:\/\//);
    expect(d.image_link.mimeType).toBe("image/jpeg");
  });

  it("toResourceLink rewrites backslashes to / and prefixes thmbnl", () => {
    const link = toResourceLink({
      thmbnl: "/remote/collections-server.arolsen-archives.org/G/SIMS/x/y/z/001.jpg?width=700",
      image: "https:\\\\collections-server.arolsen-archives.org/G/SIMS/x/y/z/001.jpg",
      title: "t", descId: 1, docCounter: "1_1", relatedLink: "en/document/1",
    });
    expect(link.image_link.uri).toBe("https://collections-server.arolsen-archives.org/G/SIMS/x/y/z/001.jpg");
    expect(link.thumbnail_link.uri.startsWith("https://")).toBe(true);
  });

  it("toPersonResult tolerates missing fields", () => {
    const r = toPersonResult({ LastName: "Schmidt" });
    expect(r.last_name).toBe("Schmidt");
    expect(r.first_name).toBeNull();
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx vitest run test/mappers.test.ts
```

Expected: module-not-found.

**Step 3: Write `src/mappers.ts`**

```ts
import { z } from "zod";
import {
  RawArchiveRow, RawPersonRow, RawArchiveInfo, RawViewerImage, RawTreeNode,
} from "./types.js";
import {
  ArchiveResult, PersonResult, ArchiveUnitOutput, DocumentEntry, BreadcrumbNode,
} from "./schemas.js";

type ArchiveResultT = z.infer<typeof ArchiveResult>;
type PersonResultT = z.infer<typeof PersonResult>;
type ArchiveUnitT = z.infer<typeof ArchiveUnitOutput>;
type DocumentEntryT = z.infer<typeof DocumentEntry>;
type BreadcrumbT = z.infer<typeof BreadcrumbNode>;

const IMG_HOST = "https://collections-server.arolsen-archives.org";

function normalizeUrl(u: string): string {
  // Upstream sometimes has "https:\\\\host/path" — normalize to https://host/path.
  let s = u.replace(/\\/g, "/");
  if (s.startsWith("https:/") && !s.startsWith("https://")) s = "https://" + s.slice(7);
  return s;
}

function thumbnailUrl(thmbnl: string): string {
  // thmbnl looks like "/remote/collections-server.arolsen-archives.org/G/...".
  // Strip the "/remote/<host>" prefix and rebuild.
  const m = thmbnl.match(/^\/remote\/[^/]+(\/.+)$/);
  if (m) return IMG_HOST + m[1];
  if (thmbnl.startsWith("http")) return thmbnl;
  return IMG_HOST + thmbnl;
}

export function toArchiveResult(r: RawArchiveRow): ArchiveResultT {
  return {
    desc_id: r.id,
    title: r.Title,
    ref_code: r.RefCode ?? null,
    signature: r.Signature ?? null,
    tree_path: r.TreePath ?? null,
    file_count: r.fileCount ?? 0,
    has_children: !!r.hasChildren,
  };
}

export function toPersonResult(r: RawPersonRow): PersonResultT {
  return {
    last_name: (r.LastName as string) ?? null,
    first_name: (r.FirstName as string) ?? null,
    birth_name: (r.BirthName as string) ?? null,
    birth_place: (r.BirthPlace as string) ?? null,
    birth_date: (r.BirthDate as string) ?? null,
    prisoner_no: (r.PrisonerNo as string) ?? null,
  };
}

function toBreadcrumb(t: RawTreeNode): BreadcrumbT {
  return { desc_id: String(t.DescId), title: t.Title, level: t.Level, url_id: t.UrlId };
}

export function toArchiveUnit(raw: RawArchiveInfo): ArchiveUnitT {
  return {
    desc_id: raw.DescId,
    title: raw.Title,
    ref_code: (raw.RefCode as string | undefined) ?? null,
    breadcrumb: (raw.TreeData ?? []).map(toBreadcrumb),
    description_data: (raw.DescriptionData ?? {}) as Record<string, unknown>,
    contains_data: (raw.ContainsData ?? []) as unknown[],
  };
}

export function toResourceLink(v: RawViewerImage): { image_link: DocumentEntryT["image_link"]; thumbnail_link: DocumentEntryT["thumbnail_link"] } {
  const imageUri = normalizeUrl(v.image);
  const thumbUri = thumbnailUrl(v.thmbnl);
  return {
    image_link: { type: "resource_link", uri: imageUri, mimeType: "image/jpeg", name: v.title },
    thumbnail_link: { type: "resource_link", uri: thumbUri, mimeType: "image/jpeg", name: `${v.title} (thumbnail)` },
  };
}

export function toDocumentEntry(v: RawViewerImage): DocumentEntryT {
  const docId = v.docCounter.split("_")[0];
  const links = toResourceLink(v);
  return {
    doc_id: docId,
    title: v.title,
    desc_id: v.descId,
    related_link: v.relatedLink,
    ...links,
  };
}
```

**Step 4: Run tests**

```bash
npx vitest run test/mappers.test.ts
```

Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add src/mappers.ts test/mappers.test.ts
git commit -m "feat: raw→schema mappers"
```

---

## Task 10: Tool — `arolsen_search`

**Files:**
- Create: `src/tools/search.ts`
- Create: `test/tools/search.test.ts`

**Step 1: Write failing test**

`test/tools/search.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { makeSearchTool } from "../../src/tools/search.js";
import { CursorStore } from "../../src/cursor.js";
import { AsmxClient } from "../../src/client.js";

function fakeClient(overrides: Partial<AsmxClient> = {}): AsmxClient {
  const c = {
    buildQuery: vi.fn().mockResolvedValue(true),
    getCount: vi.fn().mockImplementation((args: { searchType: string }) =>
      Promise.resolve(args.searchType === "person" ? 51497 : 3932)),
    ...overrides,
  } as unknown as AsmxClient;
  return c;
}

describe("arolsen_search tool", () => {
  it("registers query, fetches both counts, and returns cursor", async () => {
    const client = fakeClient();
    const cursors = new CursorStore();
    const tool = makeSearchTool({ client, cursors });

    const result = await tool.handler({ query: "Schmidt", syn_search: true });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      person_count: 51497,
      archive_count: 3932,
    });
    expect(result.structuredContent.cursor).toBeTruthy();
    expect(cursors.read(result.structuredContent.cursor)).toMatchObject({ offset: 0 });
    expect(result.content[0].text).toMatch(/51,497/);
  });

  it("surfaces upstream errors as isError with error_code", async () => {
    const client = fakeClient({
      buildQuery: vi.fn().mockRejectedValue(Object.assign(new Error("rl"), { code: "rate_limited", retryAfter: 30 })),
    });
    const tool = makeSearchTool({ client, cursors: new CursorStore() });
    const result = await tool.handler({ query: "Schmidt", syn_search: true });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error_code: "rate_limited", retry_after: 30 });
  });
});
```

**Step 2: Run failing**

```bash
npx vitest run test/tools/search.test.ts
```

Expected: module-not-found.

**Step 3: Implement `src/tools/search.ts`**

```ts
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { AsmxClient } from "../client.js";
import { CursorStore } from "../cursor.js";
import { SearchInput, SearchOutput, ErrorOutput } from "../schemas.js";
import { ArolsenError } from "../types.js";

export interface ToolDeps { client: AsmxClient; cursors: CursorStore; }

type Out = z.infer<typeof SearchOutput>;
type Err = z.infer<typeof ErrorOutput>;

export interface ToolResult<T> {
  content: { type: "text"; text: string }[];
  structuredContent: T;
  isError?: boolean;
}

function makeUniqueId(): string {
  return randomBytes(10).toString("base64url").slice(0, 20);
}

export function makeSearchTool(deps: ToolDeps) {
  return {
    name: "arolsen_search",
    description: "Run a search against the Arolsen Archives. Returns total counts and a cursor for paginating into person or archive-unit results via arolsen_search_results.",
    inputSchema: SearchInput,
    outputSchema: SearchOutput,
    async handler(input: z.infer<typeof SearchInput>): Promise<ToolResult<Out | Err>> {
      const uniqueId = makeUniqueId();
      try {
        await deps.client.buildQuery({ uniqueId, strSearch: input.query, synSearch: input.syn_search });
        const [personCount, archiveCount] = await Promise.all([
          deps.client.getCount({ uniqueId, searchType: "person" }),
          deps.client.getCount({ uniqueId, searchType: "archive" }),
        ]);
        const cursor = deps.cursors.issue(uniqueId, 0);
        const out: Out = { person_count: personCount, archive_count: archiveCount, cursor };
        return {
          structuredContent: out,
          content: [{
            type: "text",
            text:
              `Search for "${input.query}" — ${personCount.toLocaleString()} persons and ${archiveCount.toLocaleString()} archive units. ` +
              `Use arolsen_search_results with cursor=${cursor} and kind="persons" or "archives" to retrieve results.`,
          }],
        };
      } catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = { error_code: err.code ?? "upstream_5xx", retry_after: err.retryAfter };
        return {
          isError: true,
          structuredContent: errOut,
          content: [{ type: "text", text: `Arolsen search failed: ${err.message}` }],
        };
      }
    },
  };
}
```

**Step 4: Run tests**

```bash
npx vitest run test/tools/search.test.ts
```

Expected: 2 tests pass.

**Step 5: Commit**

```bash
git add src/tools/search.ts test/tools/search.test.ts
git commit -m "feat: arolsen_search tool"
```

---

## Task 11: Tool — `arolsen_search_results` (with async-extraction polling)

**Files:**
- Create: `src/tools/search_results.ts`
- Create: `test/tools/search_results.test.ts`

**Step 1: Write failing test**

`test/tools/search_results.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeSearchResultsTool } from "../../src/tools/search_results.js";
import { CursorStore } from "../../src/cursor.js";
import { AsmxClient } from "../../src/client.js";

const FIX = (n: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures", n), "utf8"));

describe("arolsen_search_results tool", () => {
  it("returns archive results from a valid cursor", async () => {
    const cursors = new CursorStore();
    const cursor = cursors.issue("uid-1", 0);
    const client = {
      getArchiveList: vi.fn().mockResolvedValue(FIX("arolsen_archive_list.json").d),
    } as unknown as AsmxClient;

    const tool = makeSearchResultsTool({ client, cursors });
    const result = await tool.handler({ cursor, kind: "archives" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.kind).toBe("archives");
    expect(result.structuredContent.results.length).toBeGreaterThan(0);
    expect(result.structuredContent.results[0]).toHaveProperty("desc_id");
    expect(result.structuredContent.next_cursor).toBeTruthy();
  });

  it("returns person results, polling until populated", async () => {
    const cursors = new CursorStore();
    const cursor = cursors.issue("uid-1", 0);
    let calls = 0;
    const client = {
      getPersonList: vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls < 3) return [];
        return [{ LastName: "Schmidt", FirstName: "Adrian" }];
      }),
    } as unknown as AsmxClient;

    const tool = makeSearchResultsTool({ client, cursors, pollIntervalMs: 5, pollBudgetMs: 200 });
    const result = await tool.handler({ cursor, kind: "persons" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.results.length).toBe(1);
    expect((result.structuredContent.results[0] as any).last_name).toBe("Schmidt");
  });

  it("flags still_extracting when persons stay empty past budget", async () => {
    const cursors = new CursorStore();
    const cursor = cursors.issue("uid-1", 0);
    const client = {
      getPersonList: vi.fn().mockResolvedValue([]),
    } as unknown as AsmxClient;

    const tool = makeSearchResultsTool({ client, cursors, pollIntervalMs: 1, pollBudgetMs: 5 });
    const result = await tool.handler({ cursor, kind: "persons" });
    expect(result.structuredContent.still_extracting).toBe(true);
    expect(result.structuredContent.results).toEqual([]);
  });

  it("expired cursor returns isError=cursor_expired", async () => {
    const cursors = new CursorStore();
    const tool = makeSearchResultsTool({
      client: {} as AsmxClient, cursors,
    });
    const result = await tool.handler({ cursor: "ZmFrZQ", kind: "archives" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error_code).toBe("cursor_expired");
  });
});
```

**Step 2: Run failing**

```bash
npx vitest run test/tools/search_results.test.ts
```

Expected: module-not-found.

**Step 3: Implement `src/tools/search_results.ts`**

```ts
import { z } from "zod";
import { AsmxClient } from "../client.js";
import { CursorStore } from "../cursor.js";
import { SearchResultsInput, SearchResultsOutput, ErrorOutput } from "../schemas.js";
import { toArchiveResult, toPersonResult } from "../mappers.js";
import { ArolsenError } from "../types.js";

export interface ToolDeps {
  client: AsmxClient;
  cursors: CursorStore;
  pageSize?: number;        // default 25
  pollIntervalMs?: number;  // default 250
  pollBudgetMs?: number;    // default 2500
}

type Out = z.infer<typeof SearchResultsOutput>;
type Err = z.infer<typeof ErrorOutput>;

export interface ToolResult<T> {
  content: { type: "text"; text: string }[];
  structuredContent: T;
  isError?: boolean;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function makeSearchResultsTool(deps: ToolDeps) {
  const pageSize = deps.pageSize ?? 25;
  const pollInterval = deps.pollIntervalMs ?? 250;
  const pollBudget = deps.pollBudgetMs ?? 2500;

  return {
    name: "arolsen_search_results",
    description: "Fetch a page of person or archive-unit results for a prior arolsen_search call. Persons may take up to ~2s on the first call due to server-side extraction.",
    inputSchema: SearchResultsInput,
    outputSchema: SearchResultsOutput,
    async handler(input: z.infer<typeof SearchResultsInput>): Promise<ToolResult<Out | Err>> {
      let state;
      try { state = deps.cursors.read(input.cursor); }
      catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = { error_code: err.code };
        return { isError: true, structuredContent: errOut, content: [{ type: "text", text: err.message }] };
      }

      try {
        if (input.kind === "archives") {
          const rows = await deps.client.getArchiveList({
            uniqueId: state.uniqueId, offset: state.offset, orderBy: input.order_by ?? "RN",
          });
          const results = rows.map(toArchiveResult);
          const out: Out = {
            kind: "archives",
            results,
            next_cursor: results.length >= pageSize
              ? deps.cursors.advance(input.cursor, state.offset + results.length)
              : undefined,
          };
          return {
            structuredContent: out,
            content: [{ type: "text", text: `${results.length} archive units (offset ${state.offset}).` }],
          };
        }

        // kind === "persons" — poll for async extraction
        const deadline = Date.now() + pollBudget;
        let rows: unknown[] = [];
        let polled = 0;
        while (true) {
          rows = await deps.client.getPersonList({
            uniqueId: state.uniqueId, offset: state.offset, orderBy: input.order_by ?? "LastName",
          });
          polled += 1;
          if (rows.length > 0) break;
          if (Date.now() >= deadline) break;
          await sleep(pollInterval);
        }
        const results = rows.map((r) => toPersonResult(r as Record<string, unknown>));
        const stillExtracting = results.length === 0 && state.offset === 0;
        const out: Out = {
          kind: "persons",
          results,
          next_cursor: results.length >= pageSize
            ? deps.cursors.advance(input.cursor, state.offset + results.length)
            : undefined,
          still_extracting: stillExtracting || undefined,
        };
        return {
          structuredContent: out,
          content: [{
            type: "text",
            text: stillExtracting
              ? "Server is still extracting person results. Try again in a few seconds."
              : `${results.length} persons (offset ${state.offset}, ${polled} poll(s)).`,
          }],
        };
      } catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = { error_code: err.code ?? "upstream_5xx", retry_after: err.retryAfter };
        return { isError: true, structuredContent: errOut, content: [{ type: "text", text: err.message }] };
      }
    },
  };
}
```

**Step 4: Run tests**

```bash
npx vitest run test/tools/search_results.test.ts
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add src/tools/search_results.ts test/tools/search_results.test.ts
git commit -m "feat: arolsen_search_results tool with async-extraction polling"
```

---

## Task 12: Tool — `arolsen_get_archive_unit`

**Files:**
- Create: `src/tools/get_archive_unit.ts`
- Create: `test/tools/get_archive_unit.test.ts`

**Step 1: Write failing test**

`test/tools/get_archive_unit.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeGetArchiveUnitTool } from "../../src/tools/get_archive_unit.js";
import { AsmxClient } from "../../src/client.js";

const FIX = (n: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures", n), "utf8"));

describe("arolsen_get_archive_unit", () => {
  it("returns title, breadcrumb, and metadata", async () => {
    const client = {
      getArchiveInfo: vi.fn().mockResolvedValue(FIX("archive_info.json").d),
    } as unknown as AsmxClient;
    const tool = makeGetArchiveUnitTool({ client });
    const r = await tool.handler({ desc_id: 1096933 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.title).toMatch(/SCHMIDT/);
    expect(r.structuredContent.breadcrumb.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run failing → module-not-found**

**Step 3: Implement `src/tools/get_archive_unit.ts`**

```ts
import { z } from "zod";
import { AsmxClient } from "../client.js";
import { GetArchiveUnitInput, ArchiveUnitOutput, ErrorOutput } from "../schemas.js";
import { toArchiveUnit } from "../mappers.js";
import { ArolsenError } from "../types.js";

export interface ToolDeps { client: AsmxClient; }

type Out = z.infer<typeof ArchiveUnitOutput>;
type Err = z.infer<typeof ErrorOutput>;

export function makeGetArchiveUnitTool(deps: ToolDeps) {
  return {
    name: "arolsen_get_archive_unit",
    description: "Fetch full metadata for an archive unit by descId, including its breadcrumb (TreeData ancestors).",
    inputSchema: GetArchiveUnitInput,
    outputSchema: ArchiveUnitOutput,
    async handler(input: z.infer<typeof GetArchiveUnitInput>) {
      try {
        const raw = await deps.client.getArchiveInfo(input.desc_id);
        const out: Out = toArchiveUnit(raw);
        return {
          structuredContent: out,
          content: [{
            type: "text" as const,
            text: `${out.title} — ${out.breadcrumb.map(b => b.title).join(" / ")}`,
          }],
        };
      } catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = { error_code: err.code ?? "upstream_5xx", retry_after: err.retryAfter };
        return {
          isError: true,
          structuredContent: errOut,
          content: [{ type: "text" as const, text: err.message }],
        };
      }
    },
  };
}
```

**Step 4: Run tests** → 1 passes.

**Step 5: Commit**

```bash
git add src/tools/get_archive_unit.ts test/tools/get_archive_unit.test.ts
git commit -m "feat: arolsen_get_archive_unit tool"
```

---

## Task 13: Tool — `arolsen_get_documents_in_unit`

**Files:**
- Create: `src/tools/get_documents_in_unit.ts`
- Create: `test/tools/get_documents_in_unit.test.ts`

**Step 1: Test**

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeGetDocumentsInUnitTool } from "../../src/tools/get_documents_in_unit.js";
import { AsmxClient } from "../../src/client.js";

const FIX = (n: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures", n), "utf8"));

describe("arolsen_get_documents_in_unit", () => {
  it("returns documents with image + thumbnail resource links", async () => {
    const client = {
      getFileByParent: vi.fn().mockResolvedValue(FIX("file_by_parent.json").d),
      getFileByParentCount: vi.fn().mockResolvedValue(4),
    } as unknown as AsmxClient;
    const tool = makeGetDocumentsInUnitTool({ client });
    const r = await tool.handler({ desc_id: 1096933, offset: 0 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.total).toBe(4);
    expect(r.structuredContent.documents[0].image_link.type).toBe("resource_link");
  });
});
```

**Step 2: Implement `src/tools/get_documents_in_unit.ts`**

```ts
import { z } from "zod";
import { AsmxClient } from "../client.js";
import { GetDocumentsInUnitInput, DocumentsInUnitOutput, ErrorOutput } from "../schemas.js";
import { toDocumentEntry } from "../mappers.js";
import { ArolsenError } from "../types.js";

export interface ToolDeps { client: AsmxClient; pageSize?: number; }

type Out = z.infer<typeof DocumentsInUnitOutput>;
type Err = z.infer<typeof ErrorOutput>;

export function makeGetDocumentsInUnitTool(deps: ToolDeps) {
  const pageSize = deps.pageSize ?? 25;
  return {
    name: "arolsen_get_documents_in_unit",
    description: "List documents (with page image and thumbnail links) in an archive unit. Paginate via offset.",
    inputSchema: GetDocumentsInUnitInput,
    outputSchema: DocumentsInUnitOutput,
    async handler(input: z.infer<typeof GetDocumentsInUnitInput>) {
      try {
        const parentId = String(input.desc_id);
        const [rows, total] = await Promise.all([
          deps.client.getFileByParent({ parentId, offset: input.offset }),
          input.offset === 0
            ? deps.client.getFileByParentCount(parentId)
            : Promise.resolve(0),
        ]);
        const documents = rows.map(toDocumentEntry);
        const out: Out = {
          total,
          documents,
          next_cursor: documents.length >= pageSize ? String(input.offset + documents.length) : undefined,
        };
        return {
          structuredContent: out,
          content: [{ type: "text" as const, text: `${documents.length} documents starting at offset ${input.offset}.` }],
        };
      } catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = { error_code: err.code ?? "upstream_5xx", retry_after: err.retryAfter };
        return { isError: true, structuredContent: errOut, content: [{ type: "text" as const, text: err.message }] };
      }
    },
  };
}
```

**Step 3: Run tests** → passes.

**Step 4: Commit**

```bash
git add src/tools/get_documents_in_unit.ts test/tools/get_documents_in_unit.test.ts
git commit -m "feat: arolsen_get_documents_in_unit tool"
```

---

## Task 14: Tool — `arolsen_get_document`

**Files:**
- Create: `src/tools/get_document.ts`
- Create: `test/tools/get_document.test.ts`

**Step 1: Test**

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeGetDocumentTool } from "../../src/tools/get_document.js";
import { AsmxClient } from "../../src/client.js";

const FIX = (n: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures", n), "utf8"));

describe("arolsen_get_document", () => {
  it("returns page resource_links for the document", async () => {
    const client = {
      getFileByObj: vi.fn().mockResolvedValue(FIX("file_by_obj.json").d),
    } as unknown as AsmxClient;
    const tool = makeGetDocumentTool({ client });
    const r = await tool.handler({ doc_id: "77266" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.pages.length).toBeGreaterThan(0);
    expect(r.structuredContent.pages[0].type).toBe("resource_link");
  });
});
```

**Step 2: Implement `src/tools/get_document.ts`**

```ts
import { z } from "zod";
import { AsmxClient } from "../client.js";
import { GetDocumentInput, DocumentOutput, ErrorOutput } from "../schemas.js";
import { toResourceLink } from "../mappers.js";
import { ArolsenError } from "../types.js";

export interface ToolDeps { client: AsmxClient; }

type Out = z.infer<typeof DocumentOutput>;
type Err = z.infer<typeof ErrorOutput>;

export function makeGetDocumentTool(deps: ToolDeps) {
  return {
    name: "arolsen_get_document",
    description: "Fetch all page images for a single document by docId.",
    inputSchema: GetDocumentInput,
    outputSchema: DocumentOutput,
    async handler(input: z.infer<typeof GetDocumentInput>) {
      try {
        const rows = await deps.client.getFileByObj(input.doc_id);
        const pages = rows.map(r => toResourceLink(r).image_link);
        const out: Out = { doc_id: input.doc_id, pages };
        return {
          structuredContent: out,
          content: [{ type: "text" as const, text: `${pages.length} page(s) for document ${input.doc_id}.` }],
        };
      } catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = { error_code: err.code ?? "upstream_5xx", retry_after: err.retryAfter };
        return { isError: true, structuredContent: errOut, content: [{ type: "text" as const, text: err.message }] };
      }
    },
  };
}
```

**Step 3: Run tests** → passes.

**Step 4: Commit**

```bash
git add src/tools/get_document.ts test/tools/get_document.test.ts
git commit -m "feat: arolsen_get_document tool"
```

---

## Task 15: Server entry — wire all tools onto stdio

**Files:**
- Create: `src/index.ts`

**Step 1: Look up the SDK's current registration API**

```bash
npx -y @modelcontextprotocol/sdk --help 2>&1 | head -10 || true
ls node_modules/@modelcontextprotocol/sdk/dist/cjs/server/ 2>&1 | head
```

Note: the SDK exposes `Server` from `@modelcontextprotocol/sdk/server/index.js` and `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`. As of v1.x there is also `McpServer` with a higher-level `registerTool({ inputSchema, outputSchema, handler })` API. Prefer `McpServer` if available; fall back to manual `setRequestHandler(ListToolsRequestSchema, ...)` + `setRequestHandler(CallToolRequestSchema, ...)` if the high-level API isn't there. Verify by reading the SDK README in `node_modules/@modelcontextprotocol/sdk/README.md`.

**Step 2: Write `src/index.ts`** (high-level form; adjust if `McpServer` doesn't exist)

```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AsmxClient } from "./client.js";
import { CursorStore } from "./cursor.js";
import { makeSearchTool } from "./tools/search.js";
import { makeSearchResultsTool } from "./tools/search_results.js";
import { makeGetArchiveUnitTool } from "./tools/get_archive_unit.js";
import { makeGetDocumentsInUnitTool } from "./tools/get_documents_in_unit.js";
import { makeGetDocumentTool } from "./tools/get_document.js";

async function main() {
  const client = new AsmxClient();
  const cursors = new CursorStore({ max: 256 });

  const tools = [
    makeSearchTool({ client, cursors }),
    makeSearchResultsTool({ client, cursors }),
    makeGetArchiveUnitTool({ client }),
    makeGetDocumentsInUnitTool({ client }),
    makeGetDocumentTool({ client }),
  ];

  const server = new McpServer({ name: "arolsen-mcp", version: "0.1.0" });

  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.inputSchema.shape ?? t.inputSchema,
        outputSchema: t.outputSchema.shape ?? t.outputSchema,
      },
      async (args: unknown) => {
        const parsed = t.inputSchema.parse(args);
        return await t.handler(parsed as never);
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Step 3: Build it**

```bash
npx tsc
```

Expected: clean build, `dist/index.js` produced.

**Step 4: Smoke-launch and check it lists tools**

```bash
node dist/index.js < /dev/null &
SERVER_PID=$!
sleep 0.5
kill $SERVER_PID 2>/dev/null || true
```

Expected: process starts and exits cleanly when stdin closes.

For an actual handshake test, send an `initialize` + `tools/list` JSON-RPC pair on stdin:

```bash
(
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
  sleep 0.2
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 0.2
) | node dist/index.js | head -40
```

Expected: see all five `arolsen_*` tool names in the response.

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: stdio MCP server wiring all five tools"
```

---

## Task 16: Live smoke test

**Files:**
- Create: `vitest.smoke.config.ts`
- Create: `test/smoke/live.test.ts`

**Step 1: Write smoke config**

`vitest.smoke.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["test/smoke/**/*.test.ts"], testTimeout: 30_000 },
});
```

**Step 2: Write smoke test**

`test/smoke/live.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AsmxClient } from "../../src/client.js";
import { CursorStore } from "../../src/cursor.js";
import { makeSearchTool } from "../../src/tools/search.js";
import { makeSearchResultsTool } from "../../src/tools/search_results.js";

describe("live Arolsen API", () => {
  it("searches Schmidt and returns counts", async () => {
    const client = new AsmxClient();
    const cursors = new CursorStore();
    const search = makeSearchTool({ client, cursors });
    const r = await search.handler({ query: "Schmidt", syn_search: true });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.person_count).toBeGreaterThan(0);
    expect(r.structuredContent.archive_count).toBeGreaterThan(0);

    const results = makeSearchResultsTool({ client, cursors });
    const archives = await results.handler({ cursor: r.structuredContent.cursor, kind: "archives" });
    expect(archives.structuredContent.results.length).toBeGreaterThan(0);
  });
});
```

**Step 3: Run smoke**

```bash
npx vitest run --config vitest.smoke.config.ts
```

Expected: passes (requires internet). If it fails, print the failure but **do not block the plan** — the unit tests are the source of truth for correctness.

**Step 4: Commit**

```bash
git add vitest.smoke.config.ts test/smoke/live.test.ts
git commit -m "test: live smoke test against Arolsen API"
```

---

## Task 17: README with install + Claude Desktop snippet + ToS note

**Files:**
- Create: `README.md`

**Step 1: Write `README.md`**

````markdown
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
| `arolsen_search_results(cursor, kind, order_by?)` | Paginate persons or archive units. |
| `arolsen_get_archive_unit(desc_id)` | Full metadata + breadcrumb for an archive unit. |
| `arolsen_get_documents_in_unit(desc_id, offset?)` | Image-bearing documents inside a unit. |
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
````

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with install, config, and ToS note"
```

---

## Task 18: Final verification

**Step 1: Run the full unit suite**

```bash
npm test
```

Expected: all tests pass (≈25–30 tests total).

**Step 2: Build cleanly**

```bash
npm run build
```

Expected: no TS errors; `dist/index.js` exists.

**Step 3: Manual handshake**

```bash
(
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
  sleep 0.2
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 0.5
) | node dist/index.js | head -60
```

Expected: see all five `arolsen_*` tool names in the `tools/list` response.

**Step 4 (optional): Live end-to-end smoke**

```bash
npm run smoke
```

Expected: passes. If it fails on network, note it and move on — unit tests are the source of truth.

**Step 5: No commit needed** — verification only.
