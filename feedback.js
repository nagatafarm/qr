// 意見：画面の右下「✎ 意見」を押すと、今の画面を写真にして、ペン・文字で書きこみ、一言をそえて送れる（窓口の 意見.gs）。
// 送ったものは、スプレッドシートの「意見」シートと、ドライブの「QR一元管理_意見の画像」にたまる。スクショを貼ってやり取りする代わり。
// ボタンを出すのは、計画担当（ログインした人の部署が「計画」）だけ。URL に ?fb=1 を付けると、だれでも出る（試し用）。
// 使い方：ページの終わりで <script src="feedback.js"></script> を読む。はめ込みの画面（iframe の中）では出さない（外の画面がまとめて写す）。
(function () {
  if (window.top !== window.self) return;
  const H2C_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  const MAX_W = 1600;                     // 送る画像の幅の上限（大きい画面は縮める）
  const COLORS = [['#e5252a', '赤'], ['#1a5fb4', '青']];

  const st = document.createElement('style');
  st.textContent = `
  #fbbtn { position: fixed; right: 16px; bottom: 16px; z-index: 60; background: #fff; color: #333; border: 1px solid #bbb; border-radius: 999px; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 3px 12px rgba(0,0,0,.18); font-family: inherit; }
  #fbbtn:hover { background: #fff7f0; border-color: #d4824a; }
  #fbbtn[hidden], #fbed[hidden] { display: none; }
  body.fb-shoot #fbbtn { visibility: hidden; }
  #fbed { position: fixed; inset: 0; z-index: 9999; background: rgba(20,20,20,.92); display: flex; flex-direction: column; color: #fff; font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; }
  #fbed .tb { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 12px; background: #222; flex: none; }
  #fbed .tb b { margin-right: 6px; font-size: 15px; }
  #fbed button { font-family: inherit; }
  #fbed .tb button { background: #3a3a3a; color: #fff; border: 1px solid #555; border-radius: 999px; padding: 6px 14px; font-size: 14px; cursor: pointer; }
  #fbed .tb button.on { background: #fff; color: #222; font-weight: bold; }
  #fbed .tb .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
  #fbed .tb .sp { flex: 1; }
  #fbed .cv { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: 10px; position: relative; }
  #fbed .wrap { position: relative; flex: none; box-shadow: 0 4px 24px rgba(0,0,0,.5); }
  #fbed canvas { display: block; touch-action: none; cursor: crosshair; }
  #fbed canvas.text { cursor: text; }
  #fbed .tin { position: absolute; z-index: 2; min-width: 160px; font-size: 16px; font-weight: bold; padding: 4px 6px; border: 2px solid currentColor; border-radius: 6px; background: #fff; font-family: inherit; }
  #fbed .ft { flex: none; display: flex; gap: 8px; align-items: flex-end; padding: 10px 12px; background: #222; }
  #fbed textarea.cm { flex: 1; min-height: 52px; max-height: 30vh; resize: vertical; font-size: 15px; padding: 8px 10px; border-radius: 8px; border: 1px solid #666; font-family: inherit; }
  #fbed .send { background: #d4824a; color: #fff; border: none; border-radius: 10px; padding: 12px 22px; font-size: 16px; font-weight: bold; cursor: pointer; }
  #fbed .send:disabled { opacity: .5; cursor: default; }
  #fbed .msg { font-size: 13px; padding: 0 12px 8px; background: #222; flex: none; }
  #fbed .msg.err { color: #ffb3b3; }
  #fbed .msg a { color: #ffd27a; }
  #fbed .wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; }
  @media (max-width: 600px) { #fbed .tb button { padding: 6px 10px; font-size: 13px; } #fbed .ft { flex-direction: column; align-items: stretch; } }
  `;
  document.head.appendChild(st);

  function canUse() {
    if (/[?&]fb=1(&|$)/.test(location.search)) return true;
    try { return !!(localStorage.getItem('qrdemo.token') && JSON.parse(localStorage.getItem('qrdemo.caps') || '{}').planner); } catch (e) { return false; }
  }
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'fbbtn'; btn.textContent = '✎ 意見'; btn.title = '今の画面に書きこんで、直してほしいところを送る';
  btn.hidden = true;
  document.body.appendChild(btn);
  // ログイン・ログアウトで出し入れする（index.html は画面を描き直すだけなので、ときどき見直す）
  const refresh = () => { const e = document.getElementById('fbed'); btn.hidden = !canUse() || !!(e && !e.hidden); };
  refresh(); setInterval(refresh, 3000);

  function loadH2C() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((ok, ng) => {
      const s = document.createElement('script'); s.src = H2C_URL;
      s.onload = () => window.html2canvas ? ok(window.html2canvas) : ng(new Error('写真の道具を読めませんでした'));
      s.onerror = () => ng(new Error('写真の道具を読めませんでした（電波を確かめてください）'));
      document.head.appendChild(s);
    });
  }
  // 今、見えている所を写す。はめ込みの画面（同じサイトの iframe）は、中身を別に写して、その場所に重ねる
  async function shoot() {
    const h2c = await loadH2C();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, Hh = window.innerHeight;
    document.body.classList.add('fb-shoot');
    try {
      const base = await h2c(document.body, { x: window.scrollX, y: window.scrollY, width: W, height: Hh, windowWidth: W, windowHeight: Hh,
        scale: scale, useCORS: true, logging: false, backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff',
        ignoreElements: el => el.id === 'fbbtn' || el.id === 'fbed' || el.tagName === 'IFRAME' });
      const out = document.createElement('canvas');
      out.width = Math.round(W * scale); out.height = Math.round(Hh * scale);
      const g = out.getContext('2d');
      g.drawImage(base, 0, 0, out.width, out.height);
      for (const f of document.querySelectorAll('iframe')) {
        const r = f.getBoundingClientRect();
        if (r.width < 20 || r.height < 20 || r.bottom < 0 || r.top > Hh) continue;
        let doc = null; try { doc = f.contentDocument; } catch (e) { doc = null; }
        if (!doc || !doc.body) continue;
        try {
          const fw = f.contentWindow;
          const c = await h2c(doc.body, { x: fw.scrollX, y: fw.scrollY, width: f.clientWidth, height: f.clientHeight, windowWidth: f.clientWidth, windowHeight: f.clientHeight,
            scale: scale, useCORS: true, logging: false, backgroundColor: getComputedStyle(doc.body).backgroundColor || '#fff' });
          g.drawImage(c, r.left * scale, r.top * scale, f.clientWidth * scale, f.clientHeight * scale);
        } catch (e) { /* 写せなければ、その所は空のまま */ }
      }
      return { canvas: out, scale: scale };
    } finally {
      document.body.classList.remove('fb-shoot');
    }
  }

  // ---------- 書きこむ画面 ----------
  let ed = null;
  function openEditor() {
    ed = document.getElementById('fbed');
    if (!ed) { ed = document.createElement('div'); ed.id = 'fbed'; document.body.appendChild(ed); }
    ed.hidden = false; btn.hidden = true;
    ed.innerHTML = `<div class="tb"><b>✎ 意見</b>
        ${COLORS.map((c, i) => `<button type="button" data-pen="${i}" class="${i === 0 ? 'on' : ''}"><span class="dot" style="background:${c[0]}"></span>ペン ${c[1]}</button>`).join('')}
        <button type="button" data-mode="text">文字</button>
        <button type="button" id="fb-undo">1つ戻す</button><button type="button" id="fb-clear">全部消す</button>
        <span class="sp"></span><button type="button" id="fb-close">やめる</button></div>
      <div class="cv"><div class="wait">画面を写しています…</div></div>
      <div class="ft"><textarea class="cm" id="fb-cm" placeholder="一言（どこを・どう直したいか）。書きこみだけでも送れます"></textarea>
        <button type="button" class="send" id="fb-send" disabled>送る</button></div>
      <div class="msg" id="fb-msg"></div>`;
    ed.querySelector('#fb-close').onclick = closeEditor;
    shoot().then(r => setupCanvas(r)).catch(e => { ed.querySelector('.cv').innerHTML = `<div class="wait">${esc(e.message || String(e))}</div>`; });
  }
  function closeEditor() { if (ed) { ed.hidden = true; ed.innerHTML = ''; } refresh(); }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ed && !ed.hidden && !ev.target.closest('.tin')) closeEditor(); });

  function setupCanvas(shot) {
    const base = shot.canvas, k = shot.scale;
    const box = ed.querySelector('.cv');
    box.innerHTML = '<div class="wrap"><canvas></canvas></div>';
    const wrap = box.querySelector('.wrap'), cv = box.querySelector('canvas'), g = cv.getContext('2d');
    cv.width = base.width; cv.height = base.height;
    // 見せる大きさ：枠に収まるように縮める（大きくはしない）
    const fit = () => {
      const bw = box.clientWidth - 20, bh = box.clientHeight - 20;
      const z = Math.min(1, bw / (base.width / k), bh / (base.height / k));
      cv.style.width = Math.round(base.width / k * z) + 'px'; cv.style.height = Math.round(base.height / k * z) + 'px';
    };
    fit(); window.addEventListener('resize', fit);
    const marks = [];             // 書きこみ：{ t:'pen', c, pts:[[x,y]...] } ／ { t:'text', c, x, y, s }
    let color = 0, mode = 'pen', cur = null;
    const lw = 4 * k, fs = 20 * k;
    function draw() {
      g.drawImage(base, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      marks.forEach(m => {
        if (m.t === 'pen') {
          g.strokeStyle = COLORS[m.c][0]; g.lineWidth = lw; g.beginPath();
          m.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
          if (m.pts.length === 1) g.lineTo(m.pts[0][0] + 0.1, m.pts[0][1]);
          g.stroke();
        } else {
          g.font = `bold ${fs}px "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif`; g.textBaseline = 'top';
          const lines = m.s.split('\n'), pad = 6 * k, lh = fs * 1.3;
          const w = Math.max(...lines.map(l => g.measureText(l).width)) + pad * 2, h = lines.length * lh + pad * 2 - (lh - fs);
          g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(m.x, m.y, w, h);
          g.strokeStyle = COLORS[m.c][0]; g.lineWidth = 2 * k; g.strokeRect(m.x, m.y, w, h);
          g.fillStyle = COLORS[m.c][0]; lines.forEach((l, i) => g.fillText(l, m.x + pad, m.y + pad + i * lh));
        }
      });
    }
    draw();
    const at = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
    cv.onpointerdown = ev => {
      if (mode === 'text') { ev.preventDefault(); askText(ev); return; }
      cv.setPointerCapture(ev.pointerId); cur = { t: 'pen', c: color, pts: [at(ev)] }; marks.push(cur); draw();
    };
    cv.onpointermove = ev => { if (!cur) return; cur.pts.push(at(ev)); draw(); };
    cv.onpointerup = cv.onpointercancel = () => { cur = null; };
    // 文字：押した所に入れる欄を出し、Enter（改行は Shift＋Enter）か、欄の外を押すと置く
    function askText(ev) {
      const old = wrap.querySelector('.tin'); if (old) old.blur();
      const r = cv.getBoundingClientRect(), p = at(ev);
      const t = document.createElement('textarea');
      t.className = 'tin'; t.rows = 1; t.style.color = COLORS[color][0];
      t.style.left = (ev.clientX - r.left) + 'px'; t.style.top = (ev.clientY - r.top) + 'px';
      wrap.appendChild(t); setTimeout(() => t.focus(), 0);
      let done = false;
      const put = () => { if (done) return; done = true; const s = t.value.trim(); t.remove(); if (s) { marks.push({ t: 'text', c: color, x: p[0], y: p[1], s }); draw(); } };
      t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); put(); } if (e.key === 'Escape') { done = true; t.remove(); } };
      t.onblur = put;
    }
    ed.querySelectorAll('[data-pen]').forEach(b => b.onclick = () => { color = Number(b.dataset.pen); mode = 'pen'; tools(); });
    ed.querySelector('[data-mode="text"]').onclick = () => { mode = 'text'; tools(); };
    function tools() {
      ed.querySelectorAll('[data-pen]').forEach(b => b.classList.toggle('on', mode === 'pen' && Number(b.dataset.pen) === color));
      ed.querySelector('[data-mode="text"]').classList.toggle('on', mode === 'text');
      cv.classList.toggle('text', mode === 'text');
    }
    ed.querySelector('#fb-undo').onclick = () => { marks.pop(); draw(); };
    ed.querySelector('#fb-clear').onclick = () => { if (marks.length && confirm('書きこみを全部消しますか？')) { marks.length = 0; draw(); } };
    const send = ed.querySelector('#fb-send'), msg = ed.querySelector('#fb-msg');
    send.disabled = false;
    send.onclick = async () => {
      const comment = ed.querySelector('#fb-cm').value.trim();
      // 送る画像：幅 MAX_W まで縮めた JPEG
      const z = Math.min(1, MAX_W / cv.width), o = document.createElement('canvas');
      o.width = Math.round(cv.width * z); o.height = Math.round(cv.height * z);
      const og = o.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, o.width, o.height); og.drawImage(cv, 0, 0, o.width, o.height);
      const image = o.toDataURL('image/jpeg', 0.85);
      send.disabled = true; msg.className = 'msg'; msg.textContent = '送っています…';
      try {
        await postApi({ action: 'feedback', comment: comment, image: image, url: location.href });
        closeEditor();
        flash('意見を送りました。ありがとうございます');
      } catch (e) {
        send.disabled = false; msg.className = 'msg err';
        msg.innerHTML = '送れませんでした：' + esc(e.message || String(e)) + '　<a href="' + image + '" download="意見_' + Date.now() + '.jpg">画像を保存する</a>（保存した画像を、いつものように貼って送れます）';
      }
    };
  }
  function flash(t) {
    if (typeof window.toast === 'function') { window.toast(t); return; }
    const d = document.createElement('div');
    d.textContent = t;
    d.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:#222;color:#fff;padding:10px 16px;border-radius:10px;z-index:9999;font-size:14px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
  }
  btn.onclick = openEditor;
})();
