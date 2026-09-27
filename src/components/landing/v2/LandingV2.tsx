import { Suspense, lazy } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import FeedSkeleton from "@/components/feed/FeedSkeleton";

// The live room carries the feed dependency tree; it loads after the words.
const EmbeddedFeed = lazy(() => import("@/components/landing/EmbeddedFeed"));

interface Props {
  onOpenAuth?: (tab: "login" | "signup") => void;
}

const d = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as React.CSSProperties;

/* ---------------- HERO: the words, and the room itself ---------------- */
const Hero = ({ onOpenAuth }: Props) => {
  const ref = useReveal<HTMLElement>("0px");
  return (
    <section ref={ref} className="relative px-5 sm:px-8 pt-28 sm:pt-36 pb-16 sm:pb-24">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-12 lg:gap-10 items-start">
        <div className="lg:col-span-6 lg:pt-10">
          <p className="reveal text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-8">
            a social space · chronological · no ads
          </p>
          <h1
            className="reveal text-[clamp(2.75rem,7.2vw,5.75rem)] font-extralight text-foreground leading-[0.94] tracking-[-0.045em]"
            style={d(60)}
          >
            a quiet room
            <br />
            <span className="font-thin text-foreground/70">on the internet.</span>
          </h1>
          <p className="reveal mt-8 text-[15.5px] sm:text-lg text-foreground/55 font-light max-w-md leading-relaxed" style={d(140)}>
            a chronological feed, no ads, no engagement farming. write. talk. leave when you want.
          </p>
          <div className="reveal mt-9 flex flex-wrap items-center gap-x-6 gap-y-3" style={d(200)}>
            <Button
              onClick={() => onOpenAuth?.("signup")}
              variant="signal"
              className="h-11 px-5 rounded-md text-[15px] font-medium group"
            >
              claim your handle
              <ArrowUpRight className="w-4 h-4 transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Button>
            <button
              type="button"
              onClick={() => onOpenAuth?.("login")}
              className="text-[14px] font-light text-foreground/55 hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              i already have an account
            </button>
          </div>
          <dl className="reveal mt-14 grid grid-cols-2 gap-x-6 gap-y-4 max-w-md text-[13px] font-light" style={d(280)}>
            {[
              ["feed", "newest first. never reordered."],
              ["ads", "none. no boosted posts."],
              ["messages", "not sold. not used to train ads."],
              ["leaving", "export and delete, anytime."],
            ].map(([k, v]) => (
              <div key={k} className="border-t border-foreground/10 pt-3">
                <dt className="text-foreground/40 uppercase tracking-[0.2em] text-[10px]">{k}</dt>
                <dd className="text-foreground/75 mt-1">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* The product, not a picture of it. */}
        <div className="reveal lg:col-span-6" style={d(160)}>
          <div className="room rounded-lg overflow-hidden h-[560px] sm:h-[640px] [mask-image:linear-gradient(to_bottom,black_82%,transparent)]">
            <Suspense fallback={<FeedSkeleton count={4} />}>
              <EmbeddedFeed onOpenAuth={onOpenAuth} />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ---------------- THREE RULES ---------------- */
const Manifesto = () => {
  const ref = useReveal<HTMLElement>();
  const lines = [
    { n: "01", t: "your feed is yours.", d: "chronological by default. pick a ranking or none. the timeline is never reordered to harvest attention." },
    { n: "02", t: "your messages are not a product.", d: "direct messages are not sold and are not used to train ads. transport is encrypted with https. we do not claim messages are unreadable on our servers." },
    { n: "03", t: "your data has a half-life.", d: "disappearing messages, one-click full account export, and irreversible deletion. you own the off-ramp." },
  ];
  return (
    <section ref={ref} id="how-it-works" className="py-24 sm:py-32 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="reveal mb-12 sm:mb-16 max-w-2xl">
          <p className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-5">three rules</p>
          <h2 className="text-4xl sm:text-5xl font-extralight text-foreground leading-[1.02] tracking-[-0.035em]">
            what we will <span className="text-foreground/45">try to keep.</span>
          </h2>
        </div>
        <div>
          {lines.map((line, i) => (
            <div key={line.n} className="reveal grid grid-cols-12 gap-6 py-8 sm:py-10 border-t border-foreground/10" style={d(i * 80)}>
              <div className="col-span-2 md:col-span-1"><span className="text-foreground/30 text-xs font-light tracking-[0.2em]">{line.n}</span></div>
              <div className="col-span-10 md:col-span-5"><h3 className="text-2xl md:text-[1.75rem] font-extralight text-foreground tracking-[-0.02em]">{line.t}</h3></div>
              <div className="col-span-12 md:col-span-6 md:pl-2"><p className="text-foreground/55 font-light leading-relaxed text-[15px] max-w-lg">{line.d}</p></div>
            </div>
          ))}
          <div className="border-t border-foreground/10" />
        </div>
      </div>
    </section>
  );
};

/* ---------------- WHAT IS IN THE ROOM ---------------- */
const Inventory = () => {
  const ref = useReveal<HTMLElement>();
  const items = [
    ["posts", "text, images, video, polls, threads, scheduled posts, drafts, templates."],
    ["messages", "direct and group messages. disappearing messages. reactions."],
    ["control", "mute, block, keyword filters, audience circles, a chronological feed."],
    ["rooms", "communities, lists, events, bookmarks, anonymous q&a."],
    ["account", "two-factor sign-in, a security audit log, full export, deletion."],
    ["everywhere", "installs as an app on phone and desktop. drafts queue offline."],
  ];
  return (
    <section ref={ref} className="py-20 sm:py-28 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="reveal mb-10 flex items-end justify-between flex-wrap gap-6">
          <h2 className="text-3xl sm:text-5xl font-extralight text-foreground tracking-[-0.03em] max-w-xl leading-[1.05]">what is in the room.</h2>
          <p className="text-foreground/45 text-sm font-light max-w-xs">nothing here is a preview or a plan. it is what you get when you sign in.</p>
        </div>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-foreground/10">
          {items.map(([k, v], i) => (
            <div key={k} className="reveal border-b border-r border-foreground/10 p-6 sm:p-7 min-h-[140px] flex flex-col justify-between" style={d(i * 50)}>
              <dt className="text-[11px] font-light tracking-[0.24em] uppercase text-foreground/45">{k}</dt>
              <dd className="text-foreground/80 font-light text-[15px] leading-relaxed mt-5">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};

/* ---------------- FINAL ---------------- */
const FinalCTA = ({ onOpenAuth }: Props) => {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="py-24 sm:py-36 px-5 sm:px-8">
      <div className="reveal max-w-6xl mx-auto">
        <h2 className="text-4xl sm:text-6xl md:text-7xl font-extralight text-foreground leading-[0.98] tracking-[-0.045em] mb-8">
          come write.
          <br />
          <span className="text-foreground/45">leave when you want.</span>
        </h2>
        <p className="text-foreground/55 font-light text-base sm:text-lg max-w-lg mb-9">free to join. no credit card. your account, your export, your delete.</p>
        <Button onClick={() => onOpenAuth?.("signup")} variant="signal" className="h-11 px-6 rounded-md text-[15px] font-medium group">
          create your account
          <ArrowUpRight className="w-4 h-4 transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Button>
      </div>
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
