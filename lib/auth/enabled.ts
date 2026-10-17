/**
 * Sign-in is switched off until the hosted project is fully set up
 * (secret key, migrations, SMTP). See README → "Turning on sign-in".
 * Read at request time, server-side only.
 */
export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}
