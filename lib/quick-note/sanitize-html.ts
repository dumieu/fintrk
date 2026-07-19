/** Allowed tags / styles for persistent quick-note HTML. */

const ALLOWED_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "UL",
  "OL",
  "LI",
  "P",
  "BR",
  "DIV",
  "SPAN",
  "H1",
  "H2",
  "H3",
  "BLOCKQUOTE",
  "FONT",
]);

const ALLOWED_TAGS_LOWER = new Set(
  [...ALLOWED_TAGS].map((t) => t.toLowerCase()),
);

const VOID_TAGS = new Set(["br"]);

const SKIP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "form",
  "noscript",
  "template",
]);

const ALLOWED_STYLE_PROPS = new Set([
  "color",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "background-color",
]);

function sanitizeStyle(style: string): string {
  return style
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx < 0) return null;
      const prop = part.slice(0, idx).trim().toLowerCase();
      const value = part.slice(idx + 1).trim();
      if (!ALLOWED_STYLE_PROPS.has(prop)) return null;
      if (/expression|url\s*\(|javascript:|data:/i.test(value)) return null;
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join("; ");
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build safe open-tag attributes (style / legacy font color+size only). */
function safeAttrsFromRaw(rawAttrs: string): string {
  const out: string[] = [];
  const styleMatch = /\bstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
  if (styleMatch) {
    const val = styleMatch[2] ?? styleMatch[3] ?? styleMatch[4] ?? "";
    const safe = sanitizeStyle(val);
    if (safe) out.push(`style="${safe.replace(/"/g, "")}"`);
  }
  const colorMatch = /\bcolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
  if (colorMatch) {
    const color = (colorMatch[2] ?? colorMatch[3] ?? colorMatch[4] ?? "").trim();
    if (/^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(color)) {
      const prev = out.find((a) => a.startsWith("style="));
      if (prev) {
        const inner = prev.slice(7, -1);
        out[out.indexOf(prev)] = `style="${inner}; color: ${color}"`;
      } else {
        out.push(`style="color: ${color}"`);
      }
    }
  }
  const sizeMatch = /\bsize\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
  if (sizeMatch) {
    const size = (sizeMatch[2] ?? sizeMatch[3] ?? sizeMatch[4] ?? "").trim();
    if (/^[1-7]$/.test(size)) {
      const map: Record<string, string> = {
        "1": "10px",
        "2": "13px",
        "3": "16px",
        "4": "18px",
        "5": "24px",
        "6": "32px",
        "7": "48px",
      };
      const fs = map[size]!;
      const prev = out.find((a) => a.startsWith("style="));
      if (prev) {
        const inner = prev.slice(7, -1);
        out[out.indexOf(prev)] = `style="${inner}; font-size: ${fs}"`;
      } else {
        out.push(`style="font-size: ${fs}"`);
      }
    }
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/**
 * DOM-free allowlist sanitizer for Node (API writes). Drops scripts, event
 * handlers, and non-formatting tags; keeps editor formatting.
 */
export function sanitizeQuickNoteHtmlWithoutDom(raw: string): string {
  const src = raw.replace(/\0/g, "").slice(0, 80_000);
  if (!src.trim()) return "";

  let i = 0;
  let out = "";

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      out += escapeText(src.slice(i));
      break;
    }
    if (lt > i) out += escapeText(src.slice(i, lt));

    // HTML comment
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }

    const gt = src.indexOf(">", lt + 1);
    if (gt < 0) {
      out += escapeText(src.slice(lt));
      break;
    }

    const rawTag = src.slice(lt + 1, gt).trim();
    i = gt + 1;

    const isClose = rawTag.startsWith("/");
    const nameMatch = /^\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(rawTag);
    if (!nameMatch) continue;
    const name = nameMatch[1]!.toLowerCase();

    if (SKIP_WITH_CONTENT.has(name)) {
      if (!isClose) {
        const closeRe = new RegExp(`</${name}\\s*>`, "i");
        const rest = src.slice(i);
        const m = closeRe.exec(rest);
        i = m ? i + m.index + m[0].length : src.length;
      }
      continue;
    }

    if (!ALLOWED_TAGS_LOWER.has(name)) {
      // Drop unknown open/close tags; keep following text.
      continue;
    }

    const tagName = name === "font" ? "span" : name;
    if (isClose) {
      if (!VOID_TAGS.has(name)) out += `</${tagName}>`;
      continue;
    }

    const attrs = safeAttrsFromRaw(rawTag.slice(nameMatch[0].length));
    const selfClosing = rawTag.endsWith("/") || VOID_TAGS.has(name);
    if (selfClosing) {
      out += `<${tagName}${attrs}>`;
    } else {
      out += `<${tagName}${attrs}>`;
    }
  }

  return out.slice(0, 80_000);
}

function walk(node: Node, out: DocumentFragment) {
  if (node.nodeType === Node.TEXT_NODE) {
    out.appendChild(document.createTextNode(node.textContent ?? ""));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME") return;

  if (!ALLOWED_TAGS.has(tag)) {
    for (const child of Array.from(el.childNodes)) walk(child, out);
    return;
  }

  const clean = document.createElement(tag === "FONT" ? "span" : tag.toLowerCase());
  const style = el.getAttribute("style");
  if (style) {
    const safe = sanitizeStyle(style);
    if (safe) clean.setAttribute("style", safe);
  }
  const color = el.getAttribute("color");
  if (color && /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(color)) {
    const prev = clean.getAttribute("style") ?? "";
    clean.setAttribute("style", `${prev ? `${prev}; ` : ""}color: ${color}`);
  }
  const size = el.getAttribute("size");
  if (size && /^[1-7]$/.test(size)) {
    const map: Record<string, string> = {
      "1": "10px",
      "2": "13px",
      "3": "16px",
      "4": "18px",
      "5": "24px",
      "6": "32px",
      "7": "48px",
    };
    const prev = clean.getAttribute("style") ?? "";
    clean.setAttribute(
      "style",
      `${prev ? `${prev}; ` : ""}font-size: ${map[size]}`,
    );
  }

  const frag = document.createDocumentFragment();
  for (const child of Array.from(el.childNodes)) walk(child, frag);
  clean.appendChild(frag);
  out.appendChild(clean);
}

/** Strip unsafe HTML; keep formatting tags used by the editor. */
export function sanitizeQuickNoteHtml(raw: string): string {
  if (typeof window === "undefined") {
    return sanitizeQuickNoteHtmlWithoutDom(raw);
  }
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${trimmed}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const frag = document.createDocumentFragment();
  for (const child of Array.from(root.childNodes)) walk(child, frag);
  const wrap = document.createElement("div");
  wrap.appendChild(frag);
  return wrap.innerHTML.slice(0, 80_000);
}

export function quickNoteHtmlToPlain(html: string): string {
  if (!html.trim()) return "";
  if (typeof window === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-3])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.innerText || div.textContent || "").trim();
}

export function isProbablyHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}
