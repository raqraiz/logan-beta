import { cn } from "@/lib/utils";
import loganFullLogo from "@/assets/logan-full-logo.jpg";

interface LoganFullLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const LoganFullLogo = ({ size = "md", className }: LoganFullLogoProps) => {
  const sizeClasses = {
    sm: "h-6",
    md: "h-8",
    lg: "h-12",
  };

  return (
    <img
      src={loganFullLogo}
      alt="Logan"
      className={cn(sizeClasses[size], "w-auto object-contain", className)}
    />
  );
};
