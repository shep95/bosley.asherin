import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

interface Props {
  onOpenAuth?: (tab: "login" | "signup") => void;
}

/*
 * One motion vocabulary for the whole page: things arrive from slightly below,
 * on one easing curve, and never animate filters (blur animations repaint the
 * whole layer every frame and are the main reason landing pages feel heavy).
 */
const EASE = [0.22, 1, 0.36, 1] as const;
const rise = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

const useRise = () => {
  const reduce = useReducedMotion();
  return (delay = 0) => ({
    variants: rise,
    initial: "hidden" as const,
    whileInView: "visible" as const,
    viewport: { once: true, margin: "-60px" },
    transition: reduce ? { duration: 0 } : { duration: 0.55, ease: EASE, delay },
  });
};

/* ---------------- HERO ---------------- */
const Hero = ({ onOpenAuth }: Props) => {
  const r = useRise();
  return (
    <section className="relative min-h-[100svh] flex items-end px-5 sm:px-8 lg:px-12 pt-32 pb-16 sm:pb-24">
      <div className="max-w-6xl mx-auto w-full">
        <motion.p {...r(0)} className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-10">
          a social space · chronological · no ads
        </motion.p>

        <motion.h1
          {...r(0.05)}
          className="text-[clamp(2.9rem,9vw,7.5rem)] font-extralight text-foreground leading-[0.92] tracking-[-0.045em] max-w-5xl"
        >
          a quiet room
          <br />
          <span className="font-thin text-foreground/70">on the internet.</span>
        </motion.h1>

        <div className="mt-12 sm:mt-16 grid gap-10 sm:grid-cols-12 sm:items-end">
          <motion.p
            {...r(0.12)}
            className="sm:col-span-7 text-base sm:text-lg text-foreground/55 font-light max-w-xl leading-relaxed"
          >
            bosley is a free social space with a chronological feed, no ads, and no engagement farming. write. talk.
            leave when you want.
          </motion.p>

          <motion.div {...r(0.18)} className="sm:col-span-5 flex flex-col sm:items-end gap-3">
            <Button
              onClick={() => onOpenAuth?.("signup")}
              variant="signal"
              className="h-12 px-6 rounded-md text-[15px] font-medium w-full sm:w-auto group"
            >
              claim your handle
              <ArrowUpRight className="w-4 h-4 transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Button>
            <button
              type="button"
              onClick={() => onOpenAuth?.("login")}
              className="text-sm font-light text-foreground/55 hover:text-foreground transition-colors underline-offset-4 hover:underline py-1"
            >
              i already have an account
            </button>
          </motion.div>
        </div>

        <motion.div
          {...r(0.28)}
          className="mt-20 sm:mt-28 pt-6 border-t border-foreground/10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-foreground/40 text-xs font-light"
        >
          <span>chronological by default</span>
          <span>no ads. no boosted posts.</span>
          <span>direct messages are not sold</span>
          <span>export and delete anytime</span>
        </motion.div>
      </div>
    </section>
  );
};

/* ---------------- MANIFESTO ---------------- */
const Manifesto = () => {
  const r = useRise();
  const lines = [
    {
      n: "01",
      t: "your feed is yours.",
      d: "chronological by default. pick a ranking or none. the timeline is never reordered to harvest attention.",
    },
    {
      n: "02",
      t: "your messages are not a product.",
      d: "direct messages are not sold and are not used to train ads. transport is encrypted with https. we do not claim messages are unreadable on our servers.",
    },
    {
      n: "03",
      t: "your data has a half-life.",
      d: "disappearing messages, one-click full account export, and irreversible deletion. you own the off-ramp.",
    },
  ];
  return (
    <section id="how-it-works" className="py-28 sm:py-36 px-5 sm:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">
        <motion.div {...r(0)} className="mb-16 sm:mb-20 max-w-2xl">
          <p className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-5">three rules</p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-extralight text-foreground leading-[1.02] tracking-[-0.035em]">
            what we will
            <br />
            <span className="text-foreground/45">try to keep.</span>
          </h2>
        </motion.div>

        <div>
          {lines.map((line, i) => (
            <motion.div
              key={line.n}
              {...r(i * 0.08)}
              className="grid grid-cols-12 gap-6 py-9 sm:py-11 border-t border-foreground/10"
            >
              <div className="col-span-2 md:col-span-1">
                <span className="text-foreground/30 text-xs font-light tracking-[0.2em]">{line.n}</span>
              </div>
              <div className="col-span-10 md:col-span-5">
                <h3 className="text-2xl md:text-3xl font-extralight text-foreground tracking-[-0.02em]">{line.t}</h3>
              </div>
              <div className="col-span-12 md:col-span-6 md:pl-2">
                <p className="text-foreground/55 font-light leading-relaxed text-[15px] max-w-lg">{line.d}</p>
              </div>
            </motion.div>
          ))}
          <div className="border-t border-foreground/10" />
        </div>
      </div>
    </section>
  );
};

/* ---------------- WHAT IS HERE ---------------- */
const Inventory = () => {
  const r = useRise();
  // Only things that exist in the product today. No roadmap, no adjectives.
  const items = [
    ["posts", "text, images, video, polls, threads, scheduled posts, drafts, templates."],
    ["messages", "direct and group messages. disappearing messages. reactions."],
    ["control", "mute, block, keyword filters, audience circles, a chronological feed."],
    ["rooms", "communities, lists, events, bookmarks, anonymous q&a."],
    ["account", "two-factor sign-in, a security audit log, full export, deletion."],
    ["everywhere", "installs as an app on phone and desktop. drafts queue offline."],
  ];
  return (
    <section className="py-24 sm:py-32 px-5 sm:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">
        <motion.div {...r(0)} className="mb-14 flex items-end justify-between flex-wrap gap-6">
          <h2 className="text-3xl sm:text-5xl font-extralight text-foreground tracking-[-0.03em] max-w-xl leading-[1.05]">
            what is in the room.
          </h2>
          <p className="text-foreground/45 text-sm font-light max-w-xs">
            nothing here is a preview or a plan. it is what you get when you sign in.
          </p>
        </motion.div>

        <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground/10 rounded-lg overflow-hidden border border-foreground/10">
          {items.map(([k, v], i) => (
            <motion.div key={k} {...r(i * 0.05)} className="bg-background/85 p-6 sm:p-7 min-h-[150px] flex flex-col justify-between">
              <dt className="text-[11px] font-light tracking-[0.24em] uppercase text-foreground/45">{k}</dt>
              <dd className="text-foreground/80 font-light text-[15px] leading-relaxed mt-6">{v}</dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
};

/* ---------------- FINAL CTA ---------------- */
const FinalCTA = ({ onOpenAuth }: Props) => {
  const r = useRise();
  return (
    <section className="py-28 sm:py-40 px-5 sm:px-8 lg:px-12">
      <motion.div {...r(0)} className="max-w-4xl mx-auto">
        <h2 className="text-4xl sm:text-6xl md:text-7xl font-extralight text-foreground leading-[0.98] tracking-[-0.045em] mb-8">
          come write.
          <br />
          <span className="text-foreground/45">leave when you want.</span>
        </h2>
        <p className="text-foreground/55 font-light text-base sm:text-lg max-w-lg mb-10">
          free to join. no credit card. your account, your export, your delete.
        </p>
        <Button
          onClick={() => onOpenAuth?.("signup")}
          variant="signal"
          className="h-12 px-7 rounded-md text-[15px] font-medium group"
        >
          create your account
          <ArrowUpRight className="w-4 h-4 transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Button>
      </motion.div>
    </section>
  );
};

const LandingV2 = ({ onOpenAuth }: Props) => (
  <>
    <Hero onOpenAuth={onOpenAuth} />
    <Manifesto />
    <Inventory />
    <FinalCTA onOpenAuth={onOpenAuth} />
  </>
);

export default LandingV2;
