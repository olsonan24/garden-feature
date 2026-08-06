"use client";

import { LoaderCircle, Mic, MicOff, Send } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { initialVoiceState, microphoneRecoveryGuidance, voiceErrorState } from "../lib/voice-permission";
import { useJarvisAssistant } from "./jarvis-assistant-provider";

type SpeechRecognitionEventLike = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionErrorLike = { error?: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function JarvisCommandBar({ compact = false, suggestions = true, autoFocus = false }: { compact?: boolean; suggestions?: boolean; autoFocus?: boolean }) {
  const { commandText, setCommandText, runCommand, mode, lastCommand, voiceAvailability, voiceEnabled, setVoiceAvailability, reportError } = useJarvisAssistant();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const busy = ["thinking", "analyzing", "navigating"].includes(mode) || voiceAvailability === "processing";
  const recognitionSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const microphoneGranted = ["granted", "stopped"].includes(voiceAvailability);

  useEffect(() => {
    const initial = initialVoiceState({ secureContext: window.isSecureContext, mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia), speechRecognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition) });
    setVoiceAvailability(initial);
    if (initial === "not-requested" && navigator.permissions?.query) {
      navigator.permissions.query({ name: "microphone" as PermissionName }).then((status) => {
        setVoiceAvailability(status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "not-requested");
        status.onchange = () => setVoiceAvailability(status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "not-requested");
      }).catch(() => undefined);
    }
    return () => recognitionRef.current?.stop();
  }, [setVoiceAvailability]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCommand();
  }

  async function enableMicrophone() {
    if (!voiceEnabled) return;
    if (!window.isSecureContext) { setVoiceAvailability("insecure-context"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setVoiceAvailability("unavailable"); return; }
    if (!recognitionSupported) { setVoiceAvailability("unsupported-browser"); return; }
    setVoiceAvailability("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceAvailability("granted");
    } catch (error) {
      const name = error instanceof DOMException ? error.name.toLowerCase() : "";
      setVoiceAvailability(name.includes("notallowed") || name.includes("security") ? "denied" : name.includes("notfound") ? "unavailable" : "stopped");
    }
  }

  function listen() {
    if (!voiceEnabled || !microphoneGranted || busy) return;
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) { setVoiceAvailability("unsupported-browser"); return; }
    const recognition = new Constructor();
    let processingResult = false;
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setVoiceAvailability("listening");
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      processingResult = true;
      setVoiceAvailability("processing");
      setCommandText(transcript);
      void runCommand(transcript).finally(() => setVoiceAvailability("stopped"));
    };
    recognition.onerror = (event) => {
      const state = voiceErrorState(event.error);
      setVoiceAvailability(state);
      reportError(state === "denied" ? microphoneRecoveryGuidance("denied", navigator.userAgent) : "Voice recognition stopped before a command was captured. Typed commands remain available.");
    };
    recognition.onend = () => { if (!processingResult) setVoiceAvailability("stopped"); };
    try { recognition.start(); }
    catch { setVoiceAvailability("stopped"); reportError("Voice recognition could not start. Typed commands remain available."); }
  }

  const hints = ["What needs attention?", "Show blockers", "Draft weekly update"];
  const guidance = microphoneRecoveryGuidance(voiceAvailability, typeof navigator === "undefined" ? "" : navigator.userAgent);
  return <div className={`angora-jarvis-command-bar ${compact ? "angora-jarvis-command-bar--compact" : ""}`}>
    <form onSubmit={submit}>
      <label className="angora-jarvis-sr-only" htmlFor={compact ? "jarvis-global-command" : "jarvis-center-command"}>JARVIS command</label>
      <input id={compact ? "jarvis-global-command" : "jarvis-center-command"} value={commandText} onChange={(event) => setCommandText(event.target.value)} placeholder={voiceAvailability === "listening" ? "Listening..." : voiceAvailability === "processing" ? "Processing voice command..." : "Ask JARVIS or navigate to an account..."} disabled={busy} autoFocus={autoFocus} autoComplete="off" />
      <button type="button" className="angora-jarvis-icon-button" onClick={listen} disabled={!voiceEnabled || !microphoneGranted || busy} aria-label={microphoneGranted ? "Start push-to-talk" : "Enable microphone first"} title={microphoneGranted ? "Push to talk" : guidance}>{microphoneGranted && voiceEnabled ? <Mic /> : <MicOff />}</button>
      <button type="submit" className="angora-jarvis-send" disabled={!commandText.trim() || busy} aria-label="Send command">{busy ? <LoaderCircle className="angora-jarvis-spin" /> : <Send />}</button>
    </form>
    {voiceEnabled && !microphoneGranted && <div className="angora-jarvis-microphone-state" role={voiceAvailability === "denied" ? "alert" : "status"}><button type="button" onClick={() => void enableMicrophone()} disabled={["requesting", "unsupported-browser", "insecure-context", "unavailable"].includes(voiceAvailability)}><Mic />{voiceAvailability === "requesting" ? "Requesting microphone..." : "Enable Microphone"}</button><small><b>{voiceAvailability.replace(/-/g, " ")}</b> - {guidance}</small></div>}
    {suggestions && <div className="angora-jarvis-command-hints" aria-label="Suggested commands">{hints.map((hint) => <button type="button" key={hint} onClick={() => void runCommand(hint)} disabled={busy}>{hint}</button>)}</div>}
    {!suggestions && lastCommand && <small className="angora-jarvis-last-command">Last command: {lastCommand}</small>}
  </div>;
}
