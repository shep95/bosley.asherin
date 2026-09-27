import DashboardLayout from "@/components/layout/DashboardLayout";
import { ArrowUpRight } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";

const sponsors = [
  {
    name: "Zorak Corp",
    description: "investment firm. backs platforms built for open discourse.",
    link: "https://zorakcorp.com/",
  },
  {
    name: "Aureon",
    description: "a language model without content filtering.",
    link: "https://aureonai.app/",
  },
  {
    name: "Avven",
    description: "a task manager for staying organised.",
    link: "https://avven.app/",
  },
  {
    name: "$AUR",
    description: "the cryptocurrency behind the Zorak Corp IPO.",
    link: "https://zorakcorp.com/",
  },
];

const Sponsors = () => {
  return (
    <DashboardLayout>
      <PageHeader title="sponsors" subtitle="who keeps the lights on." />

      <div className="stagger">
        {sponsors.map((sponsor, idx) => (
          <a
            key={sponsor.name}
            href={sponsor.link}
            target="_blank"
            rel="noopener noreferrer"
            className="row group px-5 sm:px-8 py-5 flex items-center justify-between gap-4"
            style={{ "--i": idx } as React.CSSProperties}
          >
            <div className="min-w-0">
              <p className="text-[15.5px] font-light text-foreground">{sponsor.name}</p>
              <p className="mt-1 text-[13px] font-light text-foreground/50 truncate">{sponsor.description}</p>
            </div>
            <ArrowUpRight className="w-4 h-4 shrink-0 text-foreground/35 group-hover:text-foreground group-focus-visible:text-foreground transition-colors duration-200 ease-soft" aria-hidden />
          </a>
        ))}
      </div>

      <p className="px-5 sm:px-8 py-8 text-[13px] font-light text-foreground/50">
        want to sponsor Bosley?{" "}
        <a href="mailto:sponsors@bosley.app" className="text-foreground hover:text-signal transition-colors">sponsors@bosley.app</a>
      </p>
    </DashboardLayout>
  );
};

export default Sponsors;
