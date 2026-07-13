import { cn } from "@/lib/utils";

/**
 * Fixed chrome row height — burger / quick note are h-9 (36px) at top-1.5 (6px).
 */
export const APP_TOP_CHROME_ROW_MIN_H_PX = 48;

/** Shared layout id for quick-note corner → sheet morph. */
export const APP_QUICK_NOTE_LAYOUT_ID = "app-quick-note-surface";

/** Fixed quick-note corner (top-right of the app). */
export const APP_QUICK_NOTE_FIXED_CLASS =
  "fixed right-2 top-1.5 z-[202] h-9 w-9";

/** Quick note reserved width (right chrome). */
export const APP_QUICK_NOTE_SLOT_CLASS = "w-9 shrink-0";

/** Reserves space so page headers do not sit under the fixed quick note. */
export function AppQuickNoteChromeSlot({ className }: { className?: string }) {
  return <div className={cn(APP_QUICK_NOTE_SLOT_CLASS, className)} aria-hidden />;
}
