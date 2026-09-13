import {
  LuShieldCheck,
  LuSmartphone,
  LuTarget,
  LuWallet,
} from "react-icons/lu";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeader } from "@/components/landing/section";

const VALUES = [
  {
    icon: LuTarget,
    title: "Mastery, not memorisation",
    text: "Anyone can hand you an answer key. We show the working, then ask you the same idea again a week later to check it stuck.",
  },
  {
    icon: LuSmartphone,
    title: "Built for the phone you own",
    text: "Light pages, short sessions and no assumptions about your data plan. If it only works on a laptop and fast wifi, it does not work for Nigeria.",
  },
  {
    icon: LuWallet,
    title: "Free to start, fair to upgrade",
    text: "The lessons, past questions and practice that get you through the syllabus do not sit behind a card. Paying should add convenience, never access.",
  },
  {
    icon: LuShieldCheck,
    title: "You always know what you are practising",
    text: "Every past question carries its exam, subject and year. Nothing is presented as a WAEC question unless that is exactly where it came from.",
  },
];

export function AboutValues() {
  return (
    <section>
      <div className="landing-container pb-20 lg:pb-28">
        <SectionHeader
          eyebrow="What we hold to"
          title="Four decisions we do not trade away."
          align="left"
        />

        <div className="mt-12 grid gap-x-10 sm:grid-cols-2">
          {VALUES.map((value, i) => (
            <Reveal key={value.title} delay={(i % 2) * 90}>
              <div className="flex h-full gap-4 border-t hairline py-7">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <value.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight ink">
                    {value.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed ink-muted">
                    {value.text}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
