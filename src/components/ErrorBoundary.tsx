import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_GUARD_KEY = "bosley:chunk-reload";
// One automatic reload per window: a chunk that is still missing after the
// reload gets the manual button instead of a reload loop.
const RELOAD_WINDOW_MS = 60_000;

/** A lazy route whose chunk vanished after a deploy, or a dropped connection mid-fetch. */
const isChunkLoadError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: string; message?: string };
  return (
    name === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed/i.test(
      message ?? ""
    )
  );
};

/** True when an automatic reload already happened in this tab recently. */
const readGuard = (): boolean => {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    return Number.isFinite(at) && Date.now() - at < RELOAD_WINDOW_MS;
  } catch {
    return true; // no storage: never risk a reload loop
  }
};

const writeGuard = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    else sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    /* noop */
  }
};

interface Props {
  children: ReactNode;
  /** When this changes (e.g. the route path), a caught error is cleared. */
  resetKey?: string;
}

interface State {
  error: unknown;
  reloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error) && !readGuard()) {
      writeGuard(true);
      this.setState({ reloading: true });
      window.location.reload();
      return;
    }
    if (import.meta.env.DEV) {
      console.error("route error", error, info.componentStack);
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, reloading: false });
    }
  }

  private handleReload = () => {
    writeGuard(false);
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.reloading) {
      return <div className="min-h-screen bg-background" aria-busy="true" aria-label="loading" />;
    }

    const chunk = isChunkLoadError(this.state.error);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6" role="alert">
        <div className="max-w-sm text-center space-y-4">
          <p className="text-sm font-light text-foreground">
            {chunk ? "a new version is out. reload to pick it up." : "something broke on this page."}
          </p>
          <p className="text-xs font-light text-muted-foreground">your posts and messages are safe.</p>
          <button
            type="button"
            onClick={this.handleReload}
            className="text-sm font-light text-signal hover:underline underline-offset-4"
          >
            reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
