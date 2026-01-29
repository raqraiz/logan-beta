import { cn } from "@/lib/utils";

interface LoganLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showGlow?: boolean;
}

export const LoganLogo = ({ size = "md", className, showGlow = true }: LoganLogoProps) => {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
    xl: "w-24 h-24",
  };

  const iconSizes = {
    sm: { outer: 32, inner: 20 },
    md: { outer: 48, inner: 30 },
    lg: { outer: 64, inner: 40 },
    xl: { outer: 96, inner: 60 },
  };

  const { outer, inner } = iconSizes[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-logan-graphite",
        showGlow && "shadow-[0_0_30px_hsl(var(--logan-cyan)/0.3)]",
        sizeClasses[size],
        className
      )}
    >
      <svg
        width={inner}
        height={inner}
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna */}
        <circle cx="30" cy="6" r="3" fill="hsl(var(--logan-cyan))" />
        <line
          x1="30"
          y1="9"
          x2="30"
          y2="16"
          stroke="hsl(var(--logan-cyan))"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Robot Head */}
        <rect
          x="10"
          y="16"
          width="40"
          height="34"
          rx="8"
          stroke="hsl(var(--logan-cyan))"
          strokeWidth="2.5"
          fill="transparent"
        />

        {/* Left Eye */}
        <circle cx="22" cy="32" r="5" fill="hsl(var(--logan-red))" />
        <circle cx="23" cy="31" r="1.5" fill="hsl(0 0% 100% / 0.6)" />

        {/* Right Eye */}
        <circle cx="38" cy="32" r="5" fill="hsl(var(--logan-red))" />
        <circle cx="39" cy="31" r="1.5" fill="hsl(0 0% 100% / 0.6)" />

        {/* Mouth */}
        <path
          d="M22 44 Q30 50 38 44"
          stroke="hsl(var(--logan-cyan))"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="transparent"
        />

        {/* Left Ear */}
        <rect
          x="4"
          y="26"
          width="4"
          height="12"
          rx="2"
          fill="hsl(var(--logan-cyan))"
        />

        {/* Right Ear */}
        <rect
          x="52"
          y="26"
          width="4"
          height="12"
          rx="2"
          fill="hsl(var(--logan-cyan))"
        />
      </svg>
    </div>
  );
};
