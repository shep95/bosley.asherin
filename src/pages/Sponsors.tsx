import DashboardLayout from "@/components/layout/DashboardLayout";
import { Sparkles, ExternalLink } from "lucide-react";

const sponsors = [
  {
    name: "Zorak Corp",
    type: "Investment Capital Firm",
    description: "Leading investment firm backing innovative technology platforms that champion free speech and open discourse.",
    link: "https://zorakcorp.com/",
  },
  {
    name: "Aureon",
    type: "Uncensored LLM Model",
    description: "Revolutionary AI language model designed for unrestricted, unbiased conversations without content filtering.",
    link: "https://aureonai.app/",
  },
  {
    name: "Avven",
    type: "Task Manager App",
    description: "Powerful task management application designed to help you stay organized and productive.",
    link: "https://avven.app/",
  },
  {
    name: "$AUR",
    type: "Cryptocurrency",
    description: "A cryptocurrency powering the Zorak Corp IPO ecosystem.",
    link: "https://zorakcorp.com/",
  },
];

const Sponsors = () => {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-8 h-8 text-yellow-500" />
            <h1 className="text-3xl font-light text-foreground">Our Sponsors</h1>
          </div>
          <p className="text-foreground/60 font-light max-w-xl mx-auto">
            Proudly supported by organizations that believe in free speech
          </p>
        </div>

        <div className="grid gap-6">
          {sponsors.map((sponsor) => (
            <a
              key={sponsor.name}
              href={sponsor.link}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card rounded-xl p-6 sm:p-8 hover:bg-accent/10 transition-colors block"
            >
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl sm:text-2xl font-light text-foreground">
                      {sponsor.name}
                    </h2>
                    <ExternalLink className="w-4 h-4 text-foreground/40" />
                  </div>
                  <p className="text-sm text-foreground/50 font-light mb-3">
                    {sponsor.type}
                  </p>
                  <p className="text-foreground/70 font-light leading-relaxed">
                    {sponsor.description}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-12 glass-card rounded-xl p-6 text-center">
          <h3 className="text-lg font-light text-foreground mb-2">
            Interested in sponsoring Bosley?
          </h3>
          <p className="text-foreground/60 font-light text-sm">
            Contact us at sponsors@bosley.app
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Sponsors;
