import assert from "node:assert/strict";
import { test } from "node:test";
import { clarifyOffer, missingOfferSlot, romanize, clarifyQuestion, fillSlots, fuzzyCustomers, matchIntent, missingSlot, nameSimilarity, type Pending } from "./intent";

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

test("ledger commands report the missing detail, customer first", () => {
  assert.equal(missingSlot(matchIntent("Rahul ka udhaar likho")!), "amount");
  assert.equal(missingSlot(matchIntent("500 rupaye udhaar likho")!), "customer");
  assert.equal(missingSlot(matchIntent("Rahul ka 500 rupaye udhaar add karo")!), null);
  assert.equal(missingSlot(matchIntent("koi tips do")!), null);
  assert.equal(clarifyQuestion("amount", "ADD_CREDIT", "HINGLISH", "Rahul"), "Rahul ke khate mein kitne rupaye likhne hain?");
  assert.equal(clarifyQuestion("customer", "RECORD_REPAYMENT", "HINDI"), "किसने पैसे दिए?");
});

test("a short reply completes the pending command", () => {
  const needAmount: Pending = { intent: "ADD_CREDIT", customerName: "Rahul" };
  const needName: Pending = { intent: "RECORD_REPAYMENT", amountPaise: 30_000 };
  const fill = (t: string, p: Pending) => fillSlots(t, p, matchIntent(t));
  assert.deepEqual(fill("500 rupaye", needAmount)?.params, { customerName: "Rahul", amountPaise: 50_000 });
  assert.deepEqual(fill("५००", needAmount)?.params, { customerName: "Rahul", amountPaise: 50_000 });
  assert.deepEqual(fill("Rahul", needName)?.params, { customerName: "Rahul", amountPaise: 30_000 });
  assert.deepEqual(fill("Ramesh ji", needName)?.params, { customerName: "Ramesh", amountPaise: 30_000 });
  assert.deepEqual(fill("राकेश", needName)?.params, { customerName: "राकेश", amountPaise: 30_000 });
  assert.equal(fill("Rahul", needName)?.intent, "RECORD_REPAYMENT");
  assert.equal(fill("Rahul", needName)?.needsConfirmation, true);
  // A confirmation or a different command never fills the old question.
  assert.equal(fill("haan", needAmount), null);
  assert.equal(fill("koi tips do", needAmount), null);
  assert.equal(fill("aaj ki sales kitni hui", needAmount), null);
});

test("fuzzy names tolerate speech-recognition spellings", () => {
  assert.ok(nameSimilarity("Raahul", "Rahul") >= 0.75);
  assert.ok(nameSimilarity("Rahool", "Rahul Sharma") >= 0.75);
  assert.ok(nameSimilarity("Suresh", "Rahul") < 0.75);
  const list = [{ name: "Rahul Sharma" }, { name: "Ramesh Gupta" }, { name: "Sunita Devi" }];
  assert.deepEqual(fuzzyCustomers("Rahool", list), [{ name: "Rahul Sharma" }]);
  assert.deepEqual(fuzzyCustomers("Sunitha", list), [{ name: "Sunita Devi" }]);
  assert.deepEqual(fuzzyCustomers("Mohan", list), []);
});

test("Devanagari names keep their vowel signs", () => {
  assert.equal(matchIntent("राहुल का ५०० रुपये उधार लिखो")?.params.customerName, "राहुल");
});

test("a discount request is an offer for customers, never a payment reminder for 'Credit Overdue'", () => {
  const r = matchIntent("Credit Overdue ka reminder nahi bhejna, discount ka reminder bhejna hai, 25% off ka reminder bhejna hai");
  assert.equal(r?.intent, "CREATE_OFFER");
  assert.equal(r?.params.discountPct, 25);
  assert.equal(r?.params.customerName, undefined);
  assert.equal(matchIntent("Ramesh ji ko payment reminder bhejna hai")?.intent, "REQUEST_REMINDER");
});

test("custom offers: percentage and group from English, Hinglish and Hindi", () => {
  assert.deepEqual(matchIntent("25% off for loyal customers")?.params, { discountPct: 25, audience: "LOYAL" });
  assert.deepEqual(matchIntent("inactive customers ko 10 percent discount bhejo")?.params, { discountPct: 10, audience: "INACTIVE" });
  assert.deepEqual(matchIntent("सभी ग्राहकों को २० प्रतिशत छूट दो")?.params, { discountPct: 20, audience: "ALL" });
  assert.deepEqual(matchIntent("discount 15 for active customers")?.params, { discountPct: 15, audience: "ACTIVE" });
  assert.equal(matchIntent("25% off for loyal customers")?.needsConfirmation, true);
  assert.equal(matchIntent("discount bhejna hai")?.params.discountPct, undefined);
  // Ideas without a number are still tips; absurd percentages are ignored.
  assert.equal(intentOf("loyal customers ke liye offer"), "GET_TIPS_FOR");
  assert.equal(intentOf("festival ke liye offer"), "GET_TIPS_FOR");
  assert.equal(matchIntent("90% off for everyone")?.params.discountPct, undefined);
});

test("an offer asks for the percentage, then the group, and short replies fill them", () => {
  assert.equal(missingOfferSlot({}), "percent");
  assert.equal(missingOfferSlot({ discountPct: 25 }), "audience");
  assert.equal(missingOfferSlot({ discountPct: 25, audience: "LOYAL" }), null);
  assert.equal(clarifyOffer("percent", "HINGLISH"), "Kitne percent ki chhoot dena chahte hain? (jaise 10, 15 ya 25)");
  assert.equal(clarifyOffer("audience", "ENGLISH", 25), "Who should get 25% off: loyal, inactive (stopped coming), active or all customers?");
  const fill = (t: string, p: Pending) => fillSlots(t, p, matchIntent(t));
  assert.deepEqual(fill("loyal", { intent: "CREATE_OFFER", discountPct: 25 })?.params, { discountPct: 25, audience: "LOYAL" });
  assert.deepEqual(fill("jo nahi aa rahe", { intent: "CREATE_OFFER", discountPct: 10 })?.params, { discountPct: 10, audience: "INACTIVE" });
  assert.deepEqual(fill("15", { intent: "CREATE_OFFER", audience: "ALL" })?.params, { discountPct: 15, audience: "ALL" });
  assert.deepEqual(fill("20 percent", { intent: "CREATE_OFFER", audience: "LOYAL" })?.params, { discountPct: 20, audience: "LOYAL" });
  assert.equal(fill("koi tips do", { intent: "CREATE_OFFER", discountPct: 25 }), null);
  assert.equal(fill("haan", { intent: "CREATE_OFFER", discountPct: 25 }), null);
});

test("Hindi-script names match names stored in English", () => {
  assert.equal(romanize("कविता चोपड़ा"), "kavita chopda");
  assert.ok(nameSimilarity("कविता चोपड़ा।", "Kavita Chopra") >= 0.75);
  assert.ok(nameSimilarity("राहुल", "Rahul Sharma") >= 0.75);
  assert.ok(nameSimilarity("रमेश", "Rahul Sharma") < 0.75);
  const list = [{ name: "Kavita Chopra" }, { name: "Kavita Yadav" }, { name: "Rahul Sharma" }];
  assert.deepEqual(fuzzyCustomers("कविता चोपड़ा", list)[0], { name: "Kavita Chopra" });
});

test("reminder and balance questions ask for the customer, and a bare name answers them", () => {
  assert.equal(missingSlot({ intent: "REQUEST_REMINDER", params: {} }), "customer");
  assert.equal(missingSlot({ intent: "REQUEST_REMINDER", params: { customerName: "Rahul" } }), null);
  assert.equal(clarifyQuestion("customer", "REQUEST_REMINDER", "HINGLISH"), "Kis customer ko payment reminder bhejna hai?");
  const reply = fillSlots("कविता चोपड़ा।", { intent: "REQUEST_REMINDER" }, matchIntent("कविता चोपड़ा।"));
  assert.deepEqual(reply?.params, { customerName: "कविता चोपड़ा" });
  assert.equal(reply?.intent, "REQUEST_REMINDER");
});

test("generic words are not customer names", () => {
  assert.equal(matchIntent("ek customer ko reminder bhejna hai")?.params.customerName, undefined);
  assert.equal(missingSlot(matchIntent("ek customer ko reminder bhejna hai")!), "customer");
  assert.equal(matchIntent("Ramesh ji ko reminder bhejna hai")?.params.customerName, "Ramesh");
});
