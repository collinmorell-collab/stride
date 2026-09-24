// ============================================================
// content.js: loads the lessons from the /content folder.
//
// The curriculum lives in plain JSON files so you can read and edit
// them without touching any code. Each item (card or question) gets an
// ID like "a3-1-q2" = unit a3, level 1, question 2. Your progress is
// keyed by these IDs, so add new items at the END of a list.
// ============================================================

import { state } from './store.js';

export let curriculum = null;   // tracks and units, from curriculum.json
export const units = {};        // full unit content, by unit id
const items = {};               // every card and question, by item id

export const LEVEL_NAMES = { 1: 'Spot it', 2: 'Explain it', 3: 'Use it' };

export async function loadContent() {
  curriculum = await (await fetch('content/curriculum.json')).json();
  const ready = allUnits().filter((u) => u.ready);
  await Promise.all(ready.map(async (u) => {
    const data = await (await fetch(`content/units/${u.id}.json`)).json();
    units[u.id] = data;
    indexUnit(data);
  }));
}

function indexUnit(unit) {
  for (const [level, block] of Object.entries(unit.levels)) {
    (block.cards || []).forEach((c, i) => {
      c.id = `${unit.id}-${level}-c${i + 1}`;
      items[c.id] = { ...c, kind: 'card', unitId: unit.id, level: Number(level) };
    });
    (block.quiz || []).forEach((q, i) => {
      q.id = `${unit.id}-${level}-q${i + 1}`;
      items[q.id] = { ...q, kind: 'quiz', unitId: unit.id, level: Number(level) };
    });
  }
}

// Unit summaries (id, title, track...) in curriculum order.
export function allUnits() {
  return curriculum.tracks.flatMap((t) => t.units.map((u) => ({ ...u, track: t.id })));
}

export function unitMeta(unitId) {
  return allUnits().find((u) => u.id === unitId);
}

export function levelCount(unitId) {
  return Object.keys(units[unitId]?.levels || {}).length;
}

// Look up any card or question, including ones Decode created.
export function getItem(id) {
  return items[id] || state.custom[id] || null;
}

export function levelItems(unitId, level, kind) {
  const block = units[unitId]?.levels[level];
  if (!block) return [];
  return (kind === 'card' ? block.cards : block.quiz).map((x) => getItem(x.id));
}

export function unitQuiz(unitId) {
  return Object.keys(units[unitId].levels).flatMap((lvl) => levelItems(unitId, lvl, 'quiz'));
}

// The first unit in the recommended order that isn't finished yet.
export function recommendedNext() {
  for (const id of curriculum.recommendedOrder) {
    if (!units[id]) continue;
    const done = state.units[id]?.levelsDone || [];
    if (done.length < levelCount(id)) return id;
  }
  return null;
}
