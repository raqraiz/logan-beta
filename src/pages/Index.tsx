import { Link } from "react-router-dom";
import { OnboardingForm } from "@/components/OnboardingForm";
import { MessageCircle, Sparkles, Calendar, ArrowRight, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoganLogo } from "@/components/LoganLogo";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" showGlow={false} />
            <span className="font-display font-semibold text-lg text-foreground">Logan</span>
          </div>
          {/* Admin access hidden - use /logan-admin-access */}
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 relative overflow-hidden">
        {/* Background gradient effect */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[120px]" />
        </div>

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Hero Content */}
            <div className="space-y-6 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span>4-Week Pilot Program</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight text-foreground">
                Meet <span className="text-primary">Logan</span>, your{" "}
                <span className="text-primary">cycle companion</span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-lg">
                Hyper-personalized insights and suggestions delivered directly 
                to your WhatsApp or Telegram. Because your cycle deserves 
                attention, not guesswork.
              </p>

              <div className="flex flex-wrap gap-6 pt-4">
                {[
                  { icon: MessageCircle, text: "WhatsApp insights" },
                  { icon: Bot, text: "AI-powered" },
                  { icon: Calendar, text: "2x weekly" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="w-4 h-4 text-primary" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - Onboarding Form */}
            <div className="lg:pl-8">
              <div className="bg-card rounded-2xl p-6 md:p-8 shadow-card border border-border max-w-md mx-auto">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-display font-semibold mb-2 text-foreground">Join the Pilot</h2>
                  <p className="text-sm text-muted-foreground">
                    Get early access to Logan's personalized insights
                  </p>
                </div>
                <OnboardingForm />
                <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
                  By continuing, you agree to the <a href="#consent" className="text-primary hover:underline">Pilot Consent & Privacy Terms</a>. 
                  This program provides educational information only and is not medical advice. 
                  By interacting with this program you consent you are 18+ years old.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-4 text-foreground">How Logan Works</h2>
            <p className="text-muted-foreground">Simple, personal, powerful</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Share your info",
                description: "Tell Logan about your cycle, symptoms, and goals. Takes less than 2 minutes.",
                icon: Bot,
              },
              {
                step: "02",
                title: "Receive insights",
                description: "Get personalized predictions and recommendations via WhatsApp on Saturdays and Tuesdays.",
                icon: MessageCircle,
              },
              {
                step: "03",
                title: "Give feedback",
                description: "React, share what works, and help Logan learn what matters most to you.",
                icon: Sparkles,
              },
            ].map(({ step, title, description, icon: Icon }) => (
              <div 
                key={step}
                className="relative p-6 rounded-2xl bg-card border border-border shadow-card group hover:shadow-glow transition-all hover:border-primary/30"
              >
                <div className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                  {step}
                </div>
                <div className="pt-4">
                  <Icon className="w-8 h-8 text-primary mb-4" />
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pilot Details */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-card rounded-2xl p-8 md:p-12 border border-border shadow-card">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-2xl font-display font-bold mb-4 text-foreground">Pilot Details</h2>
                <ul className="space-y-3">
                  {[
                    "4 weeks of personalized insights",
                    "Messages on Saturday & Tuesday nights (Israel time)",
                    "WhatsApp or Telegram delivery",
                    "AI-assisted educational insights, reviewed by humans",
                    "Your feedback shapes the experience",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ArrowRight className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center p-8 rounded-2xl bg-muted/50 border border-border">
                  <p className="text-sm text-muted-foreground mb-2">Insights from Twilio</p>
                  <p className="text-2xl font-display font-bold text-primary">+1 (415) 523-8886</p>
                  <p className="text-sm text-muted-foreground mt-2">Save this number as Logan in your contacts</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Consent Section */}
      <section id="consent" className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-display font-bold mb-6 text-foreground text-center">Pilot Consent & Privacy Terms</h2>
          <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-card space-y-6 text-sm text-muted-foreground">
            
            {/* Section 1 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">1. Nature of the Pilot: Educational Only - Not Medical Care</h3>
              <p>This pilot provides <strong>educational information, general wellness insights, and lifestyle suggestions only</strong> related to menstrual cycles, general health, and symptoms.</p>
              <p>We are <strong>not</strong>: doctors, nurses, licensed healthcare providers, a clinic or medical service.</p>
              <p>We do <strong>not</strong> diagnose, treat, or provide medical advice.</p>
              <p>Nothing shared should replace care from a qualified medical professional. Always consult a licensed healthcare provider before making health or medical decisions. This is solely the responsibility of the participants.</p>
              <p className="font-medium">If you have severe symptoms or a medical emergency, seek medical care immediately.</p>
            </div>

            {/* Section 2 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">2. Organized by Individuals (No Company or Clinical Relationship)</h3>
              <p>You understand that:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>this is an early-stage MVP/research pilot</li>
                <li>it is operated by private individuals, not a registered medical entity</li>
                <li>no doctor–patient or therapeutic relationship is created</li>
                <li>no professional or fiduciary duty of care is assumed</li>
              </ul>
              <p>Participation is informal and voluntary.</p>
            </div>

            {/* Section 3 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">3. Voluntary Participation</h3>
              <p>You may:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>stop participating at any time</li>
                <li>decline to answer any question or respond</li>
                <li>request deletion of your information</li>
              </ul>
              <p>There is no obligation to follow any recommendation.</p>
            </div>

            {/* Section 4 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">4. Assumption of Risk & Personal Responsibility</h3>
              <p>Health related decisions carry inherent risks.</p>
              <p>You accept full responsibility for:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>how you use the information shared</li>
                <li>any changes you make to your lifestyle or health practices</li>
                <li>your personal health outcomes</li>
              </ul>
              <p className="font-medium">You participate entirely at your own risk.</p>
            </div>

            {/* Section 5 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">5. Limitation of Liability & Release</h3>
              <p>To the maximum extent permitted by law, you agree that the Organizers, individually and collectively, including their collaborators, contractors, volunteers, advisors, service providers, and anyone assisting with or tangentially involved in the pilot, <strong>shall not be liable</strong> for any injury, illness, damages, losses, claims, or liabilities of any kind arising from or related to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>participation in the pilot</li>
                <li>reliance on any information or recommendations</li>
                <li>failure to seek medical care</li>
                <li>sharing personal or health information digitally</li>
                <li>use of third-party platforms or software (including WhatsApp or related tools)</li>
                <li>unauthorized access, data breaches, or system failures</li>
              </ul>
              <p>The pilot is provided <strong>"as is" without warranties of any kind</strong>, expressed or implied.</p>
              <p>You expressly release and waive any claims against the Organizers related to participation.</p>
            </div>

            {/* Section 6 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">6. Communication Platforms & Technology Risks</h3>
              <p>This pilot uses third-party communication and software tools, including WhatsApp, and additional messaging, storage, and database systems operated by the Organizers.</p>
              <p>These tools are general-purpose consumer or early-stage software and <strong>are not medical-grade or healthcare-certified systems</strong>.</p>
              <p>You acknowledge that:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>these platforms are not controlled by the Organizers</li>
                <li>they do not meet healthcare or HIPAA-level security standards</li>
                <li>messages and data may be stored on devices or external servers</li>
                <li>no digital transmission or database is completely secure</li>
                <li>information may be intercepted, lost, accessed, or disclosed without authorization</li>
              </ul>
              <p>By participating, you <strong>explicitly consent to communicating and storing personal and sensitive health information using these systems despite these risks</strong>.</p>
              <p className="font-medium">If you are uncomfortable with this level of risk, you should not participate.</p>
            </div>

            {/* Section 7 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">7. Data Collection, Storage & Security Limitations</h3>
              <p>You may choose to share sensitive personal and health information, including menstrual cycle, symptom, reproductive, and wellness data.</p>
              <p>You consent to the Organizers: collecting, storing, processing, analyzing, and using this information for the pilot, product, and any other related research/product development.</p>
              
              <h4 className="font-medium text-foreground mt-4">Security Efforts</h4>
              <p>We make reasonable, good-faith efforts to protect your information using practical technical and organizational measures appropriate for an early-stage pilot.</p>
              <p>However, because this is an MVP/research project:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>systems may be experimental or minimally secured</li>
                <li>software may be developed by small or junior teams</li>
                <li>formal security audits may not have been conducted</li>
                <li>vulnerabilities or breaches may occur</li>
              </ul>

              <h4 className="font-medium text-foreground mt-4">No Security Guarantee</h4>
              <p>We <strong>do not guarantee</strong>: confidentiality, security, encryption, or protection against unauthorized access.</p>
              <p className="font-medium">You understand and accept that submitting information is at your own risk.</p>

              <h4 className="font-medium text-foreground mt-4">Data Retention</h4>
              <p>Your information may be stored and retained indefinitely for research and product development purposes unless you request deletion in writing. Aggregated or anonymized information that cannot reasonably identify you may be retained indefinitely.</p>
              <p>To request deletion, email: <a href="mailto:Raquella.Siegel@gmail.com" className="text-primary hover:underline">Raquella.Siegel@gmail.com</a></p>
              <p>We will remove identifiable data within a reasonable time after receiving such request, except where retention is legally required.</p>
            </div>

            {/* Section 8 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">8. Legal & Privacy Compliance</h3>
              
              <h4 className="font-medium text-foreground">Israel</h4>
              <p>You consent to the collection, storage, and processing of your sensitive personal and health information in accordance with the <strong>Protection of Privacy Law</strong>, under which medical and health data are classified as sensitive information.</p>
              
              <h4 className="font-medium text-foreground mt-3">United States</h4>
              <p>This pilot is not a healthcare provider or medical service and is not subject to the <strong>Health Insurance Portability and Accountability Act (HIPAA)</strong>. Communications and data shared through this pilot do not receive HIPAA protections.</p>
              <p>This agreement is governed by the laws of the State of Israel, and any disputes shall be resolved exclusively in Israel.</p>
            </div>

            {/* Section 10 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">9. Eligibility</h3>
              <p>You confirm that you:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>are 18 years or older</li>
                <li>understand this consent</li>
                <li>voluntarily choose to participate</li>
              </ul>
            </div>

            {/* Section 11 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">10. Consent</h3>
              <p>By checking the <strong>"I CONSENT"</strong> box or continuing to participate, you confirm that:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>you have read and understood this document</li>
                <li>you understand the risks</li>
                <li>you agree to the collection, storage, and retention of your data</li>
                <li>you release the Organizers from liability</li>
                <li>you voluntarily consent to participate</li>
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto max-w-4xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" showGlow={false} />
            <span className="font-display font-medium text-foreground">Logan</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Made by women for women everywhere
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
