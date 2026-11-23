import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getPosts, postUrl } from "../lib/posts";
import { SITE } from "../lib/site";

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  return rss({
    title: "bosley",
    description: SITE.description,
    site: SITE.url,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: postUrl(p),
      categories: p.data.tags,
    })),
    customData: `<language>en</language>`,
    trailingSlash: false,
  });
};
