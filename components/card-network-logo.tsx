import { cn } from "@/lib/utils";

const LOGO_H = 14;

type Network =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "jcb"
  | "unionpay"
  | "diners";

function isNetwork(v: string): v is Network {
  return (
    v === "visa" ||
    v === "mastercard" ||
    v === "amex" ||
    v === "discover" ||
    v === "jcb" ||
    v === "unionpay" ||
    v === "diners"
  );
}

/** Small brand-colored mark for statement card_network values. Decorative only. */
export function CardNetworkLogo({
  network,
  className,
}: {
  network: string | null | undefined;
  className?: string;
}) {
  if (!network || network === "unknown" || !isNetwork(network)) return null;

  const common = cn("inline-block shrink-0 align-middle rounded-[3px] shadow-sm ring-1 ring-white/15", className);

  switch (network) {
    case "visa":
      return (
        <svg
          className={common}
          width={34}
          height={LOGO_H}
          viewBox="0 0 48 16"
          aria-hidden
        >
          <rect width="48" height="16" rx="2" fill="#1A1F71" />
          <text
            x="24"
            y="12"
            textAnchor="middle"
            fill="#fff"
            fontSize="9"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="0.06em"
          >
            VISA
          </text>
        </svg>
      );
    case "mastercard":
      return (
        <svg
          className={common}
          width={28}
          height={LOGO_H}
          viewBox="0 0 40 24"
          aria-hidden
        >
          <rect width="40" height="24" rx="3" fill="#fff" />
          <circle cx="17" cy="12" r="9" fill="#EB001B" />
          <circle cx="23" cy="12" r="9" fill="#F79E1B" fillOpacity={0.95} />
        </svg>
      );
    case "amex":
      return (
        <svg
          className={common}
          width={36}
          height={LOGO_H}
          viewBox="0 0 48 16"
          aria-hidden
        >
          <rect width="48" height="16" rx="2" fill="#006FCF" />
          <text
            x="24"
            y="11.5"
            textAnchor="middle"
            fill="#fff"
            fontSize="6.5"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="0.04em"
          >
            AMEX
          </text>
        </svg>
      );
    case "discover":
      return (
        <svg
          className={common}
          width={36}
          height={LOGO_H}
          viewBox="0 0 44 16"
          aria-hidden
        >
          <rect width="44" height="16" rx="2" fill="#FF6000" />
          <text
            x="22"
            y="11.5"
            textAnchor="middle"
            fill="#fff"
            fontSize="6.5"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="0.02em"
          >
            DISCOVER
          </text>
        </svg>
      );
    case "jcb":
      return (
        <svg
          className={common}
          width={32}
          height={LOGO_H}
          viewBox="0 0 36 16"
          aria-hidden
        >
          <rect width="36" height="16" rx="2" fill="#0f0f0f" />
          <rect x="3" y="3" width="9" height="10" rx="1" fill="#0B4EA2" />
          <rect x="13.5" y="3" width="9" height="10" rx="1" fill="#E21836" />
          <rect x="24" y="3" width="9" height="10" rx="1" fill="#006B3C" />
        </svg>
      );
    case "unionpay":
      return (
        <svg
          className={common}
          width={30}
          height={LOGO_H}
          viewBox="0 0 32 16"
          aria-hidden
        >
          <rect width="32" height="16" rx="2" fill="#f8f8f8" />
          <rect x="3" y="3" width="7" height="10" rx="1" fill="#E40521" />
          <rect x="12.5" y="3" width="7" height="10" rx="1" fill="#00447C" />
          <rect x="22" y="3" width="7" height="10" rx="1" fill="#009A44" />
        </svg>
      );
    case "diners":
      return (
        <svg
          className={common}
          width={LOGO_H}
          height={LOGO_H}
          viewBox="0 0 16 16"
          aria-hidden
        >
          <circle cx="8" cy="8" r="8" fill="#0079BE" />
          <text
            x="8"
            y="11"
            textAnchor="middle"
            fill="#fff"
            fontSize="8"
            fontWeight="800"
            fontFamily="Georgia, serif"
          >
            D
          </text>
        </svg>
      );
    default:
      return null;
  }
}
