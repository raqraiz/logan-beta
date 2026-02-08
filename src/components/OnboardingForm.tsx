import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Check, RefreshCw, Mail } from "lucide-react";
import { LoganLogo } from "./LoganLogo";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const STORAGE_KEY = "logan_onboarding_draft";

const onboardingSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please enter a valid email"),
});

type OnboardingData = z.infer<typeof onboardingSchema>;

interface SavedDraft {
  step: number;
  formData: Partial<OnboardingData>;
  consentGiven: boolean;
}

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const { register, handleSubmit, formState: { errors }, watch, setValue, getValues } = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
  });

  // Load saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const draft: SavedDraft = JSON.parse(saved);
        
        if (draft.formData.full_name) setValue("full_name", draft.formData.full_name);
        if (draft.formData.email) setValue("email", draft.formData.email);
        setConsentGiven(draft.consentGiven || false);
        
        if (draft.step > 1) {
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
      step,
      formData: {
        full_name: formData.full_name,
        email: formData.email,
      },
      consentGiven,
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [step, consentGiven, getValues]);

  const canProceedStep1 = watch("full_name") && watch("email");

  // Register and send magic link
  const submitForm = async () => {
    const data = getValues();
    const validationResult = onboardingSchema.safeParse(data);
    
    if (!validationResult.success) {
      const missingFields: string[] = [];
      validationResult.error.errors.forEach((err) => {
        if (err.path[0] === "full_name") missingFields.push("Name");
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
      return;
    }

    if (!consentGiven) {
      toast({
        title: "Consent required",
        description: "Please agree to the terms to continue.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Register participant via edge function
      const { data: result, error } = await supabase.functions.invoke("lookup-participant", {
        body: {
          action: "register",
          participantData: {
            full_name: data.full_name,
            email: data.email,
            whatsapp_number: data.email, // Using email as identifier now
            consent_given: consentGiven,
            consent_given_at: new Date().toISOString(),
            preferred_channel: "web",
          }
        },
      });

      if (error) throw error;
      if (result.error) throw new Error(result.error);

      // Send magic link email
      const redirectUrl = `${window.location.origin}/chat`;
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: data.email,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: data.full_name,
          }
        },
      });

      if (authError) throw authError;

      localStorage.removeItem(STORAGE_KEY);
      setSubmittedEmail(data.email);
      setIsComplete(true);
      
      toast({
        title: "Check your email! ✨",
        description: "We sent you a magic link to access Logan.",
      });
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <Mail className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-2xl font-display font-semibold mb-3">Check Your Email! 📧</h3>
        <p className="text-muted-foreground max-w-sm mx-auto mb-4">
          We sent a magic link to <strong className="text-foreground">{submittedEmail}</strong>
        </p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Click the link in the email to access Logan and start getting personalized insights.
        </p>
        <Button 
          variant="outline" 
          className="mt-6"
          onClick={clearDraft}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(submitForm)} className="space-y-6">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-6">
        {[1, 2].map((s) => (
          <div 
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step 1 - Name & Email */}
      {step === 1 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-6">
            <LoganLogo size="md" showGlow={false} className="mx-auto mb-3" />
            <h3 className="text-xl font-display font-semibold">Welcome to Logan</h3>
            <p className="text-sm text-muted-foreground mt-1">Your personalized cycle companion</p>
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
            <p className="text-xs text-muted-foreground">
              We'll send you a magic link to access Logan
            </p>
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

      {/* Step 2 - Consent Form */}
      {step === 2 && (
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
                <p>This pilot uses web-based tools and messaging systems. These are <strong>not medical-grade or healthcare-certified systems</strong>.</p>
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
            <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-12">
              Back
            </Button>
            <Button 
              type="submit" 
              className="flex-1 h-12"
              disabled={!consentGiven || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join the Pilot"
              )}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}