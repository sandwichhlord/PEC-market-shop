// Signup and login business logic. Route handlers only parse input, call these, and set the cookie.
import { Prisma } from "@/generated/prisma/client";
import { PORTAL_LOGIN, PORTAL_ROLE, ROLE_LABEL, ROLE_PORTAL } from "@/lib/portals";
import { placeholderSvg } from "@/lib/placeholder-svg";
import type { CustomerSignupInput, LoginInput, ShopSignupInput } from "@/lib/validation/auth";
import { prisma } from "@/server/db";
import { HttpError } from "@/server/http";
import { getStorage } from "@/server/storage";
import type { ValidImage } from "@/server/storage/image";
import type { StoredFile } from "@/server/storage/types";
import { AUTH_USER_SELECT, suspendedError, type AuthUser } from "./guards";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";


function emailTaken(): HttpError {
  return new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists. Try logging in instead.", {
    fieldErrors: { email: ["An account with this email already exists."] },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function assertEmailFree(email: string): Promise<void> {
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw emailTaken();
}

export async function signupCustomer(input: CustomerSignupInput): Promise<AuthUser> {
  await assertEmailFree(input.email);
  try {
    return await prisma.user.create({
      data: {
        role: "CUSTOMER",
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(input.password),
      },
      select: AUTH_USER_SELECT,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw emailTaken(); // lost a race with a concurrent signup
    throw err;
  }
}

const LOGO_COLORS = ["#ea580c", "#0d9488", "#7c3aed", "#2563eb", "#db2777", "#65a30d"];

function placeholderLogo(shopName: string): Uint8Array {
  const color = LOGO_COLORS[[...shopName].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % LOGO_COLORS.length]!;
  return new TextEncoder().encode(placeholderSvg({ label: shopName, color, kind: "logo" }));
}

/**
 * Creates a shop-owner account and its shop in one transaction. Without an uploaded logo a placeholder SVG logo is
 * generated. The logo file is written first and removed again if the database write fails.
 */
export async function signupShopOwner(
  input: ShopSignupInput,
  logo: ValidImage | null,
): Promise<{ user: AuthUser; shopId: string }> {
  await assertEmailFree(input.email);
  const storage = getStorage();
  const stored: StoredFile = logo
    ? await storage.save({ folder: "logos", data: logo.data, contentType: logo.contentType })
    : await storage.save({ folder: "logos", data: placeholderLogo(input.shopName), contentType: "image/svg+xml" });
  try {
    const passwordHash = await hashPassword(input.password);
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { role: "SHOP_OWNER", name: input.name, email: input.email, phone: input.phone ?? null, passwordHash },
        select: AUTH_USER_SELECT,
      });
      const shop = await tx.shop.create({
        data: {
          ownerId: user.id,
          name: input.shopName,
          description: input.shopDescription,
          location: input.location,
          logoUrl: stored.url,
        },
        select: { id: true },
      });
      return { user, shopId: shop.id };
    });
  } catch (err) {
    await storage.delete(stored.key);
    if (isUniqueViolation(err)) throw emailTaken();
    throw err;
  }
}

const INVALID_CREDENTIALS = () => new HttpError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");

/**
 * Checks credentials for a portal. Order of checks: credentials (401) → suspended (403 ACCOUNT_SUSPENDED) →
 * wrong portal (403 WRONG_PORTAL with the account's role and the right login page).
 */
export async function login(input: LoginInput): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { ...AUTH_USER_SELECT, passwordHash: true } });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw INVALID_CREDENTIALS();
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) throw INVALID_CREDENTIALS();
  if (user.status === "SUSPENDED") throw suspendedError();
  if (user.role !== PORTAL_ROLE[input.portal]) {
    const article = user.role === "ADMIN" ? "an" : "a";
    throw new HttpError(403, "WRONG_PORTAL", `This account is ${article} ${ROLE_LABEL[user.role]} account.`, {
      role: user.role,
      loginPath: PORTAL_LOGIN[ROLE_PORTAL[user.role]],
    });
  }
  const { passwordHash: _hash, ...authUser } = user;
  void _hash;
  return authUser;
}
