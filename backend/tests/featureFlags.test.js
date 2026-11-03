import test from "node:test";
import assert from "node:assert/strict";
import { getFeatureFlagsForUser, isFeatureEnabledForUser } from "../src/lib/featureFlags.js";

test("feature flags are off unless explicitly enabled", () => {
  assert.equal(isFeatureEnabledForUser("new_feed", "user_1", {}), false);
  assert.equal(isFeatureEnabledForUser("new_feed", "user_1", { new_feed: { enabled: false } }), false);
});

test("feature rollout is stable per user and honors percentage boundaries", () => {
  const rollout = { discovery: { enabled: true, rolloutPercent: 100 } };
  assert.equal(isFeatureEnabledForUser("discovery", "user_1", rollout), true);
  assert.equal(isFeatureEnabledForUser("discovery", "user_1", rollout), true);
  assert.equal(isFeatureEnabledForUser("discovery", "user_2", { discovery: { enabled: true, rolloutPercent: 0 } }), false);
  assert.deepEqual(getFeatureFlagsForUser("user_1", rollout), { discovery: true });
});

test("persisted admin overrides take precedence over environment rollouts", () => {
  const rollout = { discovery: { enabled: true, rolloutPercent: 100 }, private_beta: { enabled: false } };
  assert.deepEqual(getFeatureFlagsForUser("user_1", rollout, { discovery: false, private_beta: true }), {
    discovery: false,
    private_beta: true,
  });
});

