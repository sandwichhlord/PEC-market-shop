import { describe, expect, it } from "vitest";
import { POST as upload } from "@/app/api/uploads/route";
import { GET as serve } from "@/app/api/uploads/[...path]/route";
import { getStorage } from "@/server/storage";
import { JPEG_BYTES, PNG_BYTES, apiRequest, createUser, imageFile, sessionCookie } from "../helpers/fixtures";

function uploadForm(file: File | string, folder = "menu") {
  const form = new FormData();
  form.set("folder", folder);
  form.set("file", file);
  return form;
}

const serveKey = (key: string) => serve(apiRequest(`/api/uploads/${key}`), { params: Promise.resolve({ path: key.split("/") }) });

describe("POST /api/uploads", () => {
  it("requires a session", async () => {
    expect((await upload(apiRequest("/api/uploads", { form: uploadForm(imageFile()) }))).status).toBe(401);
  });

  it("rejects suspended users", async () => {
    const cookie = await sessionCookie(await createUser({ status: "SUSPENDED" }));
    expect((await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(imageFile()) }))).status).toBe(403);
  });

  it("stores an image and serves it back with its sniffed type", async () => {
    const cookie = await sessionCookie(await createUser({ role: "SHOP_OWNER" }));
    // Client claims PNG but sends JPEG bytes: the stored type follows the bytes.
    const res = await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(imageFile(JPEG_BYTES, "x.png", "image/png")) }));
    expect(res.status).toBe(201);
    const { url } = await res.json();
    expect(url).toMatch(/^\/api\/uploads\/menu\/[a-z0-9]+-[0-9a-f]{16}\.jpg$/);

    const served = await serveKey(url.replace("/api/uploads/", ""));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(JPEG_BYTES);
  });

  it("rejects non-images, SVG uploads and empty files", async () => {
    const cookie = await sessionCookie(await createUser({ role: "SHOP_OWNER" }));
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "x.svg", {
      type: "image/svg+xml",
    });
    for (const file of [new File(["hello"], "a.txt", { type: "text/plain" }), svg, new File([], "e.png", { type: "image/png" })]) {
      const res = await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(file) }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_IMAGE");
    }
  });

  it("rejects files over 5 MB with 413", async () => {
    const cookie = await sessionCookie(await createUser({ role: "SHOP_OWNER" }));
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    const res = await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(imageFile(big)) }));
    expect(res.status).toBe(413);
  });

  it("rejects unknown folders and missing files", async () => {
    const cookie = await sessionCookie(await createUser({ role: "SHOP_OWNER" }));
    expect((await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(imageFile(), "../etc") }))).status).toBe(400);
    expect((await upload(apiRequest("/api/uploads", { cookie, form: uploadForm("not a file") }))).status).toBe(400);
  });

  it("limits each role to the folders it uses", async () => {
    const customer = await sessionCookie(await createUser());
    const owner = await sessionCookie(await createUser({ role: "SHOP_OWNER" }));
    const admin = await sessionCookie(await createUser({ role: "ADMIN" }));
    const cases = [
      [customer, "menu", 403],
      [customer, "logos", 403],
      [customer, "reviews", 201],
      [owner, "reviews", 403],
      [owner, "logos", 201],
      [admin, "menu", 201],
      [admin, "reviews", 201],
    ] as const;
    for (const [cookie, folder, status] of cases) {
      const res = await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(imageFile(), folder) }));
      expect(res.status, folder).toBe(status);
    }
  });

  it("refuses an oversized body even without a Content-Length header", async () => {
    const cookie = await sessionCookie(await createUser({ role: "SHOP_OWNER" }));
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 20) return controller.close();
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const req = new Request("http://localhost:3000/api/uploads", {
      method: "POST",
      headers: { cookie, "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
    const res = await upload(req);
    expect(res.status).toBe(413);
    // 20 MB offered; reading stops just past the 5 MB cap (plus the stream's one-chunk read-ahead).
    expect(sent).toBeLessThanOrEqual(8);
  });
});

describe("GET /api/uploads/[...path]", () => {
  it("serves stored SVG placeholders inside a sandbox", async () => {
    const stored = await getStorage().save({
      folder: "logos",
      data: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      contentType: "image/svg+xml",
    });
    const res = await serveKey(stored.key);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  it.each([["../../.env"], ["logos/../../package.json"], ["logos/missing.png"], ["logos/file.txt"], ["..%2F.env"]])(
    "404s %s",
    async (key) => {
      expect((await serveKey(key)).status).toBe(404);
    },
  );
});
