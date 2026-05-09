import type { z } from "zod";
import type { AsmxClient } from "../client.js";
import { toResourceLink } from "../mappers.js";
import {
  DocumentOutput,
  type ErrorOutput,
  GetDocumentInput,
} from "../schemas.js";
import type { ArolsenError } from "../types.js";

export interface ToolDeps {
  client: AsmxClient;
}

type Out = z.infer<typeof DocumentOutput>;
type Err = z.infer<typeof ErrorOutput>;

export function makeGetDocumentTool(deps: ToolDeps) {
  return {
    name: "arolsen_get_document",
    description: "Fetch all page images for a single document by docId.",
    inputSchema: GetDocumentInput,
    outputSchema: DocumentOutput,
    async handler(input: z.infer<typeof GetDocumentInput>) {
      try {
        const rows = await deps.client.getFileByObj(input.doc_id);
        const pages = rows.map((r) => toResourceLink(r).image_link);
        const out: Out = { doc_id: input.doc_id, pages };
        return {
          structuredContent: out,
          content: [
            {
              type: "text" as const,
              text: `${pages.length} page(s) for document ${input.doc_id}.`,
            },
          ],
        };
      } catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = {
          error_code: err.code ?? "upstream_5xx",
          retry_after: err.retryAfter,
        };
        return {
          isError: true,
          structuredContent: errOut,
          content: [{ type: "text" as const, text: err.message }],
        };
      }
    },
  };
}
