import type { z } from "zod";
import type { AsmxClient } from "../client.js";
import { toDocumentEntry } from "../mappers.js";
import {
  DocumentsInUnitOutput,
  type ErrorOutput,
  GetDocumentsInUnitInput,
} from "../schemas.js";
import { type ToolResult, wrapToolErrors } from "./_helpers.js";

export interface ToolDeps {
  client: AsmxClient;
  pageSize?: number;
}

type Out = z.infer<typeof DocumentsInUnitOutput>;
type Err = z.infer<typeof ErrorOutput>;

// MCP clients that scan content[] for embeddable resources should see
// a resource_link per document alongside the text summary. Capped to
// keep response size bounded; structuredContent always has the full set.
const RESOURCE_LINK_CAP = 25;

export function makeGetDocumentsInUnitTool(deps: ToolDeps) {
  const pageSize = deps.pageSize ?? 25;
  return {
    name: "arolsen_get_documents_in_unit",
    description:
      "List documents (with page image and thumbnail links) in an archive unit. Paginate via offset/next_offset (the upstream call is stateless, so no opaque cursor).",
    inputSchema: GetDocumentsInUnitInput,
    outputSchema: DocumentsInUnitOutput,
    async handler(
      input: z.infer<typeof GetDocumentsInUnitInput>,
    ): Promise<ToolResult<Out | Err>> {
      return wrapToolErrors<Out>(async () => {
        const parentId = String(input.desc_id);
        const rows = await deps.client.getFileByParent({
          parentId,
          offset: input.offset,
        });
        const total =
          input.offset === 0
            ? await deps.client.getFileByParentCount(parentId)
            : 0;
        const documents = rows.map(toDocumentEntry);
        const out: Out = {
          total,
          documents,
          next_offset:
            documents.length >= pageSize
              ? input.offset + documents.length
              : undefined,
        };
        const resourceLinks = documents
          .slice(0, RESOURCE_LINK_CAP)
          .map((d) => ({
            type: "resource_link" as const,
            uri: d.image_link.uri,
            mimeType: d.image_link.mimeType,
            name: d.image_link.name,
          }));
        return {
          structuredContent: out,
          content: [
            {
              type: "text",
              text: `${documents.length} documents starting at offset ${input.offset}.`,
            },
            ...resourceLinks,
          ],
        };
      }, "Arolsen get_documents_in_unit failed");
    },
  };
}
