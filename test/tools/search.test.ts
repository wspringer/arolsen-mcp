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
