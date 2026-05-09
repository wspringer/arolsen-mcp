import { beforeEach, describe, expect, it } from "vitest";
import { CursorStore } from "../src/cursor.js";

describe("CursorStore", () => {
  let store: CursorStore;
  beforeEach(() => {
    store = new CursorStore({ max: 3 });
  });

  it("issues a cursor and reads it back", () => {
    const c = store.issue("abc", 0);
    const got = store.read(c);
    expect(got).toEqual({ uniqueId: "abc", offset: 0 });
  });

  it("rejects unknown cursor with cursor_expired", () => {
    expect(() => store.read("ZmFrZQ==")).toThrowError(/cursor_expired/);
  });

  it("rejects malformed cursor with cursor_expired", () => {
    expect(() => store.read("not-base64-!!!")).toThrowError(/cursor_expired/);
  });

  it("evicts least-recently-used when over capacity", () => {
    const a = store.issue("A", 0);
    const b = store.issue("B", 0);
    const c = store.issue("C", 0);
    store.read(a); // A is now MRU
    const d = store.issue("D", 0); // should evict B
    expect(() => store.read(b)).toThrowError(/cursor_expired/);
    expect(store.read(a)).toEqual({ uniqueId: "A", offset: 0 });
    expect(store.read(c)).toEqual({ uniqueId: "C", offset: 0 });
    expect(store.read(d)).toEqual({ uniqueId: "D", offset: 0 });
  });

  it("issues a derivative cursor for the same uniqueId at a new offset", () => {
    const c1 = store.issue("X", 0);
    const c2 = store.advance(c1, 25);
    expect(store.read(c2)).toEqual({ uniqueId: "X", offset: 25 });
    expect(store.read(c1)).toEqual({ uniqueId: "X", offset: 0 });
  });
});
