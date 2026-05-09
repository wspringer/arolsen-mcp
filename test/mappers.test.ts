import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  toArchiveResult,
  toArchiveUnit,
  toDocumentEntry,
  toPersonResult,
  toResourceLink,
} from "../src/mappers.js";

const FIX = (n: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", n), "utf8"));

describe("mappers", () => {
  it("toArchiveResult flattens row", () => {
    const row = FIX("arolsen_archive_list.json").d[0];
    const r = toArchiveResult(row);
    expect(r.desc_id).toBe(row.id);
    expect(r.title).toBe(row.Title);
    expect(r.ref_code).toBe(row.RefCode);
    expect(r.file_count).toBe(row.fileCount);
    expect(r.has_children).toBe(false);
  });

  it("toArchiveUnit extracts breadcrumb from TreeData", () => {
    const raw = FIX("archive_info.json").d;
    const u = toArchiveUnit(raw);
    expect(u.title).toMatch(/SCHMIDT/);
    expect(u.breadcrumb.length).toBe(raw.TreeData.length);
    expect(u.breadcrumb[0]).toMatchObject({
      desc_id: expect.any(String),
      level: expect.any(Number),
    });
  });

  it("toDocumentEntry produces resource_link blocks with usable URLs", () => {
    const raw = FIX("file_by_parent.json").d[0];
    const d = toDocumentEntry(raw);
    expect(d.image_link.type).toBe("resource_link");
    expect(d.image_link.uri).toMatch(/^https:\/\//);
    expect(d.thumbnail_link.uri).toMatch(/^https:\/\//);
    expect(d.image_link.mimeType).toBe("image/jpeg");
  });

  it("toResourceLink rewrites backslashes to / and prefixes thmbnl", () => {
    const link = toResourceLink({
      thmbnl:
        "/remote/collections-server.arolsen-archives.org/G/SIMS/x/y/z/001.jpg?width=700",
      image:
        "https:\\\\collections-server.arolsen-archives.org/G/SIMS/x/y/z/001.jpg",
      title: "t",
      descId: 1,
      docCounter: "1_1",
      relatedLink: "en/document/1",
    });
    expect(link.image_link.uri).toBe(
      "https://collections-server.arolsen-archives.org/G/SIMS/x/y/z/001.jpg",
    );
    expect(link.thumbnail_link.uri.startsWith("https://")).toBe(true);
  });

  it("toPersonResult tolerates missing fields", () => {
    const r = toPersonResult({ LastName: "Schmidt" });
    expect(r.last_name).toBe("Schmidt");
    expect(r.first_name).toBeNull();
  });
});
