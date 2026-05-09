import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AsmxClient } from "../../src/client.js";
import { makeGetDocumentsInUnitTool } from "../../src/tools/get_documents_in_unit.js";

const FIX = (n: string) =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures", n), "utf8"));

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
    expect(r.structuredContent.documents[0].image_link.type).toBe(
      "resource_link",
    );
  });

  it("surfaces resource_link content blocks alongside the text summary", async () => {
    const client = {
      getFileByParent: vi.fn().mockResolvedValue(FIX("file_by_parent.json").d),
      getFileByParentCount: vi.fn().mockResolvedValue(4),
    } as unknown as AsmxClient;
    const tool = makeGetDocumentsInUnitTool({ client });
    const r = await tool.handler({ desc_id: 1096933, offset: 0 });
    expect(r.content[0]).toMatchObject({ type: "text" });
    const links = r.content.filter((b) => b.type === "resource_link");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toMatchObject({
      type: "resource_link",
      mimeType: "image/jpeg",
    });
  });

  it("uses next_offset (numeric) once a full page is returned", async () => {
    // Fake a full page of 2 docs at pageSize=2 to force next_offset.
    const rows = FIX("file_by_parent.json").d.slice(0, 2);
    const client = {
      getFileByParent: vi.fn().mockResolvedValue(rows),
      getFileByParentCount: vi.fn().mockResolvedValue(10),
    } as unknown as AsmxClient;
    const tool = makeGetDocumentsInUnitTool({ client, pageSize: 2 });
    const r = await tool.handler({ desc_id: 1096933, offset: 4 });
    expect(r.structuredContent.next_offset).toBe(6);
    // No legacy next_cursor field.
    expect(
      (r.structuredContent as Record<string, unknown>).next_cursor,
    ).toBeUndefined();
  });
});
