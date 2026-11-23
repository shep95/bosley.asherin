import { load, save } from "./local";
import { wireShare } from "./post";

/** a visitor post page: share it, and let its writer remove it from the same browser. */
export function initVisitorPost(): void {
  const article = document.querySelector<HTMLElement>("article[data-visitor]");
  if (!article) return;
  wireShare();
  const id = article.dataset["visitor"] ?? "";
  const mine = load<Record<string, string>>("mine-posts", {});
  const token = mine[id];
  const btn = document.querySelector<HTMLButtonElement>("[data-remove-post]");
  const status = document.querySelector<HTMLElement>("[data-remove-status]");
  if (!btn || !token) return;
  btn.hidden = false;
  let armed = false;
  btn.addEventListener("click", async () => {
    // removal is permanent, so it asks once, in place, instead of a browser dialog
    if (!armed) {
      armed = true;
      btn.textContent = "remove it for good?";
      setTimeout(() => { if (armed) { armed = false; btn.textContent = "remove my post"; } }, 4000);
      return;
    }
    btn.disabled = true;
    const res = await fetch("/api/posts", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, token }) }).catch(() => null);
    if (!res?.ok) {
      btn.disabled = false; armed = false; btn.textContent = "remove my post";
      if (status) status.textContent = "couldn't remove it just now. try again.";
      return;
    }
    delete mine[id]; save("mine-posts", mine);
    if (status) status.textContent = "removed. it's gone from bosley.";
    setTimeout(() => location.assign("/"), 900);
  });
}
