import type { z } from "zod";
import type {
  ArchiveResult,
  ArchiveUnitOutput,
  BreadcrumbNode,
  DocumentEntry,
  PersonResult,
} from "./schemas.js";
import type {
  RawArchiveInfo,
  RawArchiveRow,
  RawPersonRow,
  RawTreeNode,
  RawViewerImage,
} from "./types.js";

type ArchiveResultT = z.infer<typeof ArchiveResult>;
type PersonResultT = z.infer<typeof PersonResult>;
type ArchiveUnitT = z.infer<typeof ArchiveUnitOutput>;
type DocumentEntryT = z.infer<typeof DocumentEntry>;
type BreadcrumbT = z.infer<typeof BreadcrumbNode>;

const IMG_HOST = "https://collections-server.arolsen-archives.org";

function normalizeUrl(u: string | undefined): string {
  // Upstream sometimes has "https:\\\\host/path" — normalize to https://host/path.
  if (!u) return "";
  let s = u.replace(/\\/g, "/");
  if (s.startsWith("https:/") && !s.startsWith("https://"))
    s = `https://${s.slice(7)}`;
  return s;
}

function thumbnailUrl(thmbnl: string | undefined): string {
  // thmbnl looks like "/remote/collections-server.arolsen-archives.org/G/...".
  // Strip the "/remote/<host>" prefix and rebuild.
  if (!thmbnl) return "";
  const m = thmbnl.match(/^\/remote\/[^/]+(\/.+)$/);
  if (m) return IMG_HOST + m[1];
  if (thmbnl.startsWith("http")) return thmbnl;
  return IMG_HOST + thmbnl;
}

export function toArchiveResult(r: RawArchiveRow): ArchiveResultT {
  return {
    desc_id: r.id ?? "",
    title: r.Title ?? "",
    ref_code: r.RefCode ?? null,
    signature: r.Signature ?? null,
    tree_path: r.TreePath ?? null,
    file_count: r.fileCount ?? 0,
    has_children: !!r.hasChildren,
  };
}

export function toPersonResult(r: RawPersonRow): PersonResultT {
  return {
    last_name: (r.LastName as string) ?? null,
    first_name: (r.FirstName as string) ?? null,
    birth_name: (r.BirthName as string) ?? null,
    birth_place: (r.BirthPlace as string) ?? null,
    birth_date: (r.BirthDate as string) ?? null,
    prisoner_no: (r.PrisonerNo as string) ?? null,
  };
}

function toBreadcrumb(t: RawTreeNode): BreadcrumbT {
  return {
    desc_id: t.DescId != null ? String(t.DescId) : "",
    title: t.Title ?? "",
    level: t.Level ?? 0,
    url_id: t.UrlId ?? "",
  };
}

function findHeaderValue(
  items: RawArchiveInfo["HeaderItems"],
  title: string,
): string | null {
  if (!items) return null;
  const hit = items.find((h) => h?.Title === title);
  return hit?.Value ?? null;
}

export function toArchiveUnit(raw: RawArchiveInfo): ArchiveUnitT {
  return {
    desc_id: raw.DescId ?? 0,
    title: raw.Title ?? "",
    ref_code: (raw.RefCode as string | undefined) ?? null,
    document_num: findHeaderValue(raw.HeaderItems, "documentNum"),
    breadcrumb: (raw.TreeData ?? []).map(toBreadcrumb),
    description_data: (raw.DescriptionData ?? {}) as Record<string, unknown>,
    map_data: (raw.MapData ?? []) as unknown[],
    contains_data: (raw.ContainsData ?? []) as unknown[],
  };
}

export function toResourceLink(v: RawViewerImage): {
  image_link: DocumentEntryT["image_link"];
  thumbnail_link: DocumentEntryT["thumbnail_link"];
} {
  const imageUri = normalizeUrl(v.image);
  const thumbUri = thumbnailUrl(v.thmbnl);
  const title = v.title ?? "";
  return {
    image_link: {
      type: "resource_link",
      uri: imageUri,
      mimeType: "image/jpeg",
      name: title,
    },
    thumbnail_link: {
      type: "resource_link",
      uri: thumbUri,
      mimeType: "image/jpeg",
      name: `${title} (thumbnail)`,
    },
  };
}

export function toDocumentEntry(v: RawViewerImage): DocumentEntryT {
  const docId = v.docCounter?.split("_")[0] ?? "";
  const links = toResourceLink(v);
  return {
    doc_id: docId,
    title: v.title ?? "",
    desc_id: v.descId ?? 0,
    related_link: v.relatedLink ?? "",
    ...links,
  };
}
