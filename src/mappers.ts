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
  // Upstream type is ITSPannel.classes.PersData with PlaceBirth/Dob/
  // MaidenName/PrisonerNumber. Older fixtures used BirthPlace/BirthDate/
  // BirthName/PrisonerNo, so accept both shapes.
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return null;
  };
  const idStr = (k: string): string | null => {
    const v = r[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
    return null;
  };
  return {
    last_name: pick("LastName"),
    first_name: pick("FirstName"),
    birth_name: pick("MaidenName", "BirthName"),
    birth_place: pick("PlaceBirth", "BirthPlace"),
    birth_date: pick("Dob", "BirthDate"),
    prisoner_no: pick("PrisonerNumber", "PrisonerNo"),
    obj_id: idStr("ObjId"),
    desc_id: idStr("DescId"),
    signature: pick("Signature"),
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
