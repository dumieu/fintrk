"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Dependency-free renderer for the small slice of markdown the advisor actually
 * emits: headings, bold, italics, inline code, bullet and numbered lists,
 * simple tables, and blockquotes. A full markdown library would add weight for
 * syntax the model never produces.
 *
 * It also linkifies real FinTRK paths (/dashboard/... or /demo/...) into
 * tappable in-app navigation, which is what makes "go to Spend Intelligence"
 * one click instead of a hunt through the menu.
 */

const PATH_PATTERN = /(\/(?:dashboard|demo)\/[a-z0-9-]+(?:\?[a-z0-9=&_-]+)?)/gi;

export type FinNavigate = (path: string) => void;

function NavChip({ path, onNavigate }: { path: string; onNavigate: FinNavigate }) {
  const label = path
    .replace(/^\/(dashboard|demo)\/?/, "")
    .split("?")[0]
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return (
    <button
      type="button"
      onClick={() => onNavigate(path)}
      title={`Go to ${path}`}
      className="mx-0.5 inline-flex items-center rounded-md bg-emerald-500/12 px-1.5 py-px align-baseline text-[0.92em] font-medium text-emerald-700 underline decoration-emerald-500/40 underline-offset-2 transition hover:bg-emerald-500/20 dark:text-emerald-300"
    >
      {label || "Open"}
    </button>
  );
}

/** Bold, italics, inline code, then paths. Applied in that order per segment. */
function inline(text: string, onNavigate: FinNavigate, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  const pushPlain = (chunk: string, key: string) => {
    if (!chunk) return;
    PATH_PATTERN.lastIndex = 0;
    const parts = chunk.split(PATH_PATTERN);
    parts.forEach((part, pi) => {
      if (!part) return;
      PATH_PATTERN.lastIndex = 0;
      if (PATH_PATTERN.test(part)) {
        out.push(<NavChip key={`${key}-p${pi}`} path={part} onNavigate={onNavigate} />);
      } else {
        out.push(<Fragment key={`${key}-t${pi}`}>{part}</Fragment>);
      }
    });
  };

  while ((match = pattern.exec(text)) !== null) {
    pushPlain(text.slice(last, match.index), `${keyBase}-b${i}`);
    const token = match[0];
    if (token.startsWith("**")) {
      out.push(
        <strong key={`${keyBase}-s${i}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={`${keyBase}-c${i}`}
          className="rounded bg-muted px-1 py-px font-mono text-[0.88em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={`${keyBase}-i${i}`}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
    i += 1;
  }
  pushPlain(text.slice(last), `${keyBase}-b${i}`);
  return out;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isTableDivider = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

export function FinMarkdown({
  text,
  onNavigate,
}: {
  text: string;
  onNavigate: FinNavigate;
}) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Table: header row, divider, then body rows.
    if (line.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`k${key++}`} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className="border-b border-border px-2 py-1 text-left font-semibold text-foreground"
                  >
                    {inline(h, onNavigate, `h${key}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border/50 last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2 py-1 align-top tabular-nums">
                      {inline(c, onNavigate, `c${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p
          key={`k${key++}`}
          className={
            level <= 2
              ? "mt-3 mb-1 text-[13.5px] font-semibold text-foreground first:mt-0"
              : "mt-2.5 mb-0.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0"
          }
        >
          {inline(heading[2], onNavigate, `k${key}`)}
        </p>,
      );
      i += 1;
      continue;
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={`k${key++}`} className="my-2.5 border-border" />);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`k${key++}`}
          className="my-1.5 border-l-2 border-emerald-500/50 pl-2.5 text-muted-foreground"
        >
          {inline(quote.join(" "), onNavigate, `k${key}`)}
        </blockquote>,
      );
      continue;
    }

    const bullet = /^\s*[-*•]\s+/.test(line);
    const numbered = /^\s*\d+[.)]\s+/.test(line);
    if (bullet || numbered) {
      const items: string[] = [];
      const test = bullet
        ? (l: string) => /^\s*[-*•]\s+/.test(l)
        : (l: string) => /^\s*\d+[.)]\s+/.test(l);
      while (i < lines.length && test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
        i += 1;
      }
      blocks.push(
        bullet ? (
          <ul key={`k${key++}`} className="my-1.5 list-disc space-y-1 pl-4 marker:text-emerald-600">
            {items.map((item, ii) => (
              <li key={ii}>{inline(item, onNavigate, `k${key}-${ii}`)}</li>
            ))}
          </ul>
        ) : (
          <ol
            key={`k${key++}`}
            className="my-1.5 list-decimal space-y-1 pl-4 marker:font-medium marker:text-emerald-600"
          >
            {items.map((item, ii) => (
              <li key={ii}>{inline(item, onNavigate, `k${key}-${ii}`)}</li>
            ))}
          </ol>
        ),
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`k${key++}`} className="my-1.5 leading-relaxed first:mt-0 last:mb-0">
        {inline(para.join(" "), onNavigate, `k${key}`)}
      </p>,
    );
  }

  return <>{blocks}</>;
}
