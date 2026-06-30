import { cn } from "@/lib/utils";

interface LoganFullLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_PX: Record<NonNullable<LoganFullLogoProps["size"]>, number> = {
  sm: 24, // brand minimum
  md: 32,
  lg: 48,
};

/**
 * Logan wordmark — Quicksand "logan" with the locked gradient ring on the "o".
 * Brand rules:
 *  - Gradient is fixed (magenta → violet → teal). Never recolor or restyle.
 *  - Minimum 24px tall on screen.
 *  - Clear space equals ring diameter on all sides (handled by parent layout).
 */
export const LoganFullLogo = ({ size = "md", className }: LoganFullLogoProps) => {
  const h = SIZE_PX[size];
  return (
    <div
      className={cn("inline-flex items-center", className)}
      style={{ height: h, minHeight: 24 }}
      aria-label="Logan"
      role="img"
    >
      <svg
        viewBox="0 0 220 80"
        height="100%"
        width="auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logan-wordmark-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF2E92" />
            <stop offset="55%" stopColor="#A22BE8" />
            <stop offset="100%" stopColor="#2BD4D9" />
          </linearGradient>
        </defs>
        {/* "l" "g" "a" "n" rendered as Quicksand text; "o" is the gradient ring */}
        <text
          x="0"
          y="58"
          fontFamily="Quicksand, system-ui, sans-serif"
          fontWeight="600"
          fontSize="64"
          letterSpacing="-1"
          fill="hsl(var(--foreground))"
        >
          l
        </text>
        {/* Locked gradient ring as the "o" */}
        <circle cx="62" cy="42" r="20" stroke="url(#logan-wordmark-ring)" strokeWidth="7" />
        <text
          x="88"
          y="58"
          fontFamily="Quicksand, system-ui, sans-serif"
          fontWeight="600"
          fontSize="64"
          letterSpacing="-1"
          fill="hsl(var(--foreground))"
        >
          gan
        </text>
      </svg>
    </div>
  );
};
