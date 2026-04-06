import { cn } from "@/lib/utils";

/**
 * BioTRK SHORT logo pattern: one capital letter centered in a circle, Aldhabi,
 * letter fills most of the circle — adapted for FinTRK ("F").
 * @see Biotrk/.cursor/rules/branding-logo.mdc
 */
export function FintrkShortLogo({
  className,
  size = "auth",
}: {
  className?: string;
  /** `auth` matches BioTRK PulsatingHeart hero size (h-40 sm:h-48); `header` fits the app bar */
  size?: "auth" | "header";
}) {
  const isAuth = size === "auth";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-black font-aldhabi leading-none text-white select-none",
        isAuth
          ? "h-40 w-40 text-[72px] sm:h-48 sm:w-48 sm:text-[80px]"
          : "h-9 w-9 text-[18px] sm:h-10 sm:w-10 sm:text-[20px]",
        className
      )}
      aria-hidden
    >
      F
    </div>
  );
}
