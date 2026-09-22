import path from "path";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
	// Packages can be hoisted differently by npm workspaces (notably on Render),
	// which may load two compatible Vite type copies. The plugins work at
	// runtime, but their nominal TypeScript types are then incompatible.
	plugins: [react(), VitePWA({
		registerType: "autoUpdate",
		// A deployment can replace hashed lazy chunks (ChatPage included). Claim
		// open clients and clear obsolete runtime entries immediately so users do
		// not keep an old shell that points at files which no longer exist.
		// Registration is handled in src/registerServiceWorker.ts so every open
		// client checks for a deployment promptly instead of waiting for the next
		// navigation or browser update cycle.
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
				{ urlPattern: ({ request }) => request.destination === "audio", handler: "CacheFirst", options: { cacheName: "beatbond-audio", expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } } },
				{ urlPattern: ({ request }) => request.destination === "image", handler: "StaleWhileRevalidate", options: { cacheName: "beatbond-images", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } } },
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
