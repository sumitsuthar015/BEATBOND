type Listener = (payload?: any) => void;
type Outbound = { type: string; payload: Record<string, any>; requestId: string; generation: number };

/** A tiny event facade over the browser WebSocket API used by existing views. */
export class RealtimeSocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private pendingMessages = new Map<string, Outbound>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private generation = 0;
  private manuallyClosed = false;
  private isReady = false;
  private awaitingPong = false;
  private tokenProvider: (() => Promise<string | null>) | null = null;

  constructor(private readonly url: string) {}

  get connected() { return this.isReady && this.ws?.readyState === WebSocket.OPEN; }

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener?: Listener) {
    if (!listener) this.listeners.delete(event);
    else {
      const listeners = this.listeners.get(event);
      listeners?.delete(listener);
      if (!listeners?.size) this.listeners.delete(event);
    }
    return this;
  }

  private dispatch(event: string, payload?: any) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  connect(tokenProvider: () => Promise<string | null>) {
    this.tokenProvider = tokenProvider;
    this.manuallyClosed = false;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.open();
  }

  disconnect() {
    this.manuallyClosed = true;
    this.isReady = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
    this.ws?.close(1000, "Client disconnected");
    this.ws = null;
    this.pendingMessages.clear();
    this.awaitingPong = false;
  }

  emit(event: string, payload: any = {}) {
    if (event === "sendMessage") {
      const clientMessageId = typeof payload.clientMessageId === "string" && payload.clientMessageId
        ? payload.clientMessageId
        : crypto.randomUUID();
      const message = { ...payload, clientMessageId };
      const item: Outbound = { type: event, payload: message, requestId: crypto.randomUUID(), generation: -1 };
      this.pendingMessages.set(clientMessageId, item);
      this.flushMessages();
      return;
    }
    if (this.connected) this.send({ type: event, payload, requestId: crypto.randomUUID() });
  }

  private send(packet: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(packet));
  }

  private flushMessages() {
    if (!this.connected) return;
    for (const item of this.pendingMessages.values()) {
      if (item.generation === this.generation) continue;
      item.generation = this.generation;
      this.send(item);
    }
  }

  private open() {
    if (this.manuallyClosed || !this.tokenProvider) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", async () => {
      try {
        const token = await this.tokenProvider?.();
        if (!token || this.ws !== ws || ws.readyState !== WebSocket.OPEN) throw new Error("Missing authentication token");
        ws.send(JSON.stringify({ type: "authenticate", payload: { token, visible: document.visibilityState === "visible" } }));
      } catch (error) {
        this.dispatch("connect_error", { message: error instanceof Error ? error.message : "Authentication failed" });
        ws.close(1008, "Authentication failed");
      }
    });
    ws.addEventListener("message", (event) => {
      let packet: { type?: string; payload?: any };
      try { packet = JSON.parse(String(event.data)); } catch { return; }
      const { type, payload } = packet;
      if (type === "authenticated") {
        this.isReady = true;
        this.reconnectAttempt = 0;
        this.generation += 1;
        this.dispatch("connect");
        this.flushMessages();
        this.startHeartbeat();
      } else if (type === "pong") {
        this.awaitingPong = false;
      } else if (type === "messagePersisted" || type === "messageFailed" || type === "messageError") {
        if (payload?.clientMessageId) this.pendingMessages.delete(payload.clientMessageId);
        this.dispatch(type, payload);
      } else {
        this.dispatch(type ?? "", payload);
      }
    });
    ws.addEventListener("close", () => {
      const hadConnection = this.isReady;
      this.isReady = false;
      this.awaitingPong = false;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (hadConnection) this.dispatch("disconnect");
      if (!this.manuallyClosed) {
        const base = Math.min(500 * (2 ** this.reconnectAttempt), 15000);
        this.reconnectAttempt += 1;
        this.retryTimer = setTimeout(() => this.open(), base * (0.8 + Math.random() * 0.4));
      }
    });
    ws.addEventListener("error", () => {
      this.dispatch("connect_error", { message: "WebSocket connection failed" });
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      if (this.awaitingPong) { this.ws?.close(4000, "Heartbeat timeout"); return; }
      this.awaitingPong = true;
      this.send({ type: "ping", payload: {} });
    }, 20000);
  }
}
