import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breadcrumbJsonLd,
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
  });
  assert.equal(course["@type"], "Course");
  assert.equal(course.url, `${siteUrl}/learn/biology/cell-structure`);
  assert.equal(course.provider["@type"], "Organization");
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
