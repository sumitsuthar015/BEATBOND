import path from "path";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
	// Packages can be hoisted differently by npm workspaces (notably on Render),
	// which may load two compatible Vite type copies. The plugins work at
	// runtime, but their nominal TypeScript types are then incompatible.
	plugins: [react(), VitePWA({
		// A new deployment installs and takes over in the background on its own.
		// The open app is not reloaded in front of the listener: it restarts onto
		// the new version only when it is in the background with no music
		// playing (src/registerServiceWorker.ts), and it preloads every lazy page
		// at startup (App.tsx) so it never needs a file the deployment removed.
		// Registration is handled in src/registerServiceWorker.ts so every open
		// client checks for a deployment promptly instead of waiting for the next
		// navigation or browser update cycle.
		registerType: "autoUpdate",
		injectRegister: false,
		workbox: {
			globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}"],
			cleanupOutdatedCaches: true,
			clientsClaim: true,
			skipWaiting: true,
			// Mood playlists must reflect the current curator. Do not let a failed
			// cold backend request silently reuse a week-old mood response.
			runtimeCaching: [
				{ urlPattern: /\/api\/songs\/mood\//, handler: "NetworkOnly" },
				// Search must be fresh and identical on web/mobile after deployment.
				{ urlPattern: /\/api\/saavn\/search(?:\/|$)/, handler: "NetworkOnly" },
				{ urlPattern: /\/api\/(songs|albums|playlists)/, handler: "NetworkFirst", options: { cacheName: "beatbond-library-api", networkTimeoutSeconds: 8, expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 14 }, cacheableResponse: { statuses: [0, 200] } } },
				// Audio deliberately bypasses the worker. Songs stream for minutes as
				// ranged (206) requests that a cache-first rule can't store anyway,
				// and a stream held open by the old worker blocked "Update now" until
				// the song ended. Downloads play from their own cache (offlineDownloads.ts).
				// Plain <img> loads only (no-cors). The player also loads the cover in
				// CORS mode to read its colours; handing that request a cached opaque
				// copy is rejected by the browser, so the cover failed to load.
				{ urlPattern: ({ request }) => request.destination === "image" && request.mode === "no-cors", handler: "StaleWhileRevalidate", options: { cacheName: "beatbond-images", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } } },
			],
		},
		includeAssets: ["favicon.ico", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png"],
		manifest: { name: "BeatBond", short_name: "BeatBond", description: "Your music library, ready online and offline.", theme_color: "#09090b", background_color: "#09090b", display: "standalone", start_url: "/", icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }, { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" }] },
	})] as any,
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		rollupOptions: {
			output: {
				// The 3D map library is large and rarely changes. In its own file its
				// name stays the same between deployments, so installed apps keep
				// their cached copy instead of downloading it again after every update.
				manualChunks: (id) => (id.includes("node_modules/mapbox-gl") ? "mapbox-gl" : undefined),
			},
		},
	},
	server: {
		port: 3000,
		proxy: {
			'/api': {
				target: 'http://localhost:5002', // Your backend URL
				changeOrigin: true,
			},
		},
	},
});
