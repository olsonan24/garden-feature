export type IntegrationState = "connected" | "not-configured" | "expired-token" | "disconnected" | "error";
export type IntegrationStatus = { provider: "gmail" | "slack"; state: IntegrationState; detail: string; scopes: string[]; verifiedAt?: string };
export type CommunicationSource = { id: string; provider: "gmail" | "slack"; title: string; author: string; timestamp: string; excerpt: string; sourceReference: string; sourceUrl?: string };
