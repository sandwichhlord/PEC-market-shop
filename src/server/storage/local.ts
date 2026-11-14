// Stores files on the local disk under UPLOAD_DIR; served by /api/uploads/[...path].
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { EXTENSION_FOR, TYPE_FOR_EXTENSION } from "./image";
import type { StorageProvider, StoredFile, StoredImageType, UploadFolder } from "./types";

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Public URL for a storage key. */
export function uploadUrl(key: string): string {
  return `/api/uploads/${key}`;
}

/**
 * Validates a storage key (`a/b/file.ext`): only safe segments (no `..`, no absolute paths, no backslashes)
 * and a known image extension. Returns the content type, or null if the key is not servable.
 */
export function contentTypeForKey(key: string): StoredImageType | null {
  const segments = key.split("/");
  if (segments.length === 0 || segments.length > 4) return null;
  if (!segments.every((s) => SEGMENT.test(s) && !s.includes(".."))) return null;
  const ext = path.extname(key).slice(1).toLowerCase();
  return TYPE_FOR_EXTENSION[ext] ?? null;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string | null {
    if (!contentTypeForKey(key)) return null;
    const full = path.resolve(this.root, key);
    // Belt and braces: the resolved path must stay inside the upload root.
    if (!full.startsWith(this.root + path.sep)) return null;
    return full;
  }

  async save(input: { folder: UploadFolder; data: Uint8Array; contentType: StoredImageType }): Promise<StoredFile> {
    const key = `${input.folder}/${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${EXTENSION_FOR[input.contentType]}`;
    const full = this.resolve(key);
    if (!full) throw new Error(`Invalid storage key ${key}`);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.data);
    return { key, url: uploadUrl(key) };
  }

  async read(key: string): Promise<{ data: Uint8Array; contentType: StoredImageType } | null> {
    const contentType = contentTypeForKey(key);
    const full = this.resolve(key);
    if (!contentType || !full) return null;
    try {
      return { data: await readFile(full), contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "EISDIR") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const full = this.resolve(key);
    if (!full) return;
    try {
      await unlink(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
