const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for every mutating request (route handlers and Server Actions).
 * Layered on SameSite=lax cookies and Next's own Server Action origin check:
 * the request must carry an Origin header matching the host it was sent to,
 * and must not be flagged cross-site by Fetch Metadata.
 */
export function isCsrfSafe(req: {
  method: string;
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
}): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  if (req.secFetchSite === "cross-site") return false;
  if (!req.origin || !req.host) return false;
  try {
    return new URL(req.origin).host === req.host;
  } catch {
    return false;
  }
}
