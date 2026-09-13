/**
 * Shared so the rendered accordion and the FAQPage structured data cannot
 * drift. Marking up copy that is not on the page is a rich-result violation.
 */
export const FAQS = [
  {
    question: "Which exams does ScholarsCrib cover?",
    answer:
      "WAEC (WASSCE), JAMB UTME and NECO — the three big examinations Nigerian secondary students sit for. Content follows the national curriculum from SS1 to SS3, and mock exams run under CBT conditions like JAMB's.",
  },
  {
    question: "How does the AI tutor work?",
    answer:
      "Type any question in plain English — a definition, a past question, or a topic you're stuck on — and the AI tutor explains it step by step, at your level. It's available 24/7, so late-night confusion never has to wait until morning.",
  },
  {
    question: "Can I study offline?",
    answer:
      "Yes. Download lessons, flashcards and question packs while you have data, then keep studying without a connection. Your progress syncs automatically the next time you're online.",
  },
  {
    question: "Can teachers assign work and track students?",
    answer:
      "Yes. Teachers get a dashboard where they can assign topics and mocks to a whole class, then see live scores and progress to spot struggling students early — before the report card does it for them.",
  },
  {
    question: "What does Premium cost, and can I cancel?",
    answer:
      "Premium is ₦2,500 a month or ₦24,000 a year (a 20% saving). There are no contracts — you can cancel anytime, and the Free plan is genuinely free, forever, with no card required.",
  },
  {
    question: "I have limited data. Can I still use it?",
    answer:
      "Yes. ScholarsCrib is built to be light and fast even on slower connections, and everything is designed to load quickly on the phones most students actually use.",
  },
  {
    question: "How is ScholarsCrib different from just reading?",
    answer:
      "Reading tells you what to know; practice shows you what you actually know. ScholarsCrib pairs short lessons with thousands of questions, timed mock exams, flashcards and progress tracking so you always know your next best step.",
  },
] as const;
