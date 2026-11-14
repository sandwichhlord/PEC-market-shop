import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/guards";
import { HttpError, readForm, withErrors } from "@/server/http";
import { getStorage } from "@/server/storage";
import { validateImageFile } from "@/server/storage/image";
import { MAX_UPLOAD_BYTES, UPLOAD_FOLDERS } from "@/server/storage/types";

const folderSchema = z.enum(UPLOAD_FOLDERS);

/** POST multipart { folder: logos|menu|reviews, file } → { url }. Any signed-in, non-suspended user. */
export const POST = withErrors(async (req: Request) => {
  await requireUser(req);
  // Reject oversized bodies before buffering them (multipart overhead allowance: 64 KB).
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", "Images must be 5 MB or smaller.", { field: "file" });
  }
  const form = await readForm(req);
  const folder = folderSchema.parse(form.get("folder"));
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "INVALID_IMAGE", "Choose an image to upload.", { field: "file" });
  const image = await validateImageFile(file);
  const stored = await getStorage().save({ folder, data: image.data, contentType: image.contentType });
  return NextResponse.json({ url: stored.url }, { status: 201 });
});
