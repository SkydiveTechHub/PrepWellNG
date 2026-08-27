import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageDeck } from "../src/lib/flashcard-ownership";

// Who may prune a deck. Deleting a card cascades away every enrolled student's
// FlashcardReview rows for it, so this is the whole authorization story for the
// destructive endpoints — worth its own tests even though it is four lines.

test("the student who built the deck may manage it", () => {
  assert.equal(canManageDeck({ createdBy: "stu-1" }, "stu-1"), true);
});

test("another student may not, however they reached the deck", () => {
  assert.equal(canManageDeck({ createdBy: "stu-1" }, "stu-2"), false);
});

test("an enrolled student is still not the owner", () => {
  // Enrollment is how a shared lesson deck reaches the rest of the cohort. It
  // grants study access, never the right to delete the cohort's cards.
  assert.equal(canManageDeck({ createdBy: "author" }, "follower"), false);
});

test("an ownerless deck belongs to nobody", () => {
  // createdBy is nullable — seeded and admin-authored decks have no student
  // behind them. Nobody inherits them by being the first to ask.
  assert.equal(canManageDeck({ createdBy: null }, "stu-1"), false);
});

test("a missing deck is not manageable", () => {
  assert.equal(canManageDeck(null, "stu-1"), false);
});

test("an empty user id never matches an ownerless deck", () => {
  // Guards the shape of the check itself: `deck.createdBy === userId` with two
  // falsy values must not read as ownership.
  assert.equal(canManageDeck({ createdBy: null }, ""), false);
});
