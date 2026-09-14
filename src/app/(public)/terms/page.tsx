import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";

// DRAFT — plain-language terms written by the product team. Not yet reviewed
// by a lawyer; have it reviewed before relying on it in a dispute.

const TITLE = "Terms of Service — ScholarsCrib";
const DESCRIPTION =
  "The terms for using ScholarsCrib, including one account per student.";

export const metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/terms",
});

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "1. About these terms",
    body: (
      <p>
        These terms apply when you create a ScholarsCrib account or use
        ScholarsCrib. By creating an account you agree to them. If you are
        under 18, a parent or guardian should read them with you.
      </p>
    ),
  },
  {
    heading: "2. One account per student",
    body: (
      <>
        <p>
          Each ScholarsCrib account belongs to one student. Your study plan,
          weak areas, unseen questions and progress are built from your own
          answers, so an account shared between students stops working
          properly for all of them.
        </p>
        <p>
          You must not share your login details or let another student use
          your account. You are responsible for keeping your password private.
        </p>
      </>
    ),
  },
  {
    heading: "3. Devices",
    body: (
      <p>
        A paid plan can be signed in on up to two devices at a time. Signing
        in on another device signs out the one used least recently. You can
        see and sign out your devices in Settings.
      </p>
    ),
  },
  {
    heading: "4. When we may act on an account",
    body: (
      <p>
        If an account appears to be used by more than one person, or is used
        in a way that breaks these terms, we may sign out its devices, ask
        the owner to change their password, or suspend the account. We will
        tell you what happened and how to contact us.
      </p>
    ),
  },
  {
    heading: "5. Paid plans",
    body: (
      <p>
        Payments are processed by Paystack. A plan gives access to its
        features for the period you paid for, and is for the account holder
        only.
      </p>
    ),
  },
  {
    heading: "6. Using ScholarsCrib fairly",
    body: (
      <p>
        Do not copy or resell questions, lessons or other content, try to get
        around limits or security, or interfere with the service for other
        students.
      </p>
    ),
  },
  {
    heading: "7. Changes to these terms",
    body: (
      <p>
        We may update these terms. When we make an important change we will
        let you know in the app before it takes effect.
      </p>
    ),
  },
  {
    heading: "8. Contact",
    body: (
      <p>
        Questions about these terms? <Link href="/contact" className="font-semibold text-primary hover:underline">Contact us</Link>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted">Last updated 13 September 2026</p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-bold text-foreground">{section.heading}</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/85">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
