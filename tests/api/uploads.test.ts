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
    const cookie = await sessionCookie(await createUser());
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
    const cookie = await sessionCookie(await createUser());
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    const res = await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(imageFile(big)) }));
    expect(res.status).toBe(413);
  });

  it("rejects unknown folders and missing files", async () => {
    const cookie = await sessionCookie(await createUser());
    expect((await upload(apiRequest("/api/uploads", { cookie, form: uploadForm(imageFile(), "../etc") }))).status).toBe(400);
    expect((await upload(apiRequest("/api/uploads", { cookie, form: uploadForm("not a file") }))).status).toBe(400);
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
