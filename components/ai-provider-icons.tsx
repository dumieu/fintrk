import type { SVGProps } from "react";

export type AiProviderId = "chatgpt" | "claude" | "perplexity";

interface IconProps extends SVGProps<SVGSVGElement> {
  /** White mark for use on the provider brand tile. */
  onBrand?: boolean;
}

/** OpenAI / ChatGPT knot mark */
export function ChatGptIcon({ onBrand, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      <path
        fill={onBrand ? "#ffffff" : "currentColor"}
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.938 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .742 7.097 5.98 5.98 0 0 0 .511 4.931 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.006 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.055 6.055 0 0 0-.493-7.073zM13.006 22.347a4.475 4.475 0 0 1-2.876-1.028l.141-.081 4.778-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.493 4.482zM3.211 18.277a4.467 4.467 0 0 1-.535-3.014l.142.085 4.783 2.759a.795.795 0 0 0 .788 0l5.843-3.369v2.332a.071.071 0 0 1-.027.061l-4.833 2.787a4.504 4.504 0 0 1-6.161-1.641zM2.344 7.654a4.485 4.485 0 0 1 2.366-1.973V11.6a.795.795 0 0 0 .392.681l5.843 3.369-2.02 1.168a.071.071 0 0 1-.071 0l-4.834-2.787a4.504 4.504 0 0 1-1.676-6.197zM17.506 11.989l-5.843-3.369 2.02-1.163a.071.071 0 0 1 .071 0l4.834 2.787a4.494 4.494 0 0 1-.676 8.105v-5.712a.796.796 0 0 0-.406-.648zm2.01-3.023l-.141-.085-4.774-2.782a.795.795 0 0 0-.785 0L9.409 9.229V6.897a.071.071 0 0 1 .028-.061l4.833-2.787a4.504 4.504 0 0 1 6.246 1.917zM8.816 13.52l-2.02-1.168a.071.071 0 0 1-.038-.057V6.712a4.504 4.504 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.392.681l-.005 6.742zm1.097-2.365l2.602-1.499 2.606 1.499v2.998l-2.597 1.5-2.606-1.5V11.155z"
      />
    </svg>
  );
}

/** Anthropic Claude starburst mark */
export function ClaudeIcon({ onBrand, className, ...props }: IconProps) {
  const stroke = onBrand ? "#ffffff" : "currentColor";
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      {rays.map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="5.5"
          x2="12"
          y2="18.5"
          stroke={stroke}
          strokeWidth="2.15"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}

/** Perplexity geometric mark */
export function PerplexityIcon({ onBrand, className, ...props }: IconProps) {
  const fill = onBrand ? "#ffffff" : "currentColor";
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      <path
        fill={fill}
        d="M12 3.2 14.4 8.8l5.6 2.4-5.6 2.4L12 18.8l-2.4-5.2-5.6-2.4 5.6-2.4L12 3.2z"
      />
      <path
        fill={onBrand ? "#20808D" : "currentColor"}
        fillOpacity={onBrand ? 1 : 0.35}
        d="M12 7.4 13.1 10.2l2.8 1.1-2.8 1.1L12 15.5l-1.1-2.8-2.8-1.1 2.8-1.1L12 7.4z"
      />
    </svg>
  );
}

export const PROVIDER_BRAND_COLOR: Record<AiProviderId, string> = {
  chatgpt: "#10A37F",
  claude: "#D97757",
  perplexity: "#20808D",
};

interface ProviderBrandIconProps {
  provider: AiProviderId;
  size?: "sm" | "md";
  className?: string;
}

/** Rounded brand tile with provider mark (tabs, headers). */
export function ProviderBrandIcon({ provider, size = "sm", className = "" }: ProviderBrandIconProps) {
  const dim = size === "sm" ? "h-6 w-6 rounded-md" : "h-9 w-9 rounded-lg";
  const iconDim = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  const Icon =
    provider === "chatgpt" ? ChatGptIcon : provider === "claude" ? ClaudeIcon : PerplexityIcon;

  return (
    <span
      className={`flex shrink-0 items-center justify-center ${dim} ${className}`}
      style={{ background: PROVIDER_BRAND_COLOR[provider] }}
    >
      <Icon onBrand className={iconDim} />
    </span>
  );
}
