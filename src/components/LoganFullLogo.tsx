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
      viewBox="0 0 180 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(heightClasses[size], "w-auto", className)}
      aria-label="Logan"
    >
      <defs>
        <linearGradient id="logan-o-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2BD4D9" />
          <stop offset="50%" stopColor="#15B88C" />
        </linearGradient>
      </defs>

      {/* "L" */}
      <text
        x="0"
        y="36"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="34"
      >
        L
      </text>

      {/* Gradient ring "o" */}
      <circle
        cx="52"
        cy="22"
        r="15"
        stroke="url(#logan-o-gradient)"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* "g" */}
      <text
        x="72"
        y="36"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="34"
      >
        g
      </text>

      {/* "a" */}
      <text
        x="97"
        y="36"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="34"
      >
        a
      </text>

      {/* "n" */}
      <text
        x="121"
        y="36"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="34"
      >
        n
      </text>
    </svg>
  );
};
