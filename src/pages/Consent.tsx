import { Link } from "react-router-dom";
import { LoganLogo } from "@/components/LoganLogo";
import { LoganFullLogo } from "@/components/LoganFullLogo";
import { ArrowLeft } from "lucide-react";

const Consent = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" showGlow={false} />
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
            Consent & Privacy Policy
          </h1>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">1. Nature of the Pilot: Educational Only - Not Medical Care</h2>
              <p className="text-muted-foreground">
                This pilot provides <strong>educational information, general wellness insights, and lifestyle suggestions only</strong> related to menstrual cycles, general health, and symptoms.
              </p>
              <p className="text-muted-foreground">We are <strong>not</strong>:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>doctors</li>
                <li>nurses</li>
                <li>licensed healthcare providers</li>
                <li>a clinic or medical service</li>
              </ul>
              <p className="text-muted-foreground">
                We do <strong>not</strong> diagnose, treat, or provide medical advice.
              </p>
              <p className="text-muted-foreground">
                Nothing shared should replace care from a qualified medical professional. Always consult a licensed healthcare provider before making health or medical decisions. This is solely the responsibility of the participants.
              </p>
              <p className="text-muted-foreground font-medium">
                If you have severe symptoms or a medical emergency, seek medical care immediately.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">2. Organized by Individuals (No Company or Clinical Relationship)</h2>
              <p className="text-muted-foreground">You understand that:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>this is an early-stage MVP/research pilot</li>
                <li>it is operated by private individuals, not a registered medical entity</li>
                <li>no doctor–patient or therapeutic relationship is created</li>
                <li>no professional or fiduciary duty of care is assumed</li>
              </ul>
              <p className="text-muted-foreground">Participation is informal and voluntary.</p>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">3. Voluntary Participation</h2>
              <p className="text-muted-foreground">You may:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>stop participating at any time</li>
                <li>decline to answer any question or respond</li>
                <li>request deletion of your information</li>
              </ul>
              <p className="text-muted-foreground">There is no obligation to follow any recommendation.</p>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">4. Assumption of Risk & Personal Responsibility</h2>
              <p className="text-muted-foreground">Health related decisions carry inherent risks.</p>
              <p className="text-muted-foreground">You accept full responsibility for:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>how you use the information shared</li>
                <li>any changes you make to your lifestyle or health practices</li>
                <li>your personal health outcomes</li>
              </ul>
              <p className="text-muted-foreground">You participate entirely at your own risk.</p>
            </section>

            {/* Section 5 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">5. Limitation of Liability & Release</h2>
              <p className="text-muted-foreground">
                To the maximum extent permitted by law, you agree that the Organizers, individually and collectively, including their collaborators, contractors, volunteers, advisors, service providers, and anyone assisting with or tangentially involved in the pilot, <strong>shall not be liable</strong> for any injury, illness, damages, losses, claims, or liabilities of any kind arising from or related to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>participation in the pilot</li>
                <li>reliance on any information or recommendations</li>
                <li>failure to seek medical care</li>
                <li>sharing personal or health information digitally</li>
                <li>use of third-party platforms or software (including WhatsApp or related tools)</li>
                <li>unauthorized access, data breaches, or system failures</li>
              </ul>
              <p className="text-muted-foreground">
                The pilot is provided <strong>"as is" without warranties of any kind</strong>, expressed or implied.
              </p>
              <p className="text-muted-foreground">
                You expressly release and waive any claims against the Organizers related to participation.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">6. Communication Platforms & Technology Risks</h2>
              <p className="text-muted-foreground">
                This pilot uses third-party communication and software tools, including WhatsApp, and additional messaging, storage, and database systems operated by the Organizers.
              </p>
              <p className="text-muted-foreground">
                These tools are general-purpose consumer or early-stage software and <strong>are not medical-grade or healthcare-certified systems</strong>.
              </p>
              <p className="text-muted-foreground">You acknowledge that:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>these platforms are not controlled by the Organizers</li>
                <li>they do not meet healthcare or HIPAA-level security standards</li>
                <li>messages and data may be stored on devices or external servers</li>
                <li>no digital transmission or database is completely secure</li>
                <li>information may be intercepted, lost, accessed, or disclosed without authorization</li>
              </ul>
              <p className="text-muted-foreground">
                By participating, you <strong>explicitly consent to communicating and storing personal and sensitive health information using these systems despite these risks</strong>.
              </p>
              <p className="text-muted-foreground font-medium">
                If you are uncomfortable with this level of risk, you should not participate.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">7. Data Collection, Storage & Security Limitations</h2>
              <p className="text-muted-foreground">
                You may choose to share sensitive personal and health information, including menstrual cycle, symptom, reproductive, and wellness data.
              </p>
              <p className="text-muted-foreground">You consent to the Organizers:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>collecting</li>
                <li>storing</li>
                <li>processing</li>
                <li>analyzing</li>
                <li>and using this information for the pilot, product, and any other related research/product development</li>
              </ul>

              <h3 className="text-lg font-display font-semibold text-foreground mt-6">Security Efforts</h3>
              <p className="text-muted-foreground">
                We make reasonable, good-faith efforts to protect your information using practical technical and organizational measures appropriate for an early-stage pilot.
              </p>
              <p className="text-muted-foreground">However, because this is an MVP/research project:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>systems may be experimental or minimally secured</li>
                <li>software may be developed by small or junior teams</li>
                <li>formal security audits may not have been conducted</li>
                <li>vulnerabilities or breaches may occur</li>
              </ul>

              <h3 className="text-lg font-display font-semibold text-foreground mt-6">No Security Guarantee</h3>
              <p className="text-muted-foreground">We <strong>do not guarantee</strong>:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>confidentiality</li>
                <li>security</li>
                <li>encryption</li>
                <li>or protection against unauthorized access</li>
              </ul>
              <p className="text-muted-foreground">
                You understand and accept that <strong>submitting information is at your own risk</strong>.
              </p>

              <h3 className="text-lg font-display font-semibold text-foreground mt-6">Data Retention</h3>
              <p className="text-muted-foreground">
                Your information may be stored and retained indefinitely for research and product development purposes unless you request deletion in writing. Aggregated or anonymized information that cannot reasonably identify you may be retained indefinitely.
              </p>
              <p className="text-muted-foreground">
                To request deletion, email: <a href="mailto:Raquella.Siegel@gmail.com" className="text-primary hover:underline">Raquella.Siegel@gmail.com</a>
              </p>
              <p className="text-muted-foreground">
                We will remove identifiable data within a reasonable time after receiving such request, except where retention is legally required.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">8. Legal & Privacy Compliance</h2>
              
              <h3 className="text-lg font-display font-semibold text-foreground">Israel</h3>
              <p className="text-muted-foreground">
                You consent to the collection, storage, and processing of your sensitive personal and health information in accordance with the <strong>Protection of Privacy Law</strong>, under which medical and health data are classified as sensitive information.
              </p>

              <h3 className="text-lg font-display font-semibold text-foreground mt-4">United States</h3>
              <p className="text-muted-foreground">
                This pilot is not a healthcare provider or medical service and is not subject to the <strong>Health Insurance Portability and Accountability Act (HIPAA)</strong>. Communications and data shared through this pilot do not receive HIPAA protections.
              </p>
              <p className="text-muted-foreground">
                This agreement is governed by the laws of the State of Israel, and any disputes shall be resolved exclusively in Israel.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">10. Eligibility</h2>
              <p className="text-muted-foreground">You confirm that you:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>are 18 years or older</li>
                <li>understand this consent</li>
                <li>voluntarily choose to participate</li>
              </ul>
            </section>

            {/* Section 11 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">11. Consent</h2>
              <p className="text-muted-foreground">
                By checking the <strong>"I CONSENT"</strong> box or continuing to participate, you confirm that:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>you have read and understood this document</li>
                <li>you understand the risks</li>
                <li>you agree to the collection, storage, and retention of your data</li>
                <li>you release the Organizers from liability</li>
                <li>you voluntarily consent to participate</li>
              </ul>
            </section>

            <div className="pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Last updated: February 2026
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                For questions about this policy, please contact: <a href="mailto:Raquella.Siegel@gmail.com" className="text-primary hover:underline">Raquella.Siegel@gmail.com</a>
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
