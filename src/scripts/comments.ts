import { load, save } from "./local";
import { cleanName, cleanText } from "../lib/validate";
import { forgetIdentity, myTag, sign, signedMessage } from "./identity";
import { worker } from "./work";

interface PublicComment { id: string; text: string; name: string | null; tag: string | null; at: string }

const MAX = 1000;
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(iso: string): string {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
  let v = s;
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return unit === "second" ? "just now" : rtf.format(Math.round(v), unit);
    v /= n;
  }
  return "";
}

export function initComments(): void {
  const root = document.querySelector<HTMLElement>("[data-comments]");
  if (!root) return;
  const post = root.dataset["comments"] ?? "";
  const list = root.querySelector<HTMLOListElement>("[data-list]")!;
  const empty = root.querySelector<HTMLElement>("[data-empty]")!;
  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const form = root.querySelector<HTMLFormElement>("[data-form]")!;
  const text = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const ink = form.querySelector<HTMLElement>(".ink")!;
  const left = form.querySelector<HTMLElement>("[data-left]")!;
  const named = form.querySelector<HTMLElement>("[data-named]")!;
  const nameInput = form.querySelector<HTMLInputElement>("#c-name")!;
  const tagPreview = form.querySelector<HTMLElement>("[data-tag-preview]")!;
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
  const status = form.querySelector<HTMLElement>("[data-status]")!;
  const mine = load<Record<string, string>>("mine", {}); // comment id → delete token

  let total = 0;
  const say = (msg: string, kind: "" | "ok" | "err" = "") => { status.textContent = msg; status.className = `status ${kind}`; };
  const setCount = (n: number) => { total = n; count.textContent = n === 0 ? "" : n === 1 ? "1 voice" : `${n} voices`; empty.hidden = n > 0; };

  function render(c: PublicComment, fresh = false): HTMLLIElement {
    const li = document.createElement("li");
    li.className = fresh ? "c is-new" : "c";
    li.id = `c-${c.id}`;
    const top = document.createElement("div");
    top.className = "c-top";
    const who = document.createElement("span");
    who.className = c.name ? "c-name" : "c-anon";
    who.textContent = c.name ?? "anonymous";
    top.append(who);
    if (c.tag) {
      const tag = document.createElement("span");
      tag.className = "c-tag";
      tag.title = "signed with this person's own key — the same mark appears on everything they sign";
      tag.textContent = `◆ ${c.tag}`;
      top.append(tag);
    }
    const time = document.createElement("time");
    time.className = "c-time";
    time.dateTime = c.at;
    time.textContent = ago(c.at);
    top.append(time);
    const body = document.createElement("p");
    body.className = "c-text";
    body.textContent = c.text; // plain text only: nothing in a comment is ever read as html
    li.append(top, body);
    const token = mine[c.id];
    if (token) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "linkish c-remove";
      rm.textContent = "remove what i said";
      rm.addEventListener("click", () => remove(c.id, token, li, rm));
      li.append(rm);
    }
    return li;
  }

  async function remove(id: string, token: string, li: HTMLLIElement, btn: HTMLButtonElement) {
    btn.disabled = true;
    const res = await fetch("/api/comments", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ post, id, token }) }).catch(() => null);
    if (!res?.ok) { btn.disabled = false; say("couldn't remove it just now. try again.", "err"); return; }
    delete mine[id]; save("mine", mine);
    li.animate?.([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-8px)" }], { duration: 240, easing: "cubic-bezier(0.3,0,1,1)" })
      .finished.then(() => li.remove(), () => li.remove());
    setCount(total - 1);
    say("removed. it's gone from bosley.", "ok");
  }

  async function loadList() {
    const res = await fetch(`/api/comments?post=${encodeURIComponent(post)}`, { headers: { accept: "application/json" } }).catch(() => null);
    list.setAttribute("aria-busy", "false");
    list.replaceChildren();
    if (!res || !res.ok) {
      setCount(0);
      empty.hidden = false;
      empty.textContent = res?.status === 503 ? "the conversation is resting for a moment. it'll be back." : "couldn't reach the conversation. refresh to try again.";
      return;
    }
    const data = (await res.json()) as { comments: PublicComment[] };
    for (const c of data.comments) list.append(render(c));
    setCount(data.comments.length);
  }

  // ── typing feel: the ink line and the ring follow every keystroke, at no cost to input ──
  const onInput = () => {
    const n = text.value.length;
    ink.style.setProperty("--fill", String(Math.min(1, n / 280)));
    // the count appears only near the limit — never a nag while writing
    left.textContent = n > MAX * 0.8 ? `${MAX - n} left` : "";
    left.classList.toggle("warn", n > MAX * 0.8 && n <= MAX);
    left.classList.toggle("over", n > MAX);
    if (status.classList.contains("err")) say("");
  };
  text.addEventListener("input", onInput, { passive: true });

  // ── proof-of-work starts quietly the moment someone begins to write ──
  const work = worker(post);
  text.addEventListener("focus", () => { work.start().catch(() => {}); });

  // ── identity: anonymous by default; a name is a choice, signed by a key ──
  const whoLabel = form.querySelector<HTMLElement>("[data-who]")!;
  const toggleName = form.querySelector<HTMLButtonElement>("[data-toggle-name]")!;
  let isNamed = false;
  const setNamed = async (on: boolean) => {
    isNamed = on;
    named.hidden = !on;
    toggleName.textContent = on ? "stay anonymous" : "sign with a name";
    const em = document.createElement("em");
    em.textContent = on ? nameInput.value.trim() || "your name" : "anonymous";
    whoLabel.replaceChildren("as ", em);
    const t = on ? await myTag() : null;
    tagPreview.textContent = t ? ` (yours: ◆ ${t})` : "";
  };
  const savedName = load<string>("name", "");
  if (savedName) { nameInput.value = savedName; void setNamed(true); }
  toggleName.addEventListener("click", () => { void setNamed(!isNamed).then(() => { if (isNamed) nameInput.focus(); }); });
  nameInput.addEventListener("input", () => { if (isNamed) void setNamed(true); }, { passive: true });
  form.querySelector("[data-forget-key]")?.addEventListener("click", () => {
    forgetIdentity(); nameInput.value = ""; void setNamed(false);
    say("your key is forgotten. a new one is made next time you sign.", "ok");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // the same rules the server applies, so what you sign is exactly what is stored
    const cleaned = cleanText(text.value);
    if (!cleaned.ok) { say(cleaned.error, "err"); text.focus(); return; }
    const value = cleaned.text;
    const nm = cleanName(isNamed ? nameInput.value : "");
    if (!nm.ok) { say(nm.error, "err"); nameInput.focus(); return; }
    const name = nm.name ?? "";
    if (isNamed && !name) { say("add a name, or switch to anonymous.", "err"); nameInput.focus(); return; }

    submit.disabled = true; submit.setAttribute("aria-busy", "true");
    say("sealing it…");
    try {
      const { challenge, nonce } = await work.start();
      const payload: Record<string, unknown> = { post, text: value, challenge, nonce };
      if (isNamed) {
        payload["name"] = name;
        const s = await sign(signedMessage(post, value, name, challenge));
        if (s) { payload["pub"] = s.pub; payload["sig"] = s.sig; }
        save("name", name);
        void setNamed(true);
      }
      const res = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { comment?: PublicComment; deleteToken?: string; error?: string };
      if (!res.ok || !data.comment) throw new Error(data.error ?? "something went wrong. try again.");
      if (data.deleteToken) { mine[data.comment.id] = data.deleteToken; save("mine", mine); }
      const li = render(data.comment, true);
      list.append(li);
      requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add("settled")));
      setCount(total + 1);
      text.value = ""; onInput();
      ink.style.setProperty("--fill", "0");
      say("it's here. thank you for saying something.", "ok");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      say(msg === "resting" ? "the conversation is resting for a moment. try again soon." : msg && msg !== "challenge" ? msg : "couldn't send that. try again.", "err");
    } finally {
      work.reset();
      submit.disabled = false; submit.removeAttribute("aria-busy");
    }
  });

  window.addEventListener("pagehide", () => work.cancel());
  void loadList();
}
