export type AuditEvidence = {
  id: string;
  findingId: string;
  sourceReport: string;
  rawImportId?: string;
  sourceRowReference?: string;
  metricName: string;
  currentValue?: number | string | null;
  comparisonValue?: number | string | null;
  calculationMethod: string;
  timePeriod: string;
  confidenceContribution: number;
  notes?: string;
};

export function evidenceId(findingId: string, metric: string, index = 0) {
  return `${findingId}:evidence:${metric.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${index}`;
}
