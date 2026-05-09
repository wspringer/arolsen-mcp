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
  pollIntervalMs?: number; // default 250
  pollBudgetMs?: number; // default 2500
}

type Out = z.infer<typeof SearchResultsOutput>;
type Err = z.infer<typeof ErrorOutput>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeSearchResultsTool(deps: ToolDeps) {
  const pageSize = deps.pageSize ?? 25;
  const pollInterval = deps.pollIntervalMs ?? 250;
  const pollBudget = deps.pollBudgetMs ?? 2500;

  return {
    name: "arolsen_search_results",
    description:
      "Fetch a page of person or archive-unit results for a prior arolsen_search call. Persons may take up to ~2s on the first call due to server-side extraction.",
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

        // kind === "persons" — poll for async extraction
        const deadline = Date.now() + pollBudget;
        let rows: unknown[] = [];
        let polled = 0;
        while (true) {
          rows = await deps.client.getPersonList({
            uniqueId: state.uniqueId,
            offset: state.offset,
            orderBy: input.order_by ?? "LastName",
          });
          polled += 1;
          if (rows.length > 0) break;
          if (Date.now() >= deadline) break;
          await sleep(pollInterval);
        }
        const results = rows.map((r) =>
          toPersonResult(r as Record<string, unknown>),
        );
        const stillExtracting = results.length === 0 && state.offset === 0;
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
          still_extracting: stillExtracting || undefined,
        };
        return {
          structuredContent: out,
          content: [
            {
              type: "text",
              text: stillExtracting
                ? "Server is still extracting person results. Try again in a few seconds."
                : `${results.length} persons (offset ${state.offset}, ${polled} poll(s)).`,
            },
          ],
        };
      }, "Arolsen search_results failed");
    },
  };
}
