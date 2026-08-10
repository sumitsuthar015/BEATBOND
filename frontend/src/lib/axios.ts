import axios from "axios";

type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;

// Clerk refreshes session tokens. Resolving the token immediately before each
// protected request prevents requests made during app startup from using a
// missing or expired default header.
export const setAuthTokenProvider = (provider: TokenProvider | null) => {
	tokenProvider = provider;
};

const getBaseUrl = () => {
	if (import.meta.env.VITE_API_URL) {
		const url = import.meta.env.VITE_API_URL.replace(/\/$/, "");
		return url.endsWith("/api") ? url : `${url}/api`;
	}
	return import.meta.env.MODE === "development" ? "http://localhost:5002/api" : "/api";
};

export const axiosInstance = axios.create({
	baseURL: getBaseUrl(),
	headers: {
		"Content-Type": "application/json",
	},
});

// Add request interceptor to attach fresh Clerk auth token dynamically
axiosInstance.interceptors.request.use(
	async (config) => {
		if (tokenProvider || (typeof window !== "undefined" && (window as any).Clerk?.session)) {
			try {
				const token = tokenProvider
					? await tokenProvider()
					: await (window as any).Clerk.session.getToken();
				if (token) {
					config.headers.Authorization = `Bearer ${token}`;
				}
			} catch {
				// Use existing Authorization header if token fetch fails
			}
		}
		return config;
	},
	(error) => Promise.reject(error)
);

// Add response interceptor for error handling
axiosInstance.interceptors.response.use(
	response => response,
	error => {
		if (error.response?.status === 401) {
			delete axiosInstance.defaults.headers.common["Authorization"];
		}
		return Promise.reject(error);
	}
);

