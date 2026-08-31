import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 🔒 Council portal credentials — encryption at rest.
 *
 * Both COT and CoE ask a firm for every staff member's council login
 * ("USER'S LOGIN DETAILS — LIST OF ALL STAFF", handwritten notes 2026-08-31).
 * That means this application stores live third-party municipal passwords for
 * every attorney at every firm on the platform, which makes
 * `firm_council_credentials` the highest-value table in the schema.
 *
 * Zewn, asked how to handle it: "make the fields entered but only a
 * conveyclear admin can see the data once entered." Admin-only RLS answers who
 * may QUERY the table. It does nothing about a database dump, a leaked backup,
 * or a stray `select *` in a support session — so the values are encrypted
 * here, in the application, before they ever reach Postgres.
 *
 * AES-256-GCM: authenticated encryption, so a tampered ciphertext fails to
 * decrypt rather than returning altered plaintext.
 *
 * THE KEY LIVES IN THE ENVIRONMENT, NEVER IN THE DATABASE — `COUNCIL_CRED_KEY`,
 * exactly where the standing rule puts machine secrets (Vercel env and
 * .env.local). Storing it in Postgres beside the ciphertext would make the
 * encryption decorative.
 *
 * ⚠️ THE TRADE, STATED PLAINLY: lose `COUNCIL_CRED_KEY` and every stored
 * credential is unrecoverable and must be re-entered by each firm. That is the
 * correct failure mode for a secret store, but it has to be known. Back the key
 * up in Vaultwarden.
 *
 * ⚠️ Server-only. Never import this into a client component — doing so would
 * ship the key material path into the browser bundle.
 */

/** Wire format: `v<version>.<iv>.<authTag>.<ciphertext>`, all base64url. */
const FORMAT_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32; // AES-256

export class CredentialKeyMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialKeyMissingError";
  }
}

/**
 * The active key, or an explicit failure.
 *
 * Deliberately throws rather than falling back to storing plaintext. A missing
 * key must break the write path loudly — silently degrading to plaintext is how
 * a credential store becomes a credential leak.
 */
function activeKey(): Buffer {
  const raw = process.env.COUNCIL_CRED_KEY;

  if (!raw) {
    throw new CredentialKeyMissingError(
      "COUNCIL_CRED_KEY is not set. Council logins cannot be stored without " +
        "it, and storing them unencrypted is not an option. Generate one with " +
        "`openssl rand -base64 32`, put it in Vercel env and .env.local, and " +
        "back it up in Vaultwarden."
    );
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new CredentialKeyMissingError(
      `COUNCIL_CRED_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        "Generate one with `openssl rand -base64 32`."
    );
  }

  return key;
}

/** True when credentials can be stored at all. Use to gate the UI. */
export function credentialEncryptionAvailable(): boolean {
  try {
    activeKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt one value for storage. Returns the wire format described above. */
export function encryptCredential(plaintext: string): string {
  const key = activeKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    `v${FORMAT_VERSION}`,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt one stored value.
 *
 * Throws on a tampered or truncated value rather than returning something
 * plausible — that is the whole point of using GCM over CBC here.
 */
export function decryptCredential(stored: string): string {
  const key = activeKey();
  const parts = stored.split(".");

  if (parts.length !== 4 || parts[0] !== `v${FORMAT_VERSION}`) {
    throw new Error(
      "Stored credential is not in the expected format. It may have been " +
        "written by a different key version — check key_version on the row."
    );
  }

  const [, ivPart, tagPart, ctPart] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ctPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** The key version new rows are written with. Stored so the key can rotate. */
export function currentKeyVersion(): number {
  return FORMAT_VERSION;
}

export interface CouncilCredentialInput {
  userId: string;
  firmId: string;
  municipality: string;
  username: string;
  password: string;
}

export interface EncryptedCouncilCredential {
  user_id: string;
  firm_id: string;
  municipality: string;
  username_ciphertext: string;
  password_ciphertext: string;
  key_version: number;
}

/** Shape one credential for insert. The only place a row should be built. */
export function encryptCouncilCredential(
  input: CouncilCredentialInput
): EncryptedCouncilCredential {
  const username = input.username.trim();
  const password = input.password;

  if (!username || !password) {
    throw new Error("A council login needs both a username and a password.");
  }

  return {
    user_id: input.userId,
    firm_id: input.firmId,
    municipality: input.municipality.trim().toUpperCase(),
    username_ciphertext: encryptCredential(username),
    password_ciphertext: encryptCredential(password),
    key_version: currentKeyVersion(),
  };
}
