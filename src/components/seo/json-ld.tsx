import { serialiseJsonLd } from "@/lib/seo/jsonld";

/** Renders nothing visible. `data` of null renders no tag at all. */
export function JsonLd({ data }: { data: unknown }) {
  if (!data) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}
