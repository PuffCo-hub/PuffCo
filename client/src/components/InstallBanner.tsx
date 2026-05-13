import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  Plus,
  Share,
  X,
  Smartphone,
  Chrome,
  Apple,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Add-to-home-screen / install CTA. The previous version was easy to miss on
// mobile, so this card is intentionally prominent: a single big "Add to Home
// Screen" button that either fires the platform install prompt (Chrome on
// Android, beforeinstallprompt available) or opens a step-by-step modal with
// exact instructions for Android Chrome and iPhone Safari. We never tell users
// to enable unknown sources or download an APK — PuffGo is a web app.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function getPlatform(): "ios" | "android" | "desktop" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/macintosh|windows|linux/i.test(ua)) return "desktop";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
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
  const [helpOpen, setHelpOpen] = useState(false);

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
  if (platform === "desktop") return null;

  async function handlePrimary() {
    // Prefer the native install prompt when the browser handed us one.
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } finally {
        setDeferred(null);
        setDismissed(true);
      }
      return;
    }
    // Otherwise open the step-by-step modal — guaranteed to show even when
    // Chrome has not (yet) emitted beforeinstallprompt, which is the path that
    // failed for real users.
    setHelpOpen(true);
  }

  const ctaLabel =
    platform === "ios" ? "Add PuffGo to Home Screen" : "Install PuffGo";

  return (
    <>
      <div
        className="relative rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card p-4 mb-4 overflow-hidden shadow-md"
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
          <div className="size-11 rounded-2xl bg-primary/20 border border-primary/30 grid place-items-center shrink-0">
            <Smartphone className="size-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-bold">
              Save PuffGo to your phone
            </div>
            <div className="font-bold text-[15px] leading-tight mt-0.5">
              One tap to add the icon to your home screen.
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Works like a real app — no app store, no APK, just a shortcut.
            </p>
          </div>
        </div>

        <Button
          className="ember-button w-full h-12 mt-3 text-sm font-bold rounded-2xl"
          onClick={handlePrimary}
          data-testid="button-install-primary"
        >
          <Download className="size-4 mr-2" />
          {ctaLabel}
        </Button>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="mt-2 w-full text-[12px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          data-testid="button-install-instructions"
        >
          Show step-by-step instructions
        </button>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-install-instructions">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-primary" />
              Add PuffGo to your home screen
            </DialogTitle>
            <DialogDescription>
              PuffGo is a web app — there is no APK to download. Use your
              browser's built-in "Add to Home Screen" so the PuffGo icon sits
              on your home screen like any other app.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <section
              className="rounded-2xl border border-card-border bg-card/60 p-3"
              data-testid="section-instructions-android"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Chrome className="size-4 text-primary" />
                Android · Chrome
              </div>
              <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-1 leading-snug">
                <li>Open PuffGoDelivery.com in Chrome.</li>
                <li>
                  Tap the menu{" "}
                  <span className="font-semibold text-foreground">⋮</span> in the
                  top-right corner.
                </li>
                <li>
                  Choose{" "}
                  <span className="font-semibold text-foreground">
                    "Add to Home screen"
                  </span>{" "}
                  or{" "}
                  <span className="font-semibold text-foreground">
                    "Install app"
                  </span>
                  .
                </li>
                <li>Confirm — PuffGo appears on your home screen.</li>
              </ol>
            </section>

            <section
              className="rounded-2xl border border-card-border bg-card/60 p-3"
              data-testid="section-instructions-ios"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Apple className="size-4 text-primary" />
                iPhone · Safari
              </div>
              <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-1 leading-snug">
                <li>Open PuffGoDelivery.com in Safari.</li>
                <li>
                  Tap the Share icon{" "}
                  <Share className="inline size-3.5 -mt-0.5" /> in the bottom
                  toolbar.
                </li>
                <li>
                  Choose{" "}
                  <span className="font-semibold text-foreground">
                    "Add to Home Screen"
                  </span>{" "}
                  <Plus className="inline size-3.5 -mt-0.5" />.
                </li>
                <li>Tap Add — PuffGo lives on your home screen.</li>
              </ol>
            </section>

            <div
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[12px] leading-snug text-amber-100/90"
              data-testid="note-install-safety"
            >
              <span className="font-semibold text-amber-200">Safety note:</span>{" "}
              PuffGo never asks you to download an APK or change Android
              security settings. If a site offers a "PuffGo APK" or tells you to
              allow installs from unknown sources, it is not from us.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
