import { ArolsenError } from "./types.js";

export interface CursorState {
  uniqueId: string;
  offset: number;
}

export class CursorStore {
  private cache = new Map<string, CursorState>(); // insertion order = LRU order
  private max: number;

  constructor(opts: { max?: number } = {}) {
    this.max = opts.max ?? 256;
  }

  issue(uniqueId: string, offset: number): string {
    const cursor = encode({ uniqueId, offset });
    this.touch(cursor, { uniqueId, offset });
    return cursor;
  }

  advance(prev: string, newOffset: number): string {
    const state = this.read(prev);
    return this.issue(state.uniqueId, newOffset);
  }

  read(cursor: string): CursorState {
    const decoded = tryDecode(cursor);
    if (!decoded) throw new ArolsenError("cursor_expired", "cursor_expired: Cursor is malformed or expired");
    if (!this.cache.has(cursor)) {
      throw new ArolsenError("cursor_expired", "cursor_expired: Cursor is no longer cached; call arolsen_search again");
    }
    const state = this.cache.get(cursor)!;
    // Refresh LRU position
    this.cache.delete(cursor);
    this.cache.set(cursor, state);
    return state;
  }

  private touch(cursor: string, state: CursorState) {
    if (this.cache.has(cursor)) this.cache.delete(cursor);
    this.cache.set(cursor, state);
    while (this.cache.size > this.max) {
      const firstKey = this.cache.keys().next().value as string;
      this.cache.delete(firstKey);
    }
  }
}

function encode(s: CursorState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

function tryDecode(s: string): CursorState | null {
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.uniqueId !== "string" || typeof parsed?.offset !== "number") return null;
    return parsed;
  } catch { return null; }
}
