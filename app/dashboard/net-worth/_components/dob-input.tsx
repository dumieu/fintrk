"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Cake } from "lucide-react";
import { ageFromDob } from "@/lib/net-worth";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Compact "month + year" date-of-birth input. Two inline controls — a native
 * select for month and a 4-digit numeric input for year — render the live
 * derived age inside an accent pill so users immediately confirm "yes that's
 * me". Designed for one-glance, two-click data entry.
 */
export function DobInput({
  birthMonth,
  birthYear,
  fallbackAge,
  accent = "#AD74FF",
  compact = false,
  onChange,
}: {
  birthMonth: number | null;
  birthYear: number | null;
  /** Used in the pill if DOB isn't filled yet. */
  fallbackAge: number;
  accent?: string;
  /** Single tight row for projection controls / toolbars. */
  compact?: boolean;
  onChange: (patch: { birthMonth: number | null; birthYear: number | null }) => void;
}) {
  const monthId = useId();
  const yearId = useId();
  const derived = useMemo(() => ageFromDob(birthMonth, birthYear), [birthMonth, birthYear]);
  const display = derived ?? fallbackAge;
  const complete = birthMonth != null && birthYear != null;

  const thisYear = new Date().getFullYear();

  // Local string state so the user can type freely (e.g. "2", "20", "201",
  // "2018") without us clamping mid-keystroke. We only push to the parent
  // once the value is a complete, plausible year, and clamp on blur.
  const [yearText, setYearText] = useState<string>(birthYear != null ? String(birthYear) : "");
  useEffect(() => {
    setYearText(birthYear != null ? String(birthYear) : "");
  }, [birthYear]);

  const selectCls = compact
    ? "h-7 min-w-[3.25rem] flex-1 rounded-md border border-white/10 bg-[#0e0822] px-1.5 text-[11px] font-semibold text-white outline-none transition focus:border-white/30 sm:min-w-[4.25rem] sm:flex-none"
    : "h-9 w-full rounded-lg border border-white/10 bg-[#0e0822] px-2.5 text-sm font-semibold text-white outline-none transition focus:border-white/30";

  const yearCls = compact
    ? "h-7 w-[3.25rem] shrink-0 rounded-md border border-white/10 bg-[#0e0822] px-1.5 text-[11px] font-semibold tabular-nums text-white outline-none transition focus:border-white/30 sm:w-[3.5rem]"
    : "h-9 w-full rounded-lg border border-white/10 bg-[#0e0822] px-2.5 text-sm font-semibold tabular-nums text-white outline-none transition focus:border-white/30";

  if (compact) {
    return (
      <div
        className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1"
        style={complete ? { borderColor: `${accent}35` } : undefined}
      >
        <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-white/55">
          <Cake className="h-3 w-3" style={{ color: accent }} />
          DOB
        </span>
        <select
          id={monthId}
          aria-label="Birth month"
          value={birthMonth ?? ""}
          onChange={(e) =>
            onChange({
              birthMonth: e.target.value ? Number(e.target.value) : null,
              birthYear,
            })
          }
          className={selectCls}
          style={complete ? { borderColor: `${accent}55` } : undefined}
        >
          <option value="">Mo</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          id={yearId}
          aria-label="Birth year"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="YYYY"
          value={yearText}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYearText(raw);
            if (raw === "") {
              onChange({ birthMonth, birthYear: null });
              return;
            }
            if (raw.length === 4) {
              const n = Number(raw);
              if (n >= 1900 && n <= thisYear) {
                onChange({ birthMonth, birthYear: n });
              }
            }
          }}
          onBlur={() => {
            if (yearText === "") return;
            const n = Number(yearText);
            if (!Number.isFinite(n)) {
              setYearText(birthYear != null ? String(birthYear) : "");
              return;
            }
            const clamped = Math.max(1900, Math.min(thisYear, Math.round(n)));
            setYearText(String(clamped));
            if (clamped !== birthYear) onChange({ birthMonth, birthYear: clamped });
          }}
          className={yearCls}
          style={complete ? { borderColor: `${accent}55` } : undefined}
        />
        <span
          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          style={{ background: `${accent}22`, color: accent }}
        >
          age {display}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/70">
          <Cake className="h-3.5 w-3.5" style={{ color: accent }} />
          Date of birth
        </label>
        <span
          className="rounded-md px-2 py-0.5 text-sm font-bold tabular-nums"
          style={{ background: `${accent}22`, color: accent }}
        >
          age {display}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr] gap-2">
        <select
          id={monthId}
          aria-label="Birth month"
          value={birthMonth ?? ""}
          onChange={(e) =>
            onChange({
              birthMonth: e.target.value ? Number(e.target.value) : null,
              birthYear,
            })
          }
          className={selectCls}
          style={complete ? { borderColor: `${accent}55` } : undefined}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>

        <input
          id={yearId}
          aria-label="Birth year"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="Year"
          value={yearText}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYearText(raw);
            if (raw === "") {
              onChange({ birthMonth, birthYear: null });
              return;
            }
            // Only commit when the year looks complete & in a plausible
            // window. This lets the user type "2018" character by character
            // without being clamped to 1900 / 2026 mid-stroke.
            if (raw.length === 4) {
              const n = Number(raw);
              if (n >= 1900 && n <= thisYear) {
                onChange({ birthMonth, birthYear: n });
              }
            }
          }}
          onBlur={() => {
            if (yearText === "") return;
            const n = Number(yearText);
            if (!Number.isFinite(n)) {
              setYearText(birthYear != null ? String(birthYear) : "");
              return;
            }
            const clamped = Math.max(1900, Math.min(thisYear, Math.round(n)));
            setYearText(String(clamped));
            if (clamped !== birthYear) onChange({ birthMonth, birthYear: clamped });
          }}
          className={yearCls}
          style={complete ? { borderColor: `${accent}55` } : undefined}
        />
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-white/40">
        {complete
          ? `Saved — every projection now anchors to ${MONTHS[(birthMonth ?? 1) - 1]} ${birthYear}.`
          : "Just month + year. Drives your current age and the retirement countdown."}
      </p>
    </div>
  );
}
