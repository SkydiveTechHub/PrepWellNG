import { test } from "node:test";
import assert from "node:assert/strict";
import { googleProfileToUser } from "../src/lib/google-profile";

const base = { sub: "google-123", email: "ada@example.com", picture: "https://img/ada.png" };

test("given and family names map onto the User columns", () => {
  const user = googleProfileToUser({ ...base, name: "Ada Obi", given_name: "Ada", family_name: "Obi" });
  assert.deepEqual(user, {
    id: "google-123",
    email: "ada@example.com",
    image: "https://img/ada.png",
    firstName: "Ada",
    lastName: "Obi",
  });
});

test("no `name` key reaches the adapter — User has no such column", () => {
  const user = googleProfileToUser({ ...base, name: "Ada Obi", given_name: "Ada", family_name: "Obi" });
  assert.equal("name" in user, false);
});

test("without given/family names, the full name is split on the first space", () => {
  const user = googleProfileToUser({ ...base, name: "Chiamaka Ngozi Eze" });
  assert.equal(user.firstName, "Chiamaka");
  assert.equal(user.lastName, "Ngozi Eze");
});

test("a missing family name falls back to the rest of the full name", () => {
  const user = googleProfileToUser({ ...base, name: "Ada Obi", given_name: "Ada" });
  assert.equal(user.lastName, "Obi");
});

test("a single-word name leaves the last name empty rather than failing", () => {
  const user = googleProfileToUser({ ...base, name: "Tolu", given_name: "Tolu" });
  assert.equal(user.firstName, "Tolu");
  assert.equal(user.lastName, "");
});

test("with no name at all, the email's local part stands in", () => {
  const user = googleProfileToUser({ ...base });
  assert.equal(user.firstName, "ada");
  assert.equal(user.lastName, "");
});

test("names are trimmed", () => {
  const user = googleProfileToUser({ ...base, given_name: "  Ada ", family_name: " Obi  " });
  assert.equal(user.firstName, "Ada");
  assert.equal(user.lastName, "Obi");
});
