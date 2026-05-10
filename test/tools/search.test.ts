import { describe, expect, it, vi } from "vitest";
import type { AsmxClient } from "../../src/client.js";
import { CursorStore } from "../../src/cursor.js";
import { makeSearchTool } from "../../src/tools/search.js";

function fakeClient(overrides: Partial<AsmxClient> = {}): AsmxClient {
  const c = {
    buildQuery: vi.fn().mockResolvedValue(true),
    getCount: vi
      .fn()
      .mockImplementation((args: { searchType: string }) =>
        Promise.resolve(args.searchType === "person" ? 51497 : 3932),
      ),
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
    expect(cursors.read(result.structuredContent.cursor)).toMatchObject({
      offset: 0,
    });
    expect(result.content[0].text).toMatch(/51,497/);
  });

  it("applies named filters via BuildGridFilter and uses useFilter on counts", async () => {
    const applyGridFilter = vi.fn().mockResolvedValue(null);
    const getCount = vi
      .fn()
      .mockImplementation((args: { searchType: string; useFilter: boolean }) =>
        Promise.resolve(args.searchType === "person" ? 11 : 0),
      );
    const client = fakeClient({
      applyGridFilter,
      getCount,
    } as unknown as Partial<AsmxClient>);
    const tool = makeSearchTool({ client, cursors: new CursorStore() });

    const result = await tool.handler({
      query: "Mathilde",
      syn_search: true,
      first_name: "Mathilde",
      birth_year: 1914,
    });

    expect(result.isError).toBeFalsy();
    expect(applyGridFilter).toHaveBeenCalledTimes(1);
    const call = applyGridFilter.mock.calls[0][0] as {
      type: string;
      filter: {
        Filters: Array<{ Field: string; Operator: string; Value: string }>;
      };
    };
    expect(call.type).toBe("person");
    // FirstName=contains "Mathilde", Dob exclusive bounds for year 1914
    expect(call.filter.Filters).toEqual([
      { Field: "FirstName", Operator: "contains", Value: "Mathilde" },
      { Field: "Dob", Operator: "gt", Value: "1913" },
      { Field: "Dob", Operator: "lt", Value: "1915" },
    ]);
    // Person count must be requested with useFilter=true; archive without.
    const personCall = getCount.mock.calls.find(
      (c: [{ searchType: string }]) => c[0].searchType === "person",
    );
    const archiveCall = getCount.mock.calls.find(
      (c: [{ searchType: string }]) => c[0].searchType === "archive",
    );
    expect(personCall?.[0]).toMatchObject({ useFilter: true });
    expect(archiveCall?.[0]).toMatchObject({ useFilter: false });
    expect(result.content[0].text).toMatch(/3 person filters/);
  });

  it("forwards extra_filters to the right grid type", async () => {
    const applyGridFilter = vi.fn().mockResolvedValue(null);
    const client = fakeClient({
      applyGridFilter,
    } as unknown as Partial<AsmxClient>);
    const tool = makeSearchTool({ client, cursors: new CursorStore() });

    await tool.handler({
      query: "Schmidt",
      syn_search: true,
      extra_filters: [
        {
          field: "Religion",
          operator: "contains",
          value: "jud",
          type: "person",
        },
        {
          field: "Title",
          operator: "contains",
          value: "Vught",
          type: "archive",
        },
      ],
    });

    expect(applyGridFilter).toHaveBeenCalledTimes(2);
    const types = applyGridFilter.mock.calls.map(
      (c: [{ type: string }]) => c[0].type,
    );
    expect(types.sort()).toEqual(["archive", "person"]);
  });

  it("skips applyGridFilter when no filters are set, and uses useFilter=false", async () => {
    const applyGridFilter = vi.fn().mockResolvedValue(null);
    const getCount = vi.fn().mockResolvedValue(7);
    const client = fakeClient({
      applyGridFilter,
      getCount,
    } as unknown as Partial<AsmxClient>);
    const tool = makeSearchTool({ client, cursors: new CursorStore() });

    await tool.handler({ query: "Mathilde Leeser", syn_search: true });
    expect(applyGridFilter).not.toHaveBeenCalled();
    for (const c of getCount.mock.calls) {
      expect(c[0]).toMatchObject({ useFilter: false });
    }
  });

  it("surfaces upstream errors as isError with error_code", async () => {
    const client = fakeClient({
      buildQuery: vi.fn().mockRejectedValue(
        Object.assign(new Error("rl"), {
          code: "rate_limited",
          retryAfter: 30,
        }),
      ),
    });
    const tool = makeSearchTool({ client, cursors: new CursorStore() });
    const result = await tool.handler({ query: "Schmidt", syn_search: true });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error_code: "rate_limited",
      retry_after: 30,
    });
  });
});
