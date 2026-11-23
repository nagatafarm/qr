// 3つの画面（カレンダー・ホワイトボード・人の割り振り表）で、見ている日をそろえる（2026-11-23）。
//   viewSync.on() … 連動しているか（上の帯の「🔗 日付を連動」。はじめはオン。このブラウザに覚える）
//   viewSync.day() … 連動しているとき、ほかの画面で最後に見ていた日（yyyy-MM-dd。なければ空）
//   viewSync.put(日) … 今見ている日を覚える（連動しているときだけ）
//   viewSync.button() / viewSync.bind(ボタン) … 連動のボタン
//   viewSync.mini(見出しの要素, 今の日, 選んだときの関数, {start: 週の始まりの曜日, span: 見ている日数}) … 小さなカレンダー（日を選んで飛ぶ）
(function () {
  const K_ON = 'qrdemo.syncView', K_DAY = 'qrdemo.viewDay';
  const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const css = document.createElement('style');
  css.textContent = `
  .vsync { background: #fff; border: 1px solid #bbb; border-radius: 999px; padding: 5px 12px; cursor: pointer; font-size: 13px; color: #555; font-family: inherit; white-space: nowrap; }
  .vsync.on { background: #eef2ff; border-color: #8fa4ff; color: #2f47c9; font-weight: bold; }
  .vs-ttl { cursor: pointer; border-radius: 8px; padding: 0 6px; }
  .vs-ttl::after { content: ' ▾'; font-size: .8em; color: #888; }
  .vs-ttl:hover, .vs-ttl.open { background: #eef0f3; }
  #vsmini { position: fixed; z-index: 70; background: #fff; border: 1px solid #ccc; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 8px 10px 10px; width: 260px; font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; }
  #vsmini[hidden] { display: none; }
  #vsmini .mh { display: flex; align-items: center; justify-content: space-between; font-weight: bold; font-size: 14px; margin-bottom: 4px; }
  #vsmini .mh button { border: none; background: none; font-size: 18px; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #333; }
  #vsmini .g { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 2px; text-align: center; }
  #vsmini .g .w { font-size: 11px; color: #888; padding: 2px 0; }
  #vsmini .g button { border: none; background: none; height: 32px; padding: 0; cursor: pointer; font-size: 13px; color: #222; border-radius: 50%; font-family: inherit; }
  #vsmini .g button.o { color: #bbb; }
  #vsmini .g button.in { background: #f0f6f1; border-radius: 0; }
  #vsmini .g button.t { color: #1a73e8; font-weight: bold; box-shadow: inset 0 0 0 2px #1a73e8; border-radius: 50%; }
  #vsmini .g .sun { color: #d33; } #vsmini .g .sat { color: #1a5fb4; }
  #vsmini .mh button:hover, #vsmini .g button:hover { background: #e3ece4; }
  #vsmini .mf { display: flex; justify-content: flex-end; margin-top: 6px; }
  #vsmini .mf button { border: 1px solid #bbb; background: #fff; border-radius: 999px; padding: 3px 12px; font-size: 12px; cursor: pointer; font-family: inherit; }`;
  document.head.appendChild(css);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const add = (k, n) => new Date(Date.parse(k + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const dow = k => new Date(Date.parse(k + 'T00:00:00Z')).getUTCDay();
  let box = null, month = '', opts = null;
  function draw() {
    const s0 = add(month, -((dow(month) - opts.start + 7) % 7)), mon = month.slice(0, 7), T = today();
    const inView = k => opts.cur && k >= opts.cur && k <= add(opts.cur, (opts.span || 1) - 1);
    box.innerHTML = `<div class="mh"><button type="button" data-m="-1" aria-label="前の月">‹</button><span>${month.slice(0, 4)}年${Number(month.slice(5, 7))}月</span><button type="button" data-m="1" aria-label="次の月">›</button></div>
      <div class="g">${Array.from({ length: 7 }, (_, i) => { const d = (opts.start + i) % 7; return `<span class="w${d === 0 ? ' sun' : d === 6 ? ' sat' : ''}">${'日月火水木金土'[d]}</span>`; }).join('')}
      ${Array.from({ length: 42 }, (_, i) => add(s0, i)).map(k => { const d = dow(k); return `<button type="button" data-k="${k}" class="${k.slice(0, 7) !== mon ? 'o' : d === 0 ? 'sun' : d === 6 ? 'sat' : ''}${inView(k) ? ' in' : ''}${k === T ? ' t' : ''}">${Number(k.slice(8))}</button>`; }).join('')}</div>
      <div class="mf"><button type="button" data-k="${T}">今日</button></div>`;
  }
  function close() { if (box) box.hidden = true; if (opts && opts.el) opts.el.classList.remove('open'); opts = null; }
  window.viewSync = {
    on: () => get(K_ON) !== '0',
    day() { return this.on() ? get(K_DAY) : ''; },
    put(k) { if (this.on() && /^\d{4}-\d{2}-\d{2}$/.test(k || '')) put(K_DAY, k); },
    button() { return `<button type="button" class="vsync${this.on() ? ' on' : ''}" data-vsync="1" title="オンの間は、ほかの画面（カレンダー・ホワイトボード・人の割り振り表）で見ていた日から開く">🔗 日付を連動${this.on() ? '中' : 'しない'}</button>`; },
    bind(el, getDay) {
      if (!el) return;
      el.onclick = () => {
        put(K_ON, this.on() ? '0' : '');
        el.classList.toggle('on', this.on());
        el.textContent = '🔗 日付を連動' + (this.on() ? '中' : 'しない');
        if (this.on() && getDay) this.put(getDay());
      };
    },
    mini(el, cur, pick, o) {
      if (!box) {
        box = document.createElement('div'); box.id = 'vsmini'; box.hidden = true; document.body.appendChild(box);
        box.addEventListener('click', ev => {
          const b = ev.target.closest('button'); if (!b || !opts) return;
          if (b.dataset.m) { const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + Number(b.dataset.m); month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); draw(); return; }
          if (b.dataset.k) { const f = opts.pick; close(); f(b.dataset.k); }
        });
        document.addEventListener('mousedown', ev => { if (box && !box.hidden && !ev.target.closest('#vsmini') && !(opts && opts.el && opts.el.contains(ev.target))) close(); });
        document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(); });
        window.addEventListener('resize', close);
      }
      if (!box.hidden && opts && opts.el === el) { close(); return; }
      opts = Object.assign({ start: 0, span: 1 }, o || {}, { el, cur, pick });
      month = (cur || today()).slice(0, 8) + '01';
      draw(); box.hidden = false; el.classList.add('open');
      const r = el.getBoundingClientRect();
      box.style.top = (r.bottom + 6) + 'px';
      box.style.left = Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + 'px';
    },
  };
})();
