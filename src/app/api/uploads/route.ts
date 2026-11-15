import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/guards";
import { HttpError, forbidden, readForm, withErrors } from "@/server/http";
import { getStorage } from "@/server/storage";
import { validateImageFile } from "@/server/storage/image";
import { UPLOAD_FOLDERS, type UploadFolder } from "@/server/storage/types";

const folderSchema = z.enum(UPLOAD_FOLDERS);

/** Who may upload into which folder: shop images for shop owners, review photos for customers; admins any. */
const FOLDER_ROLES: Record<UploadFolder, Role[]> = {
  logos: ["SHOP_OWNER", "ADMIN"],
  menu: ["SHOP_OWNER", "ADMIN"],
  reviews: ["CUSTOMER", "ADMIN"],
};

/**
 * POST multipart { folder: logos|menu|reviews, file } → { url }. Signed-in, non-suspended users, limited to the
 * folders their role uses. Bodies over one image (5 MB + multipart allowance) are refused while streaming in.
 */
export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const form = await readForm(req);
  const folder = folderSchema.parse(form.get("folder"));
  if (!FOLDER_ROLES[folder].includes(user.role)) throw forbidden(`You can't upload images to "${folder}".`);
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "INVALID_IMAGE", "Choose an image to upload.", { field: "file" });
  const image = await validateImageFile(file);
  const stored = await getStorage().save({ folder, data: image.data, contentType: image.contentType });
  return NextResponse.json({ url: stored.url }, { status: 201 });
});
