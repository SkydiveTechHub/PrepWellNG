import { ImageResponse } from "next/og";
import { loadPublicTopic } from "@/lib/seo/learn-data";
import { siteName } from "@/lib/seo/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
}) {
  const { subjectSlug, topicSlug } = await params;
  const topic = await loadPublicTopic(subjectSlug, topicSlug);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #1d4ed8 0%, #3730a3 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 34, opacity: 0.85, letterSpacing: 3 }}>
          {topic?.subject.name.toUpperCase() ?? "SCHOLARSCRIB"}
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, marginTop: 20, lineHeight: 1.1 }}>
          {topic?.title ?? siteName}
        </div>
        <div style={{ fontSize: 32, opacity: 0.9, marginTop: 28 }}>
          Past questions with worked answers
        </div>
      </div>
    ),
    size,
  );
}
