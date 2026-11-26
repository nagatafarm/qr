// 下のメニューバー（どのページでも同じ並び）と、単独のページの上の帯の見た目をそろえる（2026-11-27）
// ・index.html（window.NAE_SPA = true）：ボタンは data-nav。押すと index.html の goPage が動く。出す・消す・今いる所は NaeNav.update() で知らせる
// ・ほかのページ（出勤希望・使い方・機械マニュアルなど）：ボタンは index.html?go=… へのリンク。ログイン中（またはパートさん用のスマホ）だけ出す
// ・ほかの画面にはめ込まれているとき（iframe）と、印刷のときは出さない
(function () {
  if (window.top !== window.self) return;
  const SPA = !!window.NAE_SPA;
  const ls = k => { try { return localStorage.getItem('qrdemo.' + k) || ''; } catch (e) { return ''; } };
  const ICON = {
    front: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z',
    reg: 'M9 2h6a1 1 0 0 1 1 1h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a1 1 0 0 1 1-1zm0 2v2h6V4H9zm1.6 13.1 5.8-5.8-1.4-1.4-4.4 4.4-1.9-1.9-1.4 1.4 3.3 3.3z',
    find: 'M10 3a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
    calendar: 'M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zM5 10v10h14V10H5zm2 2h4v4H7v-4z',
    weed: 'M11 21v-7.1C7.6 13.6 5 10.9 5 7.5V6h1.5C9 6 11.1 7.5 12 9.6 12.9 6.3 15.9 4 19.5 4H21v1.5c0 4.1-3.1 7.5-7 7.9V21h-3z',
    stock: 'M3 7l9-4 9 4v10l-9 4-9-4V7zm9-1.8L6.2 7.7 12 10.3l5.8-2.6L12 5.2zM5 9.3v6.4l6 2.7v-6.4L5 9.3zm8 9.1 6-2.7V9.3l-6 2.7v6.4z',
  };
  const ITEMS = [['front', 'メニュー'], ['reg', '登録'], ['find', '調べる'], ['calendar', '予定'], ['weed', '除草', 1], ['stock', '在庫', 1]];   // 3つ目が 1 ＝ ログインした社員だけ

  const css = document.createElement('style');
  css.textContent = `
  body.has-bnav { --bnav-h: calc(59px + env(safe-area-inset-bottom, 0px)); padding-bottom: var(--bnav-h); }
  #bnav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 25; background: #fff; border-top: 1px solid #d6e2d8; box-shadow: 0 -2px 8px rgba(0,0,0,.06);
    display: flex; justify-content: center; padding-bottom: env(safe-area-inset-bottom, 0px); font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; }
  #bnav[hidden] { display: none; }
  #bnav .in { display: flex; width: 100%; max-width: 640px; }
  #bnav .it { flex: 1 1 0; min-width: 0; height: 58px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    background: none; border: 0; border-top: 3px solid transparent; border-radius: 0; margin: 0; padding: 0 0 2px; color: #5c665f; font: inherit; font-size: 11px; line-height: 1.2;
    text-decoration: none; cursor: pointer; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
  #bnav .it svg { width: 24px; height: 24px; fill: currentColor; }
  #bnav .it.on { color: #2f6b3a; font-weight: bold; border-top-color: #2f6b3a; }
  #bnav .it:hover { background: #f0f6f1; }
  #bnav .it:focus-visible { outline: 2px solid #2f6b3a; outline-offset: -3px; }
  /* 下に固定している部品は、メニューバーの上に上げる */
  body.has-bnav .bulkbar { bottom: var(--bnav-h); }
  body.has-bnav #toast { bottom: calc(var(--bnav-h) + 76px); }
  body.has-bnav #fbbtn { bottom: calc(var(--bnav-h) + 12px); }
  /* はめ込んだ画面（スケジュール・除草・在庫）と、PC の画面の高さから、メニューバーの分を引く */
  body.has-bnav #schedframe { height: calc(100vh - var(--hh, 110px) - var(--bnav-h)); height: calc(100dvh - var(--hh, 110px) - var(--bnav-h)); }
  @media (min-width: 821px) { body.has-bnav #app { height: calc(100vh - var(--bnav-h)); height: calc(100dvh - var(--bnav-h)); } }
  /* メニューバーと重なる「もどる」の類は消す（メニューバーが出ていないとき＝ログイン前は、そのまま残る） */
  body.has-bnav .fab, body.has-bnav header a[href^="index.html"], body.has-bnav .bar a[href^="index.html"], body.has-bnav .backlink { display: none !important; }
  /* 単独のページの上の帯：なえログ（index.html）と同じ形にそろえる */
  body.nae-page > header, body.nae-page > #app > header { background: #4f9363; color: #fff; padding: 10px 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2px 8px; }
  body.nae-page > header h1, body.nae-page > #app > header h1 { font-size: 17px; margin: 0; }
  body.nae-page > header > p, body.nae-page > #app > header .sub { font-size: 12px; opacity: .9; margin: 0; }
  body.nae-page > header > p { flex: 1 0 100%; }
  @media print { #bnav { display: none !important; } body.has-bnav { padding-bottom: 0; } }
  `;
  document.head.appendChild(css);

  let nav = null, last = '';
  function draw(o) {
    const key = JSON.stringify(o);
    if (key === last) return;
    last = key;
    if (!nav) { nav = document.createElement('nav'); nav.id = 'bnav'; nav.setAttribute('aria-label', 'メニュー'); document.body.appendChild(nav); }
    nav.hidden = !o.show;
    document.body.classList.toggle('has-bnav', !!o.show);
    if (!o.show) { nav.innerHTML = ''; return; }
    nav.innerHTML = '<div class="in">' + ITEMS.filter(x => !x[2] || o.ext).map(x => {
      const on = x[0] === o.cur, inner = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="' + ICON[x[0]] + '"/></svg><span>' + x[1] + '</span>';
      return SPA ? '<button type="button" class="it' + (on ? ' on' : '') + '" data-nav="' + x[0] + '"' + (on ? ' aria-current="page"' : '') + '>' + inner + '</button>'
        : '<a class="it" href="index.html' + (x[0] === 'front' ? '' : '?go=' + x[0]) + '">' + inner + '</a>';
    }).join('') + '</div>';
  }
  window.NaeNav = { update: draw };

  if (!SPA) {
    const start = () => {
      document.body.classList.add('nae-page');
      const part = ls('mode') === 'part', tok = !!ls('token');
      draw({ show: part || tok || !!ls('device'), ext: tok && !part, cur: '' });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
})();
