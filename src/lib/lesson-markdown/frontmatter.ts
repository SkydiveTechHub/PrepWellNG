import { DIFFICULTIES, NUMBER_KEYS, TEXT_KEYS } from "./types";
import type { Issue, LessonDifficulty, LessonMeta } from "./types";

export type Frontmatter = {
  meta: LessonMeta;
  bodyLines: string[];
  bodyOffset: number;
  warnings: Issue[];
  errors: Issue[];
};

export function parseFrontmatter(lines: string[]): Frontmatter {
  const meta: LessonMeta = {};
  const warnings: Issue[] = [];
  const errors: Issue[] = [];

  if (lines[0]?.trim() !== "---") {
    return { meta, bodyLines: lines, bodyOffset: 0, warnings, errors };
  }

  const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (close === -1) {
    errors.push({ line: 1, message: "Frontmatter opened with --- but never closed." });
    return { meta, bodyLines: lines, bodyOffset: 0, warnings, errors };
  }

  for (let i = 1; i < close; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const sep = raw.indexOf(":");
    if (sep === -1) {
      errors.push({ line: i + 1, message: `Frontmatter line "${raw.trim()}" is not "key: value".` });
      continue;
    }
    const key = raw.slice(0, sep).trim();
    const value = raw.slice(sep + 1).trim();

    if ((TEXT_KEYS as readonly string[]).includes(key)) {
      meta[key as (typeof TEXT_KEYS)[number]] = value;
      continue;
    }
    if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) {
        errors.push({ line: i + 1, message: `${key} must be a positive number, got "${value}".` });
        continue;
      }
      meta[key as (typeof NUMBER_KEYS)[number]] = Math.round(num);
      continue;
    }
    if (key === "difficulty") {
      if (!(DIFFICULTIES as readonly string[]).includes(value)) {
        errors.push({
          line: i + 1,
          message: `difficulty must be one of ${DIFFICULTIES.join(", ")}, got "${value}".`,
        });
        continue;
      }
      meta.difficulty = value as LessonDifficulty;
      continue;
    }
    warnings.push({ line: i + 1, message: `Unknown frontmatter key "${key}" — ignored.` });
  }

  return {
    meta,
    bodyLines: lines.slice(close + 1),
    bodyOffset: close + 1,
    warnings,
    errors,
  };
}
