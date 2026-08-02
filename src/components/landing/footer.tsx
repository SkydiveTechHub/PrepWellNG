import {
  LuFacebook,
  LuInstagram,
  LuLinkedin,
  LuTwitter,
  LuYoutube,
} from "react-icons/lu";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter-form";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Product tour", href: "#product" },
      { label: "Subjects", href: "#subjects" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    heading: "Subjects",
    links: [
      { label: "Mathematics", href: "#subjects" },
      { label: "English Language", href: "#subjects" },
      { label: "Physics", href: "#subjects" },
      { label: "Chemistry", href: "#subjects" },
      { label: "Biology", href: "#subjects" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "#top" },
      { label: "Help Center", href: "#faq" },
      { label: "About us", href: "#top" },
      { label: "Contact", href: "mailto:hello@prepwell.ng" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "#top" },
      { label: "Terms of Service", href: "#top" },
      { label: "Cookie Policy", href: "#top" },
    ],
  },
];

const SOCIALS = [
  { label: "Twitter", icon: LuTwitter, href: "#top" },
  { label: "Instagram", icon: LuInstagram, href: "#top" },
  { label: "Facebook", icon: LuFacebook, href: "#top" },
  { label: "LinkedIn", icon: LuLinkedin, href: "#top" },
  { label: "YouTube", icon: LuYoutube, href: "#top" },
];

export function Footer() {
  return (
    <footer className="border-t hairline surface">
      <div className="landing-container py-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          <div>
            <Logo />
            <p className="mt-5 max-w-xs text-sm leading-relaxed ink-muted">
              Nigeria’s learning platform for WAEC, JAMB and NECO. Helping
              students across Nigeria learn with confidence — one question at a
              time.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-xl surface-2 hairline text-ink-muted transition-all duration-200 hover:-translate-y-0.5 hover:text-primary"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
            <div className="mt-8 max-w-xs">
              <p className="text-xs font-extrabold uppercase tracking-widest ink">
                Study tips, weekly
              </p>
              <NewsletterForm />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-extrabold uppercase tracking-widest ink">
                {col.heading}
              </p>
              <ul className="mt-5 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm font-semibold ink-muted transition-colors hover:text-primary"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t hairline pt-7 sm:flex-row">
          <p className="text-xs font-semibold ink-faint">
            © {new Date().getFullYear()} PrepWell NG. All rights reserved.
          </p>
          <p className="text-xs font-semibold ink-faint">
            Built for Nigeria’s next generation of achievers.
          </p>
        </div>
      </div>
    </footer>
  );
}
