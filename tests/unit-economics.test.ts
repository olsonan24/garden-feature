import assert from "node:assert/strict";
import test from "node:test";
import { calculateUnitEconomics } from "../lib/unit-economics.ts";

test("matches the Garden breakeven sheet formulas", () => {
  const result = calculateUnitEconomics({
    salePrice: 39.99,
    referralRate: 15,
    fbaFee: 9.37,
    storageCost: .16,
    inboundCost: 1.1,
    cogs: 15.08,
    angoraRate: 5,
    adSales: 0,
    adSpend: 0,
    units: 1,
  });

  assert.equal(result.amazonFees, 5.9985);
  assert.ok(Math.abs(result.angoraBillable - 1.9995) < 1e-10);
  assert.ok(Math.abs(result.breakevenBeforeAds - 33.708) < 1e-10);
  assert.ok(Math.abs(result.netProceedsPerUnit - 6.282) < 1e-10);
  assert.ok(Math.abs(result.netProfitMargin - 15.70892723180796) < 1e-10);
});

test("includes advertising and calculates ACoS from ad sales", () => {
  const result = calculateUnitEconomics({
    salePrice: 40,
    referralRate: 15,
    fbaFee: 9,
    storageCost: 1,
    inboundCost: 1,
    cogs: 10,
    angoraRate: 5,
    adSales: 200,
    adSpend: 50,
    units: 10,
  });

  assert.equal(result.acos, 25);
  assert.equal(result.adCostPerUnit, 5);
  assert.equal(result.netProceedsPerUnit, 6);
  assert.equal(result.netProceedsAtCurrentUnits, 60);
});
