import assert from "node:assert/strict";
import test from "node:test";
import { authenticatePasscode, authorizeRequest, hasCapability, canAccessAccount, meetsRequiredRole, type JarvisPrincipal } from "../lib/jarvis-auth.ts";
import { validateAiExplanation } from "../lib/ai/provider.ts";
import { gmailStatus, retrieveGmailSources } from "../lib/integrations/gmail.ts";
import { retrieveSlackSources, slackStatus } from "../lib/integrations/slack.ts";
import { initialVoiceState, microphoneRecoveryGuidance, voiceErrorState } from "../lib/voice-permission.ts";

const principal = (role: JarvisPrincipal["role"], accountIds: JarvisPrincipal["accountIds"] = ["account-a"]): JarvisPrincipal => ({ userId: `user-${role}`, name: role, role, accountIds });

test("server authorization capabilities distinguish PSM, manager, administrator, and read-only users", () => {
  assert.equal(hasCapability(principal("read-only"), "write_psm"), false);
  assert.equal(hasCapability(principal("psm"), "write_psm"), true);
  assert.equal(hasCapability(principal("psm"), "approve"), false);
  assert.equal(hasCapability(principal("manager"), "approve"), true);
  assert.equal(hasCapability(principal("manager"), "send_external"), true);
  assert.equal(hasCapability(principal("administrator", "*"), "admin"), true);
  assert.equal(canAccessAccount(principal("psm"), "account-a"), true);
  assert.equal(canAccessAccount(principal("psm"), "account-b"), false);
  assert.equal(meetsRequiredRole(principal("psm"), "manager"), false);
  assert.equal(meetsRequiredRole(principal("administrator"), "manager"), true);
});

test("configured authentication rejects anonymous reads and resolves configured account scope", async () => {
  const originalUsers = process.env.JARVIS_USERS_JSON;
  const originalSecret = process.env.JARVIS_SESSION_SECRET;
  process.env.JARVIS_SESSION_SECRET = "unit-test-session-secret";
  process.env.JARVIS_USERS_JSON = JSON.stringify([{ userId: "scoped-psm", name: "Scoped PSM", role: "psm", accountIds: ["account-a"], passcode: "unit-test-passcode" }]);
  try {
    const anonymous = await authorizeRequest(new Request("https://jarvis.test/api/state"), "read");
    assert.equal(anonymous.ok, false);
    assert.equal(anonymous.status, 401);
    const configured = await authenticatePasscode("unit-test-passcode");
    assert.equal(configured?.userId, "scoped-psm");
    assert.deepEqual(configured?.accountIds, ["account-a"]);
  } finally {
    if (originalUsers === undefined) delete process.env.JARVIS_USERS_JSON; else process.env.JARVIS_USERS_JSON = originalUsers;
    if (originalSecret === undefined) delete process.env.JARVIS_SESSION_SECRET; else process.env.JARVIS_SESSION_SECRET = originalSecret;
  }
});

test("microphone state helpers cover secure-context, device, browser, denial, and recovery states", () => {
  assert.equal(initialVoiceState({ secureContext: false, mediaDevices: true, speechRecognition: true }), "insecure-context");
  assert.equal(initialVoiceState({ secureContext: true, mediaDevices: false, speechRecognition: true }), "unavailable");
  assert.equal(initialVoiceState({ secureContext: true, mediaDevices: true, speechRecognition: false }), "unsupported-browser");
  assert.equal(initialVoiceState({ secureContext: true, mediaDevices: true, speechRecognition: true }), "not-requested");
  assert.equal(voiceErrorState("not-allowed"), "denied");
  assert.equal(voiceErrorState("audio-capture"), "unavailable");
  assert.match(microphoneRecoveryGuidance("denied", "Mozilla Chrome/130"), /Site settings/i);
  assert.match(microphoneRecoveryGuidance("denied", "Mozilla Firefox/130"), /Page Info/i);
});

test("Gmail reports disconnected and authenticated status without sending automatically", async () => {
  const original = process.env.GMAIL_ACCESS_TOKEN;
  delete process.env.GMAIL_ACCESS_TOKEN;
  assert.equal((await gmailStatus()).state, "not-configured");
  process.env.GMAIL_ACCESS_TOKEN = "test-token-not-a-real-secret";
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/profile")) return Response.json({ emailAddress: "test@example.com" });
    if (url.includes("/messages?")) return Response.json({ messages: [] });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  try {
    assert.equal((await gmailStatus(fetcher)).state, "connected");
    assert.deepEqual(await retrieveGmailSources("newer_than:1d", fetcher), []);
    assert.equal(calls.some((url) => url.includes("/drafts/send")), false);
    assert.equal(calls.some((url) => url.endsWith("/drafts")), false);
  } finally {
    if (original === undefined) delete process.env.GMAIL_ACCESS_TOKEN; else process.env.GMAIL_ACCESS_TOKEN = original;
  }
});

test("Slack reports disconnected and authenticated status and reads only permitted channels without posting", async () => {
  const originalToken = process.env.SLACK_BOT_TOKEN;
  const originalChannels = process.env.SLACK_CHANNEL_IDS;
  delete process.env.SLACK_BOT_TOKEN;
  assert.equal((await slackStatus()).state, "not-configured");
  process.env.SLACK_BOT_TOKEN = "test-token-not-a-real-secret";
  process.env.SLACK_CHANNEL_IDS = "C-PERMITTED";
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("auth.test")) return Response.json({ ok: true });
    if (url.includes("conversations.history")) return Response.json({ ok: true, messages: [{ ts: "1770000000.000001", user: "U1", text: "account update" }] });
    return Response.json({ ok: false }, { status: 404 });
  }) as typeof fetch;
  try {
    assert.equal((await slackStatus(fetcher)).state, "connected");
    const sources = await retrieveSlackSources("account", fetcher);
    assert.equal(sources[0].sourceReference, "slack:C-PERMITTED:1770000000.000001");
    assert.equal(calls.some((url) => url.includes("chat.postMessage")), false);
    assert.ok(calls.some((url) => url.includes("channel=C-PERMITTED")));
  } finally {
    if (originalToken === undefined) delete process.env.SLACK_BOT_TOKEN; else process.env.SLACK_BOT_TOKEN = originalToken;
    if (originalChannels === undefined) delete process.env.SLACK_CHANNEL_IDS; else process.env.SLACK_CHANNEL_IDS = originalChannels;
  }
});

test("AI explanations must cite retrieved evidence and preserve approval", () => {
  const evidence = [{ id: "evidence-1", findingId: "finding-1", sourceReport: "Search Term", sourceRowReference: "row 7", metricName: "spend", currentValue: 25, calculationMethod: "Direct report row", timePeriod: "week", confidenceContribution: 1 }];
  assert.equal(validateAiExplanation({ explanation: "Spend was observed.", evidenceIds: ["evidence-1"], proposedActions: [{ action: "Review bid", requiresApproval: true }] }, evidence).evidenceIds[0], "evidence-1");
  assert.throws(() => validateAiExplanation({ explanation: "Unsupported", evidenceIds: ["invented"], proposedActions: [] }, evidence), /retrieved evidence/);
  assert.throws(() => validateAiExplanation({ explanation: "Unsafe", evidenceIds: ["evidence-1"], proposedActions: [{ action: "Send", requiresApproval: false }] } as never, evidence), /approval/);
});
