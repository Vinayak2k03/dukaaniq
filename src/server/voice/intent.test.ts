import assert from "node:assert/strict";
import { test } from "node:test";
import { matchIntent } from "./intent";

const intentOf = (t: string) => matchIntent(t)?.intent ?? null;

test("tip intents in Hinglish, Hindi and English", () => {
  assert.equal(intentOf("koi tips do"), "GET_TIPS");
  assert.equal(intentOf("business kaise badhaun?"), "GET_TIPS");
  assert.equal(intentOf("मुझे कुछ सुझाव दो"), "GET_TIPS");
  assert.equal(intentOf("aur tips batao"), "GET_MORE_TIPS");
  assert.equal(intentOf("show more tips"), "GET_MORE_TIPS");
  assert.deepEqual(matchIntent("festival ke liye offer")?.params.focus, ["FESTIVE"]);
  assert.deepEqual(matchIntent("loyal customers ke liye kya karu")?.params.focus, ["LOYALTY"]);
  assert.deepEqual(matchIntent("khali time mein kya offer du")?.params.focus, ["OFF_PEAK"]);
});

test("tip feedback maps to structured decline reasons", () => {
  assert.equal(matchIntent("discount zyada hai")?.params.reason, "COST_TOO_HIGH");
  assert.equal(matchIntent("ye customers nahi")?.params.reason, "WRONG_AUDIENCE");
  assert.equal(matchIntent("inko message mat bhejo")?.params.reason, "DO_NOT_CONTACT");
});

test("PRD intents with parameters", () => {
  assert.deepEqual(matchIntent("Rahul ka 500 rupaye udhaar add karo")?.params, { customerName: "Rahul", amountPaise: 50_000 });
  assert.deepEqual(matchIntent("Rahul ne 300 rupaye de diye")?.params, { customerName: "Rahul", amountPaise: 30_000 });
  assert.equal(matchIntent("Ramesh ji ko payment reminder bhejna hai")?.params.customerName, "Ramesh");
  assert.equal(matchIntent("Rahul ka kitna udhaar baaki hai?")?.intent, "GET_CUSTOMER_BALANCE");
  assert.equal(matchIntent("राहुल का ५०० रुपये उधार लिखो")?.params.amountPaise, 50_000);
  assert.equal(intentOf("Aaj ki sales kitni hui?"), "GET_SALES_SUMMARY");
  assert.equal(matchIntent("is hafte ki bikri")?.params.range, "7d");
  assert.equal(intentOf("Kaun se customers kaafi time se nahi aaye?"), "GET_INACTIVE_CUSTOMERS");
});

test("writes and approvals need confirmation; a bare 'haan' is only CONFIRM, never approval", () => {
  assert.equal(matchIntent("Is offer ko approve karo")?.intent, "APPROVE_RECOMMENDATION");
  assert.equal(matchIntent("Is offer ko approve karo")?.needsConfirmation, true);
  for (const t of ["haan", "हाँ", "yes", "theek hai"]) assert.equal(intentOf(t), "CONFIRM", t);
  assert.equal(matchIntent("Rahul ka 500 rupaye udhaar add karo")?.needsConfirmation, true);
  assert.equal(matchIntent("koi tips do")?.needsConfirmation, false);
});

test("unmatched text returns null so the LLM fallback can try", () => {
  assert.equal(matchIntent("mausam kaisa hai"), null);
  assert.equal(matchIntent("   "), null);
});
