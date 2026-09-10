import { ImageResponse } from "next/og";
import { siteName } from "@/lib/seo/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${siteName} — WAEC, JAMB and NECO preparation`;

export default function Image() {
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
        <div style={{ fontSize: 34, opacity: 0.85, letterSpacing: 4 }}>
          WAEC · JAMB · NECO
        </div>
        <div style={{ fontSize: 82, fontWeight: 800, marginTop: 20, lineHeight: 1.1 }}>
          {siteName}
        </div>
        <div style={{ fontSize: 36, opacity: 0.9, marginTop: 24 }}>
          Learn smarter. Score higher.
        </div>
      </div>
    ),
    size,
  );
}
