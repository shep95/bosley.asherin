import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, CornerDownLeft, PenLine, Search, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ALL_ROOMS, openComposer } from "@/lib/rooms";

/**
 * The command palette: ⌘K / Ctrl+K from anywhere in the signed-in app.
 * One box that goes to any room, writes, finds a person, or searches posts.
 * Also owns the global shortcuts (n = write, g then a letter = go, / = palette,
 * ? = list of shortcuts), because they share the same "am I typing?" guard.
 */

type Item = {
  id: string;
  group: "do" | "go" | "people" | "search";
  label: string;
  hint?: string;
  icon: "write" | "go" | "person" | "search";
  run: () => void;
};

const isTypingTarget = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
};

/** Subsequence match with a small bonus for word starts. Returns -1 for no match. */
function score(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 100 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 60 - idx;
  let ti = 0;
  let s = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    s += found === ti ? 2 : 1;
    ti = found + 1;
  }
  return s;
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

const Icon = ({ kind }: { kind: Item["icon"] }) => {
  const cls = "w-4 h-4 text-foreground/45";
  if (kind === "write") return <PenLine className={cls} />;
  if (kind === "person") return <User className={cls} />;
  if (kind === "search") return <Search className={cls} />;
  return <ArrowUpRight className={cls} />;
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const SHORTCUTS: Array<[string, string]> = [
  [isMac ? "⌘ K" : "ctrl K", "open this palette"],
  ["/", "open this palette"],
  ["n", "write"],
  ["g f", "feed"],
  ["g e", "explore"],
  ["g m", "messages"],
  ["g n", "notifications"],
  ["g b", "bookmarks"],
  ["g p", "your profile"],
  ["g ,", "settings"],
  ["j / k", "next / previous post"],
  ["?", "this list"],
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<Array<{ username: string; display_name: string | null }>>([]);
  const [showKeys, setShowKeys] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingG = useRef<number | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    setShowKeys(false);
  }, []);

  const go = useCallback(
    (path: string) => {
      close();
      if (location.pathname !== path) navigate(path);
    },
    [close, location.pathname, navigate],
  );

  // Anything in the app can open the palette with this event.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("bosley:palette", onOpen);
    return () => window.removeEventListener("bosley:palette", onOpen);
  }, []);

  // ---- global keys ---------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (open || mod || e.altKey || isTypingTarget(e.target)) return;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const room = ALL_ROOMS.find((r) => r.key === e.key);
        if (room) {
          e.preventDefault();
          go(room.path);
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 900);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowKeys(true);
        setOpen(true);
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        openComposer(navigate, location.pathname);
        return;
      }
      if (e.key === "j" || e.key === "k") {
        // Move between posts on any page that renders them as <article>.
        const posts = Array.from(document.querySelectorAll<HTMLElement>("main article"));
        if (posts.length === 0) return;
        e.preventDefault();
        const current = posts.findIndex((p) => p === document.activeElement || p.contains(document.activeElement));
        const next = e.key === "j" ? Math.min(posts.length - 1, current + 1) : Math.max(0, current - 1);
        const target = posts[current === -1 ? 0 : next];
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, open, go, navigate, location.pathname]);

  // ---- people lookup (debounced) ------------------------------------------
  useEffect(() => {
    const term = query.trim().replace(/^@/, "");
    if (!open || term.length < 2) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const like = `%${escapeLike(term)}%`;
      const { data } = await supabase
        .from("profiles")
        .select("username, display_name")
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .limit(5);
      if (!cancelled) setPeople(data ?? []);
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, open]);

  // ---- items ---------------------------------------------------------------
  const items: Item[] = useMemo(() => {
    const q = query.trim();
    const out: Item[] = [];
    const write: Item = {
      id: "write",
      group: "do",
      label: "write a post",
      hint: "n",
      icon: "write",
      run: () => {
        close();
        openComposer(navigate, location.pathname);
      },
    };
    if (score(q, "write a post compose new") >= 0) out.push(write);

    const rooms = ALL_ROOMS.map((r) => ({
      r,
      s: Math.max(score(q, r.label), ...(r.aliases ?? []).map((a) => score(q, a) - 5)),
    }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => (q ? b.s - a.s : 0));
    for (const { r } of rooms.slice(0, q ? 6 : 8)) {
      out.push({
        id: `go:${r.path}`,
        group: "go",
        label: r.label,
        hint: r.key ? `g ${r.key}` : undefined,
        icon: "go",
        run: () => go(r.path),
      });
    }
    for (const p of people) {
      out.push({
        id: `person:${p.username}`,
        group: "people",
        label: p.display_name ? `${p.display_name}  @${p.username}` : `@${p.username}`,
        icon: "person",
        run: () => go(`/user/${p.username}`),
      });
    }
    if (q.length >= 2) {
      out.push({
        id: "search",
        group: "search",
        label: `search posts for "${q}"`,
        icon: "search",
        run: () => {
          close();
          navigate(`/search?q=${encodeURIComponent(q)}`);
        },
      });
    }
    return out;
  }, [query, people, close, go, navigate, location.pathname]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  if (!user) return null;

  const groupTitle: Record<Item["group"], string> = { do: "do", go: "go to", people: "people", search: "search" };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-background/75 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-label="command palette"
          className="fixed left-1/2 top-[14vh] z-[71] w-[calc(100%-1.5rem)] max-w-[560px] max-h-[calc(86dvh-0.75rem)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-xl border border-foreground/10 bg-popover shadow-[0_40px_120px_-30px_hsl(0_0%_0%/0.9),inset_0_1px_0_hsl(220_20%_100%/0.06)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.985] data-[state=open]:slide-in-from-top-1 duration-150"
        >
          <DialogPrimitive.Title className="sr-only">command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">go anywhere, write, or find someone.</DialogPrimitive.Description>
          {showKeys ? (
            <div className="p-6">
              <p className="font-display text-[1.6rem] leading-none text-foreground mb-5">shortcuts</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-[13.5px] font-light">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k + v} className="contents">
                    <dt className="flex gap-1">
                      {k.split(" ").map((part) => (
                        <kbd key={part} className="kbd">{part}</kbd>
                      ))}
                    </dt>
                    <dd className="text-foreground/70 self-center">{v}</dd>
                  </div>
                ))}
              </dl>
              <button type="button" onClick={() => setShowKeys(false)} className="quiet mt-6 text-[13px]">
                back to the palette
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 h-14 border-b border-foreground/[0.08]">
                <Search className="w-4 h-4 text-foreground/40" aria-hidden />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="go anywhere, write, or find someone"
                  aria-label="command"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="palette-list"
                  aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
                  className="flex-1 bg-transparent outline-none text-[15px] font-light placeholder:text-foreground/35"
                />
                <kbd className="kbd">esc</kbd>
              </div>
              <div id="palette-list" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto py-2">
                {items.length === 0 && (
                  <p className="px-5 py-8 text-[14px] font-light text-foreground/45">nothing by that name.</p>
                )}
                {items.map((item, i) => {
                  const showGroup = i === 0 || items[i - 1].group !== item.group;
                  return (
                    <div key={item.id}>
                      {showGroup && <p className="eyebrow px-5 pt-3 pb-1.5">{groupTitle[item.group]}</p>}
                      <button
                        type="button"
                        id={`palette-${item.id}`}
                        role="option"
                        aria-selected={i === active}
                        data-index={i}
                        onMouseMove={() => setActive(i)}
                        onClick={item.run}
                        className={`w-full flex items-center gap-3 px-5 h-11 text-left text-[14.5px] font-light transition-colors ${
                          i === active ? "bg-foreground/[0.06] text-foreground" : "text-foreground/75"
                        }`}
                      >
                        <Icon kind={item.icon} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && i !== active && <span className="text-[11px] text-foreground/35 tracking-wide">{item.hint}</span>}
                        {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-foreground/45" aria-hidden />}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between px-5 h-10 border-t border-foreground/[0.08] text-[11.5px] font-light text-foreground/40">
                <span className="flex items-center gap-1.5">
                  <kbd className="kbd">↑</kbd>
                  <kbd className="kbd">↓</kbd> to move · <kbd className="kbd">↵</kbd> to open
                </span>
                <button type="button" onClick={() => setShowKeys(true)} className="hover:text-foreground/80 transition-colors">
                  shortcuts <kbd className="kbd ml-1">?</kbd>
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
