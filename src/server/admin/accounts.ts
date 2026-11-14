// Admin account actions (SPEC §6): warn with a message, suspend, reinstate. Used by the users list and the reports
// queue. Admin accounts are out of reach. Suspension takes effect on the user's next request (every guard and portal
// layout re-reads the status) and their open sockets are closed straight away.
import type { Prisma } from "@/generated/prisma/client";
import type { AccountStatus, Role } from "@/generated/prisma/enums";
import type { AccountAction } from "@/lib/validation/admin";
import { prisma } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { disconnectUser, emitNotifications } from "@/server/realtime/emit";

type Tx = Prisma.TransactionClient;

export const NOTIFICATION_SELECT = { id: true, userId: true, type: true, title: true, body: true, link: true, createdAt: true } as const;
export type CreatedNotification = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

export interface AccountState {
  id: string;
  role: Role;
  status: AccountStatus;
  warningMessage: string | null;
}

export interface AccountActionOutcome {
  /** False when the account already was in the requested state (repeat request): nothing happened. */
  changed: boolean;
  user: AccountState;
  /** Created inside the transaction; push them once it has committed. */
  notifications: CreatedNotification[];
  suspended: boolean;
}

const ACCOUNT_SELECT = { id: true, role: true, status: true, warningMessage: true } as const;

/** Applies an account action inside `tx`. Callers commit, then call `afterAccountAction`. */
export async function applyAccountAction(tx: Tx, userId: string, action: AccountAction): Promise<AccountActionOutcome> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
  if (!user) throw notFound("User not found.");
  if (user.role === "ADMIN") throw new HttpError(403, "ADMIN_ACCOUNT", "Admin accounts cannot be warned or suspended.");

  let data: { status: AccountStatus; warningMessage?: string | null };
  let message: string | null = null;
  switch (action.action) {
    case "warn":
      if (user.status === "SUSPENDED") {
        throw new HttpError(409, "ACCOUNT_SUSPENDED", "This account is suspended. Reinstate it before sending a warning.");
      }
      if (user.status === "WARNED" && user.warningMessage === action.message) return { changed: false, user, notifications: [], suspended: false };
      data = { status: "WARNED", warningMessage: action.message };
      message = `You received a warning from the market admin: “${action.message}”`;
      break;
    case "suspend":
      if (user.status === "SUSPENDED") return { changed: false, user, notifications: [], suspended: false };
      data = { status: "SUSPENDED" };
      break;
    case "reinstate":
      if (user.status === "ACTIVE") return { changed: false, user, notifications: [], suspended: false };
      data = { status: "ACTIVE", warningMessage: null };
      message = "Your account is in good standing again.";
      break;
  }

  // Conditional on the status we read, so two admins acting at once cannot interleave.
  const { count } = await tx.user.updateMany({ where: { id: userId, status: user.status }, data });
  if (count === 0) throw new HttpError(409, "ACCOUNT_CHANGED", "This account was just changed by someone else. Refresh and try again.");
  const notifications = message
    ? [
        await tx.notification.create({
          data: { userId, type: "ACCOUNT", title: "Account", body: message, link: user.role === "SHOP_OWNER" ? "/shop" : "/account" },
          select: NOTIFICATION_SELECT,
        }),
      ]
    : [];
  const updated = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: ACCOUNT_SELECT });
  return { changed: true, user: updated, notifications, suspended: action.action === "suspend" };
}

/** Real-time side effects of a committed account action. */
export function afterAccountAction(outcome: AccountActionOutcome): void {
  emitNotifications(outcome.notifications);
  if (outcome.suspended) disconnectUser(outcome.user.id);
}

/** Users list action: one account action in its own transaction. */
export async function actOnAccount(userId: string, action: AccountAction) {
  const outcome = await prisma.$transaction((tx) => applyAccountAction(tx, userId, action));
  afterAccountAction(outcome);
  return { changed: outcome.changed, user: outcome.user };
}
