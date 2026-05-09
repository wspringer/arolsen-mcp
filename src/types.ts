export const BASE_URL = "https://collections-server.arolsen-archives.org/ITS-WS.asmx";
export const ORIGIN = "https://collections.arolsen-archives.org";

export type Method =
  | "BuildQueryGlobalForAngular"
  | "GetCount"
  | "GetArchiveList"
  | "GetPersonList"
  | "GetArchiveInfo"
  | "GetFileByParent"
  | "getFileByParentCount"
  | "GetFileByObj"
  | "GetTreeNodeByDocId";

export type SearchType = "person" | "archive";

export type AsmxEnvelope<T> = { d: T };

// Raw upstream shapes (only the fields we actually use)
export interface RawArchiveRow {
  Title: string;
  id: string;          // descId
  RefCode: string;
  Signature: string;
  TreePath: string;
  fileCount: number;
  directFile: number;
  treeLevel: number;
  ReportsTo: string;
  hasChildren?: boolean;
}

export interface RawPersonRow {
  LastName?: string;
  FirstName?: string;
  BirthName?: string;
  BirthPlace?: string;
  BirthDate?: string;
  PrisonerNo?: string;
  // Some payloads use generic columns. Capture as Record so we don't lose data.
  [k: string]: unknown;
}

export interface RawTreeNode {
  Title: string;
  DescId: string;
  Level: number;
  UrlId: string;
  FileCount?: number;
}

export interface RawArchiveInfo {
  DescId: number;
  Title: string;
  RefCode?: string;
  TreeData: RawTreeNode[];
  HeaderItems?: Record<string, unknown>;
  DescriptionData?: Record<string, unknown>;
  MapData?: unknown[];
  ContainsData?: unknown[];
}

export interface RawViewerImage {
  thmbnl: string;
  image: string;
  title: string;
  descId: number;
  docCounter: string;
  relatedLink: string;
}

export type ErrorCode =
  | "upstream_5xx"
  | "upstream_timeout"
  | "rate_limited"
  | "cursor_expired"
  | "not_found"
  | "extraction_timeout";

export class ArolsenError extends Error {
  constructor(public code: ErrorCode, message: string, public retryAfter?: number) {
    super(message);
  }
}
