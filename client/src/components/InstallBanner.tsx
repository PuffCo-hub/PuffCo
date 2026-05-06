import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Plus, Share, X, Smartphone } from "lucide-react";

// Detects platform + Android beforeinstallprompt support, and renders an
// appropriate "Save PuffGo to your phone" card. The dismissed state lives only
// in React state for this session — the sandboxed iframe blocks localStorage,
// so we deliberately don't persist the dismissal across reloads.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function getPlatform(): "ios" | "android" | "desktop" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  // iPhone / iPad — Safari is what we care about for Add to Home Screen.
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/macintosh|windows|linux/i.test(ua)) return "desktop";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses navigator.standalone; the rest use display-mode.
  const navStandalone = (window.navigator as any).standalone === true;
  const matchStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return navStandalone || matchStandalone;
}

export function InstallBanner() {
  const [platform] = useState(() => getPlatform());
  const [installed] = useState(() => isStandalone());
  const [dismissed, setDismissed] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    function onBeforeInstall(ev: Event) {
      ev.preventDefault();
      setDeferred(ev as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall as any);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall as any);
  }, []);

  if (installed || dismissed) return null;
  // Don't bug desktop users with a phone install prompt.
  if (platform === "desktop") return null;

  async function triggerAndroidInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setDismissed(true);
    }
  }

  return (
    <div
      className="relative rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card to-card p-4 mb-4 overflow-hidden"
      data-testid="banner-install"
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 size-7 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover-elevate"
        aria-label="Dismiss install prompt"
        data-testid="button-dismiss-install"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl bg-primary/15 border border-primary/25 grid place-items-center shrink-0">
          <Smartphone className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold">
            Save PuffGo to your phone
          </div>
          <div className="font-semibold text-sm leading-tight mt-0.5">
            Add to home screen for one-tap reordering
          </div>

          {platform === "ios" ? (
            <>
              <p className="text-xs text-muted-foreground mt-2 leading-snug">
                In Safari, tap the <span className="font-semibold text-foreground">Share</span>{" "}
                button <Share className="inline size-3.5 -mt-0.5" />, then choose{" "}
                <span className="font-semibold text-foreground">"Add to Home Screen"</span>{" "}
                <Plus className="inline size-3.5 -mt-0.5" />.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8"
                onClick={() => setShowIosHint((s) => !s)}
                data-testid="button-ios-hint-toggle"
              >
                {showIosHint ? "Hide" : "Show"} step-by-step
              </Button>
              {showIosHint ? (
                <ol className="mt-2 text-[11px] text-muted-foreground list-decimal pl-4 space-y-1">
                  <li>Tap the Share icon in Safari's bottom toolbar.</li>
                  <li>Scroll and tap "Add to Home Screen".</li>
                  <li>Tap "Add" — PuffGo lives on your home screen.</li>
                </ol>
              ) : null}
            </>
          ) : platform === "android" ? (
            <>
              {deferred ? (
                <>
                  <p className="text-xs text-muted-foreground mt-2 leading-snug">
                    Install PuffGo as an app for faster reorders, offline access to your last
                    cart, and home-screen launch.
                  </p>
                  <Button
                    size="sm"
                    className="ember-button mt-3 h-9"
                    onClick={triggerAndroidInstall}
                    data-testid="button-install-android"
                  >
                    <Download className="size-4 mr-1.5" />
                    Install app
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-2 leading-snug">
                  In Chrome, tap the <span className="font-semibold text-foreground">⋮</span>{" "}
                  menu and choose{" "}
                  <span className="font-semibold text-foreground">"Add to Home screen"</span> /
                  "Install app".
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground mt-2 leading-snug">
              Open your browser menu and choose "Add to Home Screen" / "Install" to keep PuffGo
              one tap away.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
