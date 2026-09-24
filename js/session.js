// ============================================================
// session.js: the "game engine".
//
// A session is a list of steps (lesson pages, flashcards, quiz
// questions) shown one at a time. Lessons, reviews, boss battles and
// the placement quiz all use this same engine with different steps.
// ============================================================

import { screen, esc, fmt, shuffle, progressBar } from './ui.js';
import { record, addXP, XP } from './store.js';
import { autoSpeak, speak, stop } from './speech.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// steps: [{ type: 'lesson', page } | { type: 'card', item } | { type: 'quiz', item }]
// hearts: number of wrong answers allowed (boss battles), or null
// onFinish(results): called at the end with the score
export function runSession({ title, steps, hearts = null, onFinish, exitTo = '#/learn' }) {
  let i = 0;
  let heartsLeft = hearts;
  const results = { correct: 0, answered: 0, wrongIds: [], outOfHearts: false };

  document.body.classList.add('focus');

  function header() {
    const heartRow = hearts ? `<div class="hearts">${'❤️'.repeat(heartsLeft)}${'🤍'.repeat(hearts - heartsLeft)}</div>` : '';
    return `
      <div class="row" style="align-items:center">
        <a class="muted" href="${exitTo}" style="flex:0 0 auto;text-decoration:none;font-size:22px" aria-label="Exit">✕</a>
        <div style="flex:1">${progressBar(i, steps.length)}</div>
      </div>
      <div class="row" style="align-items:center;margin-bottom:8px">
        <div class="muted small" style="flex:3">${esc(title)}</div>
        <div style="text-align:right">${heartRow}</div>
      </div>`;
  }

  function next() {
    stop();
    i++;
    if (i >= steps.length || (hearts && heartsLeft <= 0)) return finish();
    show();
  }

  function finish() {
    stop();
    document.body.classList.remove('focus');
    results.outOfHearts = hearts ? heartsLeft <= 0 : false;
    onFinish(results);
  }

  function show() {
    const step = steps[i];
    if (step.type === 'lesson') showLesson(step.page);
    else if (step.type === 'card') showCard(step.item);
    else showQuiz(step.item);
    window.scrollTo(0, 0);
  }

  // ---------- Lesson page ----------
  function showLesson(page) {
    screen().innerHTML = `
      ${header()}
      <div class="card">
        <button class="speak" id="say" aria-label="Read aloud">🔊</button>
        <h1>${esc(page.title)}</h1>
        ${fmt(page.body)}
        ${page.pm ? `<div class="card" style="background:var(--surface-2);margin:8px 0 0"><strong>💼 Why a PM cares:</strong> ${fmt(page.pm)}</div>` : ''}
      </div>
      <button class="btn primary" id="next">Next</button>`;
    const parts = [page.title, page.body, page.pm ? 'Why a PM cares. ' + page.pm : ''];
    autoSpeak(parts);
    document.getElementById('say').onclick = () => speak(parts);
    document.getElementById('next').onclick = () => { addXP(XP.lesson); next(); };
  }

  // ---------- Flashcard ----------
  function showCard(item) {
    screen().innerHTML = `
      ${header()}
      <div class="card flash" id="card">
        <div>${fmt(item.front)}</div>
        <div class="hint">Tap to flip</div>
      </div>
      <div id="actions"></div>`;
    autoSpeak(item.front);
    document.getElementById('card').onclick = flip;

    function flip() {
      const card = document.getElementById('card');
      card.onclick = null;
      card.innerHTML = `<div>${fmt(item.front)}</div><div class="back">${fmt(item.back)}</div>`;
      autoSpeak(item.back);
      document.getElementById('actions').innerHTML = `
        <div class="row">
          <button class="btn bad" id="no">Not yet</button>
          <button class="btn good" id="yes">Got it</button>
        </div>`;
      document.getElementById('no').onclick = () => { record(item.id, false); results.wrongIds.push(item.id); next(); };
      document.getElementById('yes').onclick = () => { record(item.id, true); addXP(XP.cardGotIt); next(); };
    }
  }

  // ---------- Quiz question ----------
  function showQuiz(item) {
    // Shuffle answer order so you learn the idea, not the position.
    const order = shuffle(item.options.map((_, idx) => idx));
    screen().innerHTML = `
      ${header()}
      <div class="card">
        <button class="speak" id="say" aria-label="Read aloud">🔊</button>
        ${fmt(item.q)}
        ${item.code ? `<pre class="code">${esc(item.code)}</pre>` : ''}
      </div>
      <div id="options">
        ${order.map((opt, pos) => `
          <button class="btn option" data-opt="${opt}">
            <span class="letter">${LETTERS[pos]}</span><span>${fmt(item.options[opt]).replace(/^<p>|<\/p>$/g, '')}</span>
          </button>`).join('')}
      </div>
      <div id="after"></div>`;

    const spoken = [item.q, ...order.map((opt, pos) => `${LETTERS[pos]}: ${item.options[opt]}`)];
    autoSpeak(spoken);
    document.getElementById('say').onclick = () => speak(spoken);

    document.querySelectorAll('.option').forEach((btn) => {
      btn.onclick = () => answer(Number(btn.dataset.opt));
    });

    function answer(chosen) {
      const correct = chosen === item.answer;
      document.querySelectorAll('.option').forEach((btn) => {
        const opt = Number(btn.dataset.opt);
        if (opt === item.answer) btn.classList.add('correct');
        else if (opt === chosen) btn.classList.add('wrong');
        btn.onclick = null;
      });
      results.answered++;
      record(item.id, correct);
      if (correct) { results.correct++; addXP(XP.correct); }
      else {
        results.wrongIds.push(item.id);
        if (hearts) heartsLeft--;
      }
      const rightLetter = LETTERS[order.indexOf(item.answer)];
      document.getElementById('after').innerHTML = `
        <div class="card feedback ${correct ? 'good' : 'bad'}">
          <strong>${correct ? '✅ Correct!' : `❌ Not quite. The answer is ${rightLetter}.`}</strong>
          ${fmt(item.why)}
        </div>
        <button class="btn primary" id="next">${hearts && heartsLeft <= 0 ? 'See result' : 'Next'}</button>`;
      autoSpeak([correct ? 'Correct!' : `Not quite. The answer is ${rightLetter}.`, item.why]);
      document.getElementById('next').onclick = next;
      if (hearts) document.querySelector('.hearts').innerHTML = '❤️'.repeat(Math.max(heartsLeft, 0)) + '🤍'.repeat(hearts - Math.max(heartsLeft, 0));
      document.getElementById('after').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (!steps.length) return finish();
  show();
}
