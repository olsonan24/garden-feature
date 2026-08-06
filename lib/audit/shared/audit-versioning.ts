export const AUDIT_ENGINE_VERSION = "1.0.0";
export const PARSER_VERSION = "2.0.0";
export const PLAYBOOK_VERSIONS = {
  portfolioTriage: "1.0.0",
  skuPerformance: "1.0.0",
  ppcGrowthOperator: "0.1.0-partial",
  listingDiagnostics: "0.0.0-scaffold",
  brandDefense: "0.0.0-scaffold",
} as const;

export type AuditRuleVersion = {
  engine: string;
  playbook: string;
  parser: string;
};

export function auditRuleVersion(playbook: keyof typeof PLAYBOOK_VERSIONS): AuditRuleVersion {
  return { engine: AUDIT_ENGINE_VERSION, playbook: PLAYBOOK_VERSIONS[playbook], parser: PARSER_VERSION };
}
