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
