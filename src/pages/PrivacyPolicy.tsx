import GlassHeader from "@/components/GlassHeader";
import { Helmet } from "react-helmet-async";
import FooterSection from "@/components/landing/FooterSection";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>Privacy Policy — Bosley</title>
        <meta name="description" content="How Bosley collects, uses, and protects your data. We don't sell your information — read our full privacy policy." />
        <link rel="canonical" href="https://bosley.app/privacy" />
        <meta property="og:url" content="https://bosley.app/privacy" />
        <meta property="og:title" content="Privacy Policy — Bosley" />
        <meta property="og:description" content="How Bosley collects, uses, and protects your data." />
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
              <h1 className="text-3xl sm:text-4xl font-light text-foreground mb-8">Privacy Policy</h1>
              
              <div className="space-y-8 text-foreground/80 font-light">
                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">1. Information We Collect</h2>
                  <p className="leading-relaxed">
                    We collect information you provide directly to us, such as when you create an account, 
                    post content, or contact us for support. This includes your email address, username, 
                    profile information, and any content you share on our platform.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">2. How We Use Your Information</h2>
                  <p className="leading-relaxed">
                    We use the information we collect to provide, maintain, and improve our services, 
                    process transactions, send you technical notices and support messages, and respond 
                    to your comments and questions.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">3. Information Sharing</h2>
                  <p className="leading-relaxed">
                    We do not sell, trade, or rent your personal information to third parties. We may 
                    share information with service providers who assist us in operating our platform, 
                    conducting our business, or serving our users.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">4. Data Security</h2>
                  <p className="leading-relaxed">
                    We implement appropriate technical and organizational measures to protect the security 
                    of your personal information. However, no method of transmission over the Internet is 
                    100% secure.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">5. Your Rights</h2>
                  <p className="leading-relaxed">
                    You have the right to access, correct, or delete your personal information. You may 
                    also request a copy of your data or ask us to restrict processing of your information.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">6. Cookies</h2>
                  <p className="leading-relaxed">
                    We use cookies and similar tracking technologies to track activity on our service and 
                    hold certain information to improve and analyze our service.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">7. Changes to This Policy</h2>
                  <p className="leading-relaxed">
                    We may update our Privacy Policy from time to time. We will notify you of any changes 
                    by posting the new Privacy Policy on this page and updating the effective date.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-medium text-foreground mb-4">8. Contact Us</h2>
                  <p className="leading-relaxed">
                    If you have any questions about this Privacy Policy, please contact us at{" "}
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

export default PrivacyPolicy;
