import { describe, expect, it } from "vitest";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { POST as markRead } from "@/app/api/notifications/read/route";
import { prisma } from "@/server/db";
import { apiRequest, createUser, sessionCookie } from "../helpers/fixtures";

interface ListBody {
  notifications: { id: string; title: string; readAt: string | null; createdAt: string }[];
  unreadCount: number;
  error?: { code: string };
}

async function seedNotes(userId: string, count: number, read = 0) {
  const base = Date.now() - 60 * 60_000;
  for (let i = 0; i < count; i++) {
    await prisma.notification.create({
      data: {
        userId,
        type: "ORDER_STATUS",
        title: `Note ${i}`,
        body: "Body",
        link: "/orders",
        createdAt: new Date(base + i * 60_000),
        readAt: i < read ? new Date(base) : null,
      },
    });
  }
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

async function list(cookie?: string) {
  const res = await listNotifications(apiRequest("/api/notifications", { cookie }));
  return { res, body: (await res.json()) as ListBody };
}

async function read(cookie: string | undefined, json: unknown) {
  const res = await markRead(apiRequest("/api/notifications/read", { cookie, json }));
  return { res, body: (await res.json()) as { unreadCount?: number; error?: { code: string } } };
}

describe("GET /api/notifications", () => {
  it("returns the user's own notifications newest first, with the unread count", async () => {
    const user = await createUser();
    const other = await createUser();
    await seedNotes(user.id, 4, 1);
    await seedNotes(other.id, 2);
    const { res, body } = await list(await sessionCookie(user));
    expect(res.status).toBe(200);
    expect(body.notifications.map((n) => n.title)).toEqual(["Note 3", "Note 2", "Note 1", "Note 0"]);
    expect(body.unreadCount).toBe(3);
  });

  it("works for every role and caps the list at 50", async () => {
    const { id, role } = await createUser({ role: "SHOP_OWNER" });
    await seedNotes(id, 55);
    const { body } = await list(await sessionCookie({ id, role }));
    expect(body.notifications).toHaveLength(50);
    expect(body.unreadCount).toBe(55);
    const admin = await createUser({ role: "ADMIN" });
    expect((await list(await sessionCookie(admin))).body).toEqual({ notifications: [], unreadCount: 0 });
  });

  it("401 when logged out, 403 when suspended", async () => {
    expect((await list()).res.status).toBe(401);
    const suspended = await createUser({ status: "SUSPENDED" });
    expect((await list(await sessionCookie(suspended))).res.status).toBe(403);
  });
});

describe("POST /api/notifications/read", () => {
  it("marks chosen notifications read and returns the new unread count", async () => {
    const user = await createUser();
    const notes = await seedNotes(user.id, 3);
    const { res, body } = await read(await sessionCookie(user), { ids: [notes[0]!.id, notes[2]!.id] });
    expect(res.status).toBe(200);
    expect(body.unreadCount).toBe(1);
    const after = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(after.map((n) => n.readAt !== null)).toEqual([true, false, true]);
  });

  it("keeps the original read time of already-read notifications", async () => {
    const user = await createUser();
    const [first] = await seedNotes(user.id, 1, 1);
    await read(await sessionCookie(user), { ids: [first!.id] });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: first!.id } })).readAt).toEqual(first!.readAt);
  });

  it("mark all read", async () => {
    const user = await createUser();
    await seedNotes(user.id, 5, 2);
    const { body } = await read(await sessionCookie(user), { all: true });
    expect(body.unreadCount).toBe(0);
    expect(await prisma.notification.count({ where: { userId: user.id, readAt: null } })).toBe(0);
  });

  it("never touches another user's notifications", async () => {
    const user = await createUser();
    const other = await createUser();
    const theirs = await seedNotes(other.id, 2);
    const { res, body } = await read(await sessionCookie(user), { ids: theirs.map((n) => n.id) });
    expect(res.status).toBe(200);
    expect(body.unreadCount).toBe(0);
    await read(await sessionCookie(user), { all: true });
    expect(await prisma.notification.count({ where: { userId: other.id, readAt: null } })).toBe(2);
  });

  it("validates the body and requires a session", async () => {
    const user = await createUser();
    const cookie = await sessionCookie(user);
    for (const bad of [{}, { ids: [] }, { all: false }, { ids: "x" }, { all: true, ids: ["a"] }, { ids: Array(101).fill("a") }]) {
      const { res, body } = await read(cookie, bad);
      expect(res.status, JSON.stringify(bad).slice(0, 40)).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    }
    expect((await read(undefined, { all: true })).res.status).toBe(401);
  });
});
