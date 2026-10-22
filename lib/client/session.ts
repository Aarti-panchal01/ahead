// One session id per visit (in memory only, like everything else). Sent on every try-on as x-ahead-session so
// POST /api/session/end can delete this visit's try-ons from YouCam (docs/api-truth-table.md row 17).
export const SESSION_HEADER = "x-ahead-session";
/** Same rule as the server: 8 to 64 of [A-Za-z0-9_-]. */
export const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

let current: string | undefined;

function randomId(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  // base64url without padding: 24 chars of [A-Za-z0-9_-]
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getSessionId(): string {
  current ??= randomId();
  return current;
}

/** Forget the id; the next try-on starts a new session. */
export function resetSessionId(): void {
  current = undefined;
}

export function sessionHeaders(): Record<string, string> {
  return { [SESSION_HEADER]: getSessionId() };
}

/**
 * Ends the session on the server (deletes its YouCam tasks). keepalive lets it finish while the page unloads;
 * sendBeacon can't carry our header, so fetch is used. Never throws.
 */
export async function endSession(fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!current) return false; // nothing was tried on this visit
  const id = current;
  try {
    const r = await fetchFn("/api/session/end", { method: "POST", headers: { [SESSION_HEADER]: id }, keepalive: true });
    return r.ok;
  } catch {
    return false;
  }
}
