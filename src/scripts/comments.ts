import { solve } from "../lib/pow";
import { forget, load, save } from "./local";
import { cleanName, cleanText } from "../lib/validate";

interface PublicComment { id: string; text: string; name: string | null; tag: string | null; at: string }
interface Challenge { challenge: string; bits: number; expires: number }

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

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** the visitor's optional signing key — made and kept in this browser only. */
async function identityKey(): Promise<{ pub: JsonWebKey; priv: CryptoKey } | null> {
  if (!crypto?.subtle) return null;
  let stored = load<{ pub: JsonWebKey; priv: JsonWebKey } | null>("identity", null);
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
    stored = { pub: { kty: "EC", crv: "P-256", x: pub.x!, y: pub.y! }, priv };
    save("identity", stored);
  }
  const priv = await crypto.subtle.importKey("jwk", stored.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { pub: stored.pub, priv };
}

async function keyTag(pub: JsonWebKey): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pub.x}.${pub.y}`));
  return [...new Uint8Array(d)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const meter = form.querySelector<HTMLElement>(".meter")!;
  const left = form.querySelector<HTMLElement>("[data-left]")!;
  const named = form.querySelector<HTMLElement>("[data-named]")!;
  const nameInput = form.querySelector<HTMLInputElement>("#c-name")!;
  const tagPreview = form.querySelector<HTMLElement>("[data-tag-preview]")!;
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
  const status = form.querySelector<HTMLElement>("[data-status]")!;
  const mine = load<Record<string, string>>("mine", {}); // comment id → delete token

  let total = 0;
  const say = (msg: string, kind: "" | "ok" | "err" = "") => { status.textContent = msg; status.className = `status small ${kind}`; };
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
      rm.className = "linkish c-remove small";
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
    const pct = Math.min(100, (n / MAX) * 100);
    ink.style.setProperty("--fill", String(Math.min(1, n / 280)));
    meter.style.setProperty("--pct", String(pct));
    meter.classList.toggle("warn", n > MAX * 0.9 && n <= MAX);
    meter.classList.toggle("over", n > MAX);
    left.textContent = n > MAX * 0.8 ? String(MAX - n) : "";
    if (status.classList.contains("err")) say("");
  };
  text.addEventListener("input", onInput, { passive: true });

  // ── proof-of-work starts quietly the moment someone begins to write ──
  let work: Promise<{ challenge: string; nonce: string }> | null = null;
  let abort: AbortController | null = null;
  const startWork = () => {
    if (work) return work;
    abort = new AbortController();
    const signal = abort.signal;
    work = (async () => {
      const res = await fetch(`/api/challenge?post=${encodeURIComponent(post)}`);
      if (!res.ok) throw new Error(res.status === 503 ? "resting" : "challenge");
      const ch = (await res.json()) as Challenge;
      const nonce = await solve(ch.challenge, ch.bits, { signal });
      return { challenge: ch.challenge, nonce };
    })();
    work.catch(() => { work = null; });
    return work;
  };
  text.addEventListener("focus", () => { startWork().catch(() => {}); }, { once: false });

  // ── identity: anonymous by default ──
  const whoRadios = [...form.querySelectorAll<HTMLInputElement>('input[name="who"]')];
  const savedName = load<string>("name", "");
  if (savedName) { nameInput.value = savedName; whoRadios.find((r) => r.value === "named")!.checked = true; named.hidden = false; }
  const refreshTag = async () => {
    const stored = load<{ pub: JsonWebKey } | null>("identity", null);
    tagPreview.textContent = stored ? `(yours: ◆ ${await keyTag(stored.pub)})` : "";
  };
  refreshTag();
  for (const r of whoRadios) r.addEventListener("change", () => { named.hidden = r.value !== "named" || !r.checked; if (!named.hidden) nameInput.focus(); });
  form.querySelector("[data-forget-key]")?.addEventListener("click", () => {
    forget("identity"); forget("name"); nameInput.value = ""; tagPreview.textContent = "";
    say("your key is forgotten. a new one is made next time you sign.", "ok");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // the same rules the server applies, so what you sign is exactly what is stored
    const cleaned = cleanText(text.value);
    if (!cleaned.ok) { say(cleaned.error, "err"); text.focus(); return; }
    const value = cleaned.text;
    const isNamed = whoRadios.find((r) => r.checked)?.value === "named";
    const nm = cleanName(isNamed ? nameInput.value : "");
    if (!nm.ok) { say(nm.error, "err"); nameInput.focus(); return; }
    const name = nm.name ?? "";
    if (isNamed && !name) { say("add a name, or switch to anonymous.", "err"); nameInput.focus(); return; }

    submit.disabled = true; submit.setAttribute("aria-busy", "true");
    say("sealing it…");
    try {
      const { challenge, nonce } = await startWork();
      const payload: Record<string, unknown> = { post, text: value, challenge, nonce };
      if (isNamed) {
        payload["name"] = name;
        const id = await identityKey();
        if (id) {
          const msg = `bosley-comment-v1\n${post}\n${name}\n${challenge}\n${value}`;
          const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, id.priv, new TextEncoder().encode(msg));
          payload["pub"] = id.pub; payload["sig"] = b64url(sig);
        }
        save("name", name);
        refreshTag();
      }
      const res = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { comment?: PublicComment; deleteToken?: string; error?: string };
      if (!res.ok || !data.comment) throw new Error(data.error ?? "something went wrong. try again.");
      if (data.deleteToken) { mine[data.comment.id] = data.deleteToken; save("mine", mine); }
      list.append(render(data.comment, true));
      setCount(total + 1);
      text.value = ""; onInput();
      say("it's here. thank you for saying something.", "ok");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      say(msg === "resting" ? "the conversation is resting for a moment. try again soon." : msg && msg !== "challenge" ? msg : "couldn't send that. try again.", "err");
    } finally {
      work = null; abort = null;
      submit.disabled = false; submit.removeAttribute("aria-busy");
    }
  });

  window.addEventListener("pagehide", () => abort?.abort());
  void loadList();
}
