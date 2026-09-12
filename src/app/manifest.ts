import type { MetadataRoute } from "next";
import { siteDescription, siteName } from "@/lib/seo/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteName,
    short_name: "PrepWell",
    description: siteDescription,
    scope: "/",
    // An installed student should land in the app, not on the marketing page.
    // Logged out, this redirects to /login through the existing auth boundary,
    // which is the correct behaviour. The query parameter lets analytics tell
    // installed sessions apart later.
    start_url: "/dashboard?source=pwa",
    display: "standalone",
    orientation: "portrait",
    lang: "en-NG",
    dir: "ltr",
    categories: ["education"],
    // Matches --app-background, so the splash screen does not flash pure
    // white before first paint.
    background_color: "#f8fafc",
    // A manifest takes only one theme_color; the dark value is supplied
    // through the viewport's media-array themeColor in src/app/layout.tsx.
    theme_color: "#f8fafc",
    icons: [
      // Vector first, so desktop installs get the crisp version.
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
