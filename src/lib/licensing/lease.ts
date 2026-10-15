import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { HttpError } from "@/lib/httpError";

/**
 * The server answers licence checks with a signed "lease": a JSON string plus an Ed25519 signature over
 * that exact string. The POS verifies it offline with the public key, so a tampered or forged response
 * (or a hand-edited local file) is rejected. Generate the key pair with `node scripts/generate-signing-key.mjs`.
 */
export const signingConfigured = () => Boolean(process.env.LICENSE_SIGNING_PRIVATE_KEY);

/**
 * Reads LICENSE_SIGNING_PRIVATE_KEY tolerantly. Host consoles often mangle a pasted PEM: surrounding quotes, a literal "\\n"
 * instead of line breaks, or line breaks turned into spaces. So instead of handing the text to the PEM parser as-is, we pull out
 * the base64 body (ignoring the BEGIN/END lines and every kind of whitespace) and load it as PKCS#8 DER.
 */
const loadKey = () => {
  const body = (process.env.LICENSE_SIGNING_PRIVATE_KEY ?? "")
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END)[A-Z ]*-----/g, "")
    .replace(/["'\s]/g, "");
  return createPrivateKey({ key: Buffer.from(body, "base64"), format: "der", type: "pkcs8" });
};

export interface SigningKeyInfo { configured: boolean; valid: boolean; problem?: string; /** Base64 of the public key (SPKI). Paste into the POS's LicenseConfig.java; it accepts this form. */ publicKey?: string }

/** Is the signing key set, is it a usable Ed25519 PEM private key, and what is the matching public key? Never exposes the private key. */
export function signingKeyInfo(): SigningKeyInfo {
  if (!signingConfigured()) return { configured: false, valid: false };
  try {
    const key = loadKey();
    if (key.asymmetricKeyType !== "ed25519") {
      return { configured: true, valid: false, problem: `LICENSE_SIGNING_PRIVATE_KEY is a ${key.asymmetricKeyType ?? "unknown"} key, but it must be Ed25519. Generate one with npm run signing-key.` };
    }
    return { configured: true, valid: true, publicKey: createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64") };
  } catch {
    return { configured: true, valid: false, problem: "LICENSE_SIGNING_PRIVATE_KEY is not a valid PEM private key. It may be a random string or have lost its line breaks. Generate one with npm run signing-key and paste the PRIVATE KEY value exactly as printed." };
  }
}

export function signLease(payload: object): { lease: string; signature: string | null } {
  const lease = JSON.stringify(payload);
  if (!signingConfigured()) return { lease, signature: null };
  let key;
  try {
    key = loadKey();
    // A key that parses but isn't Ed25519 (for example the Firebase admin RSA key pasted by mistake) would otherwise crash at sign() with an unexplained 500.
    if (key.asymmetricKeyType !== "ed25519") throw new Error(`LICENSE_SIGNING_PRIVATE_KEY is a ${key.asymmetricKeyType ?? "unknown"} key, but it must be Ed25519.`);
  } catch (e) {
    // A broken key is the site owner's problem: say so clearly in the logs, and answer with a proper "service unavailable" instead of a mystery 500.
    console.error("[licensing] LICENSE_SIGNING_PRIVATE_KEY can't be read:", e instanceof Error ? e.message : e);
    throw new HttpError(503, "The licence server isn't set up correctly yet. Please contact support.", "server_misconfigured");
  }
  try {
    return { lease, signature: sign(null, Buffer.from(lease), key).toString("base64") };
  } catch (e) {
    console.error("[licensing] signing failed:", e instanceof Error ? e.message : e);
    throw new HttpError(503, "The licence server isn't set up correctly yet. Please contact support.", "server_misconfigured");
  }
}

export function verifyLease(lease: string, signature: string, publicKeyPem: string): boolean {
  try {
    return verify(null, Buffer.from(lease), createPublicKey(publicKeyPem), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}