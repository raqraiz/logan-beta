import symptomMapImage from "@/assets/symptom-map.png";

interface SymptomMapProps {
  symptoms?: string[];
}

export const SymptomMap = ({ symptoms }: SymptomMapProps) => {
  return (
    <div className="rounded-xl overflow-hidden bg-card border border-border">
      <img
        src={symptomMapImage}
        alt="Your symptom map – how your cycle affects you"
        className="w-full max-w-[280px] mx-auto"
      />
      {symptoms && symptoms.length > 0 && (
        <div className="px-3 py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Your symptom map
          </p>
        </div>
      )}
    </div>
  );
};
