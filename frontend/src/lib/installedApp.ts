/** True when BeatBond runs as an installed app rather than in a browser tab. */
export const isInstalledApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: window-controls-overlay)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** F5, Ctrl+R / Cmd+R and their hard-reload variants. */
export const isReloadShortcut = (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey">) =>
  event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r");

/**
 * An installed app should feel like an app: a stray reload restarts it and
 * stops the music. Updates arrive through the in-app "Update now" prompt, so
 * reload shortcuts are turned off there. Browser tabs keep normal behaviour.
 */
export const blockReloadInInstalledApp = () => {
  window.addEventListener("keydown", (event) => {
    if (isReloadShortcut(event) && isInstalledApp()) event.preventDefault();
  });
};
