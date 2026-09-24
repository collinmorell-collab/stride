// ============================================================
// store.js: your progress, saved on your phone.
//
// Everything (XP, streak, what you got wrong, settings) lives in one
// object called `state`. We save it to the browser's localStorage,
// which is a small private notebook each website gets on your device.
// Nothing here is sent anywhere.
// ============================================================

const KEY = 'stride-v1';

// Spaced repetition: after a right answer an item moves up a "box";
// each box waits longer before showing the item again.
// Box:           1  2  3  4   5
const WAIT_DAYS = [0, 1, 3, 7, 16];

export const XP = {
  lesson: 5,
  cardGotIt: 5,
  correct: 10,
  levelPassed: 25,
  bossBeaten: 100,
  decode: 10,
};

export const DAILY_GOAL = 50;

function fresh() {
  return {
    xp: 0,
    streak: { count: 0, lastDay: null },
    days: {},              // "2026-09-23": xp earned that day
    units: {},             // "a0": { levelsDone: [1,2], bossBeaten: true }
    items: {},             // "a0-1-q3": { box, due, seen, wrong, lastWrong }
    custom: {},            // cards/questions created by Decode
    decodes: [],           // Decode history
    placementDone: false,
    settings: {
      autoRead: true,
      rate: 1,
      voice: '',
      apiKey: '',
      model: 'claude-opus-5',
    },
  };
}

export let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      const base = fresh();
      return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
    }
  } catch (e) { /* storage blocked or corrupted: start fresh */ }
  return fresh();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------- Dates ----------

// "2026-09-23" in your local time zone
export function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- XP, levels, streak ----------

export function addXP(amount) {
  state.xp += amount;
  const day = today();
  state.days[day] = (state.days[day] || 0) + amount;
  touchStreak();
  save();
}

function touchStreak() {
  const day = today();
  const s = state.streak;
  if (s.lastDay === day) return;
  s.count = s.lastDay === today(-1) ? s.count + 1 : 1;
  s.lastDay = day;
}

// The streak shown on screen: if you missed yesterday it resets to 0.
export function currentStreak() {
  const s = state.streak;
  return s.lastDay === today() || s.lastDay === today(-1) ? s.count : 0;
}

export function xpToday() {
  return state.days[today()] || 0;
}

// Player level: each level needs 100 more XP than the last (100, 200, 300...).
export function playerLevel() {
  let level = 1, need = 100, xp = state.xp;
  while (xp >= need) { xp -= need; level++; need += 100; }
  return { level, into: xp, need };
}

// ---------- Units and levels ----------

export function unitProgress(unitId) {
  if (!state.units[unitId]) state.units[unitId] = { levelsDone: [], bossBeaten: false };
  return state.units[unitId];
}

export function markLevelDone(unitId, level) {
  const u = unitProgress(unitId);
  if (!u.levelsDone.includes(level)) u.levelsDone.push(level);
  save();
}

// ---------- Tracking right and wrong answers (Layer 2) ----------

export function record(itemId, correct) {
  const it = state.items[itemId] || { box: 1, due: today(), seen: 0, wrong: 0, lastWrong: null };
  it.seen++;
  if (correct) {
    it.box = Math.min(it.box + 1, 5);
  } else {
    it.wrong++;
    it.box = 1;
    it.lastWrong = Date.now();
  }
  it.due = today(WAIT_DAYS[it.box - 1]);
  state.items[itemId] = it;
  save();
}

// When you test out of something, treat it as "known" so it shows up rarely.
export function markKnown(itemId) {
  if (state.items[itemId]) return;
  state.items[itemId] = { box: 3, due: today(3), seen: 0, wrong: 0, lastWrong: null };
}

// Items whose review date has arrived, weakest first.
export function dueItemIds() {
  const day = today();
  return Object.entries(state.items)
    .filter(([, it]) => it.due <= day)
    .sort((a, b) => a[1].box - b[1].box || b[1].wrong - a[1].wrong)
    .map(([id]) => id);
}

// An item is "weak" if you've missed it and haven't yet climbed back up.
export function isWeak(it) {
  return it.wrong > 0 && it.box <= 2;
}

// ---------- Backup ----------

export function exportJSON() {
  return JSON.stringify({ ...state, settings: { ...state.settings, apiKey: '' } }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (typeof data.xp !== 'number' || !data.items) throw new Error('That does not look like a Stride backup.');
  const key = state.settings.apiKey;
  state = { ...fresh(), ...data, settings: { ...fresh().settings, ...data.settings, apiKey: key } };
  save();
}

export function resetAll() {
  const key = state.settings.apiKey;
  state = fresh();
  state.settings.apiKey = key;
  save();
}
