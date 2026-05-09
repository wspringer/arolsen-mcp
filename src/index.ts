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

  const server = new McpServer({ name: "arolsen-mcp", version: "0.1.0" });

  const search = makeSearchTool({ client, cursors });
  server.registerTool(
    search.name,
    {
      description: search.description,
      inputSchema: search.inputSchema.shape,
      outputSchema: search.outputSchema.shape,
    },
    (args) => search.handler(search.inputSchema.parse(args)),
  );

  const searchResults = makeSearchResultsTool({ client, cursors });
  server.registerTool(
    searchResults.name,
    {
      description: searchResults.description,
      inputSchema: searchResults.inputSchema.shape,
      outputSchema: searchResults.outputSchema.shape,
    },
    (args) => searchResults.handler(searchResults.inputSchema.parse(args)),
  );

  const getArchiveUnit = makeGetArchiveUnitTool({ client });
  server.registerTool(
    getArchiveUnit.name,
    {
      description: getArchiveUnit.description,
      inputSchema: getArchiveUnit.inputSchema.shape,
      outputSchema: getArchiveUnit.outputSchema.shape,
    },
    (args) => getArchiveUnit.handler(getArchiveUnit.inputSchema.parse(args)),
  );

  const getDocumentsInUnit = makeGetDocumentsInUnitTool({ client });
  server.registerTool(
    getDocumentsInUnit.name,
    {
      description: getDocumentsInUnit.description,
      inputSchema: getDocumentsInUnit.inputSchema.shape,
      outputSchema: getDocumentsInUnit.outputSchema.shape,
    },
    (args) =>
      getDocumentsInUnit.handler(getDocumentsInUnit.inputSchema.parse(args)),
  );

  const getDocument = makeGetDocumentTool({ client });
  server.registerTool(
    getDocument.name,
    {
      description: getDocument.description,
      inputSchema: getDocument.inputSchema.shape,
      outputSchema: getDocument.outputSchema.shape,
    },
    (args) => getDocument.handler(getDocument.inputSchema.parse(args)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
