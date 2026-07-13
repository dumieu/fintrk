"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Search } from "lucide-react";

export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  label,
  searchPlaceholder,
  className,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
  searchPlaceholder: string;
  className?: string;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((x) => x !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const clear = () => onChange([]);

  const triggerText =
    selected.length === 0
      ? label
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 min-w-[10.5rem] w-full max-w-full justify-between gap-1 px-3 font-normal sm:w-[min(220px,40vw)] sm:max-w-[220px]",
            className
          )}
        >
          <span className="truncate text-left">{triggerText}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,320px)] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="max-h-[min(50vh,260px)] overflow-y-auto p-1 [scrollbar-width:thin]">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">No matches</p>
          ) : (
            filtered.map((opt) => {
              const rowId = `${uid}-${opt.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
              return (
                <div
                  key={opt}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/80"
                >
                  <Checkbox
                    id={rowId}
                    checked={selected.includes(opt)}
                    onCheckedChange={() => toggle(opt)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={rowId}
                    className="min-w-0 flex-1 cursor-pointer font-mono text-[11px] leading-snug break-all text-foreground"
                  >
                    {opt}
                  </label>
                </div>
              );
            })
          )}
        </div>
        {selected.length > 0 ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={clear}
            >
              Clear selection
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
