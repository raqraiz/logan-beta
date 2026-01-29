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
    sm: { inner: 32 },
    md: { inner: 44 },
    lg: { inner: 64 },
    xl: { inner: 88 },
  };

  const { inner } = iconSizes[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-logan-graphite",
        showGlow && "shadow-[0_0_40px_hsl(var(--logan-blue)/0.3)]",
        sizeClasses[size],
        className
      )}
    >
      <svg
        width={inner}
        height={inner}
        viewBox="0 0 50 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna ball - small circle */}
        <circle cx="25" cy="3.5" r="2" fill="hsl(var(--logan-blue))" />
        
        {/* Antenna stem - thin line */}
        <line
          x1="25"
          y1="5.5"
          x2="25"
          y2="10"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Robot Head - rounded rectangle with softer corners */}
        <rect
          x="7"
          y="10"
          width="36"
          height="34"
          rx="9"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2"
          fill="transparent"
        />

        {/* Left Eye - circular */}
        <circle cx="17" cy="25" r="4.5" fill="hsl(var(--logan-red))" />
        <circle cx="15.5" cy="23.5" r="1.5" fill="hsl(0 0% 100% / 0.5)" />

        {/* Right Eye - circular */}
        <circle cx="33" cy="25" r="4.5" fill="hsl(var(--logan-red))" />
        <circle cx="31.5" cy="23.5" r="1.5" fill="hsl(0 0% 100% / 0.5)" />

        {/* Smile - gentle curve */}
        <path
          d="M17 36 Q25 40 33 36"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2"
          strokeLinecap="round"
          fill="transparent"
        />

        {/* Left Ear - small rounded rectangle */}
        <rect
          x="3"
          y="23"
          width="3"
          height="8"
          rx="1.5"
          fill="hsl(var(--logan-blue))"
        />

        {/* Right Ear - small rounded rectangle */}
        <rect
          x="44"
          y="23"
          width="3"
          height="8"
          rx="1.5"
          fill="hsl(var(--logan-blue))"
        />
      </svg>
    </div>
  );
};
