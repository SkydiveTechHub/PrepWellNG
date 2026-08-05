import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Avatars are served from Cloudinary; question and explanation diagrams come
    // from the question bank's own CDN. Anything else is rejected by the
    // optimizer rather than proxied.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
    // AVIF first: question diagrams are the heaviest thing on the exam screen
    // and most of the audience is on metered mobile data.
    formats: ["image/avif", "image/webp"],
    // Matches the rendered widths in the quiz, results and flashcard views.
    imageSizes: [64, 96, 128, 256, 384],
    deviceSizes: [360, 414, 640, 828, 1080, 1200],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Keeps stack traces readable in production error reports without shipping
  // source maps to the browser.
  productionBrowserSourceMaps: false,

  experimental: {
    // These barrel imports pull in the whole icon set unless the compiler is
    // told to tree-shake them per-import.
    optimizePackageImports: ["react-icons", "lucide-react", "recharts"],
  },

  // The section moved from /subjects to /classroom. Permanent so bookmarks,
  // browser history and anything already shared keep working.
  async redirects() {
    return [
      {
        source: "/subjects",
        destination: "/classroom",
        permanent: true,
      },
      // The old `lessons/[lessonId]` branch no longer exists in /classroom —
      // these three are the most-bookmarked deep links from the old tree, so
      // they get explicit targets instead of falling into the general
      // wildcard below, which would 308 straight into a 404. Order matters:
      // Next.js takes the first match, so these must come before the
      // wildcard. The lessonId is intentionally dropped — it's resolvable
      // from the topic.
      {
        source: "/subjects/:subjectSlug/:topicSlug/lessons/:lessonId/practice/result",
        destination: "/classroom/:subjectSlug/:topicSlug/practice/result",
        permanent: true,
      },
      {
        source: "/subjects/:subjectSlug/:topicSlug/lessons/:lessonId/practice",
        destination: "/classroom/:subjectSlug/:topicSlug/practice",
        permanent: true,
      },
      {
        source: "/subjects/:subjectSlug/:topicSlug/lessons/:lessonId",
        destination: "/classroom/:subjectSlug/:topicSlug/study",
        permanent: true,
      },
      {
        source: "/subjects/:path*",
        destination: "/classroom/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
