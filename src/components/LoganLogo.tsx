import { cn } from "@/lib/utils";

interface LoganLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showGlow?: boolean;
}

const SIZE_PX: Record<NonNullable<LoganLogoProps["size"]>, number> = {
  sm: 40,
  md: 56,
  lg: 80,
  xl: 112,
};

/**
 * Logan glyph — the gradient ring "o" from the wordmark, standalone.
 * The gradient is locked: magenta #FF2E92 → violet #A22BE8 → teal #2BD4D9.
 * Never recolor, rotate, or restyle the ring. Min on-screen size 24px.
 */
export const LoganLogo = ({ size = "md", className, showGlow = true }: LoganLogoProps) => {
  const px = SIZE_PX[size];
  // Stable per-instance gradient id so multiple logos on a page don't collide.
  const gid = `logan-ring-${size}`;
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        showGlow && "drop-shadow-[0_0_18px_hsl(327_100%_59%/0.35)]",
        className,
      )}
      style={{ width: px, height: px, minWidth: 24, minHeight: 24 }}
      aria-label="Logan"
      role="img"
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF2E92" />
            <stop offset="55%" stopColor="#A22BE8" />
            <stop offset="100%" stopColor="#2BD4D9" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="38" stroke={`url(#${gid})`} strokeWidth="10" />
      </svg>
    </div>
  );
};
