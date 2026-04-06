import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-4 text-xs text-muted-foreground sm:py-3">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between sm:w-full">
          <p className="text-xs">&copy; {new Date().getFullYear()} FinTRK. All rights reserved.</p>
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" aria-label="Footer navigation">
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </nav>
        </div>
        <p className="max-w-2xl text-center text-[10px] leading-relaxed text-muted-foreground/60">
          FinTRK is designed for personal financial tracking and education.
          It does not constitute financial advice, and its insights do not substitute
          for professional financial planning or investment counsel.
        </p>
      </div>
    </footer>
  );
}
