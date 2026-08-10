import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferredPrompt: InstallPromptEvent | null = null;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

export const InstallAppButton = ({ className }: { className?: string }) => {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(() => deferredPrompt);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      deferredPrompt = event as InstallPromptEvent;
      setPrompt(deferredPrompt);
    };
    const done = () => { deferredPrompt = null; setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); };
  }, []);
  if (installed) return null;

  const install = async () => {
    if (!prompt) {
      setShowHelp(true);
      return;
    }
    await prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") {
      deferredPrompt = null;
      setPrompt(null);
      setInstalled(true);
    }
  };

  return <div className={cn("relative z-50", className)}>
    <button onClick={install} className="flex min-h-10 items-center gap-2 rounded-full border border-primary/25 bg-card/95 px-3 text-xs font-semibold shadow-lg backdrop-blur transition hover:bg-secondary" aria-label="Install BeatBond" title="Install BeatBond">
      <Download className="size-4" /> Install app
    </button>
    {showHelp && <div role="dialog" aria-label="Install BeatBond" className="absolute right-0 top-12 w-72 rounded-2xl border bg-card p-4 text-sm shadow-2xl md:bottom-12 md:top-auto">
      <button onClick={() => setShowHelp(false)} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-secondary" aria-label="Close install instructions"><X className="size-4" /></button>
      <p className="pr-5 font-semibold">Install BeatBond</p>
      {isIos() ? <p className="mt-2 leading-5 text-muted-foreground">In Safari, tap <Share className="mx-1 inline size-4" /> Share, then choose <strong className="text-foreground">Add to Home Screen</strong>.</p> : <p className="mt-2 leading-5 text-muted-foreground">Use Chrome or Edge’s browser menu and select <strong className="text-foreground">Install BeatBond</strong>. The install prompt appears after the app is served over HTTPS.</p>}
    </div>}
  </div>;
};
