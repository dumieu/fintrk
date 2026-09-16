import assert from "node:assert/strict";
import test from "node:test";

import { detectPhoneFromHeaders, isPhoneUserAgent } from "./detect";

test("phones are phones; tablets stay on desktop", () => {
  assert.equal(
    isPhoneUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    ),
    true
  );
  assert.equal(
    isPhoneUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    ),
    false
  );
  assert.equal(
    isPhoneUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
    true
  );
  assert.equal(
    isPhoneUserAgent(
      "Mozilla/5.0 (Linux; Android 14; SM-X810) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    false
  );
  assert.equal(isPhoneUserAgent(""), false);
  assert.equal(isPhoneUserAgent(null), false);
});

test("header detection prefers the mobile client hint", () => {
  const headers = {
    get(name: string) {
      if (name === "sec-ch-ua-mobile") return "?1";
      if (name === "user-agent") return "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)";
      return null;
    },
  };
  assert.equal(detectPhoneFromHeaders(headers), true);
});

test("header detection falls back to UA when client hints are absent", () => {
  const phone = {
    get(name: string) {
      if (name === "user-agent") {
        return "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
      }
      return null;
    },
  };
  const desktop = {
    get(name: string) {
      if (name === "user-agent") {
        return "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36";
      }
      return null;
    },
  };
  assert.equal(detectPhoneFromHeaders(phone), true);
  assert.equal(detectPhoneFromHeaders(desktop), false);
});
