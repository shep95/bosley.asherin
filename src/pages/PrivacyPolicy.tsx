import PublicShell from "@/components/landing/PublicShell";
import { Helmet } from "react-helmet-async";

const PrivacyPolicy = () => {
  return (
    <PublicShell>
      <Helmet>
        <title>Privacy Policy — Bosley</title>
        <meta name="description" content="How Bosley collects, uses, and protects your data. We don't sell your information — read our full privacy policy." />
        <link rel="canonical" href="https://bosley.app/privacy" />
        <meta property="og:url" content="https://bosley.app/privacy" />
        <meta property="og:title" content="Privacy Policy — Bosley" />
        <meta property="og:description" content="How Bosley collects, uses, and protects your data." />
      </Helmet>
<article className="doc">
              <h1 className="text-[2.25rem] sm:text-[2.75rem] font-extralight lowercase tracking-[-0.035em] text-foreground mb-3">privacy policy</h1>
              <p className="text-[13px] font-light text-foreground/45 mb-12">last updated september 2026 · zorak corp</p>
              
              <div className="space-y-10 text-foreground/75 font-light text-[15.5px]">
                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">1. Information We Collect</h2>
                  <p className="leading-relaxed">
                    We collect information you provide directly to us, such as when you create an account, 
                    post content, or contact us for support. This includes your email address, username, 
                    profile information, and any content you share on our platform.
                  </p>
                </section>

                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">2. How We Use Your Information</h2>
                  <p className="leading-relaxed">
                    We use the information we collect to provide, maintain, and improve our services, 
                    process transactions, send you technical notices and support messages, and respond 
                    to your comments and questions.
                  </p>
                </section>

                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">3. Information Sharing</h2>
                  <p className="leading-relaxed">
                    We do not sell, trade, or rent your personal information to third parties. We may 
                    share information with service providers who assist us in operating our platform, 
                    conducting our business, or serving our users.
                  </p>
                </section>

                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">4. Data Security</h2>
                  <p className="leading-relaxed">
                    We implement appropriate technical and organizational measures to protect the security 
                    of your personal information. However, no method of transmission over the Internet is 
                    100% secure.
                  </p>
                </section>

                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">5. Your Rights</h2>
                  <p className="leading-relaxed">
                    You have the right to access, correct, or delete your personal information. You may 
                    also request a copy of your data or ask us to restrict processing of your information.
                  </p>
                </section>

                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">6. Cookies</h2>
                  <p className="leading-relaxed">
                    We use cookies and similar tracking technologies to track activity on our service and 
                    hold certain information to improve and analyze our service.
                  </p>
                </section>

                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">7. Changes to This Policy</h2>
                  <p className="leading-relaxed">
                    We may update our Privacy Policy from time to time. We will notify you of any changes 
                    by posting the new Privacy Policy on this page and updating the effective date.
                  </p>
                </section>

                <section>
                  <h2 className="text-[1.125rem] font-light lowercase text-foreground mb-3 pt-6 border-t border-foreground/10">8. Contact Us</h2>
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
            </article>
    </PublicShell>
  );
};

export default PrivacyPolicy;
