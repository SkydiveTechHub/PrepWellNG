import {
  LuBookOpen,
  LuBuilding2,
  LuClipboardList,
  LuGraduationCap,
  LuLaptop,
  LuMapPin,
  LuNetwork,
  LuSchool,
  LuUsers,
} from "react-icons/lu";
import { Reveal } from "./reveal";

const ORGS = [
  { name: "Greenfield Academy", icon: LuSchool },
  { name: "Hillcrest College", icon: LuBuilding2 },
  { name: "Brightway Tutors", icon: LuUsers },
  { name: "ExamHub NG", icon: LuClipboardList },
  { name: "Merit Publishers", icon: LuBookOpen },
  { name: "Naija E-Learn", icon: LuLaptop },
  { name: "Lagos Prep Circle", icon: LuMapPin },
  { name: "EduBridge Partners", icon: LuNetwork },
  { name: "Star Teachers Guild", icon: LuGraduationCap },
];

export function TrustedBy() {
  const items = [...ORGS, ...ORGS];
  return (
    <section className="border-y hairline">
      <div className="landing-container py-12">
        <Reveal>
          <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.2em] ink-faint">
            Trusted by schools, teachers &amp; partners across Nigeria
          </p>
        </Reveal>

        <div className="mask-fade-x mt-8 overflow-hidden">
          <div className="flex w-max animate-marquee items-center gap-12">
            {items.map((org, i) => (
              <div
                key={`${org.name}-${i}`}
                className="flex items-center gap-2.5 opacity-70 transition-opacity hover:opacity-100"
              >
                <org.icon className="h-5 w-5 text-primary/70" />
                <span className="whitespace-nowrap text-sm font-bold ink-muted">
                  {org.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Reveal delay={120}>
          <p className="mx-auto mt-10 max-w-xl text-center text-base font-semibold leading-relaxed ink-muted">
            Helping students across Nigeria learn with confidence.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
