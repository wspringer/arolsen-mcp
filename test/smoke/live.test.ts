import { describe, expect, it } from "vitest";
import { AsmxClient } from "../../src/client.js";
import { CursorStore } from "../../src/cursor.js";
import { makeSearchTool } from "../../src/tools/search.js";
import { makeSearchResultsTool } from "../../src/tools/search_results.js";

// Hits the live Arolsen API. Run with `npm run smoke`; requires internet.
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
    const archives = await results.handler({
      cursor: r.structuredContent.cursor,
      kind: "archives",
    });
    expect(archives.structuredContent.results.length).toBeGreaterThan(0);
  });

  // Pins the website parity that the cookie/session fix restored: searching
  // "Mathilde Leeser" (with synonym matching) returns exactly 7 persons and
  // 0 archive units — same as collections.arolsen-archives.org. Without the
  // ASP.NET_SessionId cookie persistence, counts come back as the global
  // archive totals (33M / 4M) and the person list is empty.
  it("matches the website for Mathilde Leeser (7 persons, 0 archives)", async () => {
    const client = new AsmxClient();
    const cursors = new CursorStore();
    const search = makeSearchTool({ client, cursors });
    const r = await search.handler({
      query: "Mathilde Leeser",
      syn_search: true,
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.person_count).toBe(7);
    expect(r.structuredContent.archive_count).toBe(0);

    const results = makeSearchResultsTool({ client, cursors });
    const persons = await results.handler({
      cursor: r.structuredContent.cursor,
      kind: "persons",
    });
    expect(persons.isError).toBeFalsy();
    expect(persons.structuredContent.kind).toBe("persons");
    expect(persons.structuredContent.results.length).toBe(7);
    const top = persons.structuredContent.results[0] as {
      last_name: string | null;
      first_name: string | null;
      obj_id: string | null;
      desc_id: string | null;
      signature: string | null;
    };
    expect(top.last_name).toBe("CRACAU");
    expect(top.first_name).toBe("Eliezer");
    // Drill-down ids must be present so callers can move from a person hit
    // to the underlying document/archive unit without leaving the MCP.
    expect(top.obj_id).toMatch(/^\d+$/);
    expect(top.desc_id).toMatch(/^\d+$/);
    expect(top.signature).toBeTruthy();
  });

  // Pins the structured-filter path. The original "Mathilde Leeser" search
  // missed Mathilde LEEZER because phonetic matching collapsed the surname
  // into different neighborhoods. Searching with first_name + birth_year
  // ignores surname-spelling drift entirely and finds her on the first try.
  it("finds Mathilde Leezer via first_name + birth_year filters", async () => {
    const client = new AsmxClient();
    const cursors = new CursorStore();
    const search = makeSearchTool({ client, cursors });

    const r = await search.handler({
      // Free-text "Mathilde" seeds the index; filters narrow it.
      query: "Mathilde",
      syn_search: true,
      first_name: "Mathilde",
      birth_year: 1914,
    });
    expect(r.isError).toBeFalsy();
    // Filters must shrink the count well below the unfiltered "Mathilde"
    // total of ~32k. We don't pin an exact number (upstream churns) but
    // require it to be a tractable range.
    expect(r.structuredContent.person_count).toBeGreaterThan(0);
    expect(r.structuredContent.person_count).toBeLessThan(2000);

    const results = makeSearchResultsTool({ client, cursors });
    const persons = await results.handler({
      cursor: r.structuredContent.cursor,
      kind: "persons",
    });
    expect(persons.isError).toBeFalsy();
    type P = {
      last_name: string | null;
      first_name: string | null;
      birth_date: string | null;
    };
    const hits = persons.structuredContent.results as P[];
    const leezer = hits.find(
      (p) => p.last_name === "LEEZER" && /Mathild/.test(p.first_name ?? ""),
    );
    expect(
      leezer,
      "Mathilde LEEZER should be in the filtered results",
    ).toBeDefined();
    expect(leezer?.birth_date).toMatch(/1914/);
  });
});
