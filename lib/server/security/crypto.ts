import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface EncryptionKeyring {
  readonly activeVersion: string;
  readonly keys: Readonly<Record<string, Uint8Array>>;
}

export interface EncryptedBytes {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyVersion: string;
}

export interface VersionedEnvelope {
  readonly v: string;
  readonly n: string;
  readonly c: string;
}

function decodeBase64Key(name: string, value: string | undefined, expectedBytes = 32): Buffer {
  if (!value) throw new Error(`${name} is not configured.`);
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== expectedBytes) throw new Error(`${name} must be ${expectedBytes} bytes encoded as base64.`);
  return key;
}

export function encryptionKeyringFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): EncryptionKeyring {
  const activeVersion = env.APP_DATA_ENCRYPTION_KEY_VERSION ?? env.PATTERNWORK_ACTIVE_KEY_VERSION ?? "v1";
  const prefix = "PATTERNWORK_ENCRYPTION_KEY_";
  const keys: Record<string, Buffer> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(prefix) || !value) continue;
    const version = name.slice(prefix.length).toLowerCase();
    keys[version] = decodeBase64Key(name, value);
  }
  if (env.APP_DATA_ENCRYPTION_KEY) keys[activeVersion] = decodeBase64Key("APP_DATA_ENCRYPTION_KEY", env.APP_DATA_ENCRYPTION_KEY);
  if (!keys[activeVersion]) {
    keys[activeVersion] = decodeBase64Key(`PATTERNWORK_ENCRYPTION_KEY_${activeVersion.toUpperCase()}`, env[`PATTERNWORK_ENCRYPTION_KEY_${activeVersion.toUpperCase()}`]);
  }
  return { activeVersion, keys };
}

export function cookieKeyringFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): EncryptionKeyring {
  const secret = env.ASSESSMENT_COOKIE_SECRET;
  if (!secret || secret.length < 32) throw new Error("ASSESSMENT_COOKIE_SECRET must contain at least 32 characters.");
  const version = "cookie-v1";
  const key = createHash("sha256").update("patternwork:assessment-cookie:", "utf8").update(secret, "utf8").digest();
  return { activeVersion: version, keys: { [version]: key } };
}

export function encryptBytes(
  plaintext: Uint8Array,
  purpose: string,
  keyring: EncryptionKeyring,
): EncryptedBytes {
  const key = keyring.keys[keyring.activeVersion];
  if (!key || key.byteLength !== 32) throw new Error(`Missing valid encryption key ${keyring.activeVersion}.`);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([encrypted, tag]), nonce, keyVersion: keyring.activeVersion };
}

export function decryptBytes(encrypted: EncryptedBytes, purpose: string, keyring: EncryptionKeyring): Buffer {
  const key = keyring.keys[encrypted.keyVersion];
  if (!key || key.byteLength !== 32) throw new Error(`Unknown encryption key version ${encrypted.keyVersion}.`);
  if (encrypted.nonce.byteLength !== 12 || encrypted.ciphertext.byteLength < 16) throw new Error("Malformed encrypted value.");
  const body = encrypted.ciphertext.subarray(0, -16);
  const tag = encrypted.ciphertext.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.nonce);
  decipher.setAAD(Buffer.from(purpose, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function encryptJson(value: unknown, purpose: string, keyring: EncryptionKeyring): EncryptedBytes {
  return encryptBytes(Buffer.from(JSON.stringify(value), "utf8"), purpose, keyring);
}

export function decryptJson<T>(encrypted: EncryptedBytes, purpose: string, keyring: EncryptionKeyring): T {
  return JSON.parse(decryptBytes(encrypted, purpose, keyring).toString("utf8")) as T;
}

export function encryptString(value: string, purpose: string, keyring: EncryptionKeyring): EncryptedBytes {
  return encryptBytes(Buffer.from(value, "utf8"), purpose, keyring);
}

export function decryptString(encrypted: EncryptedBytes, purpose: string, keyring: EncryptionKeyring): string {
  return decryptBytes(encrypted, purpose, keyring).toString("utf8");
}

export function packEnvelope(encrypted: EncryptedBytes): string {
  const envelope: VersionedEnvelope = {
    v: encrypted.keyVersion,
    n: encrypted.nonce.toString("base64url"),
    c: encrypted.ciphertext.toString("base64url"),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

export function unpackEnvelope(value: string): EncryptedBytes {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<VersionedEnvelope>;
  if (typeof parsed.v !== "string" || typeof parsed.n !== "string" || typeof parsed.c !== "string") throw new Error("Malformed encrypted envelope.");
  return { keyVersion: parsed.v, nonce: Buffer.from(parsed.n, "base64url"), ciphertext: Buffer.from(parsed.c, "base64url") };
}

export function normalizeEmail(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function emailLookupHash(email: string, hmacKey?: Uint8Array): string {
  const key = hmacKey ?? decodeBase64Key("EMAIL_LOOKUP_HMAC_KEY", process.env.EMAIL_LOOKUP_HMAC_KEY ?? process.env.PATTERNWORK_EMAIL_HMAC_KEY);
  return createHmac("sha256", key).update(normalizeEmail(email), "utf8").digest("hex");
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function randomOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
