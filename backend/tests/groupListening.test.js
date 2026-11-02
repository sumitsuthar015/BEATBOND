import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { io as createClient } from "socket.io-client";
import { createGroupListeningServer } from "../src/lib/groupListening.js";

const waitFor = (socket, event, predicate = () => true, timeoutMs = 4_000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(event, onEvent); reject(new Error(`Timed out waiting for ${event}`)); }, timeoutMs);
  const onEvent = (value) => {
    if (!predicate(value)) return;
    clearTimeout(timeout); socket.off(event, onEvent); resolve(value);
  };
  socket.on(event, onEvent);
});
const request = (socket, event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
const connect = (url, token) => new Promise((resolve, reject) => {
  const socket = createClient(url, { auth: { token }, transports: ["websocket"], reconnection: false });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", reject);
});

test("group listening synchronizes playback, enforces the host, and hands off rooms", async (t) => {
  const server = createServer();
  createGroupListeningServer(server, { authenticate: async (token) => token });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const host = await connect(url, "host-user");
  const listener = await connect(url, "listener-user");
  const late = await connect(url, "late-user");
  t.after(() => {
    host.disconnect(); listener.disconnect(); late.disconnect();
    server.close();
  });

  const created = await request(host, "room:create", { name: "Host" });
  assert.equal(created.ok, true);
  const code = created.state.code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);

  const badCode = await request(listener, "room:join", { name: "Listener", code: "XXXXX" });
  assert.match(badCode.error, /not found|valid/i);
  const joined = await request(listener, "room:join", { name: "Listener", code });
  assert.equal(joined.ok, true);

  const rejectedControl = await request(listener, "host:pause");
  assert.match(rejectedControl.error, /Only the host/);
  const song = await request(host, "host:load", { url: "https://cdn.example.test/song.mp3", title: "Test Track", duration: 120 });
  assert.equal(song.ok, true);
  assert.equal((await request(host, "host:play")).ok, true);
  const listenerState = await waitFor(listener, "room:state", (state) => state.playing && state.title === "Test Track");
  assert.equal(listenerState.trackUrl, "https://cdn.example.test/song.mp3");
  assert.equal(listenerState.members.length, 2);

  await new Promise((resolve) => setTimeout(resolve, 1_050));
  const lateJoin = await request(late, "room:join", { name: "Late", code });
  assert.equal(lateJoin.ok, true);
  assert.equal(lateJoin.state.playing, true);
  const latePosition = lateJoin.state.position + (lateJoin.state.serverTime - lateJoin.state.positionUpdatedAt) / 1000;
  assert.ok(latePosition >= 0.8, `late join position was ${latePosition}`);

  assert.equal((await request(host, "host:seek", { position: 45 })).ok, true);
  assert.equal((await request(host, "host:pause")).ok, true);
  const pausedState = await waitFor(late, "room:state", (state) => !state.playing && state.position >= 45);
  assert.ok(pausedState.position >= 45);

  host.disconnect();
  const handedOff = await waitFor(listener, "room:state", (state) => state.hostId === "listener-user");
  assert.equal(handedOff.playing, false);
  assert.equal(handedOff.members.length, 2);
});
