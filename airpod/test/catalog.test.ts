import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, getCatalogItem } from "../src/lib/catalog";

const SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);
const CATEGORIES = new Set(["container_hardening", "unix", "web"]);
const METHODS = new Set(["D", "R", "D+R"]);

const EXPECTED_IDS = [
  "C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07", "C-08", "C-09",
  "U-04", "U-05", "U-16", "U-18", "U-19", "U-22", "U-25",
  "W-01", "W-08", "W-09", "W-21", "W-22", "W-25", "W-26",
];

test("catalog ids are unique", () => {
  const ids = CATALOG.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("catalog contains exactly the expected slice 1–3 items", () => {
  assert.deepEqual(CATALOG.map((c) => c.id).sort(), [...EXPECTED_IDS].sort());
});

test("every catalog item has valid metadata", () => {
  for (const item of CATALOG) {
    assert.ok(SEVERITIES.has(item.severity), `${item.id} severity`);
    assert.ok(CATEGORIES.has(item.category), `${item.id} category`);
    assert.ok(METHODS.has(item.method), `${item.id} method`);
    assert.ok(item.title.trim().length > 0, `${item.id} title`);
    assert.ok(item.failCriterion.trim().length > 0, `${item.id} failCriterion`);
  }
});

test("getCatalogItem resolves known and throws on unknown", () => {
  assert.equal(getCatalogItem("C-01").id, "C-01");
  assert.throws(() => getCatalogItem("Z-99"));
});
