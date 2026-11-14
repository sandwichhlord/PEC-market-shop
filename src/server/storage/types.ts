// File storage abstraction. Only images are stored; keys look like `<folder>/<name>.<ext>`.

export const UPLOAD_FOLDERS = ["logos", "menu", "reviews"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

/** Types accepted for user uploads (detected from the file bytes, never trusted from the client). */
export const UPLOADABLE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type UploadableImageType = (typeof UPLOADABLE_IMAGE_TYPES)[number];

/** Types the storage can hold and serve: uploads plus generated SVG placeholders (seed data, default logos). */
export type StoredImageType = UploadableImageType | "image/svg+xml";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export interface StoredFile {
  key: string;
  /** Public URL served by /api/uploads/[...path]. */
  url: string;
}

export interface StorageProvider {
  save(input: { folder: UploadFolder; data: Uint8Array; contentType: StoredImageType }): Promise<StoredFile>;
  /** Returns the file, or null if the key is invalid or missing. */
  read(key: string): Promise<{ data: Uint8Array; contentType: StoredImageType } | null>;
  delete(key: string): Promise<void>;
}
