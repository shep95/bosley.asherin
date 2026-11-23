import { forYou, why } from "../lib/rank";
import { load, save, type Affinity } from "./local";

export function initFeed(): void {
  const list = document.querySelector<HTMLOListElement>("[data-feed]");
  const toggle = document.querySelector<HTMLElement>(".tabs");
  if (!list || !toggle) return;
  const note = document.querySelector<HTMLElement>(".foryou-note");
  const original = [...list.children] as HTMLLIElement[];
  const buttons = [...toggle.querySelectorAll<HTMLButtonElement>("button[data-mode]")];

  const apply = (mode: string, animate: boolean) => {
    for (const b of buttons) b.setAttribute("aria-checked", String(b.dataset["mode"] === mode));
    if (note) note.hidden = mode !== "foryou";
    const affinity = load<Affinity>("affinity", {});
    const read = new Set(load<string[]>("read", []));
    const items = original.map((li) => {
      const card = li.querySelector<HTMLElement>(".row")!;
      return { li, card, slug: card.dataset["slug"] ?? "", tags: (card.dataset["tags"] ?? "").split(" ").filter(Boolean), date: Date.parse(card.dataset["date"] ?? "") };
    });
    const ordered = mode === "foryou" ? forYou(items, affinity, read) : items;
    const swap = () => {
      list.replaceChildren(...ordered.map((x) => x.li));
      for (const x of items) {
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
  const saved = load<string>("feed-mode", "latest");
  if (saved === "foryou") apply("foryou", false);
}
