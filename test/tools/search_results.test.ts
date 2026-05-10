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

  it("returns person results in a single upstream call, including drill-down ids", async () => {
    const cursors = new CursorStore();
    const cursor = cursors.issue("uid-1", 0);
    const getPersonList = vi.fn().mockResolvedValue([
      {
        LastName: "CRACAU",
        FirstName: "Eliezer",
        Dob: "01/13/1859",
        ObjId: 130275901,
        DescId: "2574879",
        Signature: "1.2.4.2 - Index cards from the Judenrat",
      },
    ]);
    const client = { getPersonList } as unknown as AsmxClient;

    const tool = makeSearchResultsTool({ client, cursors });
    const result = await tool.handler({ cursor, kind: "persons" });

    expect(result.isError).toBeFalsy();
    expect(getPersonList).toHaveBeenCalledTimes(1);
    expect(result.structuredContent.results.length).toBe(1);
    const first = result.structuredContent.results[0] as {
      last_name: string | null;
      birth_date: string | null;
      obj_id: string | null;
      desc_id: string | null;
      signature: string | null;
    };
    expect(first.last_name).toBe("CRACAU");
    expect(first.birth_date).toBe("01/13/1859");
    // ObjId arrives as a number from upstream; we expose it as string so it
    // can be passed straight to arolsen_get_document.
    expect(first.obj_id).toBe("130275901");
    expect(first.desc_id).toBe("2574879");
    expect(first.signature).toMatch(/Judenrat/);
  });

  it("returns an empty array (not a still_extracting flag) when persons match nothing", async () => {
    const cursors = new CursorStore();
    const cursor = cursors.issue("uid-1", 0);
    const client = {
      getPersonList: vi.fn().mockResolvedValue([]),
    } as unknown as AsmxClient;

    const tool = makeSearchResultsTool({ client, cursors });
    const result = await tool.handler({ cursor, kind: "persons" });
    expect(result.structuredContent.results).toEqual([]);
    expect(
      (result.structuredContent as Record<string, unknown>).still_extracting,
    ).toBeUndefined();
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
