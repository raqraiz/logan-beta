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
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna ball */}
        <circle cx="24" cy="4" r="2.5" fill="hsl(var(--logan-blue))" />
        
        {/* Antenna stem */}
        <line
          x1="24"
          y1="6.5"
          x2="24"
          y2="11"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Robot Head - rounded rectangle */}
        <rect
          x="6"
          y="11"
          width="36"
          height="32"
          rx="8"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2"
          fill="transparent"
        />

        {/* Left Eye - oval */}
        <ellipse cx="16" cy="25" rx="4" ry="5" fill="hsl(var(--logan-red))" />
        <circle cx="17.5" cy="23.5" r="1.2" fill="hsl(0 0% 100% / 0.4)" />

        {/* Right Eye - oval */}
        <ellipse cx="32" cy="25" rx="4" ry="5" fill="hsl(var(--logan-red))" />
        <circle cx="33.5" cy="23.5" r="1.2" fill="hsl(0 0% 100% / 0.4)" />

        {/* Smile */}
        <path
          d="M16 35 Q24 41 32 35"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2"
          strokeLinecap="round"
          fill="transparent"
        />

        {/* Left Ear */}
        <rect
          x="2"
          y="22"
          width="3"
          height="10"
          rx="1.5"
          fill="hsl(var(--logan-blue))"
        />

        {/* Right Ear */}
        <rect
          x="43"
          y="22"
          width="3"
          height="10"
          rx="1.5"
          fill="hsl(var(--logan-blue))"
        />
      </svg>
    </div>
  );
};
