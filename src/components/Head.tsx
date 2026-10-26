import { Children, Fragment, isValidElement, useLayoutEffect, type ReactElement, type ReactNode } from "react";

/**
 * A 60-line replacement for react-helmet-async: `<Helmet>` with <title>,
 * <meta> and <link> children, written straight into document.head and
 * restored on unmount. Same JSX as before, about 10 KB less in the entry
 * chunk that every cold visit downloads.
 */
type Tag = { tag: "title" | "meta" | "link"; attrs: Record<string, string>; text?: string };

const ATTR_ALIASES: Record<string, string> = { httpEquiv: "http-equiv", charSet: "charset", hrefLang: "hreflang" };

function collect(children: ReactNode, out: Tag[]) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<Record<string, unknown> & { children?: ReactNode }>;
    if (el.type === Fragment) return collect(el.props.children, out);
    if (el.type === "title") {
      out.push({ tag: "title", attrs: {}, text: Children.toArray(el.props.children).join("") });
      return;
    }
    if (el.type === "meta" || el.type === "link") {
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.props)) {
        if (k === "children" || v == null || v === false) continue;
        attrs[ATTR_ALIASES[k] ?? k] = String(v);
      }
      out.push({ tag: el.type, attrs });
    }
  });
}

function selectorFor(t: Tag): string | null {
  if (t.tag === "meta") {
    if (t.attrs.name) return `meta[name="${t.attrs.name}"]`;
    if (t.attrs.property) return `meta[property="${t.attrs.property}"]`;
    if (t.attrs["http-equiv"]) return `meta[http-equiv="${t.attrs["http-equiv"]}"]`;
    return null;
  }
  if (t.tag === "link" && t.attrs.rel === "canonical") return `link[rel="canonical"]`;
  return null;
}

export function Helmet({ children }: { children?: ReactNode }) {
  const tags: Tag[] = [];
  collect(children, tags);
  const signature = JSON.stringify(tags);

  useLayoutEffect(() => {
    const parsed: Tag[] = JSON.parse(signature);
    const restores: Array<() => void> = [];
    for (const t of parsed) {
      if (t.tag === "title") {
        const prev = document.title;
        document.title = t.text ?? "";
        restores.push(() => { document.title = prev; });
        continue;
      }
      const sel = selectorFor(t);
      const existing = sel ? (document.head.querySelector(sel) as HTMLElement | null) : null;
      if (existing) {
        const prev = Object.fromEntries(Object.keys(t.attrs).map((k) => [k, existing.getAttribute(k)]));
        for (const [k, v] of Object.entries(t.attrs)) existing.setAttribute(k, v);
        restores.push(() => {
          for (const [k, v] of Object.entries(prev)) {
            if (v == null) existing.removeAttribute(k);
            else existing.setAttribute(k, v);
          }
        });
      } else {
        const node = document.createElement(t.tag);
        for (const [k, v] of Object.entries(t.attrs)) node.setAttribute(k, v);
        document.head.appendChild(node);
        restores.push(() => node.remove());
      }
    }
    return () => { for (let i = restores.length - 1; i >= 0; i--) restores[i](); };
  }, [signature]);

  return null;
}

export default Helmet;
