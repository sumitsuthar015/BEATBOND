import { axiosInstance, setAuthTokenProvider } from "@/lib/axios";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import { useAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { Music } from "lucide-react";
import { useEffect, useState } from "react";
import { setActiveListener } from "@/lib/listeningHistory";

const updateApiToken = (token: string | null) => {
	if (token) axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
	else delete axiosInstance.defaults.headers.common["Authorization"];
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
	const { getToken, userId } = useAuth();
	const [loading, setLoading] = useState(true);
	const checkAdminStatus = useAuthStore((state) => state.checkAdminStatus);
	const initSocket = useChatStore((state) => state.initSocket);
	const disconnectSocket = useChatStore((state) => state.disconnectSocket);
	const socket = useChatStore((state) => state.socket);
	const queryClient = useQueryClient();

	useEffect(() => {
		const refreshLiveData = ({ resource, actorId }: { resource: string; actorId: string | null }) => {
			// React Query only refetches visible queries here, so a background update
			// does not trigger unnecessary requests for screens the user is not viewing.
			void queryClient.invalidateQueries({ refetchType: "active" });

			if (resource === "admin") {
				void useMusicStore.getState().fetchSongs();
				void useMusicStore.getState().fetchAlbums();
			}
			if (resource === "playlists") {
				void usePlaylistStore.getState().fetchPlaylists();
			}
			if (resource === "songs" && actorId === userId) {
				void useMusicStore.getState().fetchLikedSongs();
			}
		};

		socket.on("data_updated", refreshLiveData);
		return () => {
			socket.off("data_updated", refreshLiveData);
		};
	}, [queryClient, socket, userId]);

	useEffect(() => {
		setActiveListener(userId || null);
		setAuthTokenProvider(getToken);
		const initAuth = async () => {
			try {
				const token = await getToken();
				updateApiToken(token);
				if (token) {
					// Run admin check asynchronously so app load is not blocked
					void checkAdminStatus();
					// Pass the getter rather than this one token. Socket.IO calls it for
					// every reconnect, keeping the handshake valid after Clerk refreshes
					// the session token.
					initSocket(getToken);
				}
			} catch (error: any) {
				updateApiToken(null);
				console.log("Error in auth provider", error);
			} finally {
				setLoading(false);
			}
		};

		initAuth();

		// clean up
		return () => {
			setAuthTokenProvider(null);
			disconnectSocket();
		};
	}, [getToken, userId, checkAdminStatus, initSocket, disconnectSocket]);

	if (loading)
		return (
			<div className='h-screen w-full flex items-center justify-center bg-background'>
				<div className='flex flex-col items-center gap-4'>
					<div className='relative'>
						<Music className='size-12 text-primary animate-bounce' />
						<div className='absolute -right-3 -top-3'>
							<span className='block size-3 rounded-full bg-primary/80 animate-ping' />
						</div>
						<div className='absolute -left-3 -bottom-3'>
							<span className='block size-3 rounded-full bg-primary/80 animate-ping delay-150' />
						</div>
					</div>
				</div>
			</div>
		);

	return <>{children}</>;
};
export default AuthProvider;
