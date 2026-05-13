import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Smartphone,
  Share,
  Plus,
  Download,
  ShieldCheck,
  Chrome,
  Apple,
} from "lucide-react";

// Customer-facing "Install safely" help. This intentionally does NOT instruct
// users to enable Android "Install from unknown sources" or sideload an APK —
// PuffGo is a web app (PWA) and the safe install path is the browser's
// built-in Add to Home Screen / Install flow. If the page receives a
// `beforeinstallprompt` event (Chrome on Android), we surface a one-tap
// "Install PuffGo" button that triggers the platform's vetted install UI.

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

export function InstallHelp({
  triggerClassName,
  triggerLabel = "Install safely",
}: {
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [platform] = useState(() => getPlatform());
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onBeforeInstall(ev: Event) {
      ev.preventDefault();
      setDeferred(ev as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall as any);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstall as any,
      );
  }, []);

  async function triggerNativeInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={
            triggerClassName ||
            "inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 underline-offset-2 hover:underline"
          }
          data-testid="button-install-help"
        >
          <Smartphone className="size-3.5" />
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="dialog-install-help">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            Install PuffGo safely
          </DialogTitle>
          <DialogDescription>
            PuffGo is a web app — there is no APK to download. Use your browser's
            built-in "Add to Home Screen" so it works exactly like an installed app.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {deferred && platform === "android" ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-primary">
                One-tap install
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Chrome on this device supports a direct install. Tap below and
                confirm Chrome's prompt.
              </p>
              <Button
                size="sm"
                className="ember-button mt-2 h-9"
                onClick={triggerNativeInstall}
                data-testid="button-install-help-native"
              >
                <Download className="size-4 mr-1.5" />
                Install PuffGo
              </Button>
            </div>
          ) : null}

          <section
            className="rounded-2xl border border-card-border bg-card/60 p-3"
            data-testid="section-install-android"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Chrome className="size-4 text-primary" />
              Android · Chrome
            </div>
            <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-1 leading-snug">
              <li>
                Open{" "}
                <span className="font-semibold text-foreground">
                  PuffGoDelivery.com
                </span>{" "}
                in Chrome.
              </li>
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
            data-testid="section-install-ios"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Apple className="size-4 text-primary" />
              iPhone · Safari
            </div>
            <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-1 leading-snug">
              <li>
                Open{" "}
                <span className="font-semibold text-foreground">
                  PuffGoDelivery.com
                </span>{" "}
                in Safari.
              </li>
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
            <span className="font-semibold text-amber-200">
              Safety note:
            </span>{" "}
            PuffGo never asks you to download an APK or change Android security
            settings. If a site offers a "PuffGo APK" or tells you to allow
            installs from unknown sources, it is not from us — close it and
            install only through your browser using the steps above.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
