import { absoluteUrl, siteDescription, siteName } from "./site";

/**
 * Structured data describes only what is on the page. Marking up gated
 * questions, or an answer that is not among the rendered options, is a
 * rich-result policy violation — so quizJsonLd returns null rather than
 * emitting something invalid.
 */
const CONTEXT = "https://schema.org";

export function organisationJsonLd() {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    name: siteName,
    url: absoluteUrl("/"),
    description: siteDescription,
    logo: absoluteUrl("/icon.svg"),
    areaServed: "NG",
  } as const;
}

export function websiteJsonLd() {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: siteName,
    url: absoluteUrl("/"),
    description: siteDescription,
    inLanguage: "en-NG",
    publisher: { "@type": "Organization", name: siteName, url: absoluteUrl("/") },
  } as const;
}

export function faqPageJsonLd(
  faqs: readonly { question: string; answer: string }[],
) {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  } as const;
}

export function breadcrumbJsonLd(
  crumbs: readonly { name: string; path: string }[],
) {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  } as const;
}

export function courseJsonLd({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": CONTEXT,
    "@type": "Course",
    name,
    description,
    url: absoluteUrl(path),
    inLanguage: "en-NG",
    provider: { "@type": "Organization", name: siteName, url: absoluteUrl("/") },
  } as const;
}

export function quizJsonLd({
  name,
  path,
  about,
  questions,
}: {
  name: string;
  path: string;
  about: string;
  questions: readonly {
    questionText: string;
    options: Record<string, string>;
    correctAnswer: string;
    explanation: string;
  }[];
}) {
  const hasPart = questions.flatMap((question) => {
    const accepted = question.options[question.correctAnswer];
    if (!accepted) return [];

    return [{
      "@type": "Question",
      eduQuestionType: "Multiple choice",
      text: question.questionText,
      acceptedAnswer: {
        "@type": "Answer",
        text: accepted,
        comment: { "@type": "Comment", text: question.explanation },
      },
      suggestedAnswer: Object.entries(question.options)
        .filter(([letter]) => letter !== question.correctAnswer)
        .map(([, text]) => ({ "@type": "Answer", text })),
    }];
  });

  if (hasPart.length !== questions.length || hasPart.length === 0) return null;

  return {
    "@context": CONTEXT,
    "@type": "Quiz",
    name,
    url: absoluteUrl(path),
    about: { "@type": "Thing", name: about },
    inLanguage: "en-NG",
    hasPart,
  } as const;
}

/**
 * `<` is escaped so a "</script>" inside any string cannot terminate the
 * script block and turn page content into markup.
 */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
