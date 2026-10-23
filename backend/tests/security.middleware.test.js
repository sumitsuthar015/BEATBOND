import test from "node:test";
import assert from "node:assert/strict";
import { isAdminUser } from "../src/middleware/auth.middleware.js";
import { rateLimit } from "../src/middleware/rateLimit.middleware.js";

test("admin authorization fails closed when the allowlist is not configured", async () => {
  const previous = process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_EMAIL;
  try {
    assert.equal(await isAdminUser("user_without_allowlisted_email"), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  }
});

test("sensitive endpoint limiter returns 429 after its configured request budget", () => {
  const middleware = rateLimit({ name: `security-test-${Date.now()}`, limit: 1, windowMs: 60_000 });
  const req = { ip: "test-ip", auth: () => ({ userId: "test-user" }) };
  const response = () => ({
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  });
  let passed = 0;
  const first = response();
  middleware(req, first, () => { passed += 1; });
  const second = response();
  middleware(req, second, () => { passed += 1; });

  assert.equal(passed, 1);
  assert.equal(second.statusCode, 429);
  assert.ok(Number(second.headers["Retry-After"]) > 0);
});
