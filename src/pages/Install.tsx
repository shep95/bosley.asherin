import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  ios: {
    title: "iphone and ipad",
    steps: ["open this page in safari", "tap share", "tap add to home screen", "tap add"],
  },
  android: {
    title: "android",
    steps: ["open this page in chrome", "tap the ⋮ menu", "tap add to home screen", "tap add"],
  },
  desktop: {
    title: "desktop",
    steps: ["look for the install icon at the right end of the address bar", "or open the browser menu and choose install bosley"],
  },
};

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) setIsInstalled(true);

    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) setPlatform("ios");
    else if (/Android/.test(ua)) setPlatform("android");

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const guide = STEPS[platform];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>install bosley</title>
        <meta
          name="description"
          content="install bosley as an app on iphone, android or desktop. full-screen, fast, and drafts keep working offline."
        />
        <link rel="canonical" href="https://bosley.app/install" />
        <meta property="og:url" content="https://bosley.app/install" />
        <meta property="og:title" content="install bosley" />
        <meta property="og:description" content="add bosley to your device for a full-screen app experience." />
      </Helmet>
      <img
        src={backgroundWallpaper}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="wallpaper fixed inset-0 w-full h-full object-cover pointer-events-none select-none"
      />
      <div className="wallpaper-scrim fixed inset-0" />

      <main className="relative z-10 min-h-screen px-5 sm:px-8 lg:px-12 pt-10 pb-20">
        <div className="max-w-6xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-light text-foreground/55 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> back
          </Link>

          <div className="mt-20 sm:mt-28 grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-7">
              <p className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-8">install</p>
              <h1 className="text-[clamp(2.5rem,7vw,5.5rem)] font-extralight text-foreground leading-[0.95] tracking-[-0.045em]">
                the room,
                <br />
                <span className="font-thin text-foreground/70">on your home screen.</span>
              </h1>
              <p className="mt-10 text-foreground/55 font-light max-w-md leading-relaxed">
                bosley installs as an app. no store, no download size. it opens full-screen, loads from your device, and
                drafts keep working when the connection does not.
              </p>

              {isInstalled ? (
                <p className="mt-10 inline-flex items-center gap-2 text-sm font-light text-signal">
                  <Check className="w-4 h-4" /> installed on this device
                </p>
              ) : deferredPrompt ? (
                <Button onClick={handleInstall} variant="signal" className="mt-10 h-12 px-6 rounded-md text-[15px] font-medium">
                  <Download className="w-4 h-4" /> install now
                </Button>
              ) : null}
            </div>

            <div className="lg:col-span-5 lg:pt-16">
              <div className="border-t border-foreground/10">
                <p className="pt-5 text-[11px] font-light tracking-[0.24em] uppercase text-foreground/45">{guide.title}</p>
                <ol className="mt-6 space-y-4">
                  {guide.steps.map((step, i) => (
                    <li key={step} className="grid grid-cols-[2rem_1fr] gap-3 text-[15px] font-light text-foreground/80 leading-relaxed">
                      <span className="text-foreground/30 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-10 border-t border-foreground/10 pt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs font-light text-foreground/40">
                {(Object.keys(STEPS) as Platform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`transition-colors ${p === platform ? "text-foreground" : "hover:text-foreground/70"}`}
                  >
                    {STEPS[p].title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Install;
