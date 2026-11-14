import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sniffImageType } from "./image";
import { LocalStorageProvider, contentTypeForKey } from "./local";

describe("sniffImageType", () => {
  it.each([
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[0xff, 0xd8, 0xff, 0xdb], "image/jpeg"],
    [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif"],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp"],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45], null], // RIFF WAVE audio
    [[0x3c, 0x73, 0x76, 0x67], null], // "<svg"
    [[], null],
  ])("%j → %s", (bytes, type) => {
    expect(sniffImageType(new Uint8Array(bytes))).toBe(type);
  });
});

describe("contentTypeForKey", () => {
  it.each([
    ["logos/a.png", "image/png"],
    ["seed/chai-logo.svg", "image/svg+xml"],
    ["menu/x.JPEG", "image/jpeg"],
    ["../x.png", null],
    ["logos/../x.png", null],
    ["/etc/x.png", null],
    ["logos\\x.png", null],
    ["logos/x.html", null],
    ["logos/.hidden.png", null],
  ])("%s → %s", (key, type) => {
    expect(contentTypeForKey(key)).toBe(type);
  });
});

describe("LocalStorageProvider", () => {
  let root: string | undefined;
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("saves, reads and deletes inside its root", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "pec-storage-"));
    const storage = new LocalStorageProvider(root);
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const { key, url } = await storage.save({ folder: "reviews", data, contentType: "image/png" });
    expect(key).toMatch(/^reviews\/.+\.png$/);
    expect(url).toBe(`/api/uploads/${key}`);
    expect(new Uint8Array(await readFile(path.join(root, key)))).toEqual(data);
    expect(await storage.read(key)).toEqual({ data: expect.anything(), contentType: "image/png" });
    await storage.delete(key);
    expect(await storage.read(key)).toBeNull();
    await expect(storage.delete(key)).resolves.toBeUndefined();
    expect(await storage.read("../outside.png")).toBeNull();
  });
});
