import { usePlayerStore } from "@/stores/usePlayerStore";

const UPDATE_CHECK_INTERVAL_MS = 60_000;

// A new deployment installs and takes over in the background by itself
// (skipWaiting + clientsClaim in vite.config.ts). The page that is already open
// keeps running until it can restart onto the new version without anyone
// noticing: the app is in the background and no music is playing. It never
// reloads in front of the listener or in the middle of a song.
let newVersionActive = false;

// Music counts as playing if the player means to play (it stays "playing"
// while it moves from a finished song to the next) or the audio element is
// actually playing. Either one alone would restart the app between two songs
// of a background listening session.
const musicIsPlaying = () => {
	if (usePlayerStore.getState().isPlaying) return true;
	const audio = document.getElementById("global-audio-player") as HTMLAudioElement | null;
	return Boolean(audio && !audio.paused && !audio.ended);
};

const restartIfUnnoticed = () => {
	if (!newVersionActive) return;
	if (document.visibilityState !== "hidden") return;
	if (musicIsPlaying()) return;
	window.location.reload();
};

export const registerServiceWorker = () => {
	if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

	// The very first install also changes the controller, but that isn't an
	// update. Compare with the controller just before each change: a snapshot
	// taken at page load missed every update in the session of the first visit.
	let controller = navigator.serviceWorker.controller;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		const previous = controller;
		controller = navigator.serviceWorker.controller;
		if (!previous) return;
		newVersionActive = true;
		restartIfUnnoticed();
	});
	document.addEventListener("visibilitychange", restartIfUnnoticed);
	usePlayerStore.subscribe((state, previous) => {
		if (previous.isPlaying && !state.isPlaying) restartIfUnnoticed();
	});
	// Media events don't bubble, so listen in the capture phase for the player's.
	document.addEventListener("pause", restartIfUnnoticed, true);

	navigator.serviceWorker
		.register("/sw.js", { scope: "/", updateViaCache: "none" })
		.then((registration) => {
			// Look for a deployment regularly and whenever the app comes back into
			// view, so an installed app that stays open still picks it up.
			const checkForUpdate = () => void registration.update().catch(() => undefined);
			window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
			window.addEventListener("focus", checkForUpdate);
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") checkForUpdate();
			});
			checkForUpdate();
		})
		.catch(() => undefined);
};
