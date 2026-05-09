import {
  BASE_URL, ORIGIN, AsmxEnvelope, ArolsenError,
  RawArchiveRow, RawPersonRow, RawArchiveInfo, RawViewerImage, SearchType,
} from "./types.js";

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetch?: FetchFn;
  timeoutMs?: number;
}

export class AsmxClient {
  private fetch: FetchFn;
  private timeoutMs: number;

  constructor(opts: ClientOptions = {}) {
    this.fetch = opts.fetch ?? (globalThis.fetch as FetchFn);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async post<T>(method: string, body: object): Promise<T> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetch(`${BASE_URL}/${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": ORIGIN,
          "Referer": `${ORIGIN}/`,
        },
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
      throw new ArolsenError("upstream_5xx", `Upstream ${method} returned ${res.status}`);
    }
    if (!res.ok) {
      throw new ArolsenError("upstream_5xx", `Upstream ${method} returned ${res.status}`);
    }
    const json = (await res.json()) as AsmxEnvelope<T>;
    return json.d;
  }

  buildQuery(args: { uniqueId: string; strSearch: string; synSearch?: boolean; archiveIds?: number[]; lang?: string }): Promise<boolean> {
    return this.post("BuildQueryGlobalForAngular", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      archiveIds: args.archiveIds ?? [],
      strSearch: args.strSearch,
      synSearch: args.synSearch ?? true,
    });
  }

  async getCount(args: { uniqueId: string; searchType: SearchType; lang?: string; useFilter?: boolean }): Promise<number> {
    const v = await this.post<string>("GetCount", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      searchType: args.searchType,
      useFilter: args.useFilter ?? false,
    });
    return parseInt(v, 10);
  }

  getArchiveList(args: { uniqueId: string; offset: number; orderBy?: string; orderType?: "asc"|"desc"; lang?: string }): Promise<RawArchiveRow[]> {
    return this.post("GetArchiveList", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      orderBy: args.orderBy ?? "RN",
      orderType: args.orderType ?? "asc",
      rowNum: args.offset,
    });
  }

  getPersonList(args: { uniqueId: string; offset: number; orderBy?: string; orderType?: "asc"|"desc"; lang?: string }): Promise<RawPersonRow[]> {
    return this.post("GetPersonList", {
      uniqueId: args.uniqueId,
      lang: args.lang ?? "en",
      rowNum: args.offset,
      orderBy: args.orderBy ?? "LastName",
      orderType: args.orderType ?? "asc",
    });
  }

  getArchiveInfo(descId: number, lang = "en"): Promise<RawArchiveInfo> {
    return this.post("GetArchiveInfo", { descId, level: 1, lang });
  }

  getFileByParent(args: { parentId: string; offset: number; lang?: string }): Promise<RawViewerImage[]> {
    return this.post("GetFileByParent", { parentId: args.parentId, rowNum: args.offset, lang: args.lang ?? "en" });
  }

  async getFileByParentCount(parentId: string, lang = "en"): Promise<number> {
    const v = await this.post<string>("getFileByParentCount", { parentId, lang });
    return parseInt(v, 10);
  }

  getFileByObj(objId: string, lang = "en"): Promise<RawViewerImage[]> {
    return this.post("GetFileByObj", { objId, lang });
  }
}
