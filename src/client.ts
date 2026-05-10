import {
  ArolsenError,
  type AsmxEnvelope,
  BASE_URL,
  type FilterTree,
  ORIGIN,
  type RawArchiveInfo,
  type RawArchiveRow,
  type RawPersonRow,
  type RawViewerImage,
  type SearchType,
} from "./types.js";

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetch?: FetchFn;
  timeoutMs?: number;
}

export class AsmxClient {
  private fetch: FetchFn;
  private timeoutMs: number;
  // ASP.NET session cookies, keyed by uniqueId. The upstream stores query
  // state (BuildQuery results, filters) in the session keyed by the cookie,
  // not by uniqueId — so all calls in one search must share the cookie set
  // by BuildQuery. Without this, GetCount returns the global archive total
  // and GetPersonList returns no rows.
  private sessions = new Map<string, string>();

  constructor(opts: ClientOptions = {}) {
    this.fetch = opts.fetch ?? (globalThis.fetch as FetchFn);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async post<T>(
    method: string,
    body: object,
    sessionKey?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
      };
      if (sessionKey) {
        const existing = this.sessions.get(sessionKey);
        if (existing) headers.Cookie = existing;
      }
      res = await this.fetch(`${BASE_URL}/${method}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") {
        throw new ArolsenError("upstream_timeout", `Timeout calling ${method}`);
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "30");
      throw new ArolsenError("rate_limited", "Upstream rate limit", retry);
    }
    if (res.status >= 500) {
      throw new ArolsenError(
        "upstream_5xx",
        `Upstream ${method} returned ${res.status}`,
      );
    }
    if (!res.ok) {
      throw new ArolsenError(
        "upstream_5xx",
        `Upstream ${method} returned ${res.status}`,
      );
    }
    if (sessionKey) this.captureSession(sessionKey, res);
    const json = (await res.json()) as AsmxEnvelope<T>;
    return json.d;
  }

  private captureSession(sessionKey: string, res: Response) {
    // Some Response polyfills lack getSetCookie; fall back to the single
    // header (which is enough for the ASP.NET_SessionId we care about).
    const setCookies =
      typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie ===
      "function"
        ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
        : ((): string[] => {
            const single = res.headers.get("set-cookie");
            return single ? [single] : [];
          })();
    if (setCookies.length === 0) return;
    const jar = new Map<string, string>();
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      for (const kv of existing.split("; ")) {
        const eq = kv.indexOf("=");
        if (eq > 0) jar.set(kv.slice(0, eq), kv.slice(eq + 1));
      }
    }
    for (const raw of setCookies) {
      const first = raw.split(";", 1)[0]?.trim();
      if (!first) continue;
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      jar.set(first.slice(0, eq), first.slice(eq + 1));
    }
    this.sessions.set(
      sessionKey,
      Array.from(jar, ([k, v]) => `${k}=${v}`).join("; "),
    );
  }

  // Apply a filter tree to either the person or archive grid for the
  // current session. Returns null on success. Subsequent GetCount /
  // GetPersonList / GetArchiveList calls within the same session use this
  // filter when called with useFilter: true (counts) or implicitly (lists).
  applyGridFilter(args: {
    uniqueId: string;
    type: SearchType;
    filter: FilterTree;
    lang?: string;
  }): Promise<null> {
    return this.post(
      "BuildGridFilter",
      {
        uniqueId: args.uniqueId,
        lang: args.lang ?? "en",
        type: args.type,
        filter: args.filter,
      },
      args.uniqueId,
    );
  }

  buildQuery(args: {
    uniqueId: string;
    strSearch: string;
    synSearch?: boolean;
    archiveIds?: number[];
    lang?: string;
  }): Promise<boolean> {
    return this.post(
      "BuildQueryGlobalForAngular",
      {
        uniqueId: args.uniqueId,
        lang: args.lang ?? "en",
        archiveIds: args.archiveIds ?? [],
        strSearch: args.strSearch,
        synSearch: args.synSearch ?? true,
      },
      args.uniqueId,
    );
  }

  async getCount(args: {
    uniqueId: string;
    searchType: SearchType;
    lang?: string;
    useFilter?: boolean;
  }): Promise<number> {
    const v = await this.post<string>(
      "GetCount",
      {
        uniqueId: args.uniqueId,
        lang: args.lang ?? "en",
        searchType: args.searchType,
        useFilter: args.useFilter ?? false,
      },
      args.uniqueId,
    );
    return parseInt(v, 10);
  }

  getArchiveList(args: {
    uniqueId: string;
    offset: number;
    orderBy?: string;
    orderType?: "asc" | "desc";
    lang?: string;
  }): Promise<RawArchiveRow[]> {
    return this.post(
      "GetArchiveList",
      {
        uniqueId: args.uniqueId,
        lang: args.lang ?? "en",
        orderBy: args.orderBy ?? "RN",
        orderType: args.orderType ?? "asc",
        rowNum: args.offset,
      },
      args.uniqueId,
    );
  }

  getPersonList(args: {
    uniqueId: string;
    offset: number;
    orderBy?: string;
    orderType?: "asc" | "desc";
    lang?: string;
  }): Promise<RawPersonRow[]> {
    return this.post(
      "GetPersonList",
      {
        uniqueId: args.uniqueId,
        lang: args.lang ?? "en",
        rowNum: args.offset,
        orderBy: args.orderBy ?? "LastName",
        orderType: args.orderType ?? "asc",
      },
      args.uniqueId,
    );
  }

  getArchiveInfo(descId: number, lang = "en"): Promise<RawArchiveInfo> {
    return this.post("GetArchiveInfo", { descId, level: 1, lang });
  }

  getFileByParent(args: {
    parentId: string;
    offset: number;
    lang?: string;
  }): Promise<RawViewerImage[]> {
    return this.post("GetFileByParent", {
      parentId: args.parentId,
      rowNum: args.offset,
      lang: args.lang ?? "en",
    });
  }

  async getFileByParentCount(parentId: string, lang = "en"): Promise<number> {
    const v = await this.post<string>("getFileByParentCount", {
      parentId,
      lang,
    });
    return parseInt(v, 10);
  }

  getFileByObj(objId: string, lang = "en"): Promise<RawViewerImage[]> {
    return this.post("GetFileByObj", { objId, lang });
  }
}
