import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const COOKIE_CONSENT_KEY = "beatbond:cookie-consent:v1";

type Choice = { requiredStorage: true; mapbox: boolean; savedAt: string };

export const readCookieChoice = (): Choice | null => {
  try {
    const choice = JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY) || "null") as Partial<Choice> | null;
    return choice?.requiredStorage === true && typeof choice.mapbox === "boolean" ? choice as Choice : null;
  } catch {
    return null;
  }
};

export const cookieChoiceChanged = () => window.dispatchEvent(new Event("beatbond:cookie-choice-changed"));

const CookieConsentManager = () => {
  const [choice, setChoice] = useState<Choice | null>(() => readCookieChoice());
  const [open, setOpen] = useState(false);
  const [mapbox, setMapbox] = useState(false);

  useEffect(() => {
    const onOpen = () => { setMapbox(readCookieChoice()?.mapbox ?? false); setOpen(true); };
    const onChange = () => setChoice(readCookieChoice());
    window.addEventListener("beatbond:open-cookie-settings", onOpen);
    window.addEventListener("beatbond:cookie-choice-changed", onChange);
    return () => {
      window.removeEventListener("beatbond:open-cookie-settings", onOpen);
      window.removeEventListener("beatbond:cookie-choice-changed", onChange);
    };
  }, []);

  const save = (allowMapbox: boolean) => {
    const next: Choice = { requiredStorage: true, mapbox: allowMapbox, savedAt: new Date().toISOString() };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(next));
    setChoice(next);
    setOpen(false);
    cookieChoiceChanged();
  };

  return <>
    {!choice && !open && <aside className="fixed inset-x-3 bottom-28 z-[100] mx-auto max-w-2xl rounded-2xl border bg-card p-4 shadow-2xl md:bottom-4" aria-label="Cookie and service preferences">
      <h2 className="font-semibold">Your storage & service choices</h2>
      <p className="mt-1 text-sm text-muted-foreground">BeatBond uses required browser storage for sign-in, security, settings and playback. The Friends Map uses Mapbox, which receives your IP address and map requests. Analytics and advertising SDKs are not installed.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => save(false)}>Required only</Button>
        <Button size="sm" variant="outline" onClick={() => { setMapbox(false); setOpen(true); }}>Choose services</Button>
        <Link to="/privacy" className="ml-auto text-sm text-primary underline">Privacy Policy</Link>
      </div>
    </aside>}
    {open && <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="cookie-choice-title" className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl">
        <h2 id="cookie-choice-title" className="text-lg font-semibold">Storage and third-party services</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Required storage supports sign-in, security, saved settings and playback. It stays on. BeatBond does not use analytics or advertising cookies.</p>
        <div className="mt-4 rounded-xl border p-3">
          <p className="font-medium">Friends Map · Mapbox</p>
          <p className="mt-1 text-sm text-muted-foreground">Optional. When enabled and you open the map, Mapbox receives your IP address, map view and tile requests. Location sharing is a separate choice.</p>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={mapbox} onChange={(event) => setMapbox(event.target.checked)} />
            Allow Mapbox map requests
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Clerk authentication is required to sign in. You can change these choices anytime in Settings. See the <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => save(false)}>Required only</Button>
          <Button onClick={() => save(mapbox)}>Save choices</Button>
        </div>
      </section>
    </div>}
  </>;
};

export default CookieConsentManager;
