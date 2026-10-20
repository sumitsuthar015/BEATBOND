import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useChatStore } from "@/stores/useChatStore";

interface IncomingNotification {
	_id?: string;
	type?: string;
	message?: string;
	metadata?: { senderId?: string };
	sender?: { clerkId?: string; fullName?: string; imageUrl?: string };
}

export const IncomingMessagePopup = () => {
	const socket = useChatStore((state) => state.socket);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [notification, setNotification] = useState<IncomingNotification | null>(null);
	const timeoutRef = useRef<number | null>(null);

	useEffect(() => {
		const receiveNotification = (incoming: IncomingNotification) => {
			if (incoming?.type !== "message") return;
			setNotification(incoming);
			void queryClient.invalidateQueries({ queryKey: ["notifications"] });
			if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
			timeoutRef.current = window.setTimeout(() => setNotification(null), 8000);
		};

		socket.on("notificationReceived", receiveNotification);
		return () => {
			socket.off("notificationReceived", receiveNotification);
			if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
		};
	}, [queryClient, socket]);

	if (!notification) return null;

	const senderId = notification.sender?.clerkId || notification.metadata?.senderId;
	const senderName = notification.sender?.fullName || "New message";

	const openChat = () => {
		if (!senderId) return;
		setNotification(null);
		if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
		navigate(`/chat?userId=${encodeURIComponent(senderId)}`);
	};

	return (
		<div className="fixed left-1/2 top-3 z-[200] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 sm:top-5" role="status" aria-live="polite">
			<div className="flex items-start gap-2 rounded-2xl border border-[#B266FF]/40 bg-card/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
				<button
					type="button"
					onClick={openChat}
					className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#B266FF]"
					aria-label={`Open chat with ${senderName}`}
				>
					<Avatar className="size-11 shrink-0 border border-[#B266FF]/40">
						<AvatarImage src={notification.sender?.imageUrl} alt="" />
						<AvatarFallback className="bg-[#B266FF]/15 text-[#E5CCFF]">
							{senderName.slice(0, 1).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm font-semibold text-foreground">{senderName}</span>
						<span className="mt-0.5 block break-words text-sm text-muted-foreground line-clamp-2">{notification.message || "Sent you a message"}</span>
					</span>
				</button>
				<button
					type="button"
					onClick={() => setNotification(null)}
					className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
					aria-label="Dismiss message notification"
				>
					<X className="size-4" />
				</button>
			</div>
		</div>
	);
};
