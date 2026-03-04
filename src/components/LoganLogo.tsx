import { cn } from "@/lib/utils";
import loganIcon from "@/assets/logan-icon.png";

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

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full overflow-hidden",
        showGlow && "shadow-[0_0_40px_hsl(var(--logan-blue)/0.3)]",
        sizeClasses[size],
        className
      )}
    >
      <img
        src={loganIcon}
        alt="Logan"
        className="w-full h-full object-cover"
      />
    </div>
  );
};
