import type { z } from "zod";
import type { AsmxClient } from "../client.js";
import type { CursorStore } from "../cursor.js";
import { toArchiveResult, toPersonResult } from "../mappers.js";
import {
  type ErrorOutput,
  SearchResultsInput,
  SearchResultsOutput,
} from "../schemas.js";
import { type ToolResult, wrapToolErrors } from "./_helpers.js";

export interface ToolDeps {
  client: AsmxClient;
  cursors: CursorStore;
  pageSize?: number; // default 25
}

type Out = z.infer<typeof SearchResultsOutput>;
type Err = z.infer<typeof ErrorOutput>;

export function makeSearchResultsTool(deps: ToolDeps) {
  const pageSize = deps.pageSize ?? 25;

  return {
    name: "arolsen_search_results",
    description:
      "Fetch a page of person or archive-unit results for a prior arolsen_search call.",
    inputSchema: SearchResultsInput,
    outputSchema: SearchResultsOutput,
    async handler(
      input: z.infer<typeof SearchResultsInput>,
    ): Promise<ToolResult<Out | Err>> {
      return wrapToolErrors<Out>(async () => {
        const state = deps.cursors.read(input.cursor);

        if (input.kind === "archives") {
          const rows = await deps.client.getArchiveList({
            uniqueId: state.uniqueId,
            offset: state.offset,
            orderBy: input.order_by ?? "RN",
          });
          const results = rows.map(toArchiveResult);
          const out: Out = {
            kind: "archives",
            results,
            next_cursor:
              results.length >= pageSize
                ? deps.cursors.advance(
                    input.cursor,
                    state.offset + results.length,
                  )
                : undefined,
          };
          return {
            structuredContent: out,
            content: [
              {
                type: "text",
                text: `${results.length} archive units (offset ${state.offset}).`,
              },
            ],
          };
        }

        const rows = await deps.client.getPersonList({
          uniqueId: state.uniqueId,
          offset: state.offset,
          orderBy: input.order_by ?? "LastName",
        });
        const results = rows.map((r) =>
          toPersonResult(r as Record<string, unknown>),
        );
        const out: Out = {
          kind: "persons",
          results,
          next_cursor:
            results.length >= pageSize
              ? deps.cursors.advance(
                  input.cursor,
                  state.offset + results.length,
                )
              : undefined,
        };
        return {
          structuredContent: out,
          content: [
            {
              type: "text",
              text: `${results.length} persons (offset ${state.offset}).`,
            },
          ],
        };
      }, "Arolsen search_results failed");
    },
  };
}
