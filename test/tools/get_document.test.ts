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
