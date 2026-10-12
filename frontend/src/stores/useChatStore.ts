import { axiosInstance } from "@/lib/axios";
import { create } from "zustand";
import { RealtimeSocket } from "@/lib/realtimeSocket";

type MusicPrivacy = "everyone" | "friends" | "none";

interface ChatStore {
  socket: RealtimeSocket;
  isConnected: boolean;
  error: string | null;
  onlineUsers: Set<string>;
  userActivities: Map<string, string>;
  // Kept locally so a track selected while WebSocket is reconnecting can be
  // announced as soon as the connection is restored.
  currentActivity: string | null;
  musicPrivacy: MusicPrivacy;
  initSocket: (getToken: () => Promise<string | null>) => void;
  disconnectSocket: () => void;
  updateMusicPrivacy: (privacy: MusicPrivacy) => Promise<void>;
  updateCurrentActivity: (activity: string) => void;
}

const getSocketUrl = () => {
  const base = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") ||
    (import.meta.env.MODE === "development" ? "http://localhost:5002" : window.location.origin);
  const wsBase = base.replace(/^http:/, "ws:").replace(/^https:/, "wss:").replace(/\/$/, "");
  return `${wsBase}/ws`;
};

const socket = new RealtimeSocket(getSocketUrl());

let listenersAttached = false;

const attachSocketListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  socket.on("connect", () => {
    useChatStore.setState({ isConnected: true, error: null });
    socket.emit("client_visibility", { visible: document.visibilityState === "visible" });
    const activity = useChatStore.getState().currentActivity;
    if (activity) socket.emit("update_activity", { activity });
  });
  socket.on("disconnect", () => {
    useChatStore.setState({ isConnected: false, onlineUsers: new Set(), userActivities: new Map() });
  });
  socket.on("connect_error", (error) => {
    useChatStore.setState({ isConnected: false, error: error.message });
  });
  socket.on("users_online", (users: string[]) => {
    useChatStore.setState({ onlineUsers: new Set(users) });
  });
  socket.on("activities", (activities: [string, string][]) => {
    useChatStore.setState({ userActivities: new Map(activities) });
  });
  socket.on("user_connected", (userId: string) => {
    useChatStore.setState((state) => ({ onlineUsers: new Set([...state.onlineUsers, userId]) }));
  });
  socket.on("user_disconnected", (userId: string) => {
    useChatStore.setState((state) => {
      const onlineUsers = new Set(state.onlineUsers);
      onlineUsers.delete(userId);
      return { onlineUsers };
    });
  });
  socket.on("activity_updated", ({ userId, activity }: { userId: string; activity: string }) => {
    useChatStore.setState((state) => {
      const userActivities = new Map(state.userActivities);
      userActivities.set(userId, activity);
      return { userActivities };
    });
  });
  socket.on("activity_cleared", ({ userId }: { userId: string }) => {
    useChatStore.setState((state) => {
      const userActivities = new Map(state.userActivities);
      userActivities.delete(userId);
      return { userActivities };
    });
  });
};

export const useChatStore = create<ChatStore>((set, get) => ({
  socket,
  isConnected: false,
  error: null,
  onlineUsers: new Set(),
  userActivities: new Map(),
  currentActivity: null,
  musicPrivacy: "friends",

  initSocket: (tokenProvider) => {
    attachSocketListeners();
    if (!socket.connected) socket.connect(tokenProvider);
  },

  disconnectSocket: () => {
    socket.disconnect();
    set({ isConnected: false, error: null, onlineUsers: new Set(), userActivities: new Map(), currentActivity: null });
  },

  updateMusicPrivacy: async (privacy) => {
    await axiosInstance.patch("/users/music-privacy", { musicPrivacy: privacy });
    set({ musicPrivacy: privacy });
  },

  updateCurrentActivity: (activity) => {
    // "Idle" represents an absence of activity, not a track. Clear it so friends
    // immediately return to the online/offline state instead of seeing "listening".
    if (!activity.trim() || activity.trim().toLowerCase() === "idle") {
      set({ currentActivity: null });
      if (get().isConnected) socket.emit("clear_activity");
      return;
    }
    const currentActivity = activity.trim().slice(0, 500);
    set({ currentActivity });
    if (get().isConnected) socket.emit("update_activity", { activity: currentActivity });
  },
}));

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (socket.connected) socket.emit("client_visibility", { visible: document.visibilityState === "visible" });
  });
}
