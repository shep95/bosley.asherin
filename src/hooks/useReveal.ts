import { useEffect, useRef } from "react";

/**
 * Adds `is-visible` to `.reveal` descendants (and the root itself) the first
 * time they enter the viewport. CSS in index.css does the animating, so this
 * costs one IntersectionObserver per section and zero JavaScript per frame.
 * Elements already in view on mount reveal on the next frame, so the first
 * paint is never blank.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(margin = "-60px") {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = [root, ...Array.from(root.querySelectorAll<HTMLElement>(".reveal"))].filter((el) =>
      el.classList.contains("reveal"),
    );
    if (targets.length === 0) return;

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: `0px 0px ${margin} 0px`, threshold: 0.01 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [margin]);

  return ref;
}
