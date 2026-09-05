import { test } from "node:test";
import assert from "node:assert/strict";
import {
  settle,
  type PendingRow,
  type VerifiedTransaction,
} from "../src/lib/billing/settlement";

const NOW = new Date("2026-09-04T10:00:00.000Z");

function pending(over: Partial<PendingRow> = {}): PendingRow {
  return {
    reference: "pw_abc123",
    tier: "PREMIUM",
    period: "MONTHLY",
    amountKobo: 500_000,
    currency: "NGN",
    status: "PENDING",
    ...over,
  };
}

function transaction(over: Partial<VerifiedTransaction> = {}): VerifiedTransaction {
  return {
    reference: "pw_abc123",
    status: "success",
    amountKobo: 500_000,
    currency: "NGN",
    channel: "card",
    paidAt: new Date("2026-09-04T09:59:00.000Z"),
    ...over,
  };
}

test("a matching successful transaction activates", () => {
  const result = settle(pending(), transaction(), NOW);
  assert.equal(result.kind, "activate");
  if (result.kind !== "activate") return;
  assert.equal(result.channel, "card");
  assert.equal(result.paidAt.toISOString(), "2026-09-04T09:59:00.000Z");
});

test("a missing paidAt falls back to now", () => {
  const result = settle(pending(), transaction({ paidAt: null }), NOW);
  assert.equal(result.kind, "activate");
  if (result.kind !== "activate") return;
  assert.equal(result.paidAt.toISOString(), NOW.toISOString());
});

test("an already-active row is a no-op", () => {
  // The callback and the webhook both settle the same reference. The second
  // one to arrive must not extend the term a second time.
  const result = settle(pending({ status: "ACTIVE" }), transaction(), NOW);
  assert.equal(result.kind, "already-applied");
});

test("underpayment is rejected", () => {
  const result = settle(pending(), transaction({ amountKobo: 10_000 }), NOW);
  assert.equal(result.kind, "reject");
  if (result.kind !== "reject") return;
  assert.equal(result.reason, "amount-mismatch");
});

test("overpayment is rejected too", () => {
  // Not generosity — a mismatch either way means the charge did not come from
  // the checkout we authorised, and the row's price is the one we honour.
  const result = settle(pending(), transaction({ amountKobo: 900_000 }), NOW);
  assert.equal(result.kind, "reject");
});

test("a currency mismatch is rejected", () => {
  const result = settle(pending(), transaction({ currency: "USD" }), NOW);
  assert.equal(result.kind, "reject");
  if (result.kind !== "reject") return;
  assert.equal(result.reason, "currency-mismatch");
});

test("a reference mismatch is rejected", () => {
  const result = settle(pending(), transaction({ reference: "pw_other" }), NOW);
  assert.equal(result.kind, "reject");
  if (result.kind !== "reject") return;
  assert.equal(result.reason, "reference-mismatch");
});

test("an unsuccessful transaction is rejected", () => {
  for (const status of ["failed", "abandoned", "pending"]) {
    const result = settle(pending(), transaction({ status }), NOW);
    assert.equal(result.kind, "reject", status);
    if (result.kind !== "reject") continue;
    assert.equal(result.reason, "not-successful");
  }
});

test("a revoked row does not reactivate on a late webhook", () => {
  const result = settle(pending({ status: "REVOKED" }), transaction(), NOW);
  assert.equal(result.kind, "reject");
  if (result.kind !== "reject") return;
  assert.equal(result.reason, "not-pending");
});

test("an abandoned row still activates when the money actually arrived", () => {
  // Starting a second checkout marks the first row ABANDONED, but the buyer
  // can still complete the first Paystack tab. Rejecting that charge would
  // take the money and grant nothing — the one outcome billing must never
  // produce. The reference is server-issued and the amount is checked below,
  // so nothing about the tampering guarantees is relaxed by accepting it.
  const result = settle(pending({ status: "ABANDONED" }), transaction(), NOW);
  assert.equal(result.kind, "activate");
  if (result.kind !== "activate") return;
  assert.equal(result.channel, "card");
});

test("an abandoned row is still held to the amount and currency", () => {
  const underpaid = settle(
    pending({ status: "ABANDONED" }),
    transaction({ amountKobo: 10_000 }),
    NOW,
  );
  assert.equal(underpaid.kind, "reject");
  if (underpaid.kind === "reject") {
    assert.equal(underpaid.reason, "amount-mismatch");
  }

  const wrongCurrency = settle(
    pending({ status: "ABANDONED" }),
    transaction({ currency: "USD" }),
    NOW,
  );
  assert.equal(wrongCurrency.kind, "reject");
  if (wrongCurrency.kind === "reject") {
    assert.equal(wrongCurrency.reason, "currency-mismatch");
  }
});

test("an abandoned row that was never paid stays rejected", () => {
  // The ordinary case: the buyer walked away. Paystack says it was not a
  // success, so there is no money to honour.
  const result = settle(
    pending({ status: "ABANDONED" }),
    transaction({ status: "abandoned" }),
    NOW,
  );
  assert.equal(result.kind, "reject");
  if (result.kind !== "reject") return;
  assert.equal(result.reason, "not-successful");
});

test("a revoked or failed row never resurrects, even on a successful charge", () => {
  // REVOKED is an admin decision and FAILED is Paystack's own verdict. Neither
  // is a bookkeeping artefact of our checkout UI, so neither may be overridden
  // the way ABANDONED is.
  for (const status of ["REVOKED", "FAILED"] as const) {
    const result = settle(pending({ status }), transaction(), NOW);
    assert.equal(result.kind, "reject", status);
    if (result.kind !== "reject") continue;
    assert.equal(result.reason, "not-pending", status);
  }
});
