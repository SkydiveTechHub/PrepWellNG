import { AboutHero } from "@/components/about/hero";
import { AboutStory } from "@/components/about/story";
import { AboutValues } from "@/components/about/values";
import { StatsBand } from "@/components/landing/stats";
import { FinalCta } from "@/components/landing/final-cta";
import { JsonLd } from "@/components/seo/json-ld";
import { aboutPageJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";

const TITLE = "About ScholarsCrib — Why we build for Nigerian students";
const DESCRIPTION =
  "ScholarsCrib is a Nigerian learning platform for WAEC, JAMB and NECO. Read why we built it, what we hold to, and who it is for.";

export const metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={aboutPageJsonLd({
          name: TITLE,
          description: DESCRIPTION,
          path: "/about",
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />
      <AboutHero />
      <AboutStory />
      <AboutValues />
      <StatsBand />
      <FinalCta />
    </>
  );
}
