import assert from "node:assert/strict";
import { it } from "node:test";

import { SessionIdentityTracker } from "../lib/session-identity.ts";

it("a late old-session response cannot match a new login, including a reused JWT", () => {
  const tracker = new SessionIdentityTracker();
  const oldRequest = tracker.replace("synthetic-token-a");
  tracker.replace("synthetic-token-b");
  assert.equal(tracker.matches(oldRequest), false);

  const reusedJwtRequest = tracker.capture();
  tracker.replace("synthetic-token-b");
  assert.equal(tracker.matches(reusedJwtRequest), false);
});

it("a current-session response matches and explicit logout revokes that generation", () => {
  const tracker = new SessionIdentityTracker();
  const request = tracker.replace("synthetic-token-a");
  assert.equal(tracker.matches(request), true);
  tracker.replace(null);
  assert.equal(tracker.matches(request), false);
});

it("a second restore cannot accept responses from an earlier restore of the same token", () => {
  const tracker = new SessionIdentityTracker();
  const firstRestore = tracker.replace("synthetic-token-a");
  const secondRestore = tracker.replace("synthetic-token-a");
  assert.equal(tracker.matches(firstRestore), false);
  assert.equal(tracker.matches(secondRestore), true);
});
