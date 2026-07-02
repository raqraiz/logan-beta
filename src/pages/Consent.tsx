import { Link } from "react-router-dom";
import { LoganFullLogo } from "@/components/LoganFullLogo";
import { ArrowLeft } from "lucide-react";

const Consent = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganFullLogo size="sm" />
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
            Privacy Policy
          </h1>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <p className="text-muted-foreground">
              Last updated: July 2026
            </p>

            <section className="space-y-4">
              <p className="text-foreground font-medium">
                The short version: Your data is private. We never sell it. You're always in control.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">1. Who we are</h2>
              <p className="text-muted-foreground">
                Logan is an early-stage women's wellness companion app, built and operated by Raquella Raiz (founder). Contact: <a href="mailto:raquella@asklogan.ai" className="text-primary hover:underline">raquella@asklogan.ai</a>
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">2. What we collect</h2>
              <p className="text-muted-foreground">When you use Logan, we may collect:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Account information (name, email, password)</li>
                <li>Cycle and wellness data you choose to share (period dates, symptoms, life stage, pregnancy information)</li>
                <li>App usage data (which features you use, how often)</li>
                <li>Device and timezone information</li>
              </ul>
              <p className="text-muted-foreground">We only collect what's needed to make Logan work for you.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">3. How we use your data</h2>
              <p className="text-muted-foreground">Your data is used to:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Personalize Logan's insights and responses for you</li>
                <li>Improve the accuracy of cycle and wellness predictions over time</li>
                <li>Maintain and improve the Logan product</li>
              </ul>
              <p className="text-muted-foreground">We never:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Sell your data to anyone</li>
                <li>Share it with advertisers</li>
                <li>Use it to train AI models outside Logan</li>
                <li>Share it with third parties except the infrastructure providers that run the app (listed below)</li>
              </ul>
              <p className="text-muted-foreground">
                Honest disclosure: As a small founding team, we may access individual user data when debugging technical issues or investigating support requests. We do this only when necessary and handle it with care.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">4. Who has access</h2>
              <p className="text-muted-foreground">Logan runs on the following third-party infrastructure:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Supabase — database and authentication</li>
                <li>Google Gemini — AI responses (your messages are processed to generate Logan's replies; Google's data use policy applies)</li>
                <li>Lovable — app development platform</li>
              </ul>
              <p className="text-muted-foreground">These providers have their own privacy policies. We choose providers with strong privacy practices.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">5. Data security</h2>
              <p className="text-muted-foreground">
                We take reasonable steps to protect your data using industry-standard security practices. However, as an early-stage product, we cannot guarantee absolute security. No digital system can. If you're not comfortable with this, please don't share information you're not comfortable sharing.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">6. Your rights</h2>
              <p className="text-muted-foreground">You can at any time:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Access the data Logan holds about you</li>
                <li>Correct inaccurate information</li>
                <li>Request deletion of your account and all associated data</li>
                <li>Withdraw consent</li>
              </ul>
              <p className="text-muted-foreground">
                To exercise any of these rights, contact: <a href="mailto:feedback@asklogan.ai" className="text-primary hover:underline">feedback@asklogan.ai</a>
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">7. Data retention</h2>
              <p className="text-muted-foreground">
                We keep your data for as long as your account is active. If you delete your account, we remove your identifiable data within 30 days. Anonymized aggregate data may be retained for product research.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">8. Not a substitute for professional advice</h2>
              <p className="text-muted-foreground">
                Logan provides wellness information and cycle insights for personal awareness only. Nothing Logan shares constitutes medical advice, diagnosis, or treatment. Always consult a qualified professional for medical decisions.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">9. Age</h2>
              <p className="text-muted-foreground">Logan is intended for users 18 and older.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">10. Changes to this policy</h2>
              <p className="text-muted-foreground">
                We'll notify you of material changes via email or in-app notice before they take effect.
              </p>
            </section>

            <div className="pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground">
                For questions about this policy, please contact: <a href="mailto:feedback@asklogan.ai" className="text-primary hover:underline">feedback@asklogan.ai</a>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto max-w-4xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LoganFullLogo size="sm" />
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
