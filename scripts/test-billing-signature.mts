import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paystackSignature,
  verifyPaystackSignature,
} from "../src/lib/billing/signature";

const SECRET = "sk_test_pretend_secret";
const BODY = JSON.stringify({ event: "charge.success", data: { id: 1 } });

test("a signature is a 128-character hex sha512 digest", () => {
  const signature = paystackSignature(BODY, SECRET);
  assert.match(signature, /^[0-9a-f]{128}$/);
});

test("a correctly signed body verifies", () => {
  assert.equal(
    verifyPaystackSignature({
      rawBody: BODY,
      signature: paystackSignature(BODY, SECRET),
      secret: SECRET,
    }),
    true,
  );
});

test("a tampered body fails", () => {
  const signature = paystackSignature(BODY, SECRET);
  const tampered = JSON.stringify({
    event: "charge.success",
    data: { id: 2 },
  });
  assert.equal(
    verifyPaystackSignature({ rawBody: tampered, signature, secret: SECRET }),
    false,
  );
});

test("a signature from the wrong secret fails", () => {
  assert.equal(
    verifyPaystackSignature({
      rawBody: BODY,
      signature: paystackSignature(BODY, "sk_test_other"),
      secret: SECRET,
    }),
    false,
  );
});

test("a missing or malformed signature fails without throwing", () => {
  // timingSafeEqual throws on a length mismatch — an attacker must not be able
  // to turn a short header into a 500 instead of a 401.
  for (const signature of [null, "", "abc", "z".repeat(128)]) {
    assert.equal(
      verifyPaystackSignature({ rawBody: BODY, signature, secret: SECRET }),
      false,
      String(signature),
    );
  }
});

test("an absent secret fails closed", () => {
  assert.equal(
    verifyPaystackSignature({
      rawBody: BODY,
      signature: paystackSignature(BODY, SECRET),
      secret: undefined,
    }),
    false,
  );
});
