import test from "node:test";
import assert from "node:assert/strict";
import { requestContext } from "../src/middleware/requestContext.middleware.js";

test("request context assigns a server ID and logs a query-free completion", () => {
  const headers = {};
  let onFinish;
  let log;
  const originalInfo = console.info;
  console.info = (value) => { log = value; };
  try {
    const req = { method: "GET", path: "/api/search/user-secret", baseUrl: "/api/search", route: { path: "/:userId" } };
    const res = { statusCode: 200, setHeader: (name, value) => { headers[name] = value; }, once: (_event, handler) => { onFinish = handler; } };
    let calledNext = false;
    requestContext(req, res, () => { calledNext = true; });
    assert.match(headers["X-Request-Id"], /^[0-9a-f-]{36}$/i);
    assert.equal(req.requestId, headers["X-Request-Id"]);
    assert.equal(calledNext, true);
    onFinish();
    const entry = JSON.parse(log);
    assert.equal(entry.event, "http.request.completed");
    assert.equal(entry.requestId, req.requestId);
    assert.equal(entry.route, "/api/search/:userId");
    assert.equal(JSON.stringify(entry).includes("user-secret"), false);
    assert.equal("query" in entry, false);
  } finally {
    console.info = originalInfo;
  }
});

test("routine successful preflights and 304 cache responses are not logged", () => {
  const originalInfo = console.info;
  const logged = [];
  console.info = (value) => { logged.push(JSON.parse(value)); };
  try {
    const run = (method, statusCode, path) => {
      let onFinish;
      const req = { method, path };
      const res = { statusCode, setHeader: () => {}, once: (_event, handler) => { onFinish = handler; } };
      requestContext(req, res, () => {});
      onFinish();
    };
    run("OPTIONS", 204, "/api/users/profile");
    run("GET", 304, "/api/friends");
    run("OPTIONS", 403, "/api/private");
    assert.equal(logged.length, 1);
    assert.equal(logged[0].method, "OPTIONS");
    assert.equal(logged[0].statusCode, 403);
  } finally {
    console.info = originalInfo;
  }
});
