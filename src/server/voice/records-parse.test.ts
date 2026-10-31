import assert from "node:assert/strict";
import { test } from "node:test";
import { matchIntent } from "./intent";
import { parseCustomerText, parseProductText, parseSaleText, paymentOf } from "./records-parse";

const intentOf = (t: string) => matchIntent(t)?.intent ?? null;

test("record commands are recognised in Hinglish, Hindi and English", () => {
  assert.equal(intentOf("naya product add karo Maggi"), "ADD_PRODUCT");
  assert.equal(intentOf("add product Tata Salt selling 28 cost 22"), "ADD_PRODUCT");
  assert.equal(intentOf("naya customer add karo Rahul Sharma 9876543210"), "ADD_CUSTOMER");
  assert.equal(intentOf("नया ग्राहक जोड़ो राहुल"), "ADD_CUSTOMER");
  assert.equal(intentOf("2 Maggi aur 1 Parle-G becha cash"), "RECORD_SALE");
  assert.equal(intentOf("Rahul ne 1 kg cheeni li udhaar mein"), "RECORD_SALE");
  assert.equal(intentOf("दो मैगी बेची"), "RECORD_SALE");
  assert.equal(intentOf("sold 3 bread on upi"), "RECORD_SALE");
});

test("questions and ledger commands keep their old meaning", () => {
  assert.equal(intentOf("aaj kitna becha"), "GET_SALES_SUMMARY");
  assert.equal(intentOf("kaun sa product sabse zyada bika"), null);
  assert.equal(intentOf("Rahul ka 500 udhaar add karo"), "ADD_CREDIT");
  assert.equal(intentOf("customer ka udhaar add karo"), "ADD_CREDIT");
  assert.equal(intentOf("Rahul ne 300 de diye"), "RECORD_REPAYMENT");
  assert.notEqual(intentOf("Rahul ne udhaar liya 500"), "RECORD_SALE");
});

test("sale text splits items, quantities, buyer and payment", () => {
  const s = parseSaleText("Rahul ne 2 Maggi aur ek Parle-G liya, cash");
  assert.equal(s.customerName, "rahul");
  assert.deepEqual(s.lines, [{ heard: "maggi", quantity: 2 }, { heard: "parle-g", quantity: 1 }]);
  assert.equal(s.payment, "CASH");
  assert.deepEqual(parseSaleText("1 kg cheeni becha 48 rupaye").lines, [{ heard: "cheeni", quantity: 1 }]);
  assert.equal(parseSaleText("1 kg cheeni becha 48 rupaye").totalPaise, 4800);
  assert.equal(parseSaleText("3 bread udhaar mein").payment, "UDHAAR");
});

test("payment words", () => {
  assert.equal(paymentOf("gpay se diya"), "UPI");
  assert.equal(paymentOf("paytm"), "PAYTM");
  assert.equal(paymentOf("khate mein likh do"), "UDHAAR");
  assert.equal(paymentOf("nakad"), "CASH");
  assert.equal(paymentOf("bas"), undefined);
});

test("product text reads selling and buying price", () => {
  const p = parseProductText("Maggi add karo, 14 rupaye ka bechte hain, 11 ka aata hai");
  assert.equal(p.name, "maggi");
  assert.deepEqual([p.sellingPaise, p.costPaise], [1400, 1100]);
  assert.deepEqual([parseProductText("add product Tata Salt selling 28 cost 22").sellingPaise, parseProductText("add product Tata Salt selling 28 cost 22").costPaise], [2800, 2200]);
});

test("customer text reads name and phone", () => {
  assert.deepEqual(parseCustomerText("Rahul Sharma naam ka customer add karo, number 98765 43210"), { name: "rahul sharma", phone: "9876543210" });
  assert.equal(parseCustomerText("add customer Priya").name, "priya");
});
