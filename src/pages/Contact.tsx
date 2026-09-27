import PublicShell from "@/components/landing/PublicShell";
import { Helmet } from "react-helmet-async";
import { Mail } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import NotFound from "@/pages/NotFound";

const Contact = () => {
  return (
    <PublicShell>
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
<article className="doc">
        <p className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-6">contact</p>
        <h1 className="text-[2.5rem] sm:text-[3.25rem] font-extralight tracking-[-0.04em] leading-[0.98] text-foreground">
          write to a person,
          <br />
          <span className="font-thin text-foreground/70">not a form.</span>
        </h1>
        <p className="mt-8 text-foreground/60 font-light text-[15.5px] leading-relaxed max-w-md">
          questions, feedback, something broken. one address, read by the person who built this.
        </p>
        <a
          href="mailto:asher@bosley.app"
          className="mt-8 inline-flex items-center gap-2 text-[17px] text-foreground hover:text-signal transition-colors underline-offset-4 hover:underline"
        >
          <Mail className="w-4 h-4" /> asher@bosley.app
        </a>
        <dl className="mt-14 pt-6 border-t border-foreground/10 grid sm:grid-cols-2 gap-6 text-[13px] font-light">
          <div>
            <dt className="text-foreground/40 uppercase tracking-[0.2em] text-[10px]">response time</dt>
            <dd className="text-foreground/75 mt-1">usually within 24–48 business hours.</dd>
          </div>
          <div>
            <dt className="text-foreground/40 uppercase tracking-[0.2em] text-[10px]">security</dt>
            <dd className="text-foreground/75 mt-1">
              vulnerabilities go to <a href="mailto:security@bosley.app" className="text-foreground hover:text-signal">security@bosley.app</a>.
            </dd>
          </div>
        </dl>
      </article>
    </PublicShell>
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
    <PublicShell>
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
      <article className="doc">

            <h1 className="text-[2.5rem] sm:text-[3.25rem] font-extralight tracking-[-0.04em] leading-[0.98] text-foreground mb-8">{hub.h1}</h1>
            {hub.body.map((p) => (
              <p key={p} className="text-foreground/65 font-light text-[15.5px] mb-4 leading-relaxed max-w-lg">
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
      </article>
    </PublicShell>
  );
};
