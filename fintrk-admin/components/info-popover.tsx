"use client";

import { useState, useRef, useEffect } from "react";
import { Info, X } from "lucide-react";

interface InfoPopoverProps {
  title: string;
  children: React.ReactNode;
}

export function InfoPopover({ title, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors cursor-pointer"
        aria-label={`Info: ${title}`}
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-[60] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <h4 className="font-semibold text-sm text-slate-900 leading-tight">{title}</h4>
            <button
              onClick={() => setOpen(false)}
              className="flex-shrink-0 text-slate-400 hover:text-slate-600 cursor-pointer mt-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-xs text-slate-600 leading-relaxed space-y-2">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
