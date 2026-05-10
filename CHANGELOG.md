## 0.1.1 (2026-05-10)

### Features

- session cookies, drill-down ids, and structured filters
- switch documents listing to next_offset, surface resource_links in content[]
- surface document_num and map_data on ArchiveUnitOutput
- stdio MCP server wiring all five tools
- arolsen_get_document tool
- arolsen_get_documents_in_unit tool
- arolsen_get_archive_unit tool
- arolsen_search_results tool with async-extraction polling
- arolsen_search tool
- raw-to-schema mappers
- zod input + output schemas
- opaque cursor + LRU store
- ASMX HTTP client with fixture-backed tests
- ASMX types and constants

### Fixes

- guard mappers against missing upstream fields
- address biome lint warnings in src and tests
