// Image validation for uploads: the type is sniffed from magic bytes and the size is capped.
import { HttpError } from "@/server/http";
import { MAX_UPLOAD_BYTES, type StoredImageType, type UploadableImageType } from "./types";

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0) =>
  sig.every((b, i) => bytes[offset + i] === b);

/** Detects PNG / JPEG / WebP / GIF from the file header. Returns null for anything else. */
export function sniffImageType(bytes: Uint8Array): UploadableImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // GIF8
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export const EXTENSION_FOR: Record<StoredImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export const TYPE_FOR_EXTENSION: Record<string, StoredImageType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export interface ValidImage {
  data: Uint8Array;
  contentType: UploadableImageType;
}

/** Validates an uploaded File: non-empty, ≤ 5 MB, and actually a PNG/JPEG/WebP/GIF. Throws HttpError otherwise. */
export async function validateImageFile(file: File, field = "file"): Promise<ValidImage> {
  if (file.size === 0) throw new HttpError(400, "INVALID_IMAGE", "The image file is empty.", { field });
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", "Images must be 5 MB or smaller.", { field });
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(data);
  if (!contentType) {
    throw new HttpError(400, "INVALID_IMAGE", "Only PNG, JPEG, WebP or GIF images can be uploaded.", { field });
  }
  return { data, contentType };
}

/** Reads an optional image field from form data: a missing or empty field is `null`, a non-file value is a 400. */
export async function optionalImageField(form: FormData, field: string): Promise<ValidImage | null> {
  const value = form.get(field);
  if (value === null || value === "") return null;
  if (typeof value === "string") throw new HttpError(400, "INVALID_IMAGE", "Expected an image file.", { field });
  if (value.size === 0 && !value.name) return null; // browsers send an empty part when no file was chosen
  return validateImageFile(value, field);
}
