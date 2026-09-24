// ============================================================
// news.js: Layer 4, the News tab.
//
// Shows the feed the robot builds every morning: a weekly Top 5
// briefing you can listen to, then the daily picks. Summaries and
// links only; tap through to read the original.
// ============================================================

import { state, save, today } from './store.js';
import { feed, getItem, unitMeta, newsItemIds } from './content.js';
import { runSession } from './session.js';
import { screen, esc, fmt, toast } from './ui.js';
import { speak, stop, toggleSpeak } from './speech.js';

export const CATEGORIES = {
  labs: 'AI labs',
  'claude-code': 'Claude Code',
  pm: 'PM + AI',
  builders: 'Builders',
};

const FILTERS = [['all', 'All'], ['must', '⭐ Must-know'], ...Object.entries(CATEGORIES)];

// How many feed items arrived since you last opened the News tab.
export function unreadCount() {
  const since = state.feedSeenAt || '';
  return feed.items.filter((it) => it.added > since).length;
}

export function latestWeekly() {
  return feed.weekly[0] || null;
}

// Must-know items automatically join your Review queue (spaced repetition).
export function queueMustKnows() {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  let added = 0;
  for (const it of feed.items) {
    if (!it.mustKnow || new Date(it.added) < cutoff) continue;
    for (const id of newsItemIds(`n-${it.id}`, it)) {
      if (!state.items[id]) {
        state.items[id] = { box: 1, due: today(), seen: 0, wrong: 0, lastWrong: null };
        added++;
      }
    }
  }
  if (added) save();
}

function dayLabel(iso) {
  const d = new Date(iso);
  const key = d.toDateString();
  if (key === new Date().toDateString()) return 'Today';
  if (key === new Date(Date.now() - 864e5).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function ago(iso) {
  if (!iso) return 'never';
  const hours = Math.round((Date.now() - new Date(iso)) / 36e5);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function itemCard(it, isNew) {
  const related = (it.related || []).filter((id) => unitMeta(id)?.ready)
    .map((id) => `<a class="tag" href="#/unit/${id}" style="text-decoration:none">📘 ${esc(unitMeta(id).title)}</a>`).join(' ');
  return `
    <div class="card">
      <div class="small muted" style="margin-bottom:4px">
        ${isNew ? '<span class="tag good">NEW</span> ' : ''}${it.mustKnow ? '<span class="tag gold">⭐ Must-know</span> ' : ''}
        <span class="tag">${esc(CATEGORIES[it.category] || it.category)}</span> · ${esc(it.source)}
      </div>
      <h3 style="margin:6px 0">${esc(it.title)}</h3>
      <p>${esc(it.summary)}</p>
      <p class="small"><strong>💼 For you:</strong> ${esc(it.why)}</p>
      ${related ? `<p>${related}</p>` : ''}
      <a class="btn" href="${esc(it.link)}" target="_blank" rel="noopener" style="margin:0">Open original ↗</a>
    </div>`;
}

export function renderNews() {
  const lastSeen = state.feedSeenAt || '';
  const filter = state.newsFilter || 'all';
  const weekly = latestWeekly();

  const shown = feed.items.filter((it) =>
    filter === 'all' ? true : filter === 'must' ? it.mustKnow : it.category === filter);

  // Group by the day each post was published.
  const groups = [];
  for (const it of shown) {
    const label = dayLabel(it.date || it.added);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(it);
  }

  const fresh = feed.items.filter((it) => it.added > lastSeen);
  const weeklyIds = weekly ? newsItemIds(`w-${weekly.weekOf}`, weekly) : [];

  screen().innerHTML = `
    <h1>📰 News</h1>
    <p class="muted small">Picked for you from ${feed.items.length ? 'Lenny, the AI labs, Claude Code and more' : 'your sources'} · updated ${ago(feed.updated)}</p>

    ${weekly ? `
      <div class="card" style="border-color:var(--gold)">
        <div class="small muted">🏆 Week of ${new Date(weekly.weekOf + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
        <h2 style="margin:6px 0 10px">${esc(weekly.headline)}</h2>
        <button class="btn primary" id="listen-weekly">▶ Listen to this week's briefing</button>
        ${weeklyIds.length ? `<button class="btn" id="quiz-weekly">🧩 Quiz me on this week (${weeklyIds.length})</button>` : ''}
        <details><summary class="small"><strong>This week's Top 5</strong></summary>
          ${weekly.top5.map((t, i) => `
            <p style="margin-top:10px"><strong>${i + 1}. <a href="${esc(t.link)}" target="_blank" rel="noopener">${esc(t.title)}</a></strong><br>
            <span class="small muted">${esc(t.source)}</span><br><span class="small">${esc(t.why)}</span></p>`).join('')}
        </details>
      </div>` : ''}

    ${fresh.length ? `<button class="btn" id="listen-new">🎧 Listen to ${fresh.length} new item${fresh.length === 1 ? '' : 's'}</button>` : ''}

    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin:8px 0 4px">
      ${FILTERS.map(([key, label]) => `<button class="tag ${key === filter ? 'good' : ''}" data-filter="${key}" style="border:none;padding:8px 12px;font-size:14px;white-space:nowrap;cursor:pointer">${label}</button>`).join('')}
    </div>

    ${groups.map((g) => `<h2>${esc(g.label)}</h2>${g.items.map((it) => itemCard(it, it.added > lastSeen)).join('')}`).join('')}

    ${!feed.items.length ? `
      <div class="card"><p><strong>No news yet.</strong></p>
      <p class="muted small">The news robot runs every morning on GitHub. Once it's set up, fresh picks from Lenny, the AI labs, Claude Code and builder blogs will show up here, and must-know items join your Review queue automatically.</p></div>` : ''}`;

  // Mark everything as seen now that you've opened the tab.
  state.feedSeenAt = new Date().toISOString();
  save();

  document.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { state.newsFilter = b.dataset.filter; save(); renderNews(); };
  });

  const lw = document.getElementById('listen-weekly');
  if (lw) {
    let playing = false;
    lw.onclick = () => {
      playing = !playing;
      if (playing) {
        lw.textContent = '⏸ Stop';
        state.weeklyHeard = weekly.weekOf;
        save();
        speak([weekly.headline, weekly.script]).then(() => { playing = false; lw.textContent = "▶ Listen to this week's briefing"; });
      } else { stop(); lw.textContent = "▶ Listen to this week's briefing"; }
    };
  }

  const qw = document.getElementById('quiz-weekly');
  if (qw) {
    qw.onclick = () => runSession({
      title: `This week: ${weekly.headline}`,
      steps: weeklyIds.map(getItem).filter(Boolean).map((item) => ({ type: item.kind === 'card' ? 'card' : 'quiz', item })),
      exitTo: '#/news',
      onFinish: (r) => { toast(r.answered ? `${r.correct} of ${r.answered} right` : 'Nice work'); location.hash = '#/news'; renderNews(); },
    });
  }

  const ln = document.getElementById('listen-new');
  if (ln) {
    ln.onclick = () => toggleSpeak(fresh.flatMap((it, i) => [`${i + 1}. ${it.title}. From ${it.source}.`, it.summary, `For you: ${it.why}`]));
  }
}
