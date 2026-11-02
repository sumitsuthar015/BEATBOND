import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter } from "react-router-dom";
import AuthProvider from "./providers/AuthProvider.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerServiceWorker } from "./registerServiceWorker.ts";
import { blockReloadInInstalledApp } from "./lib/installedApp.ts";
import * as Sentry from "@sentry/react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
	throw new Error("Missing Publishable Key");
}

if (import.meta.env.VITE_SENTRY_DSN) {
	Sentry.init({
		dsn: import.meta.env.VITE_SENTRY_DSN,
		environment: import.meta.env.MODE,
	});
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: false,
			staleTime: 30_000,
			gcTime: 10 * 60_000,
		},
	},
});

registerServiceWorker();
blockReloadInInstalledApp();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl='/'>
			<QueryClientProvider client={queryClient}>
				<AuthProvider>
					<BrowserRouter>
						<Sentry.ErrorBoundary fallback={<main role="alert" className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-bold">BeatBond ran into a problem</h1><p className="mt-2 text-sm text-muted-foreground">Reload the app to continue.</p><button type="button" className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => window.location.reload()}>Reload</button></div></main>}>
							<App />
						</Sentry.ErrorBoundary>
					</BrowserRouter>
				</AuthProvider>
			</QueryClientProvider>
		</ClerkProvider>
	</StrictMode>
);
