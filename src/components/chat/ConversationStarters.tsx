import { Button } from "@/components/ui/button";

interface ConversationStartersProps {
  starters: string[];
  onSelect: (starter: string) => void;
  disabled?: boolean;
}

export const ConversationStarters = ({ 
  starters, 
  onSelect, 
  disabled = false 
}: ConversationStartersProps) => {
  if (!starters || starters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {starters.map((starter, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          onClick={() => onSelect(starter)}
          disabled={disabled}
          className="text-sm rounded-full bg-card hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          {starter}
        </Button>
      ))}
    </div>
  );
};
