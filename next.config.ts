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
};

export default nextConfig;
