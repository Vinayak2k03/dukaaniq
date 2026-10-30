import assert from "node:assert/strict";
import { test } from "node:test";
import { composeMessage, renderForCustomer, rupeesText, templateMessage, type Language } from "./text";

const langs: Language[] = ["ENGLISH", "HINGLISH", "HINDI"];

test("reminder templates include amount and due date in both tones", () => {
  for (const language of langs)
    for (const tone of ["standard", "softer"] as const) {
      const m = templateMessage({ kind: "CREDIT_REMINDER", language, tone, shopName: "Sharma Kirana", amountRupees: "₹350", dueDate: "18 Oct 2026" });
      assert.ok(m.includes("₹350") && m.includes("18 Oct 2026") && m.includes("Sharma Kirana"));
      assert.deepEqual(m.match(/\{\w+\}/g), ["{name}"]);
    }
});

test("the name is filled per customer", () => {
  assert.equal(renderForCustomer("Hello {name}, hi {name}", "Rohit"), "Hello Rohit, hi Rohit");
});

test("composeMessage falls back to the template source", async () => {
  const r = await composeMessage({ kind: "CREDIT_REMINDER", language: "ENGLISH", tone: "standard", shopName: "S", amountRupees: "₹1", dueDate: "d" });
  assert.equal(r.source, "template");
});

test("rupee text drops zero paise", () => {
  assert.equal(rupeesText(35000), "₹350");
  assert.equal(rupeesText(35050), "₹350.50");
  assert.equal(rupeesText(123456700), "₹12,34,567");
});
