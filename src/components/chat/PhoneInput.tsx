import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Phone } from "lucide-react";

interface PhoneInputProps {
  onSubmit: (phone: string) => void;
  isSubmitting: boolean;
}

export const PhoneInput = ({ onSubmit, isSubmitting }: PhoneInputProps) => {
  const [phone, setPhone] = useState("");

  const isValid = /^\+?\d{7,15}$/.test(phone.replace(/[\s\-()]/g, ""));

  const handleSubmit = () => {
    if (!isValid) return;
    // Normalize: strip spaces/dashes, ensure + prefix
    const normalized = phone.replace(/[\s\-()]/g, "");
    onSubmit(normalized.startsWith("+") ? normalized : `+${normalized}`);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">Your phone number</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Include country code, e.g. +972501234567
        </p>
        <Input
          type="tel"
          placeholder="+972..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-12 text-base"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !isValid}
        className="w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Phone className="w-4 h-4 mr-2" />
            Continue
          </>
        )}
      </Button>
    </div>
  );
};
