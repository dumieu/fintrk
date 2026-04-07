"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CountryData {
  country: string;
  total: number;
  count: number;
}

interface WorldMapProps {
  data: CountryData[];
  currency: string;
}

const COUNTRY_PATHS: Record<string, { d: string; cx: number; cy: number; name: string }> = {
  US: { d: "M55 125 L125 125 L130 140 L120 160 L55 155Z", cx: 90, cy: 140, name: "United States" },
  CA: { d: "M55 80 L130 80 L135 120 L55 120Z", cx: 92, cy: 100, name: "Canada" },
  MX: { d: "M60 160 L110 155 L100 185 L60 180Z", cx: 82, cy: 170, name: "Mexico" },
  BR: { d: "M170 210 L220 195 L225 260 L175 270Z", cx: 198, cy: 235, name: "Brazil" },
  AR: { d: "M160 270 L195 265 L190 320 L160 315Z", cx: 175, cy: 290, name: "Argentina" },
  GB: { d: "M305 95 L320 90 L322 105 L307 108Z", cx: 313, cy: 99, name: "United Kingdom" },
  FR: { d: "M310 110 L335 108 L338 130 L312 132Z", cx: 324, cy: 120, name: "France" },
  DE: { d: "M330 95 L355 93 L357 115 L332 117Z", cx: 343, cy: 105, name: "Germany" },
  ES: { d: "M295 125 L325 122 L327 145 L297 148Z", cx: 310, cy: 135, name: "Spain" },
  IT: { d: "M340 120 L355 118 L358 150 L343 152Z", cx: 349, cy: 135, name: "Italy" },
  NL: { d: "M325 88 L340 87 L341 98 L326 99Z", cx: 333, cy: 93, name: "Netherlands" },
  CH: { d: "M330 112 L345 111 L346 122 L331 123Z", cx: 338, cy: 117, name: "Switzerland" },
  SE: { d: "M345 55 L360 50 L365 85 L350 88Z", cx: 355, cy: 70, name: "Sweden" },
  NO: { d: "M330 45 L350 40 L355 75 L335 78Z", cx: 343, cy: 60, name: "Norway" },
  PL: { d: "M355 92 L380 90 L382 110 L357 112Z", cx: 368, cy: 100, name: "Poland" },
  RU: { d: "M380 50 L520 40 L530 120 L390 110Z", cx: 455, cy: 80, name: "Russia" },
  CN: { d: "M480 130 L560 120 L570 175 L490 180Z", cx: 525, cy: 150, name: "China" },
  JP: { d: "M580 130 L600 125 L605 155 L585 158Z", cx: 592, cy: 142, name: "Japan" },
  KR: { d: "M570 135 L582 133 L584 150 L572 152Z", cx: 577, cy: 142, name: "South Korea" },
  IN: { d: "M470 170 L510 165 L505 220 L470 225Z", cx: 490, cy: 195, name: "India" },
  AU: { d: "M530 260 L600 250 L610 305 L540 310Z", cx: 570, cy: 280, name: "Australia" },
  NZ: { d: "M620 300 L640 295 L642 320 L622 322Z", cx: 631, cy: 310, name: "New Zealand" },
  SG: { d: "M530 200 L540 199 L541 206 L531 207Z", cx: 535, cy: 203, name: "Singapore" },
  AE: { d: "M435 170 L455 168 L456 180 L436 182Z", cx: 445, cy: 175, name: "UAE" },
  SA: { d: "M415 165 L445 160 L450 190 L420 195Z", cx: 432, cy: 178, name: "Saudi Arabia" },
  IL: { d: "M400 148 L412 146 L413 160 L401 162Z", cx: 406, cy: 154, name: "Israel" },
  ZA: { d: "M370 280 L405 275 L410 310 L375 315Z", cx: 390, cy: 295, name: "South Africa" },
  NG: { d: "M340 195 L365 192 L368 215 L343 218Z", cx: 353, cy: 205, name: "Nigeria" },
  EG: { d: "M380 150 L405 148 L407 175 L382 177Z", cx: 393, cy: 162, name: "Egypt" },
  TR: { d: "M380 120 L415 118 L418 138 L383 140Z", cx: 398, cy: 129, name: "Turkey" },
  TH: { d: "M525 185 L538 183 L540 205 L527 207Z", cx: 532, cy: 195, name: "Thailand" },
  MY: { d: "M530 195 L545 194 L546 208 L531 209Z", cx: 538, cy: 201, name: "Malaysia" },
  PH: { d: "M560 180 L575 178 L577 200 L562 202Z", cx: 568, cy: 190, name: "Philippines" },
  ID: { d: "M535 215 L575 210 L580 235 L540 238Z", cx: 557, cy: 225, name: "Indonesia" },
  CO: { d: "M135 195 L165 190 L168 215 L138 220Z", cx: 151, cy: 207, name: "Colombia" },
  CL: { d: "M145 270 L160 268 L162 330 L147 332Z", cx: 153, cy: 300, name: "Chile" },
  HK: { d: "M555 165 L565 164 L566 172 L556 173Z", cx: 560, cy: 168, name: "Hong Kong" },
  DK: { d: "M335 82 L350 80 L352 92 L337 94Z", cx: 343, cy: 87, name: "Denmark" },
  IE: { d: "M290 90 L305 88 L306 105 L291 107Z", cx: 298, cy: 97, name: "Ireland" },
  PT: { d: "M288 125 L298 124 L299 148 L289 149Z", cx: 293, cy: 136, name: "Portugal" },
  AT: { d: "M340 108 L360 106 L362 118 L342 120Z", cx: 351, cy: 113, name: "Austria" },
  CZ: { d: "M345 98 L365 96 L367 108 L347 110Z", cx: 356, cy: 103, name: "Czechia" },
  RO: { d: "M375 108 L398 106 L400 122 L377 124Z", cx: 387, cy: 115, name: "Romania" },
  HU: { d: "M358 108 L378 106 L380 120 L360 122Z", cx: 369, cy: 114, name: "Hungary" },
  GR: { d: "M365 132 L385 130 L387 150 L367 152Z", cx: 376, cy: 141, name: "Greece" },
};

export function WorldMap({ data, currency }: WorldMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const dataMap = new Map<string, CountryData>();
  for (const d of data) dataMap.set(d.country, d);

  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  function intensity(iso: string): number {
    const d = dataMap.get(iso);
    if (!d) return 0;
    return Math.max(0.15, d.total / maxTotal);
  }

  return (
    <div className="relative">
      <svg viewBox="0 0 660 340" className="w-full" role="img" aria-label="World spending map">
        <rect x="0" y="0" width="660" height="340" fill="transparent" />

        {Object.entries(COUNTRY_PATHS).map(([iso, { d }]) => {
          const int = intensity(iso);
          const hasData = dataMap.has(iso);
          const isHovered = hovered === iso;

          return (
            <motion.path
              key={iso}
              d={d}
              fill={hasData ? `rgba(11, 193, 141, ${int})` : "rgba(255,255,255,0.03)"}
              stroke={isHovered ? "#0BC18D" : hasData ? "rgba(11,193,141,0.3)" : "rgba(255,255,255,0.06)"}
              strokeWidth={isHovered ? 1.5 : 0.5}
              className="cursor-pointer transition-colors"
              onMouseEnter={() => setHovered(iso)}
              onMouseLeave={() => setHovered(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.02 }}
            />
          );
        })}

        {data.map((d) => {
          const path = COUNTRY_PATHS[d.country];
          if (!path) return null;
          return (
            <circle
              key={`dot-${d.country}`}
              cx={path.cx}
              cy={path.cy}
              r={Math.max(2, Math.min(6, (d.total / maxTotal) * 6))}
              fill="#0BC18D"
              opacity={0.8}
              className="pointer-events-none"
            />
          );
        })}
      </svg>

      {hovered && dataMap.has(hovered) && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-2 right-2 rounded-lg bg-black/80 border border-white/10 px-3 py-2 backdrop-blur-sm"
        >
          <p className="text-[10px] text-white/50 uppercase tracking-wider">
            {COUNTRY_PATHS[hovered]?.name ?? hovered}
          </p>
          <p className="text-sm font-bold text-[#0BC18D] tabular-nums">
            {formatCurrency(dataMap.get(hovered)!.total, currency)}
          </p>
          <p className="text-[9px] text-white/30">{dataMap.get(hovered)!.count} transactions</p>
        </motion.div>
      )}
    </div>
  );
}
