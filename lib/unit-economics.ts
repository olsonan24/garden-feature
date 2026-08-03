export type UnitEconomicsInputs = {
  salePrice: number;
  referralRate: number;
  fbaFee: number;
  storageCost: number;
  inboundCost: number;
  cogs: number;
  angoraRate: number;
  adSales: number;
  adSpend: number;
  units: number;
};

export function calculateUnitEconomics(input: UnitEconomicsInputs) {
  const amazonFees = input.salePrice * input.referralRate / 100;
  const angoraBillable = input.salePrice * input.angoraRate / 100;
  const breakevenBeforeAds = amazonFees
    + input.fbaFee
    + input.storageCost
    + input.inboundCost
    + input.cogs
    + angoraBillable;
  const adCostPerUnit = input.units > 0 ? input.adSpend / input.units : 0;
  const netProceedsPerUnit = input.salePrice - breakevenBeforeAds - adCostPerUnit;

  return {
    amazonFees,
    angoraBillable,
    breakevenBeforeAds,
    adCostPerUnit,
    totalCostPerUnit: breakevenBeforeAds + adCostPerUnit,
    netProceedsPerUnit,
    netProfitMargin: input.salePrice > 0 ? netProceedsPerUnit / input.salePrice * 100 : 0,
    acos: input.adSales > 0 ? input.adSpend / input.adSales * 100 : 0,
    netProceedsAtCurrentUnits: netProceedsPerUnit * Math.max(0, input.units),
  };
}
