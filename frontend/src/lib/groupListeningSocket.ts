import { io, type Socket } from "socket.io-client";

export type GroupSocket = Socket;

export const createGroupSocket = (getToken: () => Promise<string | null>) => {
  const configured = import.meta.env.VITE_API_URL;
  const origin = configured
    ? configured.replace(/\/api\/?$/, "").replace(/\/$/, "")
    : import.meta.env.MODE === "development" ? "http://localhost:5002" : window.location.origin;
  return io(origin, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    auth: async (callback) => callback({ token: await getToken() }),
    reconnection: true,
  });
};

export const estimateServerOffset = async (socket: GroupSocket) => {
  let best: { rtt: number; offset: number } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const startedAt = Date.now();
    const response = await new Promise<{ serverTime: number } | undefined>((resolve) => {
      const timeout = window.setTimeout(() => resolve(undefined), 2_000);
      socket.emit("time:ping", {}, (result: { serverTime: number }) => {
        window.clearTimeout(timeout);
        resolve(result);
      });
    });
    const endedAt = Date.now();
    if (response && Number.isFinite(response.serverTime)) {
      const sample = { rtt: endedAt - startedAt, offset: response.serverTime - (startedAt + endedAt) / 2 };
      if (!best || sample.rtt < best.rtt) best = sample;
    }
  }
  return best?.offset ?? 0;
};
