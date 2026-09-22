const UPDATE_CHECK_INTERVAL_MS = 60_000;

export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  let reloadingForUpdate = false;
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      const checkForUpdate = () => void registration.update().catch(() => undefined);
      window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      window.addEventListener("focus", checkForUpdate);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
      checkForUpdate();

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            // The generated worker calls skipWaiting/clientsClaim. Reloading
            // here moves the open page onto its new hashed asset set at once.
            reloadingForUpdate = true;
          }
        });
      });
    })
    .catch(() => undefined);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) window.location.reload();
  });
};
