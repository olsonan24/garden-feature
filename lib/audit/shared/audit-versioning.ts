export const AUDIT_ENGINE_VERSION = "1.0.0";
export const PARSER_VERSION = "2.0.0";
export const PLAYBOOK_VERSIONS = {
  portfolioTriage: "1.0.0",
  skuPerformance: "1.0.0",
  ppcGrowthOperator: "1.0.0",
  listingDiagnostics: "1.0.0",
  brandDefense: "1.0.0",
} as const;

export type AuditRuleVersion = {
  engine: string;
  playbook: string;
  parser: string;
};

export function auditRuleVersion(playbook: keyof typeof PLAYBOOK_VERSIONS): AuditRuleVersion {
  return { engine: AUDIT_ENGINE_VERSION, playbook: PLAYBOOK_VERSIONS[playbook], parser: PARSER_VERSION };
}
