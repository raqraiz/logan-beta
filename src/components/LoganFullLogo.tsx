import { cn } from "@/lib/utils";

interface LoganFullLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const LoganFullLogo = ({ size = "md", className }: LoganFullLogoProps) => {
  const heightClasses = {
    sm: "h-6",
    md: "h-8",
    lg: "h-12",
  };

  return (
    <svg
      viewBox="0 0 118 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(heightClasses[size], "w-auto", className)}
      aria-label="Logan"
    >
      <defs>
        <linearGradient id="logan-o-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF2E92" />
          <stop offset="50%" stopColor="#A22BE8" />
          <stop offset="100%" stopColor="#2BD4D9" />
        </linearGradient>
      </defs>

      {/* "L" */}
      <text
        x="0"
        y="35"
        fill="currentColor"
        fontFamily="Quicksand, sans-serif"
        fontWeight="600"
        fontSize="34"
      >
        L
      </text>

      {/* Gradient ring "o" — lowercase-sized, gap at the top */}
      <circle
        cx="31"
        cy="26.5"
        r="7.3"
        stroke="url(#logan-o-gradient)"
        strokeWidth="2.6"
      />

      {/* "gan" */}
      <text
        x="40.5"
        y="35"
        fill="currentColor"
        fontFamily="Quicksand, sans-serif"
        fontWeight="600"
        fontSize="34"
      >
        gan
      </text>
    </svg>
  );
};
