import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * posts are markdown files in src/content/posts — the site's only source of
 * truth. no database: a post exists because a file exists in git.
 *
 * files starting with "_" are ignored (use them for drafts you keep around).
 */
const posts = defineCollection({
  loader: glob({ pattern: "**/[!_]*.md", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1).max(120),
      description: z.string().min(1).max(200),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string().regex(/^[a-z0-9-]+$/, "tags are lower-case words joined by dashes")).max(6).default([]),
      // images live in src/assets and are re-encoded at build with all metadata removed.
      cover: image().optional(),
      coverAlt: z.string().max(200).optional(),
      draft: z.boolean().default(false),
      comments: z.boolean().default(true),
    }),
});

export const collections = { posts };
