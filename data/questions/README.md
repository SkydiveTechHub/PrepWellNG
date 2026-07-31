# Question bank

Past-paper questions, filed by department and subject.

```
data/questions/<department>/<subject>/<examType>-<year>.json
```

- **department** — the subject's `trackCategory` in `prisma/seed.ts`, lowercased:
  `core`, `science`, `arts`, `commercial`, or `vocational`.
- **subject** — the subject name, lowercased (`biology`, `mathematics`).
- **examType** — `jamb`, `waec`, or `neco`.

Example: `data/questions/science/biology/jamb-2004.json`

## Importing

```bash
npx tsx scripts/import-questions.ts data/questions                    # everything
npx tsx scripts/import-questions.ts data/questions/science            # one department
npx tsx scripts/import-questions.ts data/questions/science/biology    # one subject
```

The importer recurses, and skips questions already in the database, so re-running
is safe.

## Adding a subject

Each question's `topicSlug` must match a `Topic.slug` already seeded for that
subject — the importer rejects rows it can't resolve rather than filing them
under no topic. Subjects with no curriculum in `prisma/seed.ts` have no topics,
so **seed the curriculum before importing questions for a new subject.**

Slugs are derived from topic titles via `slugify()` in the seed, so a title of
`"Cell Structure and Organization"` produces `cell-structure-and-organization`.
