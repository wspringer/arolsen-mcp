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

// Surface page images as resource_link content blocks so MCP clients
// scanning content[] can pick them up directly. Cap is defensive — a
// single document rarely has >25 pages, but `pages` in
// structuredContent is always complete.
const RESOURCE_LINK_CAP = 25;

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
        const resourceLinks = pages.slice(0, RESOURCE_LINK_CAP).map((p) => ({
          type: "resource_link" as const,
          uri: p.uri,
          mimeType: p.mimeType,
          name: p.name,
        }));
        return {
          structuredContent: out,
          content: [
            {
              type: "text" as const,
              text: `${pages.length} page(s) for document ${input.doc_id}.`,
            },
            ...resourceLinks,
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
