import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A private secret handed to a PC once, when it registers. Only its hash is kept on the server. A PC that later can't
 * show it is not the install that registered (someone copied the licence key and device id to another machine).
 */
export const generateDeviceSecret = (): string => `dsk_${randomBytes(32).toString("base64url")}`;

export const hashDeviceSecret = (secret: string): string => createHash("sha256").update(secret.trim()).digest("hex");

export type SecretState = "none" | "bound" | "missing" | "wrong";

/**
 * - none: no secret has been issued to this device yet
 * - bound: it showed the right secret
 * - missing: a secret was issued but this request didn't carry one (an older POS that doesn't store it)
 * - wrong: it sent a secret that doesn't match: the strong signal of a copied install
 */
export function checkDeviceSecret(storedHash: unknown, presented: string | undefined): SecretState {
  if (typeof storedHash !== "string" || storedHash === "") return "none";
  if (!presented) return "missing";
  const a = Buffer.from(hashDeviceSecret(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? "bound" : "wrong";
}
