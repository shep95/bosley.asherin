import GlassHeader from "@/components/GlassHeader";
import { Helmet } from "react-helmet-async";
import FooterSection from "@/components/landing/FooterSection";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";
import { Mail } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import NotFound from "@/pages/NotFound";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>contact — bosley</title>
        <meta
          name="description"
          content="email asher@bosley.app for support, feedback, or a human. typically 24-48 business hours."
        />
        <link rel="canonical" href="https://bosley.app/contact" />
        <meta property="og:url" content="https://bosley.app/contact" />
        <meta property="og:title" content="contact bosley" />
        <meta property="og:description" content="email asher@bosley.app for support, feedback, or a human." />
      </Helmet>
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundWallpaper})` }}
      />

      <div className="relative z-10">
        <GlassHeader />

        <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <div className="glass-card rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-foreground/10 flex items-center justify-center">
                <Mail className="w-8 h-8 text-foreground" />
              </div>

              <h1 className="text-3xl sm:text-4xl font-light text-foreground mb-4">contact</h1>

              <p className="text-foreground/70 font-light mb-8 leading-relaxed">
                questions, feedback, something broken? write to us and we'll get
                back to you as soon as possible.
              </p>

              <a
                href="mailto:asher@bosley.app"
                className="inline-flex items-center gap-3 px-8 py-4 bg-foreground text-background rounded-xl font-medium hover:bg-foreground/90 transition-colors"
              >
                <Mail className="w-5 h-5" />
                asher@bosley.app
              </a>

              <div className="mt-12 pt-8 border-t border-border/20">
                <h2 className="text-lg font-medium text-foreground mb-4">response time</h2>
                <p className="text-foreground/60 font-light text-sm">
                  we usually answer within 24–48 business hours.
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

export default Contact;

type Hub = { slug: string; h1: string; title: string; description: string; body: string[] };

const HUBS: Record<string, Hub> = {
  writers: {
    slug: "writers",
    h1: "bosley for writers",
    title: "bosley for writers",
    description: "a chronological social feed with no ads and no engagement farming.",
    body: ["the feed stays in order.", "no ads. no engagement farming.", "export and delete anytime. asher@bosley.app"],
  },
  communities: {
    slug: "communities",
    h1: "bosley for communities",
    title: "bosley for communities",
    description: "a quiet social space for groups that want a chronological feed.",
    body: [
      "posts are not ranked for rage.",
      "https in transit. we do not claim messages are unreadable on our servers.",
      "free to join. no credit card.",
    ],
  },
  journalists: {
    slug: "journalists",
    h1: "bosley for journalists",
    title: "bosley for journalists",
    description: "a public chronological feed without an engagement algorithm.",
    body: [
      "posts stay in the order they were written.",
      "we do not claim independent audits or empty subpoena returns on this page.",
      "contact: asher@bosley.app",
    ],
  },
  quiet: {
    slug: "quiet",
    h1: "bosley for quiet feeds",
    title: "bosley for quiet feeds",
    description: "a quiet room on the internet. chronological. no ads.",
    body: [
      "if the other apps feel like a crowd, this one is meant to feel like a room.",
      "chronological by default. no ads.",
      "your account, your export, your delete.",
    ],
  },
};

const FOR_INDEX: Hub = {
  slug: "",
  h1: "who bosley is for",
  title: "who bosley is for",
  description: "bosley is a free social space with a chronological feed, no ads, and no engagement farming.",
  body: [
    "bosley is not the hair clinic. it is a social site at bosley.app.",
    "founded sept 5, 2024 by asher newton, zorak corp.",
  ],
};

export const For = () => {
  const { slug } = useParams();
  if (slug && !HUBS[slug]) return <NotFound />;
  const hub = slug ? HUBS[slug] : FOR_INDEX;
  const path = slug ? `/for/${slug}` : "/for";
  const url = `https://bosley.app${path}`;
  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>{hub.title}</title>
        <meta name="description" content={hub.description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={hub.title} />
        <meta property="og:description" content={hub.description} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "bosley", item: "https://bosley.app/" },
              { "@type": "ListItem", position: 2, name: hub.h1, item: url },
            ],
          })}
        </script>
      </Helmet>
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundWallpaper})` }}
      />
      <div className="relative z-10">
        <GlassHeader />
        <main className="pt-32 pb-20 px-4">
          <div className="max-w-2xl mx-auto glass-card rounded-2xl p-8 sm:p-12">
            <h1 className="text-3xl sm:text-4xl font-extralight text-foreground mb-6">{hub.h1}</h1>
            {hub.body.map((p) => (
              <p key={p} className="text-foreground/70 font-light mb-4 leading-relaxed">
                {p}
              </p>
            ))}
            {!slug && (
              <nav className="mt-10 grid gap-3 text-sm">
                <Link className="underline" to="/for/writers">
                  bosley for writers
                </Link>
                <Link className="underline" to="/for/communities">
                  bosley for communities
                </Link>
                <Link className="underline" to="/for/journalists">
                  bosley for journalists
                </Link>
                <Link className="underline" to="/for/quiet">
                  bosley for quiet feeds
                </Link>
              </nav>
            )}
          </div>
        </main>
        <FooterSection />
      </div>
    </div>
  );
};
