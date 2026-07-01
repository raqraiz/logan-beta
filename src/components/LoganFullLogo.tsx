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
      viewBox="0 0 140 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(heightClasses[size], "w-auto", className)}
      aria-label="Logan"
    >
      <defs>
        <linearGradient id="logan-o-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2BD4D9" />
          <stop offset="100%" stopColor="#15B88C" />
        </linearGradient>
      </defs>

      {/* "L" */}
      <text
        x="0"
        y="35"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="32"
      >
        L
      </text>

      {/* Gradient ring "o" with a small gap at the top */}
      <circle
        cx="34"
        cy="22"
        r="14"
        stroke="url(#logan-o-gradient)"
        strokeWidth="5"
        strokeDasharray="82 6"
        strokeLinecap="round"
        transform="rotate(-90 34 22)"
      />

      {/* "g" */}
      <text
        x="52"
        y="35"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="32"
      >
        g
      </text>

      {/* "a" */}
      <text
        x="74"
        y="35"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="32"
      >
        a
      </text>

      {/* "n" */}
      <text
        x="95"
        y="35"
        fill="currentColor"
        fontFamily="Quicksand, 'DM Sans', sans-serif"
        fontWeight="300"
        fontSize="32"
      >
        n
      </text>
    </svg>
  );
};
