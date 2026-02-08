import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Check, CalendarIcon, MessageCircle, ExternalLink, Smartphone, RefreshCw } from "lucide-react";
import { LoganLogo } from "./LoganLogo";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QRCodeSVG } from "qrcode.react";

const STORAGE_KEY = "logan_onboarding_draft";

// Normalize phone number to international format
const normalizePhoneNumber = (phone: string): string => {
  let normalized = phone.replace(/[\s\-\(\)]/g, "");
  const israeliMobilePrefixes = ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59"];
  
  if (normalized.startsWith("0") && normalized.length === 10) {
    const prefix = normalized.substring(1, 3);
    if (israeliMobilePrefixes.includes(prefix)) {
      return "+972" + normalized.substring(1);
    }
  }
  
  if (normalized.startsWith("972")) {
    normalized = "+" + normalized;
  }
  
  if (!normalized.startsWith("+")) {
    normalized = "+" + normalized;
  }
  
  normalized = normalized.replace(/^\+(\d{1,3})0(\d)/, "+$1$2");
  
  return normalized;
};

const onboardingSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  whatsapp_number: z.string()
    .min(10, "Please enter a valid phone number")
    .max(20)
    .refine((val) => {
      const normalized = normalizePhoneNumber(val);
      return /^\+\d{10,15}$/.test(normalized);
    }, "Enter number with country code (e.g., +972501234567)"),
  email: z.string().email("Please enter a valid email"),
  age: z.number().min(13).max(65).optional(),
  cycle_length_days: z.number().min(21).max(45).optional(),
  last_period_start: z.date().optional(),
});

type OnboardingData = z.infer<typeof onboardingSchema>;

interface SavedDraft {
  participantId?: string;
  step: number;
  formData: Partial<OnboardingData>;
  selectedSymptoms: string[];
  anchorSymptom: string;
  anchorOther: string;
  consentGiven: boolean;
  telegramChatId: string;
  cycleNotes: string;
  symptomNotes: string;
  anchorNotes: string;
  lastPeriodDate?: string;
}

const symptomCategories = {
  "EMOTIONAL & COGNITIVE": [
    "Rage spikes",
    "Anxiety spikes",
    "Short fuse",
    "Sudden dread",
    "Feeling overwhelmed",
    "Low stress tolerance",
    "Irritability",
    "Brain fog",
  ],
  "PHYSICAL": [
    "Energy crashes",
    "Wired but tired",
    "Full body inflammation",
    "Nausea",
    "Dizziness",
    "Ringing in ears",
    "Muffled hearing",
    "Migraines",
    "Deep fatigue",
    "Smell sensitivity",
    "Chin or jaw acne breakouts",
  ],
  "IS IT JUST ME?": [
    "Random shame spiral",
    "One stinky armpit",
    "Feeling emotionally allergic to people",
    "Sudden urge to delete your whole life online",
  ],
};

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [anchorSymptom, setAnchorSymptom] = useState<string>("");
  const [anchorOther, setAnchorOther] = useState<string>("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [lastPeriodDate, setLastPeriodDate] = useState<Date | undefined>();
  const [savedParticipantId, setSavedParticipantId] = useState<string | null>(null);
  
  // Free-form text fields
  const [cycleNotes, setCycleNotes] = useState<string>("");
  const [symptomNotes, setSymptomNotes] = useState<string>("");
  const [anchorNotes, setAnchorNotes] = useState<string>("");

  const { register, handleSubmit, formState: { errors }, watch, setValue, getValues } = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      cycle_length_days: 28,
    }
  });

  // Load saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const draft: SavedDraft = JSON.parse(saved);
        
        // Restore form state
        if (draft.formData.full_name) setValue("full_name", draft.formData.full_name);
        if (draft.formData.whatsapp_number) setValue("whatsapp_number", draft.formData.whatsapp_number);
        if (draft.formData.email) setValue("email", draft.formData.email);
        if (draft.formData.age) setValue("age", draft.formData.age);
        if (draft.formData.cycle_length_days) setValue("cycle_length_days", draft.formData.cycle_length_days);
        if (draft.lastPeriodDate) {
          const date = new Date(draft.lastPeriodDate);
          setLastPeriodDate(date);
          setValue("last_period_start", date);
        }
        
        setSelectedSymptoms(draft.selectedSymptoms || []);
        setAnchorSymptom(draft.anchorSymptom || "");
        setAnchorOther(draft.anchorOther || "");
        setConsentGiven(draft.consentGiven || false);
        setTelegramChatId(draft.telegramChatId || "");
        setCycleNotes(draft.cycleNotes || "");
        setSymptomNotes(draft.symptomNotes || "");
        setAnchorNotes(draft.anchorNotes || "");
        
        if (draft.participantId) {
          setSavedParticipantId(draft.participantId);
          // If they already saved their data, go to Telegram step
          setStep(6);
          toast({
            title: "Welcome back! 👋",
            description: "Your signup was saved. Just connect Telegram to finish.",
          });
        } else if (draft.step > 1) {
          setStep(draft.step);
        }
      }
    } catch (e) {
      console.error("Failed to load draft:", e);
    }
  }, [setValue]);

  // Save draft whenever important state changes
  useEffect(() => {
    const formData = getValues();
    const draft: SavedDraft = {
      participantId: savedParticipantId || undefined,
      step,
      formData: {
        full_name: formData.full_name,
        whatsapp_number: formData.whatsapp_number,
        email: formData.email,
        age: formData.age,
        cycle_length_days: formData.cycle_length_days,
      },
      selectedSymptoms,
      anchorSymptom,
      anchorOther,
      consentGiven,
      telegramChatId,
      cycleNotes,
      symptomNotes,
      anchorNotes,
      lastPeriodDate: lastPeriodDate?.toISOString(),
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [step, selectedSymptoms, anchorSymptom, anchorOther, consentGiven, telegramChatId, cycleNotes, symptomNotes, anchorNotes, lastPeriodDate, savedParticipantId, getValues]);

  const toggleSymptom = (symptom: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptom) 
        ? prev.filter(s => s !== symptom)
        : [...prev, symptom]
    );
  };

  const handleDateSelect = (date: Date | undefined) => {
    setLastPeriodDate(date);
    setValue("last_period_start", date);
  };

  // Save participant data after consent (step 5 -> 6)
  const saveParticipantData = async () => {
    const data = getValues();
    const validationResult = onboardingSchema.safeParse({
      ...data,
      last_period_start: lastPeriodDate,
    });
    
    if (!validationResult.success) {
      const missingFields: string[] = [];
      validationResult.error.errors.forEach((err) => {
        if (err.path[0] === "full_name") missingFields.push("Name");
        if (err.path[0] === "whatsapp_number") missingFields.push("Phone Number");
        if (err.path[0] === "email") missingFields.push("Email");
      });
      
      const fieldList = missingFields.length > 0 
        ? missingFields.join(" and ") 
        : "required fields";
      
      toast({
        title: "Please check your info",
        description: `${fieldList} ${missingFields.length === 1 ? "is" : "are"} missing or invalid.`,
        variant: "destructive",
      });
      return false;
    }

    setIsSubmitting(true);
    try {
      const finalAnchor = anchorSymptom === "Other" ? anchorOther : anchorSymptom;
      const normalizedPhone = normalizePhoneNumber(data.whatsapp_number);
      
      // Use edge function to register participant (bypasses RLS)
      const { data: result, error } = await supabase.functions.invoke("lookup-participant", {
        body: {
          action: "register",
          participantData: {
            full_name: data.full_name,
            whatsapp_number: normalizedPhone,
            email: data.email || null,
            age: data.age || null,
            cycle_length_days: data.cycle_length_days || 28,
            last_period_start: lastPeriodDate ? format(lastPeriodDate, "yyyy-MM-dd") : null,
            cycle_regularity: "regular",
            typical_symptoms: selectedSymptoms,
            goals: selectedSymptoms.length > 0 ? ["Understand my symptoms"] : [],
            anchor_symptom: finalAnchor,
            consent_given: consentGiven,
            consent_given_at: new Date().toISOString(),
            additional_notes: [cycleNotes, symptomNotes, anchorNotes].filter(Boolean).join("\n\n---\n\n") || null,
            preferred_channel: "telegram",
          }
        },
      });

      if (error) throw error;

      if (result.error) {
        throw new Error(result.error);
      }

      setSavedParticipantId(result.participantId);
      
      if (result.alreadyExists) {
        if (result.telegramConnected) {
          setIsComplete(true);
          localStorage.removeItem(STORAGE_KEY);
          toast({
            title: "You're already registered! 🌸",
            description: "Logan will reach out soon via Telegram.",
          });
          return false;
        }
        toast({
          title: "Welcome back! 👋",
          description: "Just connect Telegram to finish your signup.",
        });
      } else {
        toast({
          title: "Info saved! ✨",
          description: "Now let's connect you to Telegram.",
        });
      }
      return true;
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Telegram ID for existing participant
  const updateTelegramId = async () => {
    if (!savedParticipantId || !telegramChatId.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Use edge function to update Telegram ID (bypasses RLS)
      const { data: result, error } = await supabase.functions.invoke("lookup-participant", {
        body: {
          action: "connect-telegram",
          participantId: savedParticipantId,
          chatId: telegramChatId.trim(),
        },
      });

      if (error) throw error;
      if (result.error) throw new Error(result.error);

      localStorage.removeItem(STORAGE_KEY);
      setIsComplete(true);
      toast({
        title: "Welcome to Logan! 🌸",
        description: "You're all set. Expect your first insight soon via Telegram!",
      });
    } catch (error) {
      console.error("Update error:", error);
      toast({
        title: "Couldn't save Telegram ID",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle proceeding from consent to Telegram step
  const proceedToTelegram = async () => {
    if (savedParticipantId) {
      // Already saved, just move to step 6
      setStep(6);
    } else {
      // Save first, then move to step 6
      const success = await saveParticipantData();
      if (success) {
        setStep(6);
      }
    }
  };

  const onSubmit = async () => {
    await updateTelegramId();
  };

  const canProceedStep1 = watch("full_name") && watch("whatsapp_number") && watch("email");
  const canProceedStep4 = anchorSymptom && (anchorSymptom !== "Other" || anchorOther.trim());

  // Clear draft and start over
  const clearDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  // Confirmation screen
  if (isComplete) {
    return (
      <div className="text-center py-8 animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Check className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-2xl font-display font-semibold mb-3">You're In! 🌸</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Logan will reach out via Telegram on Saturday or Tuesday evening (Israel time) 
          with your first personalized insight.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div 
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Slide 1 - Authentication */}
      {step === 1 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-6">
            <LoganLogo size="md" showGlow={false} className="mx-auto mb-3" />
            <h3 className="text-xl font-display font-semibold">Welcome to Logan</h3>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="full_name">Your Name</Label>
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
            <Label htmlFor="whatsapp_number">Phone Number</Label>
            <Input
              id="whatsapp_number"
              placeholder="0501234567"
              {...register("whatsapp_number")}
              className="h-12"
              onBlur={(e) => {
                const current = e.target.value;
                if (current && current.length >= 10) {
                  setValue("whatsapp_number", normalizePhoneNumber(current));
                }
              }}
            />
            {watch("whatsapp_number") && watch("whatsapp_number").length >= 10 && (
              <p className="text-xs text-primary font-medium">
                Will be saved as: {normalizePhoneNumber(watch("whatsapp_number"))}
              </p>
            )}
            {errors.whatsapp_number && (
              <p className="text-sm text-destructive">{errors.whatsapp_number.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              {...register("email")}
              className="h-12"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <Button 
            type="button" 
            onClick={() => setStep(2)} 
            className="w-full h-12 mt-4"
            disabled={!canProceedStep1}
          >
            Continue
          </Button>
        </div>
      )}

      {/* Slide 2 - Cycle Data */}
      {step === 2 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-6">
            <h3 className="text-xl font-display font-semibold">Your Personal Cycle</h3>
          </div>

          <div className="space-y-2">
            <Label htmlFor="age" className="text-sm">
              Age <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="age"
              type="number"
              placeholder="35"
              {...register("age", { valueAsNumber: true })}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cycle_length_days" className="text-sm">
              Average Cycle Length (Days) <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cycle_length_days"
              type="number"
              placeholder="28"
              {...register("cycle_length_days", { valueAsNumber: true })}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">
              When Did Your Last Period Start? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-12 justify-start text-left font-normal",
                    !lastPeriodDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {lastPeriodDate ? format(lastPeriodDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={lastPeriodDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cycle_notes" className="text-sm">
              Anything else about your cycle? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="cycle_notes"
              placeholder="Irregular patterns, hormonal conditions, medications, or anything Logan should know..."
              value={cycleNotes}
              onChange={(e) => setCycleNotes(e.target.value)}
              className="min-h-[80px] resize-none"
            />
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

      {/* Slide 3 - Symptoms */}
      {step === 3 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-4">
            <h3 className="text-xl font-display font-semibold mb-2">Understand Your Symptoms</h3>
            <p className="text-muted-foreground">
              What are the symptoms that are the most <strong className="text-foreground">confusing or troubling</strong> around your cycle?
            </p>
            <p className="text-sm text-muted-foreground mt-1">Select all that apply</p>
          </div>

          <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
            {Object.entries(symptomCategories).map(([category, symptoms]) => (
              <div key={category} className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                  {category}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {symptoms.map((symptom) => (
                    <button
                      key={symptom}
                      type="button"
                      onClick={() => toggleSymptom(symptom)}
                      className={`px-3 py-2 rounded-full text-sm transition-all ${
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
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="symptom_notes" className="text-sm">
              Tell us more about your symptoms <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="symptom_notes"
              placeholder="When do they usually appear? How do they affect your day? Any patterns you've noticed..."
              value={symptomNotes}
              onChange={(e) => setSymptomNotes(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 h-12">
              Back
            </Button>
            <Button type="button" onClick={() => setStep(4)} className="flex-1 h-12">
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Slide 4 - Anchor Symptom */}
      {step === 4 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-4">
            <h3 className="text-xl font-display font-semibold mb-2">Which Troubles You Most?</h3>
            <p className="text-muted-foreground">
              Choose the <strong className="text-foreground">one symptom</strong> that affects your life the most. This becomes your Anchor Symptom.
            </p>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {selectedSymptoms.length > 0 ? (
              selectedSymptoms.map((symptom) => (
                <button
                  key={symptom}
                  type="button"
                  onClick={() => setAnchorSymptom(symptom)}
                  className={`w-full p-4 rounded-xl text-left text-sm transition-all border ${
                    anchorSymptom === symptom
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-card border-border hover:border-primary/50"
                  }`}
                >
                  {symptom}
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No symptoms selected. You can still choose "Other" below.
              </p>
            )}
            
            {/* Other option */}
            <button
              type="button"
              onClick={() => setAnchorSymptom("Other")}
              className={`w-full p-4 rounded-xl text-left text-sm transition-all border ${
                anchorSymptom === "Other"
                  ? "bg-primary/10 border-primary text-foreground"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              Other
            </button>
            
            {anchorSymptom === "Other" && (
              <div className="pt-2">
                <Input
                  placeholder="Describe your anchor symptom..."
                  value={anchorOther}
                  onChange={(e) => setAnchorOther(e.target.value)}
                  className="h-12"
                  required
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="anchor_notes" className="text-sm">
              How does this symptom affect your life? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="anchor_notes"
              placeholder="Work, relationships, daily routines, self-perception... share as much or as little as you'd like"
              value={anchorNotes}
              onChange={(e) => setAnchorNotes(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="button" variant="outline" onClick={() => setStep(3)} className="flex-1 h-12">
              Back
            </Button>
            <Button 
              type="button" 
              onClick={() => setStep(5)} 
              className="flex-1 h-12"
              disabled={!canProceedStep4}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Slide 5 - Consent Form */}
      {step === 5 && (
        <div className="space-y-4 animate-fade-in">
          <div className="text-center mb-2">
            <h3 className="text-lg font-display font-semibold">Pilot Consent & Privacy Terms</h3>
            <p className="text-xs text-muted-foreground">Please read and agree to continue</p>
          </div>

          <ScrollArea className="h-[320px] rounded-lg border border-border bg-muted/30 p-4">
            <div className="space-y-4 text-sm text-muted-foreground pr-4">
              {/* Section 1 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">1. Nature of the Pilot: Educational Only - Not Medical Care</h4>
                <p>This pilot provides <strong>educational information, general wellness insights, and lifestyle suggestions only</strong> related to menstrual cycles, general health, and symptoms.</p>
                <p className="mt-2">We are <strong>not</strong>: doctors, nurses, licensed healthcare providers, a clinic or medical service.</p>
                <p className="mt-2">We do <strong>not</strong> diagnose, treat, or provide medical advice.</p>
                <p className="mt-2">Nothing shared should replace care from a qualified medical professional. Always consult a licensed healthcare provider before making health or medical decisions.</p>
                <p className="mt-2 font-medium text-foreground">If you have severe symptoms or a medical emergency, seek medical care immediately.</p>
              </section>

              {/* Section 2 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">2. Organized by Individuals (No Company or Clinical Relationship)</h4>
                <p>You understand that:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>This is an early-stage MVP/research pilot</li>
                  <li>It is operated by private individuals, not a registered medical entity</li>
                  <li>No doctor–patient or therapeutic relationship is created</li>
                  <li>No professional or fiduciary duty of care is assumed</li>
                </ul>
                <p className="mt-2">Participation is informal and voluntary.</p>
              </section>

              {/* Section 3 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">3. Voluntary Participation</h4>
                <p>You may:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>Stop participating at any time</li>
                  <li>Decline to answer any question or respond</li>
                  <li>Request deletion of your information</li>
                </ul>
                <p className="mt-2">There is no obligation to follow any recommendation.</p>
              </section>

              {/* Section 4 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">4. Assumption of Risk & Personal Responsibility</h4>
                <p>Health related decisions carry inherent risks.</p>
                <p className="mt-2">You accept full responsibility for:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>How you use the information shared</li>
                  <li>Any changes you make to your lifestyle or health practices</li>
                  <li>Your personal health outcomes</li>
                </ul>
                <p className="mt-2 font-medium text-foreground">You participate entirely at your own risk.</p>
              </section>

              {/* Section 5 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">5. Limitation of Liability & Release</h4>
                <p>To the maximum extent permitted by law, you agree that the Organizers, individually and collectively, including their collaborators, contractors, volunteers, advisors, service providers, and anyone assisting with the pilot, <strong>shall not be liable</strong> for any injury, illness, damages, losses, claims, or liabilities of any kind arising from or related to:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>Participation in the pilot</li>
                  <li>Reliance on any information or recommendations</li>
                  <li>Failure to seek medical care</li>
                  <li>Sharing personal or health information digitally</li>
                  <li>Use of third-party platforms or software</li>
                  <li>Unauthorized access, data breaches, or system failures</li>
                </ul>
                <p className="mt-2">The pilot is provided <strong>"as is" without warranties of any kind</strong>.</p>
              </section>

              {/* Section 6 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">6. Communication Platforms & Technology Risks</h4>
                <p>This pilot uses third-party tools including Telegram and additional messaging systems. These are <strong>not medical-grade or healthcare-certified systems</strong>.</p>
                <p className="mt-2">You acknowledge that:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>These platforms are not controlled by the Organizers</li>
                  <li>They do not meet healthcare or HIPAA-level security standards</li>
                  <li>Messages and data may be stored on devices or external servers</li>
                  <li>No digital transmission is completely secure</li>
                </ul>
                <p className="mt-2">By participating, you <strong>explicitly consent to communicating and storing personal health information using these systems despite these risks</strong>.</p>
              </section>

              {/* Section 7 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">7. Data Collection, Storage & Security</h4>
                <p>You consent to the Organizers collecting, storing, processing, analyzing, and using your information for the pilot and related research/product development.</p>
                
                <p className="mt-3 font-medium text-foreground">Security Efforts</p>
                <p>We make reasonable, good-faith efforts to protect your information. However, because this is an MVP/research project:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>Systems may be experimental or minimally secured</li>
                  <li>Formal security audits may not have been conducted</li>
                  <li>Vulnerabilities or breaches may occur</li>
                </ul>

                <p className="mt-3 font-medium text-foreground">No Security Guarantee</p>
                <p>We <strong>do not guarantee</strong> confidentiality, security, encryption, or protection against unauthorized access. Submitting information is at your own risk.</p>

                <p className="mt-3 font-medium text-foreground">Data Retention</p>
                <p>Your information may be stored indefinitely for research purposes unless you request deletion. To request deletion, email: <a href="mailto:Raquella.Siegel@gmail.com" className="text-primary hover:underline">Raquella.Siegel@gmail.com</a></p>
              </section>

              {/* Section 8 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">8. Legal & Privacy Compliance</h4>
                <p><strong>Israel:</strong> You consent to processing in accordance with the Protection of Privacy Law.</p>
                <p className="mt-2"><strong>United States:</strong> This pilot is not subject to HIPAA. Communications do not receive HIPAA protections.</p>
                <p className="mt-2">This agreement is governed by the laws of the State of Israel.</p>
              </section>

              {/* Section 9 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">9. Eligibility</h4>
                <p>You confirm that you:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>Are 18 years or older</li>
                  <li>Understand this consent</li>
                  <li>Voluntarily choose to participate</li>
                </ul>
              </section>

              {/* Section 10 */}
              <section>
                <h4 className="font-semibold text-foreground mb-1">10. Consent</h4>
                <p>By checking "I CONSENT" below, you confirm that:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                  <li>You have read and understood this document</li>
                  <li>You understand the risks</li>
                  <li>You agree to the collection, storage, and retention of your data</li>
                  <li>You release the Organizers from liability</li>
                  <li>You voluntarily consent to participate</li>
                </ul>
              </section>
            </div>
          </ScrollArea>

          <label className={cn(
            "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
            consentGiven 
              ? "bg-primary/10 border-primary" 
              : "bg-card border-border hover:border-primary/50"
          )}>
            <Checkbox 
              checked={consentGiven} 
              onCheckedChange={(checked) => setConsentGiven(checked === true)}
              className="mt-0.5 min-w-[20px] min-h-[20px]"
            />
            <span className="text-sm text-foreground leading-relaxed">
              <strong>I CONSENT</strong> – I have read, understood, and agree to all terms above.
            </span>
          </label>

          {!consentGiven && (
            <p className="text-xs text-muted-foreground text-center">
              ☝️ Please check the box above to continue
            </p>
          )}

          <div className="flex gap-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setStep(4)} className="flex-1 h-12">
              Back
            </Button>
            <Button 
              type="button" 
              onClick={proceedToTelegram} 
              className="flex-1 h-12"
              disabled={!consentGiven || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Slide 6 - Telegram Connection */}
      {step === 6 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#0088cc]/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-[#0088cc]" />
            </div>
            <h3 className="text-xl font-display font-semibold mb-2">Connect to Logan on Telegram</h3>
            <p className="text-muted-foreground text-sm">
              Your info is saved! Now connect Telegram to receive your insights.
            </p>
          </div>

          <div className="bg-muted/50 rounded-xl p-5 border border-border space-y-4">
            <div className="flex flex-col items-center gap-3 pb-4 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="w-4 h-4" />
                <span>Scan with your phone</span>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm">
                <QRCodeSVG 
                  value="https://t.me/AskLoganBot"
                  size={120}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <p><strong>1.</strong> Open <a href="https://t.me/AskLoganBot" target="_blank" rel="noopener noreferrer" className="text-primary underline">@AskLoganBot</a> on Telegram</p>
              <p><strong>2.</strong> Tap <strong>Start</strong> and copy your Chat ID</p>
              <p><strong>3.</strong> Paste it below:</p>
            </div>

            <Input
              placeholder="Your Chat ID (e.g., 5264001213)"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              className="h-12 text-center font-mono text-lg"
            />

            <a
              href="https://t.me/AskLoganBot?start=getchatid"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-lg bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium transition-colors text-center"
            >
              <span className="flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Open Telegram
                <ExternalLink className="w-4 h-4" />
              </span>
            </a>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                const url = "https://t.me/AskLoganBot?start=getchatid";
                try {
                  await navigator.clipboard.writeText(url);
                  toast({ title: "Link copied", description: "Paste it into Telegram or your browser" });
                } catch {
                  toast({
                    title: "Copy failed",
                    description: "Select and copy: https://t.me/AskLoganBot?start=getchatid",
                    variant: "destructive",
                  });
                }
              }}
            >
              Copy Telegram Link
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Or search <strong className="text-foreground">@AskLoganBot</strong> in Telegram
            </p>
          </div>

          <div className="flex gap-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setStep(5)} className="flex-1 h-12">
              Back
            </Button>
            <Button 
              type="submit" 
              className="flex-1 h-12" 
              disabled={isSubmitting || !telegramChatId.trim()}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Finishing...
                </>
              ) : (
                "Complete Sign Up"
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Need to start over?{" "}
            <button 
              type="button" 
              onClick={clearDraft}
              className="text-primary underline hover:no-underline"
            >
              Clear and restart
            </button>
          </p>
        </div>
      )}

    </form>
  );
}
