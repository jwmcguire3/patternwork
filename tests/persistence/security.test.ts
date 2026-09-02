import assert from "node:assert/strict";
import test from "node:test";
import {
  cookieKeyringFromEnv,
  decryptJson,
  decryptString,
  emailLookupHash,
  encryptJson,
  encryptString,
  encryptionKeyringFromEnv,
  normalizeEmail,
  packEnvelope,
  unpackEnvelope,
} from "../../lib/server/security/index.ts";

const dataKey = Buffer.alloc(32, 7).toString("base64");
const hmacKey = Buffer.alloc(32, 9);

test("AES-256-GCM versioned envelopes round-trip email, response, packet, and artifact payloads", () => {
  const keyring = encryptionKeyringFromEnv({ APP_DATA_ENCRYPTION_KEY: dataKey, APP_DATA_ENCRYPTION_KEY_VERSION: "v7" });
  const email = encryptString("person@example.com", "email:session-1", keyring);
  assert.equal(email.keyVersion, "v7");
  assert.equal(decryptString(email, "email:session-1", keyring), "person@example.com");

  for (const [purpose, value] of [
    ["response:1", { selected: ["OL-1"], freeText: "my own words" }],
    ["packet:1", { packet_id: "PKT-1", evidence: [{ id: "EV-1" }] }],
    ["artifact:1", { report_id: "REP-1", sections: [] }],
  ] as const) {
    const packed = packEnvelope(encryptJson(value, purpose, keyring));
    assert.deepEqual(decryptJson(unpackEnvelope(packed), purpose, keyring), value);
    assert.throws(() => decryptJson(unpackEnvelope(packed), `${purpose}:wrong`, keyring));
  }
});

test("email lookup normalization is stable and keyed", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(emailLookupHash(" Person@Example.com", hmacKey), emailLookupHash("person@example.COM ", hmacKey));
  assert.notEqual(emailLookupHash("person@example.com", hmacKey), emailLookupHash("other@example.com", hmacKey));
});

test("data encryption and cookie encryption use separate public environment secrets", () => {
  const env = {
    APP_DATA_ENCRYPTION_KEY: dataKey,
    APP_DATA_ENCRYPTION_KEY_VERSION: "data-v1",
    ASSESSMENT_COOKIE_SECRET: "a-separate-cookie-secret-with-more-than-32-characters",
  };
  const data = encryptionKeyringFromEnv(env);
  const cookie = cookieKeyringFromEnv(env);
  assert.notDeepEqual(Buffer.from(data.keys[data.activeVersion]), Buffer.from(cookie.keys[cookie.activeVersion]));
  assert.throws(() => cookieKeyringFromEnv({ ASSESSMENT_COOKIE_SECRET: "short" }));
});
