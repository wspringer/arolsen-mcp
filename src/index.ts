#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AsmxClient } from "./client.js";
import { CursorStore } from "./cursor.js";
import { makeGetArchiveUnitTool } from "./tools/get_archive_unit.js";
import { makeGetDocumentTool } from "./tools/get_document.js";
import { makeGetDocumentsInUnitTool } from "./tools/get_documents_in_unit.js";
import { makeSearchTool } from "./tools/search.js";
import { makeSearchResultsTool } from "./tools/search_results.js";

async function main() {
  const client = new AsmxClient();
  const cursors = new CursorStore({ max: 256 });

  const tools = [
    makeSearchTool({ client, cursors }),
    makeSearchResultsTool({ client, cursors }),
    makeGetArchiveUnitTool({ client }),
    makeGetDocumentsInUnitTool({ client }),
    makeGetDocumentTool({ client }),
  ];

  const server = new McpServer({ name: "arolsen-mcp", version: "0.1.0" });

  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: (t.inputSchema as { shape?: unknown }).shape as never,
        outputSchema: (t.outputSchema as { shape?: unknown }).shape as never,
      },
      (async (args: unknown) => {
        const parsed = (
          t.inputSchema as { parse: (a: unknown) => unknown }
        ).parse(args);
        return await (
          t as { handler: (a: unknown) => Promise<unknown> }
        ).handler(parsed);
      }) as never,
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
