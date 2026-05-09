import type { z } from "zod";
import type { AsmxClient } from "../client.js";
import { toArchiveUnit } from "../mappers.js";
import {
  ArchiveUnitOutput,
  type ErrorOutput,
  GetArchiveUnitInput,
} from "../schemas.js";
import { type ToolResult, wrapToolErrors } from "./_helpers.js";

export interface ToolDeps {
  client: AsmxClient;
}

type Out = z.infer<typeof ArchiveUnitOutput>;
type Err = z.infer<typeof ErrorOutput>;

export function makeGetArchiveUnitTool(deps: ToolDeps) {
  return {
    name: "arolsen_get_archive_unit",
    description:
      "Fetch full metadata for an archive unit by descId, including its breadcrumb (TreeData ancestors).",
    inputSchema: GetArchiveUnitInput,
    outputSchema: ArchiveUnitOutput,
    async handler(
      input: z.infer<typeof GetArchiveUnitInput>,
    ): Promise<ToolResult<Out | Err>> {
      return wrapToolErrors<Out>(async () => {
        const raw = await deps.client.getArchiveInfo(input.desc_id);
        const out: Out = toArchiveUnit(raw);
        return {
          structuredContent: out,
          content: [
            {
              type: "text",
              text: `${out.title} — ${out.breadcrumb.map((b) => b.title).join(" / ")}`,
            },
          ],
        };
      }, "Arolsen get_archive_unit failed");
    },
  };
}
