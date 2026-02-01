import { Link } from "react-router-dom";
import { LoganLogo } from "@/components/LoganLogo";
import { ArrowLeft } from "lucide-react";

const Consent = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" showGlow={false} />
            <span className="font-display font-semibold text-lg text-foreground">Logan</span>
          </div>
          <Link 
            to="/" 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-8 text-foreground">
            Consent & Privacy Policy
          </h1>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <p className="text-muted-foreground text-lg">
              By participating in the Logan Pilot Program, you agree to the following terms and conditions:
            </p>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">1. Educational Purpose</h2>
              <p className="text-muted-foreground">
                Logan provides educational information about menstrual health and wellness. The insights and recommendations 
                are for informational purposes only and do not constitute medical advice, diagnosis, or treatment. Always 
                consult with qualified healthcare professionals for medical decisions.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">2. Not Medical Advice</h2>
              <p className="text-muted-foreground">
                Logan is not a healthcare provider. The AI-generated insights are educational in nature and should not 
                replace professional medical consultation. If you experience concerning symptoms, please seek medical attention.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">3. Assumption of Risk</h2>
              <p className="text-muted-foreground">
                You acknowledge that any actions taken based on Logan's insights are at your own discretion and risk. 
                Individual responses to wellness recommendations may vary.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">4. Liability Release</h2>
              <p className="text-muted-foreground">
                To the fullest extent permitted by law, you release Logan and its creators from any liability arising 
                from your participation in the pilot program or use of the information provided.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">5. Data Collection</h2>
              <p className="text-muted-foreground">
                We collect personal information you provide during registration, including your name, contact details, 
                and menstrual cycle information. This data is used solely to provide personalized insights and improve 
                the Logan experience.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">6. Data Privacy</h2>
              <p className="text-muted-foreground">
                Your data is stored securely and protected using industry-standard encryption. We comply with applicable 
                privacy regulations including the Israel Privacy Protection Law and maintain practices aligned with 
                US HIPAA guidelines for health information protection.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">7. Data Usage</h2>
              <p className="text-muted-foreground">
                Your information is used to generate personalized insights, improve our AI models, and enhance the 
                overall service. We do not sell your personal data to third parties.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">8. Data Retention</h2>
              <p className="text-muted-foreground">
                Your data will be retained for the duration of the pilot program and may be kept afterward in 
                anonymized form for research and improvement purposes. You may request deletion of your data at any time.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">9. Communication Consent</h2>
              <p className="text-muted-foreground">
                By joining the pilot, you consent to receive messages via Telegram from @AskLoganBot on the scheduled 
                days (Saturdays and Tuesdays). You may opt out at any time by contacting us.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">10. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We may update these terms during the pilot program. Significant changes will be communicated to you 
                via your registered contact method. Continued participation constitutes acceptance of updated terms.
              </p>
            </section>

            <div className="pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Last updated: February 2026
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                For questions about this policy, please contact us through the Logan Telegram bot.
              </p>
            </div>
          </div>
        </div>
      </main>

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

export default Consent;
