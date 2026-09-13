import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aboutPageJsonLd,
  breadcrumbJsonLd,
  contactPageJsonLd,
  courseJsonLd,
  faqPageJsonLd,
  organisationJsonLd,
  quizJsonLd,
  serialiseJsonLd,
  websiteJsonLd,
} from "../src/lib/seo/jsonld";
import { siteUrl } from "../src/lib/seo/site";

test("organisation and website declare their schema type and identity", () => {
  const org = organisationJsonLd();
  assert.equal(org["@context"], "https://schema.org");
  assert.equal(org["@type"], "Organization");
  assert.equal(org.url, `${siteUrl}/`);

  const site = websiteJsonLd();
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.inLanguage, "en-NG");
});

test("breadcrumbs are positioned from one and carry absolute urls", () => {
  const crumbs = breadcrumbJsonLd([
    { name: "Subjects", path: "/learn" },
    { name: "Biology", path: "/learn/biology" },
  ]);
  assert.equal(crumbs["@type"], "BreadcrumbList");
  assert.equal(crumbs.itemListElement.length, 2);
  assert.equal(crumbs.itemListElement[0].position, 1);
  assert.equal(crumbs.itemListElement[1].position, 2);
  assert.equal(crumbs.itemListElement[1].item, `${siteUrl}/learn/biology`);
});

test("the faq markup mirrors the answers exactly", () => {
  const faq = faqPageJsonLd([{ question: "Q1?", answer: "A1." }]);
  assert.equal(faq["@type"], "FAQPage");
  assert.equal(faq.mainEntity[0]["@type"], "Question");
  assert.equal(faq.mainEntity[0].name, "Q1?");
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "A1.");
});

test("a course points at its own canonical url and names the provider", () => {
  const course = courseJsonLd({
    name: "Cell Structure",
    description: "D",
    path: "/learn/biology/cell-structure",
    estimatedMinutes: 45,
  });
  assert.equal(course["@type"], "Course");
  assert.equal(course.url, `${siteUrl}/learn/biology/cell-structure`);
  assert.equal(course.provider["@type"], "Organization");
});

test("a course states only what is true: real workload, free offer, no fabricated fields", () => {
  const course = courseJsonLd({
    name: "Cell Structure",
    description: "D",
    path: "/learn/biology/cell-structure",
    estimatedMinutes: 45,
  });

  // hasCourseInstance carries the true, page-level facts: it is online, and
  // its workload is the topic's own estimatedMinutes as an ISO-8601 duration
  // — not a made-up constant.
  assert.ok(course.hasCourseInstance);
  assert.equal(course.hasCourseInstance["@type"], "CourseInstance");
  assert.equal(course.hasCourseInstance.courseMode, "online");
  assert.equal(course.hasCourseInstance.courseWorkload, "PT45M");

  // offers reflects that the sample content is genuinely free to read
  // without an account.
  assert.ok(course.offers);
  assert.equal(course.offers["@type"], "Offer");
  assert.equal(course.offers.price, "0");
  assert.equal(course.offers.priceCurrency, "NGN");

  // Nothing fabricated: no dates, location, instructor, non-zero price,
  // enrolment count, rating, or a third-party provider.
  const serialised = JSON.stringify(course);
  for (const forbidden of [
    "startDate", "endDate", "location", "instructor",
    "aggregateRating", "totalHistoricalEnrollment", "courseSchedule",
  ]) {
    assert.ok(!serialised.includes(forbidden), `unexpectedly found ${forbidden}`);
  }

  // Workload must actually track the input, not a hardcoded value.
  const shorter = courseJsonLd({
    name: "N",
    description: "D",
    path: "/x",
    estimatedMinutes: 20,
  });
  assert.equal(shorter.hasCourseInstance.courseWorkload, "PT20M");
});

test("a quiz marks up every option and the accepted answer", () => {
  const quiz = quizJsonLd({
    name: "WAEC 2019 Biology",
    path: "/past-questions/waec/biology/2019",
    about: "Biology",
    questions: [
      {
        questionText: "What is a cell?",
        options: { A: "A unit", B: "A rock", C: "A gas", D: "A star" },
        correctAnswer: "B",
        explanation: "Because.",
      },
    ],
  });
  assert.ok(quiz);
  assert.equal(quiz["@type"], "Quiz");
  const question = quiz.hasPart[0];
  assert.equal(question["@type"], "Question");
  assert.equal(question.eduQuestionType, "Multiple choice");
  assert.equal(question.suggestedAnswer.length, 3);
  assert.equal(question.acceptedAnswer.text, "A rock");
  assert.equal(question.acceptedAnswer.comment.text, "Because.");
});

test("a quiz with an unmatched correct answer is not marked up as a quiz", () => {
  // Claiming an accepted answer that is not among the options is invalid
  // markup, and invalid markup on a rich result is worse than none.
  const quiz = quizJsonLd({
    name: "N",
    path: "/x",
    about: "A",
    questions: [
      {
        questionText: "Q",
        options: { A: "one", B: "two" },
        correctAnswer: "Z",
        explanation: "E",
      },
    ],
  });
  assert.equal(quiz, null);
});

test("a closing script tag in the content cannot break out of the script block", () => {
  // The classic JSON-LD XSS: an explanation containing </script> ends the
  // block early and everything after it is parsed as HTML.
  const output = serialiseJsonLd({ text: "a </script><img onerror=alert(1)> b" });
  assert.ok(!output.includes("</script>"), output);
  assert.match(output, /\\u003c/);
});

test("serialised output round-trips back to the same data", () => {
  const data = { a: 1, b: "two <three>" };
  assert.deepEqual(JSON.parse(serialiseJsonLd(data)), data);
});

test("the about page points back at the organisation it describes", () => {
  const about = aboutPageJsonLd({
    name: "About ScholarsCrib",
    description: "Why we build for Nigerian students.",
    path: "/about",
  });
  assert.equal(about["@type"], "AboutPage");
  assert.equal(about.url, `${siteUrl}/about`);
  assert.equal(about.about["@type"], "Organization");
  assert.equal(about.about.url, `${siteUrl}/`);
});

test("the contact page carries a support contact point when there is an address", () => {
  const contact = contactPageJsonLd({
    name: "Contact ScholarsCrib",
    description: "Support for students and schools.",
    path: "/contact",
    email: "hello@scholarscrib.com",
  });
  assert.equal(contact["@type"], "ContactPage");
  assert.equal(contact.url, `${siteUrl}/contact`);
  assert.equal(
    contact.about.contactPoint?.email,
    "hello@scholarscrib.com",
  );
  assert.equal(contact.about.contactPoint?.contactType, "customer support");
});

test("an absent email emits no contactPoint rather than an empty one", () => {
  // A ContactPoint with no way to reach anyone is worse than no markup: it
  // advertises a support channel that does not exist.
  const contact = contactPageJsonLd({
    name: "Contact ScholarsCrib",
    description: "Support for students and schools.",
    path: "/contact",
  });
  assert.ok(!("contactPoint" in contact.about), JSON.stringify(contact.about));
});
