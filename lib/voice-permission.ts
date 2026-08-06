export type VoicePermissionState = "not-requested" | "requesting" | "granted" | "denied" | "unavailable" | "unsupported-browser" | "insecure-context" | "listening" | "processing" | "stopped";

export function initialVoiceState(input: { secureContext: boolean; mediaDevices: boolean; speechRecognition: boolean }): VoicePermissionState {
  if (!input.secureContext) return "insecure-context";
  if (!input.mediaDevices) return "unavailable";
  if (!input.speechRecognition) return "unsupported-browser";
  return "not-requested";
}

export function voiceErrorState(error?: string): VoicePermissionState {
  if (["not-allowed", "permission-denied", "service-not-allowed"].includes(error || "")) return "denied";
  if (["audio-capture", "not-found", "devices-not-found"].includes(error || "")) return "unavailable";
  return "stopped";
}

export function microphoneRecoveryGuidance(state: VoicePermissionState, userAgent: string) {
  if (state === "insecure-context") return "Open the deployed HTTPS preview; browsers block microphone capture on insecure pages.";
  if (state === "unsupported-browser") return "This browser does not expose speech recognition. Use typed commands or open the HTTPS preview in a current Chromium-based browser.";
  if (state === "unavailable") return "No usable microphone was found. Connect or enable a microphone in the operating-system privacy settings, then reload.";
  if (state !== "denied") return "Microphone access begins only after you choose Enable Microphone.";
  if (/firefox/i.test(userAgent)) return "In Firefox, use the microphone icon in the address bar or Page Info > Permissions, allow microphone access, then reload.";
  if (/edg/i.test(userAgent)) return "In Edge, select the lock icon > Permissions for this site > Microphone > Allow, then reload.";
  if (/chrome|chromium/i.test(userAgent)) return "In Chrome, select the tune or lock icon > Site settings > Microphone > Allow, then reload.";
  if (/safari/i.test(userAgent)) return "In Safari, open Settings for This Website > Microphone > Allow, then reload.";
  return "Open this site's browser permissions, allow microphone access, and reload. Typed commands remain available.";
}
