/** Builds the per-request Content-Security-Policy. No 'unsafe-inline' for scripts, ever. */
export function buildCsp(opts: {
  nonce: string;
  isDev: boolean;
  /** Only needed while Supabase Auth is in use. */
  supabaseUrl?: string;
  upgradeInsecure: boolean;
}): string {
  const supabase = opts.supabaseUrl ? [new URL(opts.supabaseUrl).origin] : [];
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        `'nonce-${opts.nonce}'`,
        "'strict-dynamic'",
        ...(opts.isDev ? ["'unsafe-eval'"] : []),
      ],
    ],
    // Dev tooling injects inline styles; production uses the nonce only.
    ["style-src", ["'self'", opts.isDev ? "'unsafe-inline'" : `'nonce-${opts.nonce}'`]],
    ["img-src", ["'self'", "blob:", "data:"]],
    ["font-src", ["'self'"]],
    [
      "connect-src",
      ["'self'", ...supabase, "https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io"],
    ],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["frame-src", ["'none'"]],
  ];
  const policy = directives.map(([k, v]) => `${k} ${v.join(" ")}`);
  if (opts.upgradeInsecure) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
