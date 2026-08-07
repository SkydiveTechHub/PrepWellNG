import type { Issue } from "./types";

// ─── SVG sanitiser ───────────────────────────────────────────
//
// InteractiveDiagram renders block.svg through dangerouslySetInnerHTML, so
// uploaded markup executes in student pages. This is an allowlist: anything
// not named here is removed. Never convert it to a blocklist.

const SVG_ELEMENTS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline",
  "polygon", "text", "tspan", "defs", "marker", "lineargradient",
  "radialgradient", "stop", "title", "desc",
]);

/** Elements dropped along with everything inside them. */
const SVG_VOID_HOSTILE = new Set([
  "script", "style", "foreignobject", "use", "image", "iframe", "animate",
  "set", "handler",
]);

const SVG_ATTRS = new Set([
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "points", "transform", "viewbox", "preserveaspectratio",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity",
  "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline",
  "offset", "stop-color", "stop-opacity", "gradientunits", "marker-end",
  "marker-start", "id", "class", "xmlns",
]);

type HostileToken = {
  name: string;
  start: number;
  end: number;
  kind: "open" | "close";
  selfClosing: boolean;
};

/** True for the characters JS regex `\w` matches — the alphabet `\b` uses. */
function isWordChar(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}

/**
 * End index of the maximal run of word characters starting at `from`.
 *
 * Runs for two different `<` positions can never overlap (a run stops at the
 * first non-word character, and `<` is one), so summed over a whole pass this
 * visits each character at most once.
 */
function wordRunEnd(s: string, from: number): number {
  let i = from;
  while (i < s.length && isWordChar(s[i])) i += 1;
  return i;
}

/**
 * One linear left-to-right pass that removes hostile elements — paired
 * (`<script>...</script>`) and self-closing (`<use/>`) — from `svg`.
 *
 * Opens and closes are located by two hand-rolled scans, not by regex, and
 * that is load-bearing. The obvious spelling — `matchAll(/<(names)\b[^>]*>/g)`
 * — is quadratic, and the comment that used to sit here claimed otherwise
 * ("an open matches as soon as it finds any `>` ahead of it, full stop").
 * That premise is false: when there is no `>` ahead at all, `[^>]*` scans to
 * the end of input and *fails*. `matchAll` only declines to re-scan text a
 * **successful** match consumed; a failed attempt consumes nothing, so the
 * engine advances one character and scans to the end again. 25,000 opens with
 * no `>` after them measured ~9.5-13s (and ~30s for a spliced
 * `<use <image <set ` flood) — well inside MAX_LESSON_MARKDOWN_BYTES, so the
 * size cap is no defence, and it needs no malice: a truncated `.md` with
 * unterminated markup does it. Node is single-threaded, so that stall blocks
 * every concurrent request; the upload form re-parses on each keystroke, so
 * it freezes the browser tab too.
 *
 * Both scans below therefore walk `<` positions with `indexOf` and locate the
 * matching `>` through a **forward-only** cursor (`nextGt`), so a failure
 * costs O(1) instead of a scan to end of input and no character is examined
 * twice. This is the same shape pass 2 of `sanitizeSvg` already uses. Match
 * semantics are otherwise identical to the regexes they replace, including
 * `matchAll`'s "a successful match consumes its text, a failure advances one
 * character".
 *
 * Pairing opens to closes afterwards is one more linear scan using a small
 * per-name stack (array push/pop, O(1) each), so pairing never revisits text
 * either — including a close sitting *before* every open, the shape that
 * defeated an earlier fix (a per-name "does a closing tag exist anywhere"
 * precheck): one close anywhere made the precheck pass while a *combined*
 * `<name...>...</name>` pattern still retried the failing pairing at each of
 * 25,000 opens — ~17.5s measured.
 *
 * Splicing (`<scr<use/>ipt>` only reads as `<script>` once the inner
 * `<use/>` is removed) is why the caller repeats this to a fixed point
 * instead of assuming one pass is enough — a token that exists only after
 * an earlier removal cannot be seen by this pass.
 */
function stripHostileOnce(
  svg: string,
  names: string[],
  warn: (message: string) => void,
): string {
  const hostile = new Set(names.map((n) => n.toLowerCase()));

  // Forward-only `>` cursor. Every query asks for the first `>` at or after a
  // position that is >= the previous query's, so the cursor only ever moves
  // right: the total work it does across a whole pass is O(n), and once the
  // input has no `>` left ahead, every later query answers in O(1).
  let gtPos = -1;
  let gtExhausted = false;
  const nextGt = (from: number): number => {
    if (gtExhausted) return -1;
    if (gtPos < from) {
      gtPos = svg.indexOf(">", from);
      if (gtPos === -1) {
        gtExhausted = true;
        return -1;
      }
    }
    return gtPos;
  };

  const tokens: HostileToken[] = [];

  // Opens: `<name\b[^>]*>` where name is hostile. The word run after `<` must
  // equal a hostile name exactly — a longer run means the `\b` in the original
  // pattern would not hold (`<uses>` is not `<use>`), and no hostile name is a
  // prefix of another, so comparing the maximal run is exactly equivalent.
  let i = 0;
  while (i < svg.length) {
    const lt = svg.indexOf("<", i);
    if (lt === -1) break;
    const nameEnd = wordRunEnd(svg, lt + 1);
    if (!hostile.has(svg.slice(lt + 1, nameEnd).toLowerCase())) {
      i = lt + 1;
      continue;
    }
    const gt = nextGt(nameEnd);
    // No `>` anywhere ahead: this open cannot match, and neither can any
    // later one, since they would all need a `>` at a still-higher index.
    if (gt === -1) break;
    // `/\s*>` at the tag's end marks a self-closing form. The backward walk
    // stays inside [nameEnd, gt), a region no other token revisits.
    let k = gt - 1;
    while (k >= nameEnd && /\s/.test(svg[k])) k -= 1;
    tokens.push({
      name: svg.slice(lt + 1, nameEnd).toLowerCase(),
      start: lt,
      end: gt + 1,
      kind: "open",
      selfClosing: k >= nameEnd && svg[k] === "/",
    });
    i = gt + 1;
  }

  // Closes: `</name\s*>` where name is hostile.
  i = 0;
  while (i < svg.length) {
    const lt = svg.indexOf("<", i);
    if (lt === -1) break;
    if (svg[lt + 1] !== "/") {
      i = lt + 1;
      continue;
    }
    const nameEnd = wordRunEnd(svg, lt + 2);
    if (!hostile.has(svg.slice(lt + 2, nameEnd).toLowerCase())) {
      i = lt + 1;
      continue;
    }
    // Trailing whitespace before `>`. Runs scanned here are bounded by the
    // next `<` (whitespace is not `<`), so this too stays linear overall.
    let j = nameEnd;
    while (j < svg.length && /\s/.test(svg[j])) j += 1;
    if (svg[j] !== ">") {
      i = lt + 1;
      continue;
    }
    tokens.push({
      name: svg.slice(lt + 2, nameEnd).toLowerCase(),
      start: lt,
      end: j + 1,
      kind: "close",
      selfClosing: false,
    });
    i = j + 1;
  }

  if (tokens.length === 0) return svg;
  tokens.sort((a, b) => a.start - b.start);

  // Removal spans: self-closing opens remove themselves immediately; paired
  // opens wait on a per-name stack for the next close of the same name that
  // comes *after* them in document order. A close with nothing pending on
  // its name's stack is an orphan (e.g. a stray close with no preceding
  // open, or one that already sits before the only open) and is left as
  // literal text — pass 2 will see it as a disallowed close tag on its own
  // and drop just that tag.
  const spans: Array<[number, number]> = [];
  const openStacks = new Map<string, number[]>();
  for (const token of tokens) {
    if (token.kind === "open") {
      if (token.selfClosing) {
        spans.push([token.start, token.end]);
        warn(`<${token.name}> is not allowed in a diagram and was removed.`);
        continue;
      }
      const stack = openStacks.get(token.name);
      if (stack) stack.push(token.start);
      else openStacks.set(token.name, [token.start]);
      continue;
    }
    const stack = openStacks.get(token.name);
    if (stack && stack.length > 0) {
      const openStart = stack.pop() as number;
      spans.push([openStart, token.end]);
      warn(`<${token.name}> is not allowed in a diagram and was removed.`);
    }
  }
  if (spans.length === 0) return svg;

  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) {
      last[1] = Math.max(last[1], span[1]);
    } else {
      merged.push([...span]);
    }
  }

  let result = "";
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) result += svg.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  result += svg.slice(cursor);
  return result;
}

export function sanitizeSvg(svg: string): { svg: string; warnings: Issue[] } {
  const warnings: Issue[] = [];
  const seen = new Set<string>();
  const warn = (message: string) => {
    if (seen.has(message)) return;
    seen.add(message);
    warnings.push({ message });
  };

  let out = svg;

  // 1. Drop hostile elements with their contents (and self-closing forms),
  // to a fixed point. See stripHostileOnce for why one pass is O(n).
  const HOSTILE_NAMES = [...SVG_VOID_HOSTILE];
  // Defensive bound: pathological nesting (splicing one hostile tag out of
  // another, repeated many times) could in principle force many fixed-point
  // iterations. Each iteration is O(n), so this cap keeps the whole loop
  // O(n) worst case regardless of how deeply an attacker nests it —
  // realistic and even generously adversarial content converges in 2-3.
  // The residual — a construction deep enough to exhaust the cap — leaves
  // at most inert leftover text (no tag survives; pass 2 still fail-closed
  // drops any tag-shaped fragment), never a live, executable tag.
  const MAX_FIXED_POINT_PASSES = 64;
  let pass = 0;
  let changed = true;
  while (changed && pass < MAX_FIXED_POINT_PASSES) {
    const next = stripHostileOnce(out, HOSTILE_NAMES, warn);
    changed = next !== out;
    out = next;
    pass += 1;
  }

  // Attribute values are re-emitted inside a freshly built double-quoted
  // string. A value captured from a *single*-quoted original attribute may
  // legally contain a literal `"` (e.g. `id='x" onclick="alert(1)"'`) — if
  // that character were written back out unescaped it would close our
  // double-quoted attribute early and let the rest of the value reappear as
  // live markup (a new, unfiltered attribute). Escaping `&`, `"`, `<` and
  // `>` in every kept value closes that hole.
  const escapeAttrValue = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // 2. Walk remaining tags with a fail-closed scanner.
  //
  // `String.replace` alone is fail-OPEN: text a regex does not match is
  // left in the output untouched. The previous implementation required
  // every quote inside a tag's attribute region to pair up — but an
  // unpaired `'` or `"` is legal in an HTML *unquoted* attribute value
  // (browsers treat it as an ordinary character there), so a payload like
  // `fill=#fff' onmouseover="alert(1)"` desynced the regex, the whole tag
  // failed to match, and it survived byte-for-byte in the output —
  // including the event handler, with zero warnings.
  //
  // This scans left to right instead. Every `<` must resolve to a
  // well-formed, allowlisted tag (attribute values may be quoted OR
  // unquoted, per HTML5); anything else — a genuinely malformed tag, or an
  // unrecognised element — is dropped from that `<` through the next `>`
  // (or to the end of input) rather than being left in place. Fail closed,
  // never fail open.
  // Excludes `/` so a self-closing tag's trailing `/>` is never swallowed
  // into the preceding unquoted value (e.g. `r=1/>` must not become
  // `r="1/"` with the closing `>` left dangling — that produces an invalid
  // SVG length and loses the self-close, nesting following siblings inside
  // the tag). HTML5 unquoted values may legally contain `/`, but no
  // allowlisted SVG attribute here needs one, so this is a safe exclusion.
  const UNQUOTED_VALUE = `[^\\s"'\`=<>/]+`;
  const ATTR_VALUE = `(?:"[^"]*"|'[^']*'|${UNQUOTED_VALUE})`;
  const ATTR = `[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\\s*=\\s*${ATTR_VALUE})?`;
  const OPEN_TAG_RE = new RegExp(`^<([a-zA-Z][a-zA-Z0-9-]*)((?:\\s+${ATTR})*)\\s*(/)?>`);
  const CLOSE_TAG_RE = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/;
  const ATTR_RE = new RegExp(`([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\\s*=\\s*(${ATTR_VALUE}))?`, "g");

  let result = "";
  let i = 0;
  while (i < out.length) {
    // THE INVARIANT that makes this sanitiser provable: this is the only
    // branch that copies a character through verbatim, and it is guarded by
    // `out[i] !== "<"`. Every other branch either drops its input or emits a
    // tag rebuilt from the element/attribute allowlists below. So no `<` can
    // reach the output except one this function constructed — which is why
    // "was the input well-formed?" is never a security question here. Any
    // future edit that copies input in some other place must re-establish
    // this guard, or the allowlist stops being an allowlist.
    if (out[i] !== "<") {
      result += out[i];
      i += 1;
      continue;
    }

    const rest = out.slice(i);

    const close = CLOSE_TAG_RE.exec(rest);
    if (close) {
      const name = close[1].toLowerCase();
      if (SVG_ELEMENTS.has(name)) {
        result += `</${name}>`;
      } else {
        warn(`<${close[1]}> is not an allowed diagram element and was removed.`);
      }
      i += close[0].length;
      continue;
    }

    const open = OPEN_TAG_RE.exec(rest);
    if (open) {
      const [full, rawName, rawAttrs, slash] = open;
      const name = rawName.toLowerCase();
      if (!SVG_ELEMENTS.has(name)) {
        warn(`<${rawName}> is not an allowed diagram element and was removed.`);
      } else {
        const kept: string[] = [];
        let m: RegExpExecArray | null;
        ATTR_RE.lastIndex = 0;
        while ((m = ATTR_RE.exec(rawAttrs))) {
          const attr = m[1].toLowerCase();
          const rawValue = m[2];
          const value = rawValue
            ? /^["']/.test(rawValue)
              ? rawValue.slice(1, -1)
              : rawValue
            : "";
          if (attr.startsWith("on")) {
            warn(`Event handler "${m[1]}" was removed from <${name}>.`);
            continue;
          }
          if (attr === "href" || attr === "xlink:href") {
            if (value.startsWith("#")) {
              kept.push(`${attr}="${escapeAttrValue(value)}"`);
            } else {
              warn(`href "${value}" is not a same-document fragment and was removed.`);
            }
            continue;
          }
          if (attr.startsWith("aria-") || SVG_ATTRS.has(attr)) {
            kept.push(`${m[1]}="${escapeAttrValue(value)}"`);
            continue;
          }
          warn(`Attribute "${m[1]}" is not allowed on <${name}> and was removed.`);
        }
        result += `<${name}${kept.length ? " " + kept.join(" ") : ""}${slash ? "/" : ""}>`;
      }
      i += full.length;
      continue;
    }

    // Not a well-formed tag at this `<` — fail closed: drop through the
    // next `>` (or to the end of input if there is none) instead of
    // leaving unrecognised markup, attributes and all, in the output.
    const nextGt = rest.indexOf(">");
    const dropped = nextGt === -1 ? rest : rest.slice(0, nextGt + 1);
    warn("Malformed or unrecognised markup was removed from the diagram.");
    i += dropped.length;
  }
  out = result;

  if (!/<svg\b/i.test(out)) {
    return {
      svg: "",
      warnings: [{ message: "No <svg> element found in this diagram." }],
    };
  }
  return { svg: out.trim(), warnings };
}
