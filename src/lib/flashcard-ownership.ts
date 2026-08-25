// Who may destructively manage a deck.
//
// Kept pure and separate from flashcards.ts so the one decision that stands
// between a student and another cohort's review history can be tested without a
// database. Deleting a Flashcard cascades away every FlashcardReview and
// FlashcardReviewLog row for it (prisma/schema.prisma), and lesson decks are
// shared, so "may this person delete this" is a data-loss question.

/** The only field the decision needs. */
export type DeckOwnership = { createdBy: string | null };

/**
 * True only for the student who created the deck.
 *
 * Enrollment deliberately does not count: it is how a shared lesson deck
 * reaches the rest of the cohort, and it grants study access rather than the
 * right to delete what the cohort is studying. A deck with no `createdBy` —
 * seeded or admin-authored — belongs to nobody, so the null case is false
 * rather than "anyone".
 */
export function canManageDeck(
  deck: DeckOwnership | null,
  userId: string,
): boolean {
  if (!deck || deck.createdBy === null) return false;
  return deck.createdBy === userId;
}
