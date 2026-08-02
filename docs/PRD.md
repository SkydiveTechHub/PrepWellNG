# PrepWell NG — Product Requirements Document

| | |
|---|---|
| **Product** | PrepWell NG |
| **Category** | Exam preparation / EdTech (Secondary Education) |
| **Market** | Nigeria (WAEC, JAMB, NECO candidates) |
| **Target users** | SS1–SS3 students, resitting WASSCE/GCE candidates, private candidates |
| **Status** | Draft v0.1 |

---

## 1. Executive Summary

PrepWell NG is an all-in-one digital exam-preparation platform for Nigerian
secondary-school students preparing for WAEC WASSCE, JAMB UTME, and NECO SSCE.
It combines a syllabus-aligned curriculum (SS1–SS3), a searchable past-question
bank, full CBT and mock-exam simulations, a personalized study-plan generator,
performance analytics, and gamification into a single product — closing the gap
between the "practice-only" apps and the "notes-only" portals currently
fragmented across the Nigerian EdTech market.

## 2. Problem Statement (Nigerian Context)

Every year ~1.5–2 million candidates sit JAMB UTME and millions more sit WAEC
and NECO. Yet the prep experience is broken:

1. **Fragmented tools.** Students jump between a past-question app (Pass.ng,
   TestDriller), a notes website (ClassNotes.ng), YouTube, and paper textbooks.
   Progress and weaknesses are never connected across these.
2. **Cost.** Quality past-question banks and CBT software are sold per-software,
   per-device or via costly centers; many students in public schools cannot
   afford them.
3. **No personalization.** Most competitors serve the same 40-question practice
   to every student. Nobody tells a student *which topics* are their weakest or
   sequences revision based on exam-date countdown and topic weight in the real
   paper.
4. **Syllabus blindness.** Students study topics that barely appear in WAEC/JAMB
   while neglecting high-weight topics. Weighting is not surfaced anywhere.
5. **Format shock.** JAMB is now fully CBT; many candidates practise only on
   paper and underperform on timing, navigation, and auto-submit behaviour.
6. **Data-poor.** Candidates don't know their predicted grade (A1–F9 scale),
   accuracy, or mastery per topic until the real result arrives.

## 3. Target Users & Personas

| Persona | Description | Core need |
|---|---|---|
| **Chiamaka (SS3, Science)** | Lagos public-school student aiming for Medicine (JAMB cut-off ~280+). | Predict-grade accuracy, weak-topic coaching, full CBT simulation. |
| **Ibrahim (SS2, Commercial)** | Kano student planning Accounting. | Track-aligned subjects (Maths, Econ, Commerce), structured study plan. |
| **Resitter / Private candidate** | Out-of-school WASSCE/GCE candidate. | Affordable full-curriculum coverage + past questions in one place. |
| **Teacher / Admin** | School admin importing and curating question banks. | Bulk import, review, and maintenance tooling. |

## 4. Value Proposition

> "One platform that **teaches** you the WAEC/JAMB/NECO syllabus, **tests** you
> with real past questions, **scores** you on the actual grading scale, and
> **plans** your revision backwards from exam day — built specifically for
> Nigerian students."

## 5. Core Features

### 5.1 Accounts & Profiles
- Email/password sign-up **and** Google OAuth (NextAuth + Prisma adapter).
- Profile: name, email, phone, **state**, school; avatar upload via Cloudinary.
- Academic profile: **class level (SS1/SS2/SS3)** and **track
  (Science/Arts/Commercial)** — these drive curriculum and subject defaults.

### 5.2 Curriculum & Lessons
- **45 subjects** mapped to WAEC/JAMB/NECO availability and grouped by track
  category: Core, Science, Arts, Commercial, Vocational.
- Syllabus-structured curriculum per class level and term, with topics carrying
  **WAEC and JAMB weightings** (e.g., Physics "Equations of Motion": 0.9/0.9),
  prerequisites, and estimated study minutes.
- Lessons with MDX content, key points, worked examples, and media resources.

### 5.3 Question Bank (Past Questions)
- Real past-paper questions filed by exam type and year (e.g., Biology JAMB
  1983–2004, Mathematics WAEC 2023), each tagged to a syllabus topic.
- Objective/theory/fill-in-blank question types, difficulty, marks, and
  time estimates, with full explanations.
- Bulk import tooling (idempotent CLI importer) and an admin console.

### 5.4 Practice Modes
- **Subject practice / past questions**: 40 random questions per subject, timed
  (60 min), auto-submit, flag-for-review, question navigator.
- **JAMB CBT practice**: per-subject JAMB-format practice for all 12 JAMB
  subjects.
- **Full CBT simulation**: 180 questions across 4 subjects in 120 minutes —
  mirrors the official JAMB UTME interface and subject tabs.
- **Mock exams** for WAEC/NECO/JAMB with configurable time limits.
- Exam-correct configuration data (JAMB 180q/120min/400 marks; WAEC/NECO
  grading A1–F9; no negative marking).

### 5.5 Results, Grading & Analytics
- Instant scoring with the **official A1–F9 WASSCE grading boundaries** (A1 75+,
  B3 65–69, C6 50–54, D7 45–49, E8 40–44, F9 <40) and letter grades for JAMB.
- Per-question review with explanations; per-attempt breakdown.
- **Performance dashboard**: accuracy, attempts, latest grade, subject-level
  metrics, and automatically surfaced **"topics to improve"** derived from wrong
  answers (weak-topic detection).
- Mastery levels (Weak → Developing → Competent → Strong) tracked per subject
  and topic.

### 5.6 Personalized Study Plan
- Generates a **week-by-week schedule backwards from the exam date**, across
  chosen subjects, for WAEC/JAMB/NECO, with a daily-hours budget.
- Plan items mix lessons, practice, revision, past questions, and mock exams;
  completion progress and week navigation are surfaced in the UI.
- Regenerable at any time.

### 5.7 Gamification
- Achievements/badges across criteria types: questions answered, perfect
  scores, day streaks, lessons completed, subject mastery, mock score ≥70%.

### 5.8 Library
- Curated per-subject resources (textbooks, videos, PDFs, worksheets, past
  papers) with free/premium flags and an **in-app PDF reader**.

### 5.9 JAMB Subject-Combination Guidance
- Reference of required JAMB subject combinations per course and faculty
  (Medicine: Bio/Chem/Phys; Engineering: Math/Phys/Chem; Law arts subjects;
  etc.), plus approximate cut-off tiers (140–280+) by course competitiveness.

### 5.10 Administration
- Role-based access (Student/Teacher/Admin) and an admin console for managing
  and importing questions.

## 6. Technical Architecture

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth v5 (credentials + Google OAuth) |
| Styling | Tailwind CSS v4, lucide/react-icons |
| Media | Cloudinary (avatars), react-pdf (in-app reader) |
| Content | Question bank as versioned JSON, imported into Postgres |

## 7. Competitive Landscape & Advantage

### 7.1 The Market
| Competitor | Focus | Gaps PrepWell addresses |
|---|---|---|
| **Pass.ng** | Past questions + mini-lessons | Practice-only; no personalized study plan, no curriculum weighting, limited analytics |
| **TestDriller** | Offline CBT software (per-device licence) | Paid, device-bound; no web analytics or plan generation |
| **Myschool.ng / Flashlearners** | Past questions + news/info | Content portal; weak learner analytics, no grading-simulation depth |
| **ClassNotes.ng** | Lesson notes | Notes only — no practice, timing, or performance tracking |
| **Local CBT centres (EduTams, etc.)** | Exam-hall mock CBT | Expensive, location-bound, one-off sittings; no continuous learning loop |
| **International apps (Khan Academy, Quizlet, Anki)** | Generic learning | Not syllabus/exam-aligned to WAEC/JAMB/NECO; wrong grading scale; not Nigeria-specific |

### 7.2 What Makes PrepWell Different (Moat / Moats)
1. **Fully Nigerian by design.** A1–F9 grading, JAMB 180q/120min/400-mark
   configuration, cut-off tiers, 36 states + FCT, all 45 NERDC subjects across
   Science/Arts/Commercial/Vocational tracks — nothing is an afterthought.
2. **Closed learning loop: Teach → Test → Diagnose → Plan.**
   Curriculum lessons feed a real past-question bank; every wrong answer updates
   mastery analytics; the study plan regenerates from those weaknesses and the
   exam countdown. Competitors cover one or two stages, not the loop.
3. **Exam-weight-aware studying.** WAEC/JAMB topic weightings let the study plan
   and UI prioritize high-yield topics — a feature no mainstream Nigerian app
   exposes.
4. **Data-driven personalization.** Weak-topic detection, accuracy tracking, and
   mastery levels turn raw practice into coaching, per student.
5. **Full official-format simulation.** A complete 180-question, 4-subject,
   timed, tabbed JAMB CBT that mirrors the real interface — not just a Q&A
   drill.
6. **One subscription, whole prep.** Replaces 2–4 separate paid products
   (question app + notes site + CBT center + practice software) with a single
   platform.
7. **Curated, versioned content pipeline.** JSON-based question bank with
   idempotent import means content is auditable, scriptable, and extensible to
   new years/subjects cheaply.

## 8. Success Metrics
- Activation: % of registered users who complete a first practice session.
- Engagement: practice attempts per active user/week, 7-day streak retention.
- Learning outcome: accuracy improvement between first and last attempt.
- Monetization: free → premium conversion (premium resources, full mocks).
- Reach: share of SS1–SS3 students reached per school/state.

## 9. Roadmap & Out of Scope (draft)

### In scope next (suggested)
- Expand question bank coverage to all subjects and recent years (2024–2026).
- Add teacher/school analytics and classroom assignment flows.
- Mobile app / PWA installability for low-bandwidth use.

### Out of scope (v0.x)
- Live proctoring or official exam registration.
- Full JAMB portal integration.
- Post-secondary (post-UTME, GMAT-type) content.

## 10. Risks & Assumptions
- **Data**: question bank accuracy and completeness must be validated before
  it can be marketed as "exam-grade".
- **Access**: assumes affordable data + device access, which limits reach among
  low-income students (mitigate with offline/PWA and light pages).
- **Trust**: must be transparent that PrepWell is a practice tool, not the exam
  body, to stay safe from impersonation concerns around WAEC/JAMB/NECO branding.
