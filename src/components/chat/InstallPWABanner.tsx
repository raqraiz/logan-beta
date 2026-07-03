import { useEffect, useState } from "react";
import { Smartphone, X, Share, MoreVertical } from "lucide-react";

interface InstallPWABannerProps {
  userId: string;
}

const STORAGE_KEY = "logan_install_pwa_banner_dismissed_v1";

type Platform = "ios" | "android";

function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobi/i.test(ua);
  if (!isMobile) return null;
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return null;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari legacy
  const iosStandalone = (window.navigator as any).standalone === true;
  return !!(mm || iosStandalone);
}

/**
 * One-time dismissible banner prompting mobile users to add Logan to
 * their home screen. Hidden on desktop, when already installed as PWA,
 * or once dismissed.
 */
export function InstallPWABanner({ userId }: InstallPWABannerProps) {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (isStandalone()) return;
    const p = detectPlatform();
    if (!p) return;
    const dismissed = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (dismissed) return;
    setPlatform(p);
    setVisible(true);
  }, [userId]);

  const dismiss = () => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, "1");
    setVisible(false);
  };

  if (!visible || !platform) return null;

  const steps =
    platform === "ios"
      ? [
          <>Tap the <Share className="inline w-3.5 h-3.5 mx-0.5 -mt-0.5" /> Share icon in Safari</>,
          <>Select <span className="font-medium text-foreground">"Add to Home Screen"</span></>,
          <>Tap <span className="font-medium text-foreground">Add</span></>,
        ]
      : [
          <>Tap the <MoreVertical className="inline w-3.5 h-3.5 mx-0.5 -mt-0.5" /> three dots in your browser</>,
          <>Select <span className="font-medium text-foreground">"Add to Home Screen"</span> or <span className="font-medium text-foreground">"Install app"</span></>,
          <>Tap <span className="font-medium text-foreground">Install</span></>,
        ];

  return (
    <div className="relative rounded-2xl border-l-4 border-l-primary border border-primary/20 bg-gradient-to-br from-primary/10 via-card/40 to-card/20 backdrop-blur-sm p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500 font-quicksand">
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Smartphone className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              📱 Add Logan to your home screen
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Tap below for the full app experience — no browser bar, no tabs, just Logan.
            </p>
          </div>
          <ol className="text-xs text-muted-foreground space-y-1 pl-4 list-decimal marker:text-primary/70">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <button
            onClick={dismiss}
            className="text-xs text-primary hover:text-primary/80 transition-colors mt-1 underline underline-offset-2"
          >
            Got it, don't show again
          </button>
        </div>
      </div>
    </div>
  );
}
