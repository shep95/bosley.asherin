/**
 * Every room in the signed-in app, in one place. The sidebar, the command
 * palette and the keyboard shortcuts all read from this list, so a new page
 * shows up everywhere at once.
 */
export type Room = {
  label: string;
  path: string;
  /** Second key after "g" (g then f = feed). */
  key?: string;
  badge?: "messages" | "notifications";
  /** Extra words the palette should match on. */
  aliases?: string[];
};

export type RoomGroup = { title: string; rooms: Room[] };

export const ROOM_GROUPS: RoomGroup[] = [
  {
    title: "read",
    rooms: [
      { label: "feed", path: "/dashboard", key: "f", aliases: ["home", "timeline"] },
      { label: "explore", path: "/explore", key: "e", aliases: ["discover", "trending"] },
      { label: "search", path: "/search", key: "s", aliases: ["find"] },
    ],
  },
  {
    title: "talk",
    rooms: [
      { label: "messages", path: "/messages", key: "m", badge: "messages", aliases: ["dm", "inbox", "chat"] },
      { label: "notifications", path: "/notifications", key: "n", badge: "notifications", aliases: ["alerts", "activity"] },
    ],
  },
  {
    title: "keep",
    rooms: [
      { label: "bookmarks", path: "/bookmarks", key: "b", aliases: ["saved"] },
      { label: "lists", path: "/lists", key: "l" },
      { label: "communities", path: "/communities", key: "c", aliases: ["groups"] },
      { label: "events", path: "/events", aliases: ["calendar events"] },
    ],
  },
  {
    title: "make",
    rooms: [
      { label: "drafts", path: "/drafts", key: "d" },
      { label: "threads", path: "/compose/thread", aliases: ["thread composer"] },
      { label: "templates", path: "/templates" },
      { label: "scheduled", path: "/scheduled", aliases: ["queue"] },
      { label: "calendar", path: "/calendar" },
      { label: "analytics", path: "/analytics", key: "a", aliases: ["stats", "insights"] },
      { label: "automations", path: "/rules", aliases: ["rules"] },
    ],
  },
  {
    title: "you",
    rooms: [
      { label: "profile", path: "/profile", key: "p", aliases: ["me", "member card"] },
      { label: "settings", path: "/settings", key: ",", aliases: ["preferences", "privacy", "security", "two-factor", "export", "delete account"] },
      { label: "sponsors", path: "/sponsors" },
      { label: "install", path: "/install", aliases: ["app"] },
    ],
  },
];

export const ALL_ROOMS: Room[] = ROOM_GROUPS.flatMap((g) => g.rooms);

/** Open the composer from anywhere (the feed listens for this event). */
export function openComposer(navigate: (to: string, opts?: { state?: unknown }) => void, pathname: string) {
  if (pathname !== "/dashboard") navigate("/dashboard", { state: { compose: true } });
  else window.dispatchEvent(new CustomEvent("bosley:compose"));
}
