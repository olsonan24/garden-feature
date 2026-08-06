export type DataReadinessIssue = {
  code: string;
  field: string;
  message: string;
  whyItMatters: string;
  blockedRecommendation?: string;
  resolution: string;
  severity: "warning" | "blocking";
};

export type DataReadiness = {
  completeness: number;
  status: "ready" | "partial" | "blocked";
  issues: DataReadinessIssue[];
};

export function buildDataReadiness(checks: Array<{ available: boolean; issue: DataReadinessIssue }>): DataReadiness {
  if (!checks.length) return { completeness: 1, status: "ready", issues: [] };
  const issues = checks.filter((check) => !check.available).map((check) => check.issue);
  const completeness = Number(((checks.length - issues.length) / checks.length).toFixed(2));
  return { completeness, status: issues.some((issue) => issue.severity === "blocking") ? "blocked" : issues.length ? "partial" : "ready", issues };
}
