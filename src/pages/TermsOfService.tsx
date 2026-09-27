import GlassHeader from "@/components/GlassHeader";
import { Helmet } from "react-helmet-async";
import FooterSection from "@/components/landing/FooterSection";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>Terms of Service — Bosley</title>
        <meta name="description" content="The rules for using Bosley: accounts, content, prohibited conduct, file limits, and account termination." />
        <link rel="canonical" href="https://bosley.app/terms" />
        <meta property="og:url" content="https://bosley.app/terms" />
        <meta property="og:title" content="Terms of Service — Bosley" />
        <meta property="og:description" content="The rules for using Bosley." />
      </Helmet>
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundWallpaper})` }}
      />
      
      <div className="relative z-10">
        <GlassHeader onOpenAuth={() => {}} />
        
        <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="glass-card rounded-2xl p-8 sm:p-12">
              <h1 className="text-3xl sm:text-4xl font-light text-foreground mb-8">Terms of Service</h1>
              
              <div className="space-y-8 text-foreground/80 font-light">
                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">1. Acceptance of Terms</h2>
                  <p className="leading-relaxed">
                    By accessing or using Bosley, you agree to be bound by these Terms of Service. If you 
                    do not agree to these terms, please do not use our service.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">2. User Accounts</h2>
                  <p className="leading-relaxed">
                    You are responsible for maintaining the confidentiality of your account credentials and 
                    for all activities that occur under your account. You must be at least 13 years old to 
                    create an account.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">3. User Content</h2>
                  <p className="leading-relaxed">
                    You retain ownership of content you post on Bosley. By posting content, you grant us a 
                    non-exclusive, worldwide, royalty-free license to use, display, and distribute your 
                    content on our platform.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">4. Prohibited Conduct</h2>
                  <p className="leading-relaxed">
                    You agree not to engage in harassment, spam, impersonation, or any illegal activities. 
                    Content that violates intellectual property rights, promotes violence, or contains 
                    malware is strictly prohibited.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">5. File Upload Limits</h2>
                  <p className="leading-relaxed">
                    Images may be up to 10MB and videos up to 100MB. 
                    We reserve the right to remove content that exceeds these limits or violates our policies.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">6. Termination</h2>
                  <p className="leading-relaxed">
                    We reserve the right to suspend or terminate your account at any time for violations of 
                    these terms or for any other reason at our sole discretion.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">7. Disclaimer of Warranties</h2>
                  <p className="leading-relaxed">
                    Bosley is provided "as is" without warranties of any kind. We do not guarantee that the 
                    service will be uninterrupted, secure, or error-free.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">8. Limitation of Liability</h2>
                  <p className="leading-relaxed">
                    To the maximum extent permitted by law, Bosley shall not be liable for any indirect, 
                    incidental, special, consequential, or punitive damages arising from your use of the service.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">9. Changes to Terms</h2>
                  <p className="leading-relaxed">
                    We may modify these terms at any time. Continued use of the service after changes 
                    constitutes acceptance of the new terms.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">10. Contact</h2>
                  <p className="leading-relaxed">
                    For questions about these Terms of Service, please contact us at{" "}
                    <a href="mailto:asher@zorakcorp.com" className="text-foreground underline hover:text-foreground/80 transition-colors">
                      asher@zorakcorp.com
                    </a>
                  </p>
                </section>

                <p className="text-sm text-foreground/50 pt-4">
                  Last updated: January 13, 2026
                </p>
              </div>
            </div>
          </div>
        </main>
        
        <FooterSection />
      </div>
    </div>
  );
};

export default TermsOfService;
