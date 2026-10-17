/**
 * Only same-site relative paths are allowed as post-sign-in destinations.
 * Rejects absolute URLs, protocol-relative ("//evil.com"), backslash tricks
 * and anything with control characters.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://catfound.invalid");
    if (url.origin !== "http://catfound.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
