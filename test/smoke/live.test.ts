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
