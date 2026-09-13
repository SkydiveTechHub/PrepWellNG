import type { IconType } from "react-icons";
import {
  LuBuilding2,
  LuGraduationCap,
  LuMail,
  LuMessageCircle,
} from "react-icons/lu";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeader } from "@/components/landing/section";
import {
  SUPPORT_EMAIL,
  SUPPORT_RESPONSE,
  mailtoHref,
  whatsappHref,
} from "@/lib/contact";

type Channel = {
  icon: IconType;
  title: string;
  /** What this route is the *best* choice for — routing beats a list of addresses. */
  bestFor: string;
  href: string;
  action: string;
  detail: string;
};

/**
 * Built at render time rather than declared as a constant, because WhatsApp is
 * only a channel once a number exists. A card that links nowhere is worse than
 * one less card.
 */
function channels(): Channel[] {
  const whatsapp = whatsappHref();

  return [
    {
      icon: LuMail,
      title: "Email support",
      bestFor:
        "Your account, a payment, or anything that needs a record you can refer back to.",
      href: mailtoHref("Support"),
      action: SUPPORT_EMAIL,
      detail: `Replies ${SUPPORT_RESPONSE}`,
    },
    ...(whatsapp
      ? [
          {
            icon: LuMessageCircle,
            title: "WhatsApp",
            bestFor:
              "Short questions where a screenshot explains it faster than a paragraph.",
            href: whatsapp,
            action: "Start a chat",
            detail: "Fastest during support hours",
          },
        ]
      : []),
    {
      icon: LuGraduationCap,
      title: "Report a question",
      bestFor:
        "A wrong answer, a broken diagram, or an explanation that does not add up.",
      href: mailtoHref("Question report"),
      action: "Send a report",
      detail: "Checked against the original paper",
    },
    {
      icon: LuBuilding2,
      title: "Schools and partnerships",
      bestFor:
        "Bringing ScholarsCrib to a class, a whole school, or a scholarship programme.",
      href: mailtoHref("Schools and partnerships"),
      action: "Talk to us",
      detail: "We will ask about your student numbers first",
    },
  ];
}

export function ContactChannels() {
  return (
    <section>
      <div className="landing-container py-20 lg:py-24">
        <SectionHeader
          eyebrow="Where to write"
          title="Pick the route that matches your question."
          description="Everything lands in the same inbox, but a subject line that says what it is about gets an answer sooner."
          align="left"
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {channels().map((channel, i) => (
            <Reveal key={channel.title} delay={(i % 2) * 90}>
              <a
                href={channel.href}
                className="group flex h-full flex-col rounded-2xl surface hairline border p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-blue-600 to-brand text-white shadow-soft">
                  <channel.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-extrabold tracking-tight ink">
                  {channel.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed ink-muted">
                  {channel.bestFor}
                </p>
                <p className="mt-5 text-sm font-bold text-primary transition-colors group-hover:text-primary-hover">
                  {channel.action}
                </p>
                <p className="mt-1 text-xs font-semibold ink-faint">
                  {channel.detail}
                </p>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
