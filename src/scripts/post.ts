import { learnFrom, load, save } from "./local";

export function initPost(): void {
  const article = document.querySelector<HTMLElement>("article[data-post]");
  if (!article) return;
  const slug = article.dataset["post"] ?? "";
  const tags = (article.dataset["tags"] ?? "").split(" ").filter(Boolean);

  // a read counts once the reader reaches the end of the text. it is remembered
  // here, in this browser, to shape "for you" — and nowhere else.
  const mark = document.querySelector(".read-mark");
  if (mark && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const read = new Set(load<string[]>("read", []));
      if (!read.has(slug)) {
        read.add(slug);
        save("read", [...read].slice(-500));
        learnFrom(tags);
      }
    });
    io.observe(mark);
  }

  const share = document.querySelector<HTMLButtonElement>("[data-share]");
  const label = share?.querySelector<HTMLElement>("[data-share-label]");
  share?.addEventListener("click", async () => {
    const url = share.dataset["url"] ?? location.href;
    const title = share.dataset["title"] ?? document.title;
    const touch = matchMedia("(pointer: coarse)").matches;
    try {
      if (touch && navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      if (label) {
        share.classList.add("is-done");
        label.textContent = "copied";
        setTimeout(() => { label.textContent = "copy link"; share.classList.remove("is-done"); }, 1800);
      }
    } catch { /* the reader closed the share sheet or clipboard was blocked */ }
  });
}
