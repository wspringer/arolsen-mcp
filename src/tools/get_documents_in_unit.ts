import { z } from "zod";
import { AsmxClient } from "../client.js";
import { GetDocumentsInUnitInput, DocumentsInUnitOutput, ErrorOutput } from "../schemas.js";
import { toDocumentEntry } from "../mappers.js";
import { ArolsenError } from "../types.js";

export interface ToolDeps { client: AsmxClient; pageSize?: number; }

type Out = z.infer<typeof DocumentsInUnitOutput>;
type Err = z.infer<typeof ErrorOutput>;

export function makeGetDocumentsInUnitTool(deps: ToolDeps) {
  const pageSize = deps.pageSize ?? 25;
  return {
    name: "arolsen_get_documents_in_unit",
    description: "List documents (with page image and thumbnail links) in an archive unit. Paginate via offset.",
    inputSchema: GetDocumentsInUnitInput,
    outputSchema: DocumentsInUnitOutput,
    async handler(input: z.infer<typeof GetDocumentsInUnitInput>) {
      try {
        const parentId = String(input.desc_id);
        const [rows, total] = await Promise.all([
          deps.client.getFileByParent({ parentId, offset: input.offset }),
          input.offset === 0
            ? deps.client.getFileByParentCount(parentId)
            : Promise.resolve(0),
        ]);
        const documents = rows.map(toDocumentEntry);
        const out: Out = {
          total,
          documents,
          next_cursor: documents.length >= pageSize ? String(input.offset + documents.length) : undefined,
        };
        return {
          structuredContent: out,
          content: [{ type: "text" as const, text: `${documents.length} documents starting at offset ${input.offset}.` }],
        };
      } catch (e: unknown) {
        const err = e as ArolsenError;
        const errOut: Err = { error_code: err.code ?? "upstream_5xx", retry_after: err.retryAfter };
        return { isError: true, structuredContent: errOut, content: [{ type: "text" as const, text: err.message }] };
      }
    },
  };
}
