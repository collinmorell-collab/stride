// ============================================================
// speech.js: reads text out loud using your phone's built-in voice.
// This uses the "Web Speech API", a feature built into browsers, so
// it's free and needs no internet once the app is loaded.
// ============================================================

import { state } from './store.js';

const synth = window.speechSynthesis;

// Apple ships some novelty voices (singing, whispering...). Hide those.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical/i;

export function voices() {
  if (!synth) return [];
  return synth.getVoices().filter((v) => v.lang.startsWith('en') && !NOVELTY.test(v.name));
}

// Pick the voice you chose in Settings, or the best-sounding English one.
function pickVoice() {
  const list = voices();
  if (!list.length) return null;
  const chosen = list.find((v) => v.voiceURI === state.settings.voice);
  if (chosen) return chosen;
  const us = list.filter((v) => v.lang === 'en-US');
  const pool = us.length ? us : list;
  return (
    pool.find((v) => /premium|enhanced/i.test(v.name)) ||
    pool.find((v) => /samantha|ava|allison/i.test(v.name)) ||
    pool[0]
  );
}

// Turn our lesson text into something that sounds good out loud:
// drop formatting symbols, and don't try to pronounce code.
export function speakable(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' (see the code on screen) ')
    .replace(/`([^`]{1,24})`/g, '$1')
    .replace(/`[^`]+`/g, ' (see screen) ')
    .replace(/\*/g, '')
    .replace(/[#>_]/g, ' ');
}

// Speak one or more pieces of text in order. Returns a promise that
// finishes when speaking ends (or is interrupted).
export function speak(parts) {
  if (!synth) return Promise.resolve();
  stop();
  const list = Array.isArray(parts) ? parts : [parts];
  const voice = pickVoice();
  let last;
  const done = new Promise((resolve) => {
    list.filter(Boolean).forEach((text, i, arr) => {
      const u = new SpeechSynthesisUtterance(speakable(text));
      if (voice) u.voice = voice;
      u.rate = state.settings.rate;
      if (i === arr.length - 1) { u.onend = resolve; u.onerror = resolve; last = u; }
      synth.speak(u);
    });
    if (!last) resolve();
  });
  return done;
}

// Only speak if "Read aloud automatically" is on.
export function autoSpeak(parts) {
  if (state.settings.autoRead) speak(parts);
}

export function stop() {
  if (synth) synth.cancel();
}

// Voices load a moment after the page opens; let the Settings screen know.
export function onVoicesReady(fn) {
  if (synth) synth.addEventListener('voiceschanged', fn);
}
