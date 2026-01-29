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
        {/* Antenna: hollow rounded-square loop + stem */}
        <rect
          x="22.5"
          y="2"
          width="5"
          height="5"
          rx="1.4"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2.5"
          fill="transparent"
        />
        <line
          x1="25"
          y1="7.2"
          x2="25"
          y2="11"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Head outline */}
        <rect
          x="8"
          y="11"
          width="34"
          height="30"
          rx="8"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2.5"
          fill="transparent"
        />

        {/* Ears: outlined rounded tabs */}
        <rect
          x="3.8"
          y="22"
          width="6.2"
          height="8"
          rx="4"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2.5"
          fill="transparent"
        />
        <rect
          x="40"
          y="22"
          width="6.2"
          height="8"
          rx="4"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="2.5"
          fill="transparent"
        />

        {/* Eyes: red rounded-rectangles */}
        <rect x="15.5" y="20.5" width="7" height="9" rx="3.2" fill="hsl(var(--logan-red))" />
        <rect x="27.5" y="20.5" width="7" height="9" rx="3.2" fill="hsl(var(--logan-red))" />

        {/* Mouth: thick cyan smile */}
        <path
          d="M18 33 Q25 38 32 33"
          stroke="hsl(var(--logan-blue))"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="transparent"
        />
      </svg>
    </div>
  );
};
