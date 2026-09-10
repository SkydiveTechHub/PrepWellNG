import { ImageResponse } from "next/og";
import { parseExamSegment, parseYearSegment } from "@/lib/seo/exam-segment";
import { loadPaper } from "@/lib/seo/paper-data";
import { siteName } from "@/lib/seo/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ exam: string; subjectSlug: string; year: string }>;
}) {
  const { exam, subjectSlug, year } = await params;
  const parsed = parseExamSegment(exam);
  const parsedYear = parseYearSegment(year);
  const paper =
    parsed && parsedYear !== null
      ? await loadPaper(parsed.examType, subjectSlug, parsedYear)
      : null;

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
          {parsed && parsedYear !== null ? `${parsed.label} ${parsedYear}` : siteName}
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, marginTop: 20, lineHeight: 1.1 }}>
          {paper ? `${paper.subject.name} Past Questions` : "Past Questions"}
        </div>
        <div style={{ fontSize: 32, opacity: 0.9, marginTop: 28 }}>
          {paper
            ? `${paper.questionCount} questions with worked answers`
            : "With worked answers"}
        </div>
      </div>
    ),
    size,
  );
}
