import { test } from "node:test";
import assert from "node:assert/strict";
import { MATERIAL_TYPES, MATERIAL_LABELS } from "../src/lib/materials";
import {
  requiresUpload,
  validateMaterialUrl,
  signingParamsFor,
  nextOrderIndex,
} from "../src/lib/admin-material";

test("there are exactly four material types", () => {
  assert.deepEqual([...MATERIAL_TYPES], ["PDF", "IMAGE", "VIDEO", "LINK"]);
});

test("every type has a display label", () => {
  // "PDF" must not render as "Pdf", which is what a CSS capitalize would do.
  assert.equal(MATERIAL_LABELS.PDF, "PDF");
  assert.equal(MATERIAL_LABELS.IMAGE, "Image");
  assert.equal(MATERIAL_LABELS.VIDEO, "Video");
  assert.equal(MATERIAL_LABELS.LINK, "Link");
});

test("files are uploaded, videos and links are pasted", () => {
  assert.equal(requiresUpload("PDF"), true);
  assert.equal(requiresUpload("IMAGE"), true);
  assert.equal(requiresUpload("VIDEO"), false);
  assert.equal(requiresUpload("LINK"), false);
});

test("http is refused for every type", () => {
  // A student's browser blocks mixed content, so an http material is a
  // material that silently fails to load.
  const result = validateMaterialUrl("LINK", "http://example.com/notes");
  assert.equal(result.ok, false);
});

test("https links are accepted", () => {
  assert.equal(validateMaterialUrl("LINK", "https://example.com/notes").ok, true);
});

test("a direct video file is refused", () => {
  // Self-hosted MP4 means one fixed bitrate with no adaptive streaming, which
  // is the wrong answer on metered mobile data. Video must be a hosted embed.
  const result = validateMaterialUrl("VIDEO", "https://cdn.example.com/lesson.mp4");
  assert.equal(result.ok, false);
});

test("youtube and vimeo are accepted for video", () => {
  assert.equal(
    validateMaterialUrl("VIDEO", "https://www.youtube.com/watch?v=abc123").ok,
    true,
  );
  assert.equal(validateMaterialUrl("VIDEO", "https://youtu.be/abc123").ok, true);
  assert.equal(validateMaterialUrl("VIDEO", "https://vimeo.com/123456").ok, true);
});

test("a host that merely contains a video host name is refused", () => {
  // Suffix matching, not substring: youtube.com.evil.test must not pass.
  assert.equal(
    validateMaterialUrl("VIDEO", "https://youtube.com.evil.test/x").ok,
    false,
  );
});

test("garbage is refused rather than thrown on", () => {
  assert.equal(validateMaterialUrl("LINK", "not a url").ok, false);
});

test("each uploaded type gets its own folder and format allowlist", () => {
  const pdf = signingParamsFor("PDF");
  const image = signingParamsFor("IMAGE");

  assert.notEqual(pdf.folder, image.folder);
  assert.deepEqual(pdf.allowedFormats, ["pdf"]);
  assert.deepEqual(image.allowedFormats, ["jpg", "jpeg", "png", "webp"]);
  // Cloudinary stores a PDF as a raw asset, not an image.
  assert.equal(pdf.resourceType, "raw");
  assert.equal(image.resourceType, "image");
  assert.ok(pdf.maxBytes > image.maxBytes);
});

test("the first material lands at index zero", () => {
  assert.equal(nextOrderIndex([]), 0);
});

test("a new material lands after the last one, gaps notwithstanding", () => {
  assert.equal(nextOrderIndex([{ orderIndex: 0 }, { orderIndex: 7 }]), 8);
});
