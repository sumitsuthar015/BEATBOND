import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { axiosInstance } from "@/lib/axios";
import { toast } from "react-hot-toast";

const decodeKey = (key: string) => {
  const padded = `${key}${"=".repeat((4 - key.length % 4) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const PushNotificationSetting = () => {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!active) return;
      setSupported(Boolean(registration));
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription || Notification.permission !== "granted") return;

      // The browser can retain a subscription after the server DB has been
      // reset, or after this device signs into another account. Re-save it for
      // the currently authenticated user so push delivery can find it.
      try {
        await axiosInstance.post("/notifications/push/subscriptions", subscription.toJSON());
        if (active) setSubscribed(true);
      } catch {
        if (active) setSubscribed(false);
      }
    };
    void load().catch(() => undefined);
    return () => { active = false; };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser to enable message alerts.");
      const registration = await navigator.serviceWorker.ready;
      const { data } = await axiosInstance.get<{ publicKey: string }>("/notifications/push/public-key");
      if (!data.publicKey) throw new Error("Push notifications are not configured on the server yet.");
      // Reuse a browser subscription when one already exists. subscribe() can
      // reject with InvalidStateError in that case, and its existing endpoint
      // still needs to be synchronized with the current account on the server.
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(data.publicKey),
        });
      await axiosInstance.post("/notifications/push/subscriptions", subscription.toJSON());
      setSubscribed(true);
      toast.success("Device notifications enabled");
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message || "Couldn't enable device notifications");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await axiosInstance.delete("/notifications/push/subscriptions", { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Device notifications disabled");
    } catch {
      toast.error("Couldn't disable device notifications");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-xl bg-amber-500/15 p-2 text-amber-500"><BellRing className="size-4" /></span>
        <div><p className="text-sm font-medium">Device notifications</p><p className="text-xs text-muted-foreground">Alerts when BeatBond is in the background or closed.</p></div>
      </div>
      <Button size="sm" variant={subscribed ? "secondary" : "default"} disabled={!supported || busy} onClick={() => void (subscribed ? disable() : enable())}>
        {!supported ? "Unavailable" : busy ? "Please wait…" : subscribed ? "Turn off" : "Enable"}
      </Button>
    </div>
  );
};
