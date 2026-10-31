import assert from "node:assert/strict";
import { test } from "node:test";
import { productSimilarity } from "./aliases";

test("sugar is found under every spoken name, in either script", () => {
  for (const heard of ["sugar", "शुगर", "chini", "cheeni", "चीनी", "शक्कर", "shakkar"]) {
    assert.ok(productSimilarity(heard, "Sugar 1kg") >= 0.9, heard);
    assert.ok(productSimilarity(heard, "चीनी") >= 0.9, heard);
  }
  assert.ok(productSimilarity("शुगर", "Tata Salt") < 0.72);
});
