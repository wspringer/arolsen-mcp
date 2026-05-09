import { randomBytes } from "node:crypto";
import type { z } from "zod";
import type { AsmxClient } from "../client.js";
import type { CursorStore } from "../cursor.js";
import { type ErrorOutput, SearchInput, SearchOutput } from "../schemas.js";
import { type ToolResult, wrapToolErrors } from "./_helpers.js";

export interface ToolDeps {
  client: AsmxClient;
  cursors: CursorStore;
}

type Out = z.infer<typeof SearchOutput>;
type Err = z.infer<typeof ErrorOutput>;

function makeUniqueId(): string {
  return randomBytes(10).toString("base64url").slice(0, 20);
}

export function makeSearchTool(deps: ToolDeps) {
  return {
    name: "arolsen_search",
    description:
      "Run a search against the Arolsen Archives. Returns total counts and a cursor for paginating into person or archive-unit results via arolsen_search_results.",
    inputSchema: SearchInput,
    outputSchema: SearchOutput,
    async handler(
      input: z.infer<typeof SearchInput>,
    ): Promise<ToolResult<Out | Err>> {
      return wrapToolErrors<Out>(async () => {
        const uniqueId = makeUniqueId();
        await deps.client.buildQuery({
          uniqueId,
          strSearch: input.query,
          synSearch: input.syn_search,
        });
        const [personCount, archiveCount] = await Promise.all([
          deps.client.getCount({ uniqueId, searchType: "person" }),
          deps.client.getCount({ uniqueId, searchType: "archive" }),
        ]);
        const cursor = deps.cursors.issue(uniqueId, 0);
        const out: Out = {
          person_count: personCount,
          archive_count: archiveCount,
          cursor,
        };
        return {
          structuredContent: out,
          content: [
            {
              type: "text",
              text:
                `Search for "${input.query}" — ${personCount.toLocaleString()} persons and ${archiveCount.toLocaleString()} archive units. ` +
                `Use arolsen_search_results with cursor=${cursor} and kind="persons" or "archives" to retrieve results.`,
            },
          ],
        };
      }, "Arolsen search failed");
    },
  };
}
