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
    <div className="flex flex-nowrap gap-2 mt-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {starters.map((starter, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          onClick={() => onSelect(starter)}
          disabled={disabled}
          className="text-sm rounded-full bg-card hover:bg-primary hover:text-primary-foreground transition-colors shrink-0 whitespace-nowrap"
        >
          {starter}
        </Button>
      ))}
    </div>
  );
};
