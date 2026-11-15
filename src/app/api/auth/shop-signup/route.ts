import { NextResponse } from "next/server";
import { ROLE_HOME } from "@/lib/portals";
import { shopSignupSchema } from "@/lib/validation/auth";
import { signupShopOwner } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/session";
import { readForm, withErrors } from "@/server/http";
import { optionalImageField } from "@/server/storage/image";

const TEXT_FIELDS = ["name", "email", "password", "phone", "shopName", "shopDescription", "location"] as const;

// Public by design: shop owners sign up here (multipart: account + shop fields + optional `logo` image).
export const POST = withErrors(async (req: Request) => {
  const form = await readForm(req, { field: "logo" });
  const raw: Record<string, string | undefined> = {};
  for (const field of TEXT_FIELDS) {
    const value = form.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  const input = shopSignupSchema.parse(raw);
  const logo = await optionalImageField(form, "logo");
  const { user, shopId } = await signupShopOwner(input, logo);
  const res = NextResponse.json({ user, shopId, redirectTo: ROLE_HOME.SHOP_OWNER }, { status: 201 });
  await setSessionCookie(res, { userId: user.id, role: user.role });
  return res;
});
