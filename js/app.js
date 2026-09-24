// ============================================================
// app.js: the app's "front desk".
//
// It loads the content, then shows the right screen based on the
// part of the web address after the # sign (e.g. #/review). This is
// called "routing". Each screen is one function below.
// ============================================================

import {
  state, save, addXP, XP, DAILY_GOAL, currentStreak, xpToday, playerLevel,
  unitProgress, markLevelDone, markKnown, dueItemIds, isWeak, record,
  exportJSON, importJSON, resetAll,
} from './store.js';
import {
  loadContent, curriculum, units, allUnits, unitMeta, levelCount, getItem,
  levelItems, unitQuiz, recommendedNext, LEVEL_NAMES,
} from './content.js';
import { runSession } from './session.js';
import { screen, esc, fmt, toast, shuffle } from './ui.js';
import { speak, stop, voices, allVoices, voiceTier, onVoicesReady } from './speech.js';
import { renderDecode } from './decode.js';

const PASS_MARK = 0.7;       // 70% to pass a level
const BOSS_QUESTIONS = 10;
const BOSS_HEARTS = 3;

// ---------- Router ----------

const routes = {
  learn: renderLearn,
  unit: renderUnit,
  study: startStudy,
  boss: startBoss,
  placement: startPlacement,
  review: renderReview,
  practice: startPractice,
  walk: renderWalk,
  decode: renderDecode,
  me: renderMe,
};

function route() {
  stop();
  walkToken++;
  document.body.classList.remove('focus');
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'learn').split('/');
  (routes[name] || renderLearn)(...args);
  document.querySelectorAll('#tabs a').forEach((a) => {
    const tab = { unit: 'learn', study: 'learn', boss: 'learn', placement: 'learn', practice: 'review', walk: 'review' }[name] || name;
    a.classList.toggle('active', a.dataset.tab === tab);
  });
  renderTopbar();
  window.scrollTo(0, 0);
}

export function renderTopbar() {
  const lvl = playerLevel();
  document.getElementById('topbar').innerHTML = `
    <span class="brand">Stride</span>
    <span class="pill" title="Day streak">🔥 ${currentStreak()}</span>
    <span class="pill" title="Today's XP">⚡ ${xpToday()}/${DAILY_GOAL}</span>
    <span class="pill" title="Player level">⭐ ${lvl.level}</span>`;
}

// ---------- Learn tab: the skill map ----------

function unitStatus(unitId) {
  const meta = unitMeta(unitId);
  if (!meta.ready) return { icon: '🔒', label: 'Coming soon', cls: 'soon' };
  const p = unitProgress(unitId);
  const total = levelCount(unitId);
  if (p.bossBeaten) return { icon: '👑', label: 'Mastered', cls: 'mastered' };
  if (p.levelsDone.length >= total) return { icon: '⚔️', label: 'Boss battle ready', cls: '' };
  if (p.levelsDone.length) return { icon: '📘', label: `Level ${p.levelsDone.length + 1}: ${LEVEL_NAMES[p.levelsDone.length + 1]}`, cls: '' };
  return { icon: meta.icon || '📗', label: 'Not started', cls: '' };
}

function pips(unitId) {
  if (!units[unitId]) return '';
  const p = unitProgress(unitId);
  const lv = Array.from({ length: levelCount(unitId) }, (_, i) => `<i class="${p.levelsDone.includes(i + 1) ? 'on' : ''}"></i>`).join('');
  return `<span class="pips">${lv}<i class="boss ${p.bossBeaten ? 'on' : ''}"></i></span>`;
}

function renderLearn() {
  const next = recommendedNext();
  const lvl = playerLevel();

  const welcome = !state.placementDone ? `
    <div class="card">
      <h2 style="margin-top:0">👋 Welcome to Stride</h2>
      <p>Take a 3-minute placement quiz and I'll unlock the levels you already know.</p>
      <a class="btn primary" href="#/placement">Take placement quiz</a>
      <button class="btn ghost" id="skip-placement">Skip, start from the beginning</button>
    </div>` : '';

  const cont = next && state.placementDone ? `
    <a class="btn primary" href="#/unit/${next}">▶ Continue: ${esc(unitMeta(next).title)}</a>` : '';

  const due = dueItemIds().length;
  const reviewNudge = due && state.placementDone ? `<a class="btn" href="#/practice/due">🎯 ${due} item${due === 1 ? '' : 's'} due for review</a>` : '';

  const tracks = curriculum.tracks.map((t) => `
    <section class="track">
      <div class="track-head"><h2>${esc(t.title)}</h2></div>
      <p class="muted small">${esc(t.blurb)}</p>
      ${t.units.map((u) => {
        const s = unitStatus(u.id);
        const isNext = u.id === next;
        const inner = `
          <span class="badge">${s.icon}</span>
          <span class="info">
            <span class="title">${esc(u.title)}</span>
            <span class="sub">${isNext ? '⭐ Recommended next · ' : ''}${esc(s.label)}</span>
            ${pips(u.id)}
          </span>`;
        return u.ready
          ? `<a class="unit ${s.cls} ${isNext ? 'next' : ''}" href="#/unit/${u.id}">${inner}</a>`
          : `<div class="unit soon">${inner}</div>`;
      }).join('')}
    </section>`).join('');

  screen().innerHTML = `
    ${welcome}
    <div class="card">
      <div class="row" style="align-items:center">
        <div><strong>Level ${lvl.level}</strong> <span class="muted small">· ${state.xp} XP total</span></div>
      </div>
      <div class="progress"><span style="width:${Math.round((lvl.into / lvl.need) * 100)}%"></span></div>
      <div class="muted small">${lvl.need - lvl.into} XP to level ${lvl.level + 1} · Today ${xpToday()}/${DAILY_GOAL} XP ${xpToday() >= DAILY_GOAL ? '✅' : ''}</div>
    </div>
    ${cont}
    ${reviewNudge}
    ${tracks}`;

  const skip = document.getElementById('skip-placement');
  if (skip) skip.onclick = () => { state.placementDone = true; save(); route(); };
}

// ---------- A single unit ----------

function renderUnit(unitId) {
  const unit = units[unitId];
  if (!unit) return renderLearn();
  const meta = unitMeta(unitId);
  const p = unitProgress(unitId);
  const total = levelCount(unitId);

  const levels = [1, 2, 3].map((n) => {
    const exists = !!unit.levels[n];
    const done = p.levelsDone.includes(n);
    const open = exists && (n === 1 || p.levelsDone.includes(n - 1));
    if (!exists) {
      return `<div class="card" style="opacity:.55"><strong>Level ${n} · ${LEVEL_NAMES[n]}</strong><div class="muted small">Coming soon</div></div>`;
    }
    return `
      <div class="card">
        <div class="row" style="align-items:center">
          <div><strong>Level ${n} · ${LEVEL_NAMES[n]}</strong></div>
          <div style="text-align:right">${done ? '<span class="tag good">Done ✓</span>' : open ? '' : '<span class="tag">🔒 Locked</span>'}</div>
        </div>
        <p class="muted small" style="margin:6px 0 10px">${esc(unit.levels[n].summary || '')}</p>
        ${open ? `
          <a class="btn ${done ? '' : 'primary'}" href="#/study/${unitId}/${n}">${done ? 'Study again' : 'Start: lesson → cards → quiz'}</a>
          ${done ? '' : `<a class="btn ghost" href="#/study/${unitId}/${n}/quiz">I already know this: just quiz me</a>`}
        ` : `<p class="small muted" style="margin:0">Pass level ${n - 1} to unlock.</p>`}
      </div>`;
  }).join('');

  const bossOpen = p.levelsDone.length >= total;
  const boss = `
    <div class="card" style="${bossOpen ? 'border-color:var(--gold)' : 'opacity:.6'}">
      <strong>⚔️ Boss battle</strong>
      <p class="muted small" style="margin:6px 0 10px">${BOSS_QUESTIONS} mixed questions, ${BOSS_HEARTS} hearts. Beat it to master this unit (+${XP.bossBeaten} XP).</p>
      ${p.bossBeaten ? '<p><span class="tag gold">👑 Beaten</span></p>' : ''}
      ${bossOpen ? `<a class="btn ${p.bossBeaten ? '' : 'primary'}" href="#/boss/${unitId}">${p.bossBeaten ? 'Fight again' : 'Fight the boss'}</a>` : '<p class="small muted" style="margin:0">Finish all levels to unlock.</p>'}
    </div>`;

  const links = (unit.links || []).map((l) => `
    <a class="unit" href="${esc(l.url)}" target="_blank" rel="noopener">
      <span class="badge">${{ video: '🎬', docs: '📚', podcast: '🎧' }[l.type] || '📰'}</span>
      <span class="info"><span class="title">${esc(l.title)}</span><span class="sub">${esc(l.source || '')}${l.minutes ? ` · ${l.minutes} min` : ''}</span></span>
    </a>`).join('');

  screen().innerHTML = `
    <a href="#/learn" class="muted small">‹ Skill map</a>
    <h1>${meta.icon || ''} ${esc(meta.title)}</h1>
    <p class="muted">${esc(unit.intro || meta.blurb || '')}</p>
    ${levels}
    ${boss}
    ${links ? `<h2>Go deeper</h2>${links}` : ''}`;
}

// ---------- Studying a level ----------

function startStudy(unitId, levelStr, mode) {
  const level = Number(levelStr);
  const block = units[unitId]?.levels[level];
  if (!block) return renderLearn();
  const quizOnly = mode === 'quiz';
  const lessonOnly = mode === 'lesson';

  const steps = [];
  if (!quizOnly) block.lesson.forEach((page) => steps.push({ type: 'lesson', page }));
  if (!quizOnly && !lessonOnly) levelItems(unitId, level, 'card').forEach((item) => steps.push({ type: 'card', item }));
  if (!lessonOnly) levelItems(unitId, level, 'quiz').forEach((item) => steps.push({ type: 'quiz', item }));

  runSession({
    title: `${unitMeta(unitId).title} · Level ${level}`,
    steps,
    exitTo: `#/unit/${unitId}`,
    onFinish: (r) => {
      if (lessonOnly) { location.hash = `#/unit/${unitId}`; return; }
      const score = r.answered ? r.correct / r.answered : 0;
      const passed = score >= PASS_MARK;
      const firstPass = passed && !unitProgress(unitId).levelsDone.includes(level);
      if (firstPass) { markLevelDone(unitId, level); addXP(XP.levelPassed); }
      showResult({
        emoji: passed ? '🎉' : '💪',
        title: passed ? `Level ${level} passed!` : 'Almost there',
        body: `You got ${r.correct} of ${r.answered} right (${Math.round(score * 100)}%). ${passed ? (firstPass ? `+${XP.levelPassed} XP bonus.` : '') : `You need ${Math.round(PASS_MARK * 100)}% to pass. The ones you missed are saved to your Review tab.`}`,
        wrongIds: r.wrongIds,
        buttons: passed
          ? [[`#/unit/${unitId}`, 'Continue', true]]
          : [[`#/study/${unitId}/${level}/quiz`, 'Retry the quiz', true], [`#/study/${unitId}/${level}/lesson`, 'Re-read the lesson']],
      });
    },
  });
}

function showResult({ emoji, title, body, wrongIds = [], buttons }) {
  const missed = [...new Set(wrongIds)].map(getItem).filter(Boolean);
  screen().innerHTML = `
    <div class="big-emoji">${emoji}</div>
    <h1 class="center">${esc(title)}</h1>
    <p class="center">${esc(body)}</p>
    ${missed.length ? `
      <h2>What you missed</h2>
      ${missed.map((it) => `
        <div class="card feedback bad">
          ${it.kind === 'card' ? `<strong>${fmt(it.front)}</strong>${fmt(it.back)}` : `${fmt(it.q)}<p><strong>Answer:</strong> ${fmt(it.options[it.answer]).replace(/^<p>|<\/p>$/g, '')}</p><div class="muted small">${fmt(it.why)}</div>`}
        </div>`).join('')}` : ''}
    ${buttons.map(([href, label, primary]) => `<a class="btn ${primary ? 'primary' : ''}" href="${href}">${esc(label)}</a>`).join('')}`;
  speak([title, body]);
  renderTopbar();
}

// ---------- Boss battle ----------

function startBoss(unitId) {
  if (!units[unitId]) return renderLearn();
  // Your weak questions from this unit come first, then random others.
  const all = unitQuiz(unitId);
  const weak = shuffle(all.filter((q) => state.items[q.id] && isWeak(state.items[q.id])));
  const rest = shuffle(all.filter((q) => !weak.includes(q)));
  const picks = [...weak, ...rest].slice(0, BOSS_QUESTIONS);

  runSession({
    title: `⚔️ Boss: ${unitMeta(unitId).title}`,
    steps: shuffle(picks).map((item) => ({ type: 'quiz', item })),
    hearts: BOSS_HEARTS,
    exitTo: `#/unit/${unitId}`,
    onFinish: (r) => {
      const won = !r.outOfHearts;
      const p = unitProgress(unitId);
      const firstWin = won && !p.bossBeaten;
      if (firstWin) { p.bossBeaten = true; addXP(XP.bossBeaten); save(); }
      showResult({
        emoji: won ? '👑' : '💀',
        title: won ? 'Boss defeated!' : 'The boss won this round',
        body: won
          ? `${r.correct} of ${r.answered} correct. ${firstWin ? `Unit mastered! +${XP.bossBeaten} XP.` : ''}`
          : `You ran out of hearts after ${r.answered} questions. Review what you missed, then try again.`,
        wrongIds: r.wrongIds,
        buttons: [[`#/unit/${unitId}`, 'Back to unit', true], ...(won ? [] : [[`#/boss/${unitId}`, 'Try again']])],
      });
    },
  });
}

// ---------- Placement quiz ----------

function startPlacement() {
  // One Level 1 and one Level 2 question from each unit that's ready.
  const picks = [];
  for (const id of curriculum.recommendedOrder) {
    if (!units[id]) continue;
    for (const lvl of [1, 2]) {
      const qs = levelItems(id, lvl, 'quiz');
      if (qs.length) picks.push(shuffle(qs)[0]);
    }
  }
  runSession({
    title: 'Placement quiz',
    steps: picks.map((item) => ({ type: 'quiz', item })),
    exitTo: '#/learn',
    onFinish: (r) => {
      const wrong = new Set(r.wrongIds);
      const unlocked = [];
      for (const id of curriculum.recommendedOrder) {
        if (!units[id]) continue;
        const [q1, q2] = picks.filter((q) => q.unitId === id);
        if (q1 && !wrong.has(q1.id)) {
          markLevelDone(id, 1);
          levelItems(id, 1, 'card').concat(levelItems(id, 1, 'quiz')).forEach((it) => markKnown(it.id));
          unlocked.push(`${unitMeta(id).title} L1`);
          if (q2 && !wrong.has(q2.id)) {
            markLevelDone(id, 2);
            levelItems(id, 2, 'card').concat(levelItems(id, 2, 'quiz')).forEach((it) => markKnown(it.id));
            unlocked.push(`${unitMeta(id).title} L2`);
          }
        }
      }
      state.placementDone = true;
      save();
      showResult({
        emoji: '🧭',
        title: 'Placement done',
        body: unlocked.length
          ? `You tested out of ${unlocked.length} level${unlocked.length === 1 ? '' : 's'}: ${unlocked.join(', ')}.`
          : "No skips this time. That's fine: you'll start at the beginning and move fast.",
        buttons: [['#/learn', 'See my skill map', true]],
      });
    },
  });
}

// ---------- Review tab (Layer 2: weak spots) ----------

// Group your weak items by unit + level, so you see *topics*, not single questions.
function weakSpots() {
  const groups = {};
  for (const [id, it] of Object.entries(state.items)) {
    const item = getItem(id);
    if (!item) continue;
    const key = item.unitId === 'decode' ? 'decode' : `${item.unitId}-${item.level}`;
    const g = groups[key] || (groups[key] = { key, unitId: item.unitId, level: item.level, seen: 0, wrong: 0, weakIds: [] });
    g.seen += it.seen;
    g.wrong += it.wrong;
    if (isWeak(it)) g.weakIds.push(id);
  }
  return Object.values(groups)
    .filter((g) => g.weakIds.length)
    .sort((a, b) => b.weakIds.length - a.weakIds.length || b.wrong / b.seen - a.wrong / a.seen);
}

function renderReview() {
  const due = dueItemIds().length;
  const spots = weakSpots();
  const tracked = Object.keys(state.items).length;

  const spotCards = spots.slice(0, 6).map((g) => {
    const isDecode = g.unitId === 'decode';
    const title = isDecode ? '🔍 From your Decodes' : `${unitMeta(g.unitId).title} · L${g.level} ${LEVEL_NAMES[g.level]}`;
    const accuracy = g.seen ? Math.round((1 - g.wrong / g.seen) * 100) : 0;
    const link = !isDecode && units[g.unitId].links?.[0];
    return `
      <div class="card">
        <div class="row" style="align-items:center">
          <strong>${esc(title)}</strong>
          <div style="text-align:right;flex:0 0 auto"><span class="tag bad">${g.weakIds.length} weak</span></div>
        </div>
        <div class="muted small" style="margin:4px 0 10px">${accuracy}% accuracy so far</div>
        <a class="btn primary" href="#/practice/spot/${g.key}">Practice this</a>
        ${isDecode ? '' : `<div class="row">
          <a class="btn" href="#/study/${g.unitId}/${g.level}/lesson">Re-read lesson</a>
          ${link ? `<a class="btn" href="${esc(link.url)}" target="_blank" rel="noopener">Go deeper ↗</a>` : ''}
        </div>`}
      </div>`;
  }).join('');

  screen().innerHTML = `
    <h1>Review</h1>
    <div class="stat-grid">
      <div class="stat"><b>${due}</b><span>due today</span></div>
      <div class="stat"><b>${spots.reduce((n, g) => n + g.weakIds.length, 0)}</b><span>weak items</span></div>
      <div class="stat"><b>${tracked}</b><span>tracked</span></div>
    </div>
    <a class="btn primary" href="#/practice/due" ${due ? '' : 'aria-disabled="true"'}>${due ? `🎯 Review ${Math.min(due, 15)} due items` : '🎯 Nothing due: mixed practice'}</a>
    <a class="btn" href="#/walk">🚶 Walk Mode (hands-free audio cards)</a>
    <h2>Your weak spots</h2>
    ${spotCards || `<p class="muted">No weak spots yet. When you miss something, it shows up here grouped by topic, with a way to practice it, re-read the lesson, or go deeper.</p>`}
    <p class="muted small">How this works: every card and question you see is tracked. Miss one and it comes back today; get it right and it waits longer each time (1 day, 3 days, a week, ~2 weeks). This is called <strong>spaced repetition</strong>.</p>`;
}

function startedItemIds() {
  // Every item in levels you've started or finished.
  return Object.keys(units).flatMap((id) => {
    const done = unitProgress(id).levelsDone;
    const levels = done.length ? [...done, done.length + 1] : [];
    return levels.flatMap((l) => levelItems(id, l, 'card').concat(levelItems(id, l, 'quiz')).map((it) => it.id));
  });
}

function startPractice(kind, key) {
  let ids;
  let title;
  if (kind === 'spot') {
    const g = weakSpots().find((s) => s.key === key);
    ids = g ? g.weakIds : [];
    title = 'Weak spot practice';
  } else {
    ids = dueItemIds();
    title = 'Review';
    if (!ids.length) {
      ids = shuffle(startedItemIds().length ? startedItemIds() : Object.keys(state.items));
      title = 'Mixed practice';
    }
  }
  const steps = ids.slice(0, 15).map(getItem).filter(Boolean)
    .map((item) => ({ type: item.kind === 'card' ? 'card' : 'quiz', item }));

  if (!steps.length) {
    screen().innerHTML = `<h1>Nothing to practice yet</h1><p>Finish a level on the Learn tab first.</p><a class="btn primary" href="#/learn">Go to Learn</a>`;
    return;
  }
  runSession({
    title,
    steps,
    exitTo: '#/review',
    onFinish: (r) => showResult({
      emoji: '🎯',
      title: 'Review done',
      body: r.answered ? `${r.correct} of ${r.answered} questions right.` : 'Nice work.',
      wrongIds: r.wrongIds,
      buttons: [['#/review', 'Back to Review', true]],
    }),
  });
}

// ---------- Walk Mode: hands-free audio flashcards ----------

let walkToken = 0;

function renderWalk() {
  const due = dueItemIds().map(getItem).filter((it) => it?.kind === 'card');
  const started = shuffle(startedItemIds().map(getItem).filter((it) => it.kind === 'card'));
  const deck = [...new Map([...due, ...started].map((c) => [c.id, c])).values()].slice(0, 20);

  if (!deck.length) {
    screen().innerHTML = `<h1>🚶 Walk Mode</h1><p>Walk Mode plays flashcards from levels you've started. Start a level on the Learn tab first.</p><a class="btn primary" href="#/learn">Go to Learn</a>`;
    return;
  }

  let i = 0;
  let paused = true;
  const token = ++walkToken;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function draw(side) {
    const c = deck[i];
    screen().innerHTML = `
      <a href="#/review" class="muted small">‹ Review</a>
      <h1>🚶 Walk Mode</h1>
      <p class="muted small">Card ${i + 1} of ${deck.length}. It reads the term, pauses so you can answer in your head, then reads the answer.</p>
      <div class="card flash">
        <div>${fmt(c.front)}</div>
        ${side === 'back' ? `<div class="back">${fmt(c.back)}</div>` : '<div class="hint">…think of the answer…</div>'}
      </div>
      <button class="btn primary" id="play">${paused ? '▶ Play' : '⏸ Pause'}</button>
      <div class="row">
        <button class="btn bad" id="missed">I missed that</button>
        <button class="btn" id="skip">Next ⏭</button>
      </div>`;
    document.getElementById('play').onclick = () => {
      paused = !paused;
      if (paused) { walkToken++; stop(); draw(side); } else loop();
    };
    document.getElementById('missed').onclick = () => { record(c.id, false); toast('Saved to weak spots'); advance(); };
    document.getElementById('skip').onclick = advance;
  }

  function advance() {
    walkToken++; // cancels the running loop so it doesn't skip two cards
    stop();
    i = (i + 1) % deck.length;
    draw('front');
    if (!paused) loop();
  }

  async function loop() {
    const my = ++walkToken;
    const alive = () => my === walkToken && !paused;
    while (alive()) {
      const c = deck[i];
      draw('front');
      await speak(c.front);
      if (!alive()) return;
      await wait(3500);
      if (!alive()) return;
      draw('back');
      await speak(c.back);
      if (!alive()) return;
      await wait(1500);
      if (!alive()) return;
      i = (i + 1) % deck.length;
    }
  }

  if (token === walkToken) draw('front');
}

// ---------- Me tab: stats and settings ----------

function renderMe() {
  const lvl = playerLevel();
  const mastered = Object.values(state.units).filter((u) => u.bossBeaten).length;
  const answers = Object.values(state.items).reduce((a, it) => ({ seen: a.seen + it.seen, wrong: a.wrong + it.wrong }), { seen: 0, wrong: 0 });
  const acc = answers.seen ? Math.round((1 - answers.wrong / answers.seen) * 100) + '%' : '–';
  const s = state.settings;

  screen().innerHTML = `
    <h1>Me</h1>
    <div class="stat-grid">
      <div class="stat"><b>${lvl.level}</b><span>level</span></div>
      <div class="stat"><b>${state.xp}</b><span>total XP</span></div>
      <div class="stat"><b>🔥 ${currentStreak()}</b><span>day streak</span></div>
      <div class="stat"><b>${mastered}</b><span>units mastered</span></div>
      <div class="stat"><b>${acc}</b><span>accuracy</span></div>
      <div class="stat"><b>${state.decodes.length}</b><span>decodes</span></div>
    </div>

    <h2>🔊 Audio</h2>
    <div class="card">
      <label class="toggle">Read aloud automatically <input type="checkbox" id="autoRead" ${s.autoRead ? 'checked' : ''}></label>
      <label for="rate">Speaking speed</label>
      <select id="rate">
        ${[0.8, 0.9, 1, 1.1, 1.25, 1.5].map((r) => `<option value="${r}" ${r === s.rate ? 'selected' : ''}>${r}×</option>`).join('')}
      </select>
      <label for="voice">Voice</label>
      <select id="voice"></select>
      <button class="btn" id="test-voice">Test voice</button>
      <p class="muted small">Tip: for a much better voice, go to iPhone Settings → Accessibility → Read &amp; Speak → Voices → English, and download an "Enhanced" voice (not a Siri voice). Then fully close and reopen Stride and pick it here.</p>
      <details><summary class="small">Show all voices iOS shares with Stride</summary><pre class="code" id="voice-debug" style="margin-top:10px"></pre></details>
    </div>

    <h2>🔑 Decode settings</h2>
    <div class="card">
      <label for="apiKey">Anthropic API key</label>
      <input type="password" id="apiKey" placeholder="sk-ant-..." value="${esc(s.apiKey)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <label for="model">Model</label>
      <select id="model">
        <option value="claude-opus-5" ${s.model === 'claude-opus-5' ? 'selected' : ''}>Claude Opus 5: best explanations (~5–8¢ per decode)</option>
        <option value="claude-sonnet-5" ${s.model === 'claude-sonnet-5' ? 'selected' : ''}>Claude Sonnet 5: very good, cheaper (~2–3¢)</option>
        <option value="claude-haiku-4-5" ${s.model === 'claude-haiku-4-5' ? 'selected' : ''}>Claude Haiku 4.5: fastest, cheapest (~1¢)</option>
      </select>
      <button class="btn primary" id="save-key">Save</button>
      ${s.apiKey
        ? `<p class="small" style="color:var(--good)"><strong>✓ Key saved</strong> (ends in …${esc(s.apiKey.slice(-4))}). Decode is ready: <a href="#/decode">try it</a>.</p>`
        : '<p class="small muted">No key saved yet.</p>'}
      <p class="muted small" style="margin:0">Your key is stored only on this phone. It is never part of the app's code and is left out of backups. Set a monthly spend limit in your Anthropic Console as a safety net.</p>
    </div>

    <h2>💾 Backup</h2>
    <div class="card">
      <p class="small">Your progress lives only on this phone. If you remove Stride from your home screen, it's gone, so export a backup now and then.</p>
      <button class="btn" id="export">Export backup file</button>
      <label class="btn" for="import-file" style="font-weight:600">Import backup file</label>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
      <button class="btn bad" id="reset">Reset all progress</button>
    </div>
    <p class="muted small center">Stride · Layers 1–3</p>`;

  const fillVoices = () => {
    const list = voices();
    document.getElementById('voice').innerHTML = `<option value="">Automatic (best available)</option>` +
      list.map((v) => {
        const tier = voiceTier(v);
        return `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.voice ? 'selected' : ''}>${esc(v.name)}${tier ? ` · ${tier}` : ''} (${esc(v.lang)})</option>`;
      }).join('');
    const all = allVoices();
    document.getElementById('voice-debug').textContent = `${all.length} voices total\n\n` +
      all.map((v) => `${v.name} | ${v.lang} | ${v.voiceURI}`).join('\n');
  };
  fillVoices();
  onVoicesReady(fillVoices);

  const bind = (id, fn) => { document.getElementById(id).onchange = fn; };
  bind('autoRead', (e) => { s.autoRead = e.target.checked; save(); });
  bind('rate', (e) => { s.rate = Number(e.target.value); save(); });
  bind('voice', (e) => { s.voice = e.target.value; save(); });
  document.getElementById('test-voice').onclick = () => speak('Hi! This is how I will sound on your walk.');
  document.getElementById('save-key').onclick = () => {
    s.apiKey = document.getElementById('apiKey').value.trim();
    s.model = document.getElementById('model').value;
    save();
    toast(s.apiKey ? 'Saved on this phone' : 'Key removed');
    renderMe(); // redraw so the "✓ Key saved" line appears
  };
  document.getElementById('export').onclick = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stride-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  document.getElementById('import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { importJSON(await file.text()); toast('Backup restored'); route(); }
    catch (err) { toast(err.message); }
  };
  document.getElementById('reset').onclick = () => {
    if (confirm('Erase all XP, streaks and progress on this phone? This cannot be undone.')) { resetAll(); route(); }
  };
}

// ---------- Start the app ----------

async function start() {
  screen().innerHTML = '<p class="muted center" style="margin-top:40px">Loading…</p>';
  try {
    await loadContent();
  } catch (e) {
    screen().innerHTML = `<h1>Couldn't load lessons</h1><p class="muted">${esc(e.message)}</p>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

// The service worker keeps a copy of the app on your phone so it opens
// instantly and works offline (see sw.js).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
