import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Heart, Sparkles, Check } from "lucide-react";

const onboardingSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  whatsapp_number: z.string().min(10, "Please enter a valid WhatsApp number").max(20),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  age: z.number().min(13).max(65).optional(),
  cycle_length_days: z.number().min(21).max(45).optional(),
  last_period_start: z.string().optional(),
  cycle_regularity: z.string().optional(),
});

type OnboardingData = z.infer<typeof onboardingSchema>;

const symptoms = [
  "Cramps", "Bloating", "Mood swings", "Fatigue", "Headaches", 
  "Breast tenderness", "Acne", "Food cravings", "Insomnia"
];

const goals = [
  "Better understand my cycle",
  "Predict my period",
  "Manage symptoms",
  "Track mood patterns",
  "Optimize energy levels",
  "Support fertility awareness"
];

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch } = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      cycle_length_days: 28,
      cycle_regularity: "regular",
    }
  });

  const toggleSymptom = (symptom: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptom) 
        ? prev.filter(s => s !== symptom)
        : [...prev, symptom]
    );
  };

  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev => 
      prev.includes(goal) 
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    );
  };

  const onSubmit = async (data: OnboardingData) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("participants").insert({
        full_name: data.full_name,
        whatsapp_number: data.whatsapp_number,
        email: data.email || null,
        age: data.age || null,
        cycle_length_days: data.cycle_length_days || 28,
        last_period_start: data.last_period_start || null,
        cycle_regularity: data.cycle_regularity || "regular",
        typical_symptoms: selectedSymptoms,
        goals: selectedGoals,
      });

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Already registered",
            description: "This WhatsApp number is already in the pilot. We'll be in touch soon! 💕",
            variant: "default",
          });
        } else {
          throw error;
        }
      } else {
        setIsComplete(true);
        toast({
          title: "Welcome to Logan! 🌸",
          description: "You're all set. Expect your first insight soon via WhatsApp!",
        });
      }
    } catch (error) {
      console.error("Onboarding error:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isComplete) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Check className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-2xl font-display font-semibold mb-3">You're In! 🌸</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Logan will reach out via WhatsApp on Saturday or Tuesday evening (Israel time) 
          with your first personalized insight.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div 
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="text-center mb-6">
            <Heart className="w-8 h-8 mx-auto text-primary mb-2" />
            <h3 className="text-lg font-display font-medium">Let's get to know you</h3>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="full_name">Your name</Label>
            <Input
              id="full_name"
              placeholder="How should Logan address you?"
              {...register("full_name")}
              className="h-12"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp_number">WhatsApp number</Label>
            <Input
              id="whatsapp_number"
              placeholder="+972 50 123 4567"
              {...register("whatsapp_number")}
              className="h-12"
            />
            {errors.whatsapp_number && (
              <p className="text-sm text-destructive">{errors.whatsapp_number.message}</p>
            )}
            <p className="text-xs text-muted-foreground">Include country code</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              {...register("email")}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="age">Age (optional)</Label>
            <Input
              id="age"
              type="number"
              placeholder="25"
              {...register("age", { valueAsNumber: true })}
              className="h-12"
            />
          </div>

          <Button 
            type="button" 
            onClick={() => setStep(2)} 
            className="w-full h-12 mt-4"
            disabled={!watch("full_name") || !watch("whatsapp_number")}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="text-center mb-6">
            <Sparkles className="w-8 h-8 mx-auto text-primary mb-2" />
            <h3 className="text-lg font-display font-medium">Tell us about your cycle</h3>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cycle_length_days">Average cycle length (days)</Label>
            <Input
              id="cycle_length_days"
              type="number"
              placeholder="28"
              {...register("cycle_length_days", { valueAsNumber: true })}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="last_period_start">When did your last period start?</Label>
            <Input
              id="last_period_start"
              type="date"
              {...register("last_period_start")}
              className="h-12"
            />
          </div>

          <div className="space-y-3">
            <Label>How regular is your cycle?</Label>
            <div className="grid grid-cols-3 gap-2">
              {["regular", "irregular", "very_irregular"].map((reg) => (
                <label 
                  key={reg}
                  className="flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors hover:bg-secondary/50 has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:border-primary"
                >
                  <input
                    type="radio"
                    value={reg}
                    {...register("cycle_regularity")}
                    className="sr-only"
                  />
                  <span className="text-sm capitalize">{reg.replace("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-12">
              Back
            </Button>
            <Button type="button" onClick={() => setStep(3)} className="flex-1 h-12">
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <div className="text-center mb-6">
            <Heart className="w-8 h-8 mx-auto text-primary mb-2" />
            <h3 className="text-lg font-display font-medium">What do you experience?</h3>
          </div>

          <div className="space-y-3">
            <Label>Common symptoms (select all that apply)</Label>
            <div className="flex flex-wrap gap-2">
              {symptoms.map((symptom) => (
                <button
                  key={symptom}
                  type="button"
                  onClick={() => toggleSymptom(symptom)}
                  className={`px-4 py-2 rounded-full text-sm transition-all ${
                    selectedSymptoms.includes(symptom)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {symptom}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>What are your goals?</Label>
            <div className="space-y-2">
              {goals.map((goal) => (
                <label 
                  key={goal}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedGoals.includes(goal)
                      ? "bg-primary/5 border-primary"
                      : "hover:bg-secondary/50"
                  }`}
                >
                  <Checkbox
                    checked={selectedGoals.includes(goal)}
                    onCheckedChange={() => toggleGoal(goal)}
                  />
                  <span className="text-sm">{goal}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 h-12">
              Back
            </Button>
            <Button type="submit" className="flex-1 h-12" disabled={isSubmitting}>
              {isSubmitting ? "Joining..." : "Join the Pilot 🌸"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
