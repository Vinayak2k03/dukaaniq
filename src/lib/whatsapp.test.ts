import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePhone, whatsappLink } from "./whatsapp";

test("normalizes common Indian number formats", () => {
  for (const raw of ["98765 43210", "+91 98765-43210", "09876543210", "919876543210", "0091 9876543210"]) assert.equal(normalizePhone(raw), "919876543210");
});

test("rejects missing or malformed numbers", () => {
  for (const raw of [null, undefined, "", "12345", "abc"]) assert.equal(normalizePhone(raw), null);
});

test("link carries the exact message, encoded", () => {
  assert.equal(whatsappLink("9876543210", "Hi Rohit & co, ₹350"), "https://wa.me/919876543210?text=Hi%20Rohit%20%26%20co%2C%20%E2%82%B9350");
  assert.equal(whatsappLink("123", "x"), null);
});
