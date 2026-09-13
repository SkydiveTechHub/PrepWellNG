import { ContactBrief } from "@/components/contact/brief";
import { ContactChannels } from "@/components/contact/channels";
import { ContactHero } from "@/components/contact/hero";
import { JsonLd } from "@/components/seo/json-ld";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { breadcrumbJsonLd, contactPageJsonLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";

const TITLE = "Contact ScholarsCrib — Support for students and schools";
const DESCRIPTION =
  "Reach ScholarsCrib support about your account, a payment, a past question that looks wrong, or bringing the platform to your school.";

export const metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={contactPageJsonLd({
          name: TITLE,
          description: DESCRIPTION,
          path: "/contact",
          email: SUPPORT_EMAIL,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      <ContactHero />
      <ContactChannels />
      <ContactBrief />
    </>
  );
}
