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
import { Check, CalendarIcon, MessageCircle, ExternalLink, Smartphone } from "lucide-react";
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

// Normalize phone number to international format
// Handles common Israeli formats: 0501234567, +9720501234567, 972501234567, etc.
const normalizePhoneNumber = (phone: string): string => {
  // Remove all whitespace, dashes, parentheses
  let normalized = phone.replace(/[\s\-\(\)]/g, "");
  
  // Israeli mobile prefixes (without leading 0)
  const israeliMobilePrefixes = ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59"];
  
  // Case 1: Starts with 0 (local Israeli format like 0501234567)
  if (normalized.startsWith("0") && normalized.length === 10) {
    const prefix = normalized.substring(1, 3);
    if (israeliMobilePrefixes.includes(prefix)) {
      return "+972" + normalized.substring(1);
    }
  }
  
  // Case 2: Starts with 972 without + (like 972501234567 or 9720501234567)
  if (normalized.startsWith("972")) {
    normalized = "+" + normalized;
  }
  
  // Ensure it starts with +
  if (!normalized.startsWith("+")) {
    normalized = "+" + normalized;
  }
  
  // Fix leading 0 after any country code: +9720... -> +972...
  normalized = normalized.replace(/^\+(\d{1,3})0(\d)/, "+$1$2");
  
  return normalized;
};

const onboardingSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  whatsapp_number: z.string()
    .min(10, "Please enter a valid WhatsApp number")
    .max(20)
    .refine((val) => {
      const normalized = normalizePhoneNumber(val);
      // Must start with + and have 10-15 digits after
      return /^\+\d{10,15}$/.test(normalized);
    }, "Enter number with country code (e.g., +972501234567)"),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  age: z.number().min(13).max(65).optional(),
  cycle_length_days: z.number().min(21).max(45).optional(),
  last_period_start: z.date().optional(),
});

type OnboardingData = z.infer<typeof onboardingSchema>;

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
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [lastPeriodDate, setLastPeriodDate] = useState<Date | undefined>();

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      cycle_length_days: 28,
    }
  });

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

  const onSubmit = async (data: OnboardingData) => {
    if (!consentGiven) {
      toast({
        title: "Consent required",
        description: "Please provide your consent to continue.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const finalAnchor = anchorSymptom === "Other" ? anchorOther : anchorSymptom;
      const normalizedPhone = normalizePhoneNumber(data.whatsapp_number);
      
      const { error } = await supabase.from("participants").insert({
        full_name: data.full_name,
        whatsapp_number: normalizedPhone,
        email: data.email || null,
        age: data.age || null,
        cycle_length_days: data.cycle_length_days || 28,
        last_period_start: data.last_period_start ? format(data.last_period_start, "yyyy-MM-dd") : null,
        cycle_regularity: "regular",
        typical_symptoms: selectedSymptoms,
        goals: selectedSymptoms.length > 0 ? ["Understand my symptoms"] : [],
        anchor_symptom: finalAnchor,
        consent_given: consentGiven,
        consent_given_at: consentGiven ? new Date().toISOString() : null,
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

  const canProceedStep1 = watch("full_name") && watch("whatsapp_number");
  const canProceedStep4 = anchorSymptom && (anchorSymptom !== "Other" || anchorOther.trim());

  // Slide 6 - Confirmation
  if (isComplete) {
    return (
      <div className="text-center py-8 animate-fade-in">
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
            <Label htmlFor="whatsapp_number">WhatsApp Number</Label>
            <Input
              id="whatsapp_number"
              placeholder="+972501234567"
              {...register("whatsapp_number")}
              className="h-12"
            />
            <p className="text-xs text-muted-foreground">
              Include country code without the leading 0 (e.g., +972 not +9720)
            </p>
            {errors.whatsapp_number && (
              <p className="text-sm text-destructive">{errors.whatsapp_number.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email (Optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              {...register("email")}
              className="h-12"
            />
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
            <Label htmlFor="age">Age</Label>
            <Input
              id="age"
              type="number"
              placeholder="35"
              {...register("age", { valueAsNumber: true })}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cycle_length_days">Average Cycle Length (Days)</Label>
            <Input
              id="cycle_length_days"
              type="number"
              placeholder="28"
              {...register("cycle_length_days", { valueAsNumber: true })}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>When Did Your Last Period Start?</Label>
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

      {/* Slide 5 - WhatsApp Connection */}
      {step === 5 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-display font-semibold mb-2">Connect to Logan on WhatsApp</h3>
            <p className="text-muted-foreground text-sm">
              To receive your personalized insights, you need to connect with Logan on WhatsApp first.
            </p>
          </div>

          <div className="bg-muted/50 rounded-xl p-5 border border-border space-y-4">
            {/* QR Code Section */}
            <div className="flex flex-col items-center gap-3 pb-4 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="w-4 h-4" />
                <span>Scan with your phone</span>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm">
                <QRCodeSVG 
                  value="https://wa.me/14155238886?text=join%20night-shadow"
                  size={140}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Scan to open WhatsApp with the message pre-filled
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              <span>or follow these steps</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <p className="text-sm text-foreground">
                  Open WhatsApp and message <strong className="text-primary">+1 415 523 8886</strong>
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <p className="text-sm text-foreground">
                  Send this exact message:
                </p>
              </div>
              
              <div className="ml-9 bg-card rounded-lg p-3 border border-primary/30">
                <code className="text-lg font-mono font-semibold text-primary">join night-shadow</code>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <p className="text-sm text-foreground">
                  Wait for the confirmation message from Logan
                </p>
              </div>
            </div>

            <a 
              href="https://wa.me/14155238886?text=join%20night-shadow" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              Open WhatsApp
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card cursor-pointer hover:border-primary/50 transition-colors">
            <Checkbox 
              checked={whatsappConnected} 
              onCheckedChange={(checked) => setWhatsappConnected(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-foreground leading-relaxed">
              I've sent the message and received a confirmation from Logan on WhatsApp
            </span>
          </label>

          <div className="flex gap-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setStep(4)} className="flex-1 h-12">
              Back
            </Button>
            <Button 
              type="button" 
              onClick={() => setStep(6)} 
              className="flex-1 h-12"
              disabled={!whatsappConnected}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Slide 6 - Consent Form */}
      {step === 6 && (
        <div className="space-y-4 animate-fade-in">
          <div className="text-center mb-2">
            <h3 className="text-lg font-display font-semibold">Data Processing Consent</h3>
            <p className="text-xs text-muted-foreground">Logan MVP Pilot</p>
          </div>

          <ScrollArea className="h-[320px] rounded-lg border border-border bg-muted/30 p-4">
            <div className="space-y-4 text-sm text-muted-foreground pr-4">
              <section>
                <h4 className="font-semibold text-foreground mb-1">Purpose of the Pilot</h4>
                <p>
                  Logan is a research and pilot product designed to test how cycle-related insights can support wellbeing, communication, and health awareness. This pilot collects limited personal and health-related data to generate insights and evaluate product effectiveness.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-1">Data We Collect</h4>
                <p className="mb-2">By participating, you consent to the collection and processing of the following data:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Menstrual cycle information (cycle length, phase tracking, symptoms, timing)</li>
                  <li>Self-reported health and wellbeing data</li>
                  <li>Interaction data within the Logan platform</li>
                  <li>Optional feedback and responses</li>
                  <li>Basic identifiers (e.g. email or user ID)</li>
                </ul>
                <p className="mt-2 text-xs italic">This may include special category data under GDPR (health data).</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-1">Legal Basis for Processing</h4>
                <p>We process your data based on:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Explicit consent (GDPR Article 6(1)(a))</li>
                  <li>Explicit consent for health data (GDPR Article 9(2)(a))</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-1">How Your Data Is Used</h4>
                <p className="mb-2">Your data will be used only for:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Generating cycle-based insights</li>
                  <li>Improving product functionality</li>
                  <li>Research and evaluation of the pilot</li>
                  <li>Internal analytics and reporting</li>
                </ul>
                <p className="mt-2 font-medium text-foreground">Your data will not be sold, shared with third parties for marketing, or used for advertising.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-1">Data Storage & Security</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Data is stored securely</li>
                  <li>Access is restricted to the Logan development and research team</li>
                  <li>Data is retained only for the duration of the pilot and evaluation period unless you consent otherwise</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-1">Your Rights (GDPR)</h4>
                <p className="mb-2">You have the right to:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Access your data</li>
                  <li>Correct your data</li>
                  <li>Withdraw consent at any time</li>
                  <li>Request deletion of your data</li>
                  <li>Request data portability</li>
                  <li>Restrict processing</li>
                </ul>
                <p className="mt-2 text-xs italic">Withdrawal of consent will not affect prior lawful processing.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-1">Voluntary Participation</h4>
                <p>Participation in this pilot is voluntary. You may exit the pilot at any time without consequence.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-1">Consent Declaration</h4>
                <p>By proceeding, you confirm that:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>You understand what data is being collected</li>
                  <li>You understand how your data will be used</li>
                  <li>You consent to the processing of your personal and health data for the Logan MVP pilot</li>
                  <li>You understand that this is a research/pilot product, not a medical service</li>
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
              I give explicit consent to the processing of my personal and health data for the Logan MVP pilot.
            </span>
          </label>

          {!consentGiven && (
            <p className="text-xs text-muted-foreground text-center">
              ☝️ Please check the box above to continue
            </p>
          )}

          <div className="flex gap-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setStep(5)} className="flex-1 h-12">
              Back
            </Button>
            <Button 
              type="submit" 
              className="flex-1 h-12" 
              disabled={isSubmitting || !consentGiven}
            >
              {isSubmitting ? "Joining..." : "Join the Pilot 🌸"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
