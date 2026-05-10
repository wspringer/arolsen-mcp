import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsmxClient } from "../src/client.js";

const FIX = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

function mockFetch(
  responses: Record<string, unknown>,
  resHeaders?: Record<string, Record<string, string>>,
) {
  return vi.fn(async (url: string, _init: RequestInit) => {
    const method = url.split("/").pop() ?? "";
    if (!(method in responses)) throw new Error(`No mock for ${method}`);
    return new Response(JSON.stringify(responses[method]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...(resHeaders?.[method] ?? {}),
      },
    });
  });
}

describe("AsmxClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("buildQuery posts the right body and headers", async () => {
    const fetch = mockFetch({ BuildQueryGlobalForAngular: { d: true } });
    const client = new AsmxClient({ fetch });
    const ok = await client.buildQuery({
      uniqueId: "abc",
      strSearch: "Schmidt",
    });
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/BuildQueryGlobalForAngular$/);
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Origin).toMatch(
      /^https:\/\/collections\.arolsen-archives\.org/,
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      uniqueId: "abc",
      lang: "en",
      strSearch: "Schmidt",
      synSearch: true,
      archiveIds: [],
    });
  });

  it("getCount returns parsed integer", async () => {
    const fetch = mockFetch({ GetCount: FIX("count_person.json") });
    const client = new AsmxClient({ fetch });
    const n = await client.getCount({ uniqueId: "abc", searchType: "person" });
    expect(n).toBe(51497);
  });

  it("getArchiveList returns parsed rows", async () => {
    const fetch = mockFetch({
      GetArchiveList: FIX("arolsen_archive_list.json"),
    });
    const client = new AsmxClient({ fetch });
    const rows = await client.getArchiveList({ uniqueId: "abc", offset: 0 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("Title");
    expect(rows[0]).toHaveProperty("id");
  });

  it("getArchiveInfo parses TreeData breadcrumb", async () => {
    const fetch = mockFetch({ GetArchiveInfo: FIX("archive_info.json") });
    const client = new AsmxClient({ fetch });
    const info = await client.getArchiveInfo(1096933);
    expect(info.Title).toMatch(/SCHMIDT/);
    expect(info.TreeData.length).toBeGreaterThan(0);
  });

  it("getFileByParent returns viewer images", async () => {
    const fetch = mockFetch({ GetFileByParent: FIX("file_by_parent.json") });
    const client = new AsmxClient({ fetch });
    const imgs = await client.getFileByParent({
      parentId: "1096933",
      offset: 0,
    });
    expect(imgs[0].image).toMatch(/^https?:/);
    expect(imgs[0].descId).toBe(1096933);
  });

  it("getFileByParentCount returns int", async () => {
    const fetch = mockFetch({
      getFileByParentCount: FIX("file_by_parent_count.json"),
    });
    const client = new AsmxClient({ fetch });
    const n = await client.getFileByParentCount("1096933");
    expect(n).toBe(4);
  });

  it("getFileByObj returns viewer images for one document", async () => {
    const fetch = mockFetch({ GetFileByObj: FIX("file_by_obj.json") });
    const client = new AsmxClient({ fetch });
    const imgs = await client.getFileByObj("77266");
    expect(imgs.length).toBeGreaterThan(0);
  });

  it("persists ASP.NET session cookies across calls in the same uniqueId", async () => {
    // The upstream stores BuildQuery state in an ASP.NET session keyed by the
    // cookie. Without cookie persistence, GetCount/GetPersonList land in a
    // fresh session and report global totals / no rows — the bug we hit on
    // the live API. This test pins the fix.
    const fetch = mockFetch(
      {
        BuildQueryGlobalForAngular: { d: true },
        GetCount: { d: "7" },
      },
      {
        BuildQueryGlobalForAngular: {
          "Set-Cookie":
            "ASP.NET_SessionId=oni534kroudqao0ua1t3arlr; path=/; HttpOnly",
        },
      },
    );
    const client = new AsmxClient({ fetch });
    await client.buildQuery({ uniqueId: "uid-A", strSearch: "Schmidt" });
    await client.getCount({ uniqueId: "uid-A", searchType: "person" });

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstHeaders = (fetch.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(firstHeaders.Cookie).toBeUndefined();
    const secondHeaders = (fetch.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(secondHeaders.Cookie).toBe(
      "ASP.NET_SessionId=oni534kroudqao0ua1t3arlr",
    );
  });

  it("keeps separate cookie jars for different uniqueIds", async () => {
    const fetch = mockFetch(
      {
        BuildQueryGlobalForAngular: { d: true },
        GetCount: { d: "0" },
      },
      {
        BuildQueryGlobalForAngular: {
          "Set-Cookie": "ASP.NET_SessionId=session-for-A; path=/",
        },
      },
    );
    const client = new AsmxClient({ fetch });
    await client.buildQuery({ uniqueId: "uid-A", strSearch: "x" });
    // A second uniqueId — its first call must NOT carry uid-A's cookie.
    await client.getCount({ uniqueId: "uid-B", searchType: "person" });

    const callForB = (fetch.mock.calls[1][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(callForB.Cookie).toBeUndefined();
  });
});

describe("AsmxClient errors", () => {
  it("maps 5xx to upstream_5xx ArolsenError", async () => {
    const fetch = vi.fn(async () => new Response("oops", { status: 503 }));
    const client = new AsmxClient({ fetch });
    await expect(
      client.getCount({ uniqueId: "x", searchType: "person" }),
    ).rejects.toMatchObject({ code: "upstream_5xx" });
  });

  it("maps 429 to rate_limited with retry_after", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "12" },
        }),
    );
    const client = new AsmxClient({ fetch });
    await expect(
      client.getCount({ uniqueId: "x", searchType: "person" }),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfter: 12 });
  });

  it("maps abort to upstream_timeout", async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      return new Promise<Response>((_res, rej) => {
        (init.signal as AbortSignal).addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      });
    });
    const client = new AsmxClient({ fetch, timeoutMs: 10 });
    await expect(
      client.getCount({ uniqueId: "x", searchType: "person" }),
    ).rejects.toMatchObject({ code: "upstream_timeout" });
  });
});
