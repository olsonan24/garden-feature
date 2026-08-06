"use client";

import { LoaderCircle, Mic, MicOff, Send } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
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
  const {
    commandText, setCommandText, runCommand, mode, lastCommand, voiceAvailability, voiceEnabled,
    setVoiceAvailability, setMode, reportError,
  } = useJarvisAssistant();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const busy = ["thinking", "analyzing", "navigating"].includes(mode);

  useEffect(() => {
    setVoiceAvailability(window.SpeechRecognition || window.webkitSpeechRecognition ? "available" : "unavailable");
    return () => recognitionRef.current?.stop();
  }, [setVoiceAvailability]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCommand();
  }

  function listen() {
    if (!voiceEnabled || voiceAvailability !== "available" || busy) return;
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setVoiceAvailability("unavailable");
      reportError("Voice recognition is unavailable in this browser. Typed commands still work.");
      return;
    }
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setMode("listening");
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setCommandText(transcript);
      void runCommand(transcript);
    };
    recognition.onerror = (event) => reportError(event.error === "not-allowed" ? "Microphone permission was not granted. Typed commands remain available." : "Voice recognition stopped before a command was captured. Typed commands remain available.");
    recognition.onend = () => setMode((mode === "listening") ? "idle" : mode);
    try { recognition.start(); }
    catch { reportError("Voice recognition could not start. Typed commands remain available."); }
  }

  const hints = ["What needs attention?", "Show blockers", "Draft weekly update"];
  return <div className={`angora-jarvis-command-bar ${compact ? "angora-jarvis-command-bar--compact" : ""}`}>
    <form onSubmit={submit}>
      <label className="angora-jarvis-sr-only" htmlFor={compact ? "jarvis-global-command" : "jarvis-center-command"}>JARVIS command</label>
      <input id={compact ? "jarvis-global-command" : "jarvis-center-command"} value={commandText} onChange={(event) => setCommandText(event.target.value)} placeholder={mode === "listening" ? "Listening…" : "Ask JARVIS or navigate to an account…"} disabled={busy} autoFocus={autoFocus} autoComplete="off" />
      <button type="button" className="angora-jarvis-icon-button" onClick={listen} disabled={!voiceEnabled || voiceAvailability !== "available" || busy} aria-label={voiceAvailability === "available" ? "Start push-to-talk" : "Voice recognition unavailable"} title={voiceAvailability === "available" ? "Push to talk" : "Voice unavailable in this browser"}>{voiceAvailability === "available" && voiceEnabled ? <Mic /> : <MicOff />}</button>
      <button type="submit" className="angora-jarvis-send" disabled={!commandText.trim() || busy} aria-label="Send command">{busy ? <LoaderCircle className="angora-jarvis-spin" /> : <Send />}</button>
    </form>
    {suggestions && <div className="angora-jarvis-command-hints" aria-label="Suggested commands">{hints.map((hint) => <button type="button" key={hint} onClick={() => void runCommand(hint)} disabled={busy}>{hint}</button>)}</div>}
    {!suggestions && lastCommand && <small className="angora-jarvis-last-command">Last command: {lastCommand}</small>}
  </div>;
}

