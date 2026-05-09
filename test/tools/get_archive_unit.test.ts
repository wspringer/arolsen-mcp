import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AsmxClient } from "../../src/client.js";
import { makeGetArchiveUnitTool } from "../../src/tools/get_archive_unit.js";

const FIX = (n: string) =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures", n), "utf8"));

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

  it("surfaces document_num and map_data per the design spec", async () => {
    const client = {
      getArchiveInfo: vi.fn().mockResolvedValue(FIX("archive_info.json").d),
    } as unknown as AsmxClient;
    const tool = makeGetArchiveUnitTool({ client });
    const r = await tool.handler({ desc_id: 1096933 });
    expect(r.structuredContent.document_num).toBe("2");
    expect(r.structuredContent.map_data).toEqual([]);
  });
});
