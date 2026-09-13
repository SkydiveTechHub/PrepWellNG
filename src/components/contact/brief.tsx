import { LuClock, LuLifeBuoy } from "react-icons/lu";
import { Reveal } from "@/components/landing/reveal";
import { SUPPORT_HOURS, SUPPORT_RESPONSE } from "@/lib/contact";

/**
 * Every line here removes one round trip. Support that has to ask "which
 * subject?" before it can start takes two days instead of one.
 */
const INCLUDE = [
  "The email address on your ScholarsCrib account.",
  "The subject and topic — or the exam, subject and year if it is about a past question.",
  "What you expected to happen, and what happened instead.",
  "A screenshot, if you can take one.",
];

export function ContactBrief() {
  return (
    <section>
      <div className="landing-container pb-20 lg:pb-28">
        <Reveal>
          <div className="grid gap-10 rounded-3xl surface-2 hairline border p-8 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight ink sm:text-3xl">
                Four things that get you an answer faster
              </h2>
              <ul className="mt-7 space-y-4">
                {INCLUDE.map((line) => (
                  <li key={line} className="flex gap-3">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden
                    />
                    <p className="text-sm leading-relaxed ink-muted">{line}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-6 border-t hairline pt-8 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
              <div className="flex gap-3">
                <LuClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-extrabold ink">Support hours</p>
                  <p className="mt-1 text-sm leading-relaxed ink-muted">
                    {SUPPORT_HOURS}. Messages sent outside those hours are
                    answered {SUPPORT_RESPONSE}.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <LuLifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-extrabold ink">
                    Locked out of your account?
                  </p>
                  <p className="mt-1 text-sm leading-relaxed ink-muted">
                    Write from the address you registered with. It is the one
                    thing that lets us confirm the account is yours.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
