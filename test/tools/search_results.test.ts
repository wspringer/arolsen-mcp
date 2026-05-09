import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AsmxClient } from "../../src/client.js";
import { CursorStore } from "../../src/cursor.js";
import { makeSearchResultsTool } from "../../src/tools/search_results.js";

const FIX = (n: string) =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures", n), "utf8"));

describe("arolsen_search_results tool", () => {
  it("returns archive results from a valid cursor", async () => {
    const cursors = new CursorStore();
    const cursor = cursors.issue("uid-1", 0);
    const client = {
      getArchiveList: vi
        .fn()
        .mockResolvedValue(FIX("arolsen_archive_list.json").d),
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

    const tool = makeSearchResultsTool({
      client,
      cursors,
      pollIntervalMs: 5,
      pollBudgetMs: 200,
    });
    const result = await tool.handler({ cursor, kind: "persons" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.results.length).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(2); // proves polling
    expect(result.structuredContent.still_extracting).toBeFalsy();
    const first = result.structuredContent.results[0] as {
      last_name: string | null;
    };
    expect(first.last_name).toBe("Schmidt");
  });

  it("flags still_extracting when persons stay empty past budget", async () => {
    const cursors = new CursorStore();
    const cursor = cursors.issue("uid-1", 0);
    const client = {
      getPersonList: vi.fn().mockResolvedValue([]),
    } as unknown as AsmxClient;

    const tool = makeSearchResultsTool({
      client,
      cursors,
      pollIntervalMs: 1,
      pollBudgetMs: 5,
    });
    const result = await tool.handler({ cursor, kind: "persons" });
    expect(result.structuredContent.still_extracting).toBe(true);
    expect(result.structuredContent.results).toEqual([]);
  });

  it("expired cursor returns isError=cursor_expired", async () => {
    const cursors = new CursorStore();
    const tool = makeSearchResultsTool({
      client: {} as AsmxClient,
      cursors,
    });
    const result = await tool.handler({ cursor: "ZmFrZQ", kind: "archives" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error_code).toBe("cursor_expired");
  });
});
