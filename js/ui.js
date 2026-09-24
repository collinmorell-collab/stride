// ============================================================
// ui.js: small helpers used by every screen.
// ============================================================

export const screen = () => document.getElementById('screen');

// "Escape" text so characters like < and > show up as text instead of
// being treated as HTML. This matters a lot for code snippets.
export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A tiny formatter for lesson text:
//   ```code block```   `inline code`   **bold**   *italic*   blank line = new paragraph
// Code is set aside first so symbols inside it (like ** in `**/*.js`)
// aren't mistaken for formatting.
export function fmt(text) {
  const saved = [];
  const stash = (html) => { saved.push(html); return `\u0000${saved.length - 1}\u0000`; };
  let out = esc(text)
    .replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, code) => `\n\n${stash(`<pre class="code">${code.replace(/^\n|\n$/g, '')}</pre>`)}\n\n`)
    .replace(/`([^`]+)`/g, (_, code) => stash(`<code>${code}</code>`))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
  out = out
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^\u0000\d+\u0000$/.test(p) && saved[p.slice(1, -1)].startsWith('<pre') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`))
    .join('');
  return out.replace(/\u0000(\d+)\u0000/g, (_, n) => saved[n]);
}

export function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress"><span style="width:${pct}%"></span></div>`;
}
