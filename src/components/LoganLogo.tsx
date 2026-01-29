import { cn } from "@/lib/utils";

interface LoganLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showGlow?: boolean;
}

export const LoganLogo = ({ size = "md", className, showGlow = true }: LoganLogoProps) => {
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
    xl: "w-28 h-28",
  };

  const iconSizes = {
    sm: { inner: 28 },
    md: { inner: 38 },
    lg: { inner: 54 },
    xl: { inner: 76 },
  };

  const { inner } = iconSizes[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-logan-graphite border border-logan-blue/30",
        showGlow && "shadow-[0_0_40px_hsl(var(--logan-blue)/0.4)]",
        sizeClasses[size],
        className
      )}
    >
      <svg
        width={inner}
        height={inner}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna ball */}
        <circle cx="32" cy="6" r="4" fill="hsl(var(--logan-blue))" />
        
        {/* Antenna stem */}
        <line
          x1="32"
          y1="10"
          x2="32"
          y2="18"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Robot Head - rounded rectangle */}
        <rect
          x="8"
          y="18"
          width="48"
          height="38"
          rx="10"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="3"
          fill="transparent"
        />

        {/* Left Eye */}
        <circle cx="22" cy="36" r="6" fill="hsl(var(--logan-red))" />
        <circle cx="24" cy="34" r="2" fill="hsl(0 0% 100% / 0.5)" />

        {/* Right Eye */}
        <circle cx="42" cy="36" r="6" fill="hsl(var(--logan-red))" />
        <circle cx="44" cy="34" r="2" fill="hsl(0 0% 100% / 0.5)" />

        {/* Smile */}
        <path
          d="M22 48 Q32 55 42 48"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="3"
          strokeLinecap="round"
          fill="transparent"
        />

        {/* Left Ear */}
        <rect
          x="2"
          y="30"
          width="5"
          height="14"
          rx="2.5"
          fill="hsl(var(--logan-blue))"
        />

        {/* Right Ear */}
        <rect
          x="57"
          y="30"
          width="5"
          height="14"
          rx="2.5"
          fill="hsl(var(--logan-blue))"
        />
      </svg>
    </div>
  );
};
