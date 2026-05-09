import { z } from "zod";

// Input schemas
export const SearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe("Search term — surname, full name, or other free text."),
  syn_search: z
    .boolean()
    .default(true)
    .describe(
      "Phonetic/synonym matching. Defaults to true (Arolsen UI default).",
    ),
});

export const SearchResultsInput = z.object({
  cursor: z
    .string()
    .describe(
      "Opaque cursor returned by arolsen_search or a previous arolsen_search_results call.",
    ),
  kind: z.enum(["persons", "archives"]),
  order_by: z
    .string()
    .optional()
    .describe(
      "Persons: LastName | FirstName | BirthName | BirthPlace | BirthDate | PrisonerNo. Archives: RN | Title | Signature.",
    ),
});

export const GetArchiveUnitInput = z.object({
  desc_id: z
    .number()
    .int()
    .describe("descId of the archive unit (from search results)."),
});

export const GetDocumentsInUnitInput = z.object({
  desc_id: z.number().int(),
  offset: z.number().int().nonnegative().default(0),
});

export const GetDocumentInput = z.object({
  doc_id: z
    .string()
    .describe("Document ID (numeric string from search results)."),
});

// Output schemas
const ResourceLink = z.object({
  type: z.literal("resource_link"),
  uri: z.string().url(),
  mimeType: z.string(),
  name: z.string(),
});

export const SearchOutput = z.object({
  person_count: z.number().int(),
  archive_count: z.number().int(),
  cursor: z.string(),
});

export const PersonResult = z.object({
  last_name: z.string().nullable(),
  first_name: z.string().nullable(),
  birth_name: z.string().nullable(),
  birth_place: z.string().nullable(),
  birth_date: z.string().nullable(),
  prisoner_no: z.string().nullable(),
});

export const ArchiveResult = z.object({
  desc_id: z.string(),
  title: z.string(),
  ref_code: z.string().nullable(),
  signature: z.string().nullable(),
  tree_path: z.string().nullable(),
  file_count: z.number().int(),
  has_children: z.boolean(),
});

export const SearchResultsOutput = z.object({
  kind: z.enum(["persons", "archives"]),
  results: z.union([z.array(PersonResult), z.array(ArchiveResult)]),
  next_cursor: z.string().optional(),
  still_extracting: z.boolean().optional(),
});

export const BreadcrumbNode = z.object({
  desc_id: z.string(),
  title: z.string(),
  level: z.number().int(),
  url_id: z.string(),
});

export const ArchiveUnitOutput = z.object({
  desc_id: z.number().int(),
  title: z.string(),
  ref_code: z.string().nullable(),
  document_num: z.string().nullable(),
  breadcrumb: z.array(BreadcrumbNode),
  description_data: z.record(z.unknown()),
  map_data: z.array(z.unknown()).default([]),
  contains_data: z.array(z.unknown()),
});

export const DocumentEntry = z.object({
  doc_id: z.string(),
  title: z.string(),
  desc_id: z.number().int(),
  related_link: z.string(),
  image_link: ResourceLink,
  thumbnail_link: ResourceLink,
});

export const DocumentsInUnitOutput = z.object({
  total: z.number().int(),
  documents: z.array(DocumentEntry),
  next_cursor: z.string().optional(),
});

export const DocumentOutput = z.object({
  doc_id: z.string(),
  pages: z.array(ResourceLink),
});

export const ErrorOutput = z.object({
  error_code: z.string(),
  retry_after: z.number().int().optional(),
});
