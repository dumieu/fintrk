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
      if (/expression|url\s*\(|javascript:/i.test(value)) return null;
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join("; ");
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
    return raw
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .slice(0, 80_000);
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
