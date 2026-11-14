import type { AuthUser } from "@/server/auth/guards";
import { prisma } from "@/server/db";

export interface MeResponse {
  user: AuthUser;
  shop: { id: string; name: string; logoUrl: string | null; location: string; isOpen: boolean } | null;
}

/** The current user's profile plus, for shop owners, a summary of their shop. */
export async function getMe(user: AuthUser): Promise<MeResponse> {
  const shop =
    user.role === "SHOP_OWNER"
      ? await prisma.shop.findUnique({
          where: { ownerId: user.id },
          select: { id: true, name: true, logoUrl: true, location: true, isOpen: true },
        })
      : null;
  return { user, shop };
}
