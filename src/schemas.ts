import { z } from "zod";

// Input schemas

// Operators supported by the upstream BuildGridFilter API. "contains" is the
// default for text fields (matches the website's default filter dialog).
export const FilterOperator = z
  .enum([
    "contains",
    "equals",
    "gt",
    "lt",
    "gte",
    "lte",
    "startsWith",
    "endsWith",
  ])
  .describe(
    "BuildGridFilter operator. 'contains' matches the website's default. 'gt'/'lt' are exclusive year bounds for Dob (e.g. gt=1913 + lt=1915 returns 1914).",
  );

export const ExtraFilter = z.object({
  field: z
    .string()
    .describe(
      "Upstream field name as the API expects it (e.g. 'FirstName', 'Dob', 'PlaceBirth', 'Last_residence_country'). Used for fields not surfaced as named parameters.",
    ),
  operator: FilterOperator.default("contains"),
  value: z.string(),
  type: z
    .enum(["person", "archive"])
    .default("person")
    .describe("Which grid the filter applies to."),
});

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

  // ── Person filters ──────────────────────────────────────────────────
  // Most fields use 'contains' matching. The upstream is undocumented; field
  // names below mirror what the website's filter UI sends. If a particular
  // field doesn't filter as expected, fall back to extra_filters with the
  // exact upstream field name.
  first_name: z
    .string()
    .optional()
    .describe(
      "Person filter: FirstName contains. Drop the surname when its spelling is uncertain — phonetic search misses some variants.",
    ),
  last_name: z
    .string()
    .optional()
    .describe("Person filter: LastName contains."),
  maiden_name: z
    .string()
    .optional()
    .describe(
      "Person filter: MaidenName contains. Useful for married women indexed under a different surname.",
    ),
  place_of_birth: z
    .string()
    .optional()
    .describe("Person filter: PlaceBirth contains."),
  prisoner_number: z
    .string()
    .optional()
    .describe("Person filter: PrisonerNumber contains."),
  religion: z.string().optional().describe("Person filter: Religion contains."),
  nationality: z
    .string()
    .optional()
    .describe("Person filter: Nationality contains."),
  family_status: z
    .string()
    .optional()
    .describe("Person filter: FamilyStatus contains."),
  occupation: z
    .string()
    .optional()
    .describe("Person filter: Occupaton contains (note the upstream's typo)."),
  place_of_incarceration: z
    .string()
    .optional()
    .describe("Person filter: Place_of_incarceration contains."),
  date_of_decease: z
    .string()
    .optional()
    .describe("Person filter: Date_of_decease contains."),
  father: z.string().optional().describe("Person filter: Father contains."),
  mother: z.string().optional().describe("Person filter: Mother contains."),
  last_residence_country: z.string().optional(),
  last_residence_district: z.string().optional(),
  last_residence_province: z.string().optional(),
  last_residence_town: z.string().optional(),
  last_residence_part_of_town: z.string().optional(),
  last_residence_street: z.string().optional(),
  last_residence_house_number: z.string().optional(),
  // Birth year is a YEAR filter (Dob range). The website sends it as
  // exclusive bounds, so we mirror that and convert from inclusive UX:
  // birth_year=1914 → gt=1913, lt=1915.
  birth_year: z
    .number()
    .int()
    .optional()
    .describe(
      "Person filter: exact birth year (Dob). Converted internally to gt=year-1, lt=year+1.",
    ),
  birth_year_from: z
    .number()
    .int()
    .optional()
    .describe("Person filter: lower bound on birth year (inclusive)."),
  birth_year_to: z
    .number()
    .int()
    .optional()
    .describe("Person filter: upper bound on birth year (inclusive)."),

  // ── Archive (topic) filters ─────────────────────────────────────────
  archive_signature: z
    .string()
    .optional()
    .describe("Archive filter: Signature contains (e.g. '1.1.46.1')."),
  archive_title: z
    .string()
    .optional()
    .describe("Archive filter: Title contains."),
  archive_ref_code: z
    .string()
    .optional()
    .describe("Archive filter: RefCode contains."),

  // ── Escape hatch ────────────────────────────────────────────────────
  extra_filters: z
    .array(ExtraFilter)
    .optional()
    .describe(
      "Raw filter clauses for any field/operator the named parameters above don't cover. Each clause goes straight to BuildGridFilter.",
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
      "Persons: LastName | FirstName | MaidenName | PlaceBirth | PrisonerNumber. Archives: RN | Title | Signature.",
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
  // Identifiers for drill-down. obj_id is the document ID (use with
  // arolsen_get_document); desc_id is the archive unit (use with
  // arolsen_get_archive_unit / arolsen_get_documents_in_unit). signature is
  // the human-readable archive section the document sits in.
  obj_id: z.string().nullable(),
  desc_id: z.string().nullable(),
  signature: z.string().nullable(),
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
  // Documents listing is naturally offset-based — the upstream call is
  // stateless (no uniqueId), so we surface a numeric next_offset rather
  // than the opaque base64 cursors used by arolsen_search.
  next_offset: z.number().int().nonnegative().optional(),
});

export const DocumentOutput = z.object({
  doc_id: z.string(),
  pages: z.array(ResourceLink),
});

export const ErrorOutput = z.object({
  error_code: z.string(),
  retry_after: z.number().int().optional(),
});
