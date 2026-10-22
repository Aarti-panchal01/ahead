import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, prepareUpload } from "@/lib/youcam/images";
import { fetchRemoteImage, isPrivateIp, parsePublicUrl, safeLookup, type RemoteDeps } from "@/lib/youcam/remote";
import { jpeg } from "./helpers";

describe("upload pipeline", () => {
  it("resizes to long side 1024 and outputs a JPG", async () => {
    const out = await prepareUpload(await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#888" } }).png().toBuffer());
    const m = await sharp(out).metadata();
    expect(m.format).toBe("jpeg");
    expect(Math.max(m.width!, m.height!)).toBe(1024);
  });
  it("does not enlarge small photos", async () => {
    const m = await sharp(await prepareUpload(await jpeg(400, 500))).metadata();
    expect([m.width, m.height]).toEqual([400, 500]);
  });
  it("strips EXIF metadata", async () => {
    const withExif = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#444" } })
      .jpeg().withExif({ IFD0: { Copyright: "private-owner", Artist: "someone" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await prepareUpload(withExif);
    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(out.includes(Buffer.from("private-owner"))).toBe(false);
  });
  it("applies EXIF orientation before stripping it", async () => {
    const rotated = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#444" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const m = await sharp(await prepareUpload(rotated)).metadata();
    expect([m.width, m.height]).toEqual([400, 600]);
  });
  it("rejects non-images, empty files, oversize files and tiny photos with plain messages", async () => {
    await expect(prepareUpload(Buffer.from("<html>not a photo</html>"))).rejects.toMatchObject({ code: "not_image", message: expect.stringMatching(/JPG, PNG or WebP/) });
    await expect(prepareUpload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).rejects.toMatchObject({ code: "not_image" });
    await expect(prepareUpload(Buffer.alloc(0))).rejects.toMatchObject({ code: "empty_upload" });
    await expect(prepareUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toMatchObject({ code: "too_large", message: expect.stringMatching(/10 MB/) });
    await expect(prepareUpload(await jpeg(100, 100))).rejects.toMatchObject({ code: "too_small" });
  });
});

describe("SSRF protection", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe",
  ])("treats %s as private", (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"])("treats %s as public", (ip) => expect(isPrivateIp(ip)).toBe(false));

  it.each([
    "http://example.com/a.jpg", "ftp://example.com/a.jpg", "https://user:pw@example.com/a.jpg", "https://example.com:8443/a.jpg",
    "https://localhost/a.jpg", "https://foo.localhost/a.jpg", "https://printer.local/a.jpg", "https://127.0.0.1/a.jpg",
    "https://[::1]/a.jpg", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/a.jpg", "not a url", "file:///etc/passwd",
  ])("rejects %s before any network call", (u) => {
    expect(() => parsePublicUrl(u)).toThrow();
  });
  it("accepts a normal https URL", () => {
    expect(parsePublicUrl("https://images.example.com/wig.jpg").hostname).toBe("images.example.com");
  });

  it("blocks a hostname that resolves to a private address (DNS rebinding safe)", async () => {
    const lookup = safeLookup((_h, _o, cb) => cb(null, [{ address: "10.0.0.8", family: 4 }]));
    const err = await new Promise<NodeJS.ErrnoException | null>((res) => lookup("evil.example", {}, (e) => res(e)));
    expect(err?.code).toBe("EBLOCKED");
    const ok = safeLookup((_h, _o, cb) => cb(null, [{ address: "93.184.216.34", family: 4 }]));
    const err2 = await new Promise<NodeJS.ErrnoException | null>((res) => ok("good.example", {}, (e) => res(e)));
    expect(err2).toBeNull();
  });

  function deps(handler: (url: URL) => { status: number; headers?: Record<string, string | undefined>; body?: Buffer }): RemoteDeps & { urls: string[] } {
    const urls: string[] = [];
    return {
      urls,
      get: (url, cb) => {
        urls.push(url.toString());
        const r = handler(url);
        const res = Object.assign(Readable.from([r.body ?? Buffer.alloc(0)]), { statusCode: r.status, headers: r.headers ?? {} }) as unknown as IncomingMessage;
        queueMicrotask(() => cb(res));
        return { on: () => undefined, setTimeout: () => undefined, destroy: () => undefined };
      },
    };
  }

  it("fetches an image", async () => {
    const img = await jpeg();
    const d = deps(() => ({ status: 200, headers: { "content-type": "image/jpeg" }, body: img }));
    expect((await fetchRemoteImage("https://cdn.example.com/w.jpg", d)).equals(img)).toBe(true);
  });
  it("rejects non-image content types", async () => {
    const d = deps(() => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html>") }));
    await expect(fetchRemoteImage("https://shop.example.com/listing", d)).rejects.toMatchObject({ code: "not_an_image_url" });
    const svg = deps(() => ({ status: 200, headers: { "content-type": "image/svg+xml" }, body: Buffer.from("<svg/>") }));
    await expect(fetchRemoteImage("https://shop.example.com/a.svg", svg)).rejects.toMatchObject({ code: "not_an_image_url" });
  });
  it("rejects oversize images by header and by streamed size", async () => {
    const byHeader = deps(() => ({ status: 200, headers: { "content-type": "image/jpeg", "content-length": String(MAX_UPLOAD_BYTES + 1) } }));
    await expect(fetchRemoteImage("https://cdn.example.com/big.jpg", byHeader)).rejects.toMatchObject({ code: "too_large" });
    const streamed = deps(() => ({ status: 200, headers: { "content-type": "image/jpeg" }, body: Buffer.alloc(MAX_UPLOAD_BYTES + 5) }));
    await expect(fetchRemoteImage("https://cdn.example.com/big2.jpg", streamed)).rejects.toMatchObject({ code: "too_large" });
  });
  it("follows redirects but re-checks every hop for private targets", async () => {
    const d = deps((u) => u.hostname === "cdn.example.com"
      ? { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }
      : { status: 200, headers: { "content-type": "image/jpeg" }, body: Buffer.from("x") });
    await expect(fetchRemoteImage("https://cdn.example.com/r", d)).rejects.toMatchObject({ code: "blocked_url" });
    expect(d.urls).toEqual(["https://cdn.example.com/r"]);
    const http = deps(() => ({ status: 301, headers: { location: "http://cdn.example.com/x.jpg" } }));
    await expect(fetchRemoteImage("https://cdn.example.com/r", http)).rejects.toMatchObject({ code: "bad_url" });
  });
  it("gives up after too many redirects and on non-200 answers", async () => {
    const loop = deps(() => ({ status: 302, headers: { location: "https://cdn.example.com/again" } }));
    await expect(fetchRemoteImage("https://cdn.example.com/a", loop)).rejects.toMatchObject({ code: "fetch_failed" });
    const nf = deps(() => ({ status: 404 }));
    await expect(fetchRemoteImage("https://cdn.example.com/a", nf)).rejects.toMatchObject({ code: "fetch_failed" });
  });
});
