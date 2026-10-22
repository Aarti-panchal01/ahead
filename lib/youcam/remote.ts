// Fetch a listing photo from a user-supplied https URL without letting it reach our own network.
// Blocks private, loopback, link-local and other non-public addresses, checked at connect time
// (so DNS rebinding can't swap the address after the check), and every redirect hop.
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import type { IncomingMessage } from "node:http";
import { YoucamError } from "./errors";
import { messageFor } from "./messages";
import { MAX_UPLOAD_BYTES } from "./images";

const err = (code: string) => new YoucamError(code, messageFor(code));

export function isPrivateIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (fam === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const mappedHex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return (
      s === "::" || s === "::1" ||
      /^f[cd]/.test(s) ||            // fc00::/7 unique local
      /^fe[89ab]/.test(s) ||         // fe80::/10 link local
      /^ff/.test(s) ||               // multicast
      s.startsWith("64:ff9b:") ||    // NAT64
      s.startsWith("2001:db8") ||    // documentation
      s.startsWith("100::")          // discard
    );
  }
  return true; // not an IP: never trust
}

/** Syntax check, no network. Throws a plain YoucamError. */
export function parsePublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw err("bad_url"); }
  if (u.protocol !== "https:" || u.username || u.password) throw err("bad_url");
  if (u.port && u.port !== "443") throw err("bad_url");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw err("blocked_url");
  if (net.isIP(host) && isPrivateIp(host)) throw err("blocked_url");
  return u;
}

type LookupCb = (e: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;
type LookupFn = (hostname: string, opts: dns.LookupOptions, cb: LookupCb) => void;

/** A dns.lookup replacement that refuses to resolve to a non-public address. */
export function safeLookup(base: LookupFn = dns.lookup as unknown as LookupFn): LookupFn {
  return (hostname, opts, cb) => {
    base(hostname, { ...opts, all: true }, (e, addrs) => {
      if (e) return cb(e, "", 4);
      const list = addrs as dns.LookupAddress[];
      if (!list.length || list.some((a) => isPrivateIp(a.address))) {
        return cb(Object.assign(new Error("blocked"), { code: "EBLOCKED" }) as NodeJS.ErrnoException, "", 4);
      }
      if (opts.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

export interface RemoteDeps {
  get: (url: URL, cb: (res: IncomingMessage) => void) => { on(ev: "error", fn: (e: Error) => void): unknown; setTimeout(ms: number, fn: () => void): unknown; destroy(e?: Error): unknown };
}
const defaultDeps: RemoteDeps = {
  get: (url, cb) => https.get(url, { lookup: safeLookup() as never, headers: { Accept: "image/*", "User-Agent": "Ahead/1.0" } }, cb),
};

const MAX_REDIRECTS = 3;

/** Returns the raw image bytes (not yet validated as an image; run prepareUpload on them). */
export async function fetchRemoteImage(rawUrl: string, deps: RemoteDeps = defaultDeps): Promise<Buffer> {
  let url = parsePublicUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = deps.get(url, resolve);
      req.on("error", (e) => reject((e as NodeJS.ErrnoException).code === "EBLOCKED" ? err("blocked_url") : err("fetch_failed")));
      req.setTimeout(10_000, () => req.destroy(err("fetch_failed")));
    });
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      try { url = parsePublicUrl(new URL(res.headers.location, url).toString()); } catch (e) { throw e instanceof YoucamError ? e : err("bad_url"); }
      continue;
    }
    if (status !== 200) { res.resume(); throw err("fetch_failed"); }
    const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/") || type === "image/svg+xml") { res.resume(); throw err("not_an_image_url"); }
    const len = Number(res.headers["content-length"] ?? 0);
    if (len > MAX_UPLOAD_BYTES) { res.resume(); throw err("too_large"); }
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const c of res) {
        total += (c as Buffer).length;
        if (total > MAX_UPLOAD_BYTES) { res.destroy(); throw err("too_large"); }
        chunks.push(c as Buffer);
      }
    } catch (e) {
      throw e instanceof YoucamError ? e : err("fetch_failed");
    }
    return Buffer.concat(chunks);
  }
  throw err("fetch_failed");
}
