/**
 * Shared className strings for the Obsidian-style segmented pill tabs used
 * across feed pages. Apply to shadcn <TabsList> and <TabsTrigger>.
 */
export const pillTabsListClass =
  "p-1 glass-inset rounded-xl flex items-center gap-1 w-full h-auto";

export const pillTabsTriggerClass =
  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ease-soft text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] data-[state=active]:bg-foreground/[0.12] data-[state=active]:text-foreground data-[state=active]:shadow-card";