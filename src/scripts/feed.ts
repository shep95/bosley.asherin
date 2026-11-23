import { forYou, why } from "../lib/rank";
import { load, save, type Affinity } from "./local";

interface PublicPost { id: string; key: string; title: string; text: string; name: string | null; tag: string | null; at: string }

const fmt = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" });

/** a visitor's post as the same editorial row the owner's posts use. text only: nothing is read as html. */
function visitorRow(p: PublicPost): HTMLLIElement {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
    const n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const li = document.createElement("li");
  const row = el("article", "row is-arriving");
  row.dataset["date"] = p.at;
  row.dataset["slug"] = p.key;
  row.dataset["tags"] = "";
  const hit = el("a", "hit");
  hit.href = `/v/${p.key}`;
  hit.setAttribute("aria-label", p.title);

  const lead = el("div", "lead");
  lead.append(p.name ? el("span", "by-name", p.name) : el("span", "by-anon", "anonymous"));
  const time = el("time", "meta", fmt.format(new Date(p.at)).toLowerCase());
  time.dateTime = p.at;
  lead.append(time);

  const main = el("div", "main");
  const h = el("h2", "serif title", p.title);
  const whyP = el("p", "why meta"); whyP.hidden = true;
  main.append(h, whyP);

  const side = el("div", "side");
  const flat = p.text.replace(/\s+/g, " ").trim();
  side.append(el("p", "desc", flat.length > 180 ? `${flat.slice(0, 178).trimEnd()}…` : flat));
  const foot = el("p", "meta foot", `${Math.max(1, Math.round(flat.split(" ").length / 230))} min read · a visitor's post`);
  if (p.tag) { foot.append(" · "); foot.append(el("span", "mark", `◆ ${p.tag}`)); }
  side.append(foot);

  row.append(hit, lead, main, side);
  li.append(row);
  return li;
}

export function initFeed(): void {
  const list = document.querySelector<HTMLOListElement>("[data-feed]");
  const toggle = document.querySelector<HTMLElement>(".tabs");
  if (!list || !toggle) return;
  const note = document.querySelector<HTMLElement>(".foryou-note");
  const empty = document.querySelector<HTMLElement>("[data-empty]");
  const end = document.querySelector<HTMLElement>("[data-end]");
  let original = [...list.children] as HTMLLIElement[];
  const buttons = [...toggle.querySelectorAll<HTMLButtonElement>("button[data-mode]")];
  let mode = "latest";

  const items = () => original.map((li) => {
    const card = li.querySelector<HTMLElement>(".row")!;
    return { li, card, slug: card.dataset["slug"] ?? "", tags: (card.dataset["tags"] ?? "").split(" ").filter(Boolean), date: Date.parse(card.dataset["date"] ?? "") };
  });

  const apply = (next: string, animate: boolean) => {
    mode = next;
    for (const b of buttons) b.setAttribute("aria-checked", String(b.dataset["mode"] === mode));
    if (note) note.hidden = mode !== "foryou";
    const affinity = load<Affinity>("affinity", {});
    const read = new Set(load<string[]>("read", []));
    const all = items();
    const ordered = mode === "foryou" ? forYou(all, affinity, read) : all;
    const swap = () => {
      list.replaceChildren(...ordered.map((x) => x.li));
      for (const x of all) {
        const tag = x.card.querySelector<HTMLElement>(".why");
        if (!tag) continue;
        const reason = mode === "foryou" ? why(x.tags, affinity) : null;
        tag.hidden = !reason;
        tag.textContent = reason ?? "";
      }
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (animate && doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(swap);
    else swap();
    save("feed-mode", mode);
  };

  for (const b of buttons) b.addEventListener("click", () => apply(b.dataset["mode"] ?? "latest", true));
  toggle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = buttons.find((b) => b.getAttribute("aria-checked") !== "true");
    next?.click(); next?.focus();
  });
  if (load<string>("feed-mode", "latest") === "foryou") apply("foryou", false);

  // visitor posts join the same list, newest first, the moment they arrive
  void (async () => {
    const res = await fetch("/api/posts", { headers: { accept: "application/json" } }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json().catch(() => null)) as { posts?: PublicPost[] } | null;
    const posts = data?.posts ?? [];
    if (!posts.length) return;
    const rows = posts.map(visitorRow);
    original = [...original, ...rows].sort((a, b) => {
      const da = Date.parse(a.querySelector<HTMLElement>(".row")?.dataset["date"] ?? "");
      const db = Date.parse(b.querySelector<HTMLElement>(".row")?.dataset["date"] ?? "");
      return db - da;
    });
    list.hidden = false;
    if (empty) empty.hidden = true;
    if (end) end.hidden = false;
    toggle.hidden = original.length < 2;
    apply(mode, false);
  })();
}
