import { randomBytes } from "node:crypto";
import type { z } from "zod";
import type { AsmxClient } from "../client.js";
import type { CursorStore } from "../cursor.js";
import { type ErrorOutput, SearchInput, SearchOutput } from "../schemas.js";
import type { FilterClause } from "../types.js";
import { type ToolResult, wrapToolErrors } from "./_helpers.js";

export interface ToolDeps {
  client: AsmxClient;
  cursors: CursorStore;
}

type Out = z.infer<typeof SearchOutput>;
type Err = z.infer<typeof ErrorOutput>;
type Input = z.infer<typeof SearchInput>;

function makeUniqueId(): string {
  return randomBytes(10).toString("base64url").slice(0, 20);
}

// Map named-parameter person filters to upstream {Field, Operator, Value}
// clauses. Field names mirror the website's BuildGridFilter payloads.
const PERSON_TEXT_FIELDS: Array<[keyof Input, string]> = [
  ["first_name", "FirstName"],
  ["last_name", "LastName"],
  ["maiden_name", "MaidenName"],
  ["place_of_birth", "PlaceBirth"],
  ["prisoner_number", "PrisonerNumber"],
  ["religion", "Religion"],
  ["nationality", "Nationality"],
  ["family_status", "FamilyStatus"],
  ["occupation", "Occupaton"], // upstream typo, mirrored
  ["place_of_incarceration", "Place_of_incarceration"],
  ["date_of_decease", "Date_of_decease"],
  ["father", "Father"],
  ["mother", "Mother"],
  ["last_residence_country", "Last_residence_country"],
  ["last_residence_district", "Last_residence_district"],
  ["last_residence_province", "Last_residence_province"],
  ["last_residence_town", "Last_residence_town"],
  ["last_residence_part_of_town", "Last_residence_part_of_town"],
  ["last_residence_street", "Last_residence_street"],
  ["last_residence_house_number", "Last_residence_house_number"],
];

const ARCHIVE_TEXT_FIELDS: Array<[keyof Input, string]> = [
  ["archive_signature", "Signature"],
  ["archive_title", "Title"],
  ["archive_ref_code", "RefCode"],
];

function collectFilters(input: Input): {
  person: FilterClause[];
  archive: FilterClause[];
} {
  const person: FilterClause[] = [];
  const archive: FilterClause[] = [];

  for (const [key, field] of PERSON_TEXT_FIELDS) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) {
      person.push({ Field: field, Operator: "contains", Value: v });
    }
  }
  for (const [key, field] of ARCHIVE_TEXT_FIELDS) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) {
      archive.push({ Field: field, Operator: "contains", Value: v });
    }
  }

  // Birth year — upstream Dob accepts year as a string with exclusive
  // bounds. UX exposes inclusive year_from/year_to plus an exact
  // birth_year shorthand.
  const fromYear =
    input.birth_year !== undefined ? input.birth_year : input.birth_year_from;
  const toYear =
    input.birth_year !== undefined ? input.birth_year : input.birth_year_to;
  if (fromYear !== undefined) {
    person.push({ Field: "Dob", Operator: "gt", Value: String(fromYear - 1) });
  }
  if (toYear !== undefined) {
    person.push({ Field: "Dob", Operator: "lt", Value: String(toYear + 1) });
  }

  for (const ef of input.extra_filters ?? []) {
    const clause: FilterClause = {
      Field: ef.field,
      Operator: ef.operator,
      Value: ef.value,
    };
    if (ef.type === "archive") archive.push(clause);
    else person.push(clause);
  }

  return { person, archive };
}

export function makeSearchTool(deps: ToolDeps) {
  return {
    name: "arolsen_search",
    description:
      "Run a search against the Arolsen Archives. Free-text query plus optional structured filters (first_name, birth_year, religion, etc.) — when phonetic surname matching misses, drop the surname and lean on first_name + birth_year. Returns total counts and a cursor for paginating into results via arolsen_search_results.",
    inputSchema: SearchInput,
    outputSchema: SearchOutput,
    async handler(input: Input): Promise<ToolResult<Out | Err>> {
      return wrapToolErrors<Out>(async () => {
        const uniqueId = makeUniqueId();
        await deps.client.buildQuery({
          uniqueId,
          strSearch: input.query,
          synSearch: input.syn_search,
        });

        const { person, archive } = collectFilters(input);
        if (person.length > 0) {
          await deps.client.applyGridFilter({
            uniqueId,
            type: "person",
            filter: {
              Operator: "and",
              Field: "",
              Filters: person,
              Value: "",
            },
          });
        }
        if (archive.length > 0) {
          await deps.client.applyGridFilter({
            uniqueId,
            type: "archive",
            filter: {
              Operator: "and",
              Field: "",
              Filters: archive,
              Value: "",
            },
          });
        }

        const [personCount, archiveCount] = await Promise.all([
          deps.client.getCount({
            uniqueId,
            searchType: "person",
            useFilter: person.length > 0,
          }),
          deps.client.getCount({
            uniqueId,
            searchType: "archive",
            useFilter: archive.length > 0,
          }),
        ]);
        const cursor = deps.cursors.issue(uniqueId, 0);
        const out: Out = {
          person_count: personCount,
          archive_count: archiveCount,
          cursor,
        };
        const filterNote =
          person.length + archive.length > 0
            ? ` (${person.length} person filter${person.length === 1 ? "" : "s"}, ${archive.length} archive filter${archive.length === 1 ? "" : "s"} applied)`
            : "";
        return {
          structuredContent: out,
          content: [
            {
              type: "text",
              text:
                `Search for "${input.query}"${filterNote} — ${personCount.toLocaleString()} persons and ${archiveCount.toLocaleString()} archive units. ` +
                `Use arolsen_search_results with cursor=${cursor} and kind="persons" or "archives" to retrieve results.`,
            },
          ],
        };
      }, "Arolsen search failed");
    },
  };
}
