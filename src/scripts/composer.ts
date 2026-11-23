import { cleanName, cleanText, cleanTitle, MAX_POST } from "../lib/validate";
import { load, save, forget } from "./local";
import { myTag, sign, signedMessage } from "./identity";
import { worker } from "./work";

interface PublicPost { id: string; key: string; title: string; text: string; name: string | null; tag: string | null; at: string }
type Draft = { title: string; text: string };

let ready = false;

/** wire the composer once, then open it. loaded only when someone asks to write. */
export function openComposer(opener?: HTMLElement | null): void {
  const dialog = document.querySelector<HTMLDialogElement>("[data-composer]");
  if (!dialog) return;
  if (!ready) { wire(dialog); ready = true; }
  if (dialog.open) return;
  dialog.showModal();
  const title = dialog.querySelector<HTMLInputElement>("#w-title")!;
  (title.value ? dialog.querySelector<HTMLTextAreaElement>("#w-text")! : title).focus();
  dialog.addEventListener("close", () => opener?.focus(), { once: true });
}

function wire(dialog: HTMLDialogElement): void {
  const form = dialog.querySelector<HTMLFormElement>("[data-w-form]")!;
  const title = form.querySelector<HTMLInputElement>("#w-title")!;
  const text = form.querySelector<HTMLTextAreaElement>("#w-text")!;
  const named = form.querySelector<HTMLElement>("[data-w-named]")!;
  const nameInput = form.querySelector<HTMLInputElement>("#w-name")!;
  const tag = form.querySelector<HTMLElement>("[data-w-tag]")!;
  const who = form.querySelector<HTMLElement>("[data-w-who]")!;
  const toggle = form.querySelector<HTMLButtonElement>("[data-w-toggle]")!;
  const left = form.querySelector<HTMLElement>("[data-w-left]")!;
  const status = form.querySelector<HTMLElement>("[data-w-status]")!;
  const submit = form.querySelector<HTMLButtonElement>("[data-w-submit]")!;
  const work = worker("new-post");
  let signing = false;
  let busy = false;

  const say = (msg: string, kind: "" | "ok" | "err" = "") => { status.textContent = msg; status.className = `w-status ${kind}`; };

  // a draft survives a closed panel or a reload, on this device only
  const draft = load<Draft>("draft", { title: "", text: "" });
  title.value = draft.title; text.value = draft.text;
  let saveTimer = 0;
  const keep = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(() => save("draft", { title: title.value, text: text.value }), 250); };

  const count = () => {
    const n = text.value.length;
    const near = n > MAX_POST * 0.85;
    left.textContent = near ? `${MAX_POST - n} left` : "";
    left.classList.toggle("warn", near && n <= MAX_POST);
    left.classList.toggle("over", n > MAX_POST);
  };
  count();
  const onInput = () => { keep(); count(); if (status.classList.contains("err")) say(""); work.start().catch(() => {}); };
  title.addEventListener("input", onInput, { passive: true });
  text.addEventListener("input", onInput, { passive: true });

  // anonymous by default; a name is a choice, and a key signs it
  const setSigning = async (on: boolean) => {
    signing = on;
    named.hidden = !on;
    toggle.textContent = on ? "stay anonymous" : "sign with a name";
    who.replaceChildren(document.createTextNode("posting as "), Object.assign(document.createElement("em"), { textContent: on ? (cleanName(nameInput.value).ok && nameInput.value.trim()) || "your name" : "anonymous" }));
    if (on) { const t = await myTag(); tag.textContent = t ? ` (yours: ◆ ${t})` : ""; }
  };
  const savedName = load<string>("name", "");
  if (savedName) { nameInput.value = savedName; void setSigning(true); }
  toggle.addEventListener("click", () => { void setSigning(!signing); if (signing) nameInput.focus(); });
  nameInput.addEventListener("input", () => { if (signing) void setSigning(true); }, { passive: true });

  for (const b of dialog.querySelectorAll<HTMLButtonElement>("[data-w-close]")) b.addEventListener("click", () => dialog.close());
  // a click on the dim outside the panel closes it, the way it opened
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("cancel", (e) => { if (busy) e.preventDefault(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    // the same rules the server applies, so what is signed is exactly what is stored
    const t = cleanTitle(title.value);
    if (!t.ok) { say(t.error, "err"); title.focus(); return; }
    const body = cleanText(text.value, MAX_POST, 3);
    if (!body.ok) { say(body.error, "err"); text.focus(); return; }
    const nm = cleanName(signing ? nameInput.value : "");
    if (!nm.ok) { say(nm.error, "err"); nameInput.focus(); return; }
    if (signing && !nm.name) { say("add a name, or post anonymously.", "err"); nameInput.focus(); return; }

    busy = true; submit.disabled = true; submit.setAttribute("aria-busy", "true");
    say("sealing it…");
    try {
      const { challenge, nonce } = await work.start();
      const payload: Record<string, unknown> = { title: t.title, text: body.text, challenge, nonce };
      if (signing && nm.name) {
        payload["name"] = nm.name;
        const s = await sign(signedMessage("new-post", `${t.title}\n${body.text}`, nm.name, challenge));
        if (s) { payload["pub"] = s.pub; payload["sig"] = s.sig; }
        save("name", nm.name);
      }
      const res = await fetch("/api/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { post?: PublicPost; deleteToken?: string; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error ?? "couldn't publish that. try again.");
      if (data.deleteToken) {
        const mine = load<Record<string, string>>("mine-posts", {});
        mine[data.post.id] = data.deleteToken;
        save("mine-posts", mine);
      }
      clearTimeout(saveTimer);
      title.value = ""; text.value = "";
      forget("draft");
      say("published. taking you there…", "ok");
      location.assign(`/v/${data.post.key}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      say(msg === "resting" ? "writing is resting for a moment. your draft is kept — try again soon." : msg && msg !== "challenge" ? msg : "couldn't publish that. your draft is kept.", "err");
      work.reset();
      busy = false; submit.disabled = false; submit.removeAttribute("aria-busy");
    }
  });

  window.addEventListener("pagehide", () => { save("draft", { title: title.value, text: text.value }); work.cancel(); });
}
