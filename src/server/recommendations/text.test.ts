import assert from "node:assert/strict";
import { test } from "node:test";
import { composeWith, rejectReason, renderForCustomer, rupeesText, templateMessage, templateProvider, type Language, type MessageFacts } from "./text";

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

const facts: MessageFacts = { kind: "CREDIT_REMINDER", language: "ENGLISH", tone: "standard", shopName: "Sharma Kirana Store", amountRupees: "₹350", dueDate: "18 Oct 2026" };

test("composeWith uses the first provider that returns text", async () => {
  const ai = { name: "ai", compose: async () => "Hello {name}, ₹350 is pending since 18 Oct 2026." };
  assert.equal((await composeWith([ai, templateProvider], facts)).source, "ai");
});

test("composeWith falls back to the template when a provider returns null or throws", async () => {
  const nul = { name: "nul", compose: async () => null };
  const boom = { name: "boom", compose: async () => { throw new Error("down"); } };
  assert.equal((await composeWith([nul, boom], facts)).source, "template");
});

test("AI text that keeps the facts and the placeholder is accepted", () => {
  assert.equal(rejectReason("Namaste {name}, Sharma Kirana Store se. Aapka ₹350 ka payment 18 Oct 2026 se pending hai. Dhanyavad.", facts), null);
  assert.equal(rejectReason("नमस्ते {name}, आपका ₹३५० का बकाया 18 Oct 2026 से लंबित है। धन्यवाद।", facts), null);
  assert.equal(rejectReason("Hello {name}, ₹350 pending since 18 Oct 2026. Thanks.", { ...facts, amountRupees: "₹1,350.50" }), "amount_missing");
});

test("AI text that changes or invents figures is rejected", () => {
  assert.equal(rejectReason("Hello {name}, ₹400 is pending since 18 Oct 2026. Please pay.", facts), "amount_missing");
  assert.equal(rejectReason("Hello {name}, ₹350 pending since 18 Oct 2026. Pay 50 extra fee.", facts), "unexpected_number");
  assert.equal(rejectReason("Hello {name}, ₹350 pending since 19 Oct 2026. Please pay soon.", facts), "unexpected_number");
});

test("AI text without the placeholder, with other placeholders, links or bad length is rejected", () => {
  assert.equal(rejectReason("Hello Rohit, ₹350 is pending since 18 Oct 2026. Please pay.", facts), "missing_name_placeholder");
  assert.equal(rejectReason("Hello {name} {shop}, ₹350 pending since 18 Oct 2026. Please pay.", facts), "unknown_placeholder");
  assert.equal(rejectReason("Hello {name}, pay ₹350 (18 Oct 2026) at https://pay.example/x now.", facts), "link");
  assert.equal(rejectReason("{name} ₹350", facts), "length");
});

test("rupee text drops zero paise", () => {
  assert.equal(rupeesText(35000), "₹350");
  assert.equal(rupeesText(35050), "₹350.50");
  assert.equal(rupeesText(123456700), "₹12,34,567");
});
