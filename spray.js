// 農薬散布の画面（index.html から使う）。
//   農薬散布担当：対象のロットを選び、薬剤（3つまで）・倍率・使用量・機材・場所を入れて記録する
//   計画画面：そのロットの農薬の使用履歴と回数
//   計画担当：「農薬」タブ（取引先に出す使用農薬履歴と、全員の散布の記録）
// 回数の上限は、選んだときに画面で確かめ、記録するときにデータの窓口でもう一度確かめる。

const SPRAY = '__spray__';          // 農薬散布担当
const sprayForm = { products: [{ name: '', dilution: '' }], amount: '', equipment: '', area: '', regChecked: false, washed: false, memo: '' };
let pickerOpen = false;
let pestShipTo = '';                // 計画担当の「使用農薬履歴」の出荷先の絞り込み

function isSpray() { return getRole() === SPRAY; }
function sprayRole() {
  return { key: SPRAY, label: '農薬散布担当', desc: '散布した農薬を記録する（どのロットに・何を・どれぐらい）' };
}
function sprayLots() { try { return JSON.parse(load('sprayLots') || '[]'); } catch (e) { return []; } }
function setSprayLots(ids) { save('sprayLots', JSON.stringify([...new Set(ids)])); }

// ---------- 回数の確かめ（画面側。記録のときは窓口でもう一度） ----------

function pestReg(item, product) { return state.pest.regs.find(r => r.item === item && r.product === product); }
function pestIngLimit(item, ing) { return state.pest.ings.find(r => r.item === item && r.ing === ing); }
function pestProduct(name) { return state.pest.products.find(p => p.name === name); }

// 選んだロット×薬剤ごとに「今回で何回目か」を出す。ingN はロットごとの成分の回数（同じ散布で同じ成分が2剤あれば2回）
function sprayCheck(lots, names) {
  const out = names.map(() => ({ groups: {}, over: [], noReg: [], ingLines: {} }));
  lots.forEach(p => {
    const c = state.pest.counts[p.id] || { p: {}, i: {} };
    const ingN = {};
    names.forEach((name, k) => {
      const pr = pestProduct(name);
      if (!pr) return;
      const o = out[k];
      const reg = pestReg(p.regItem, name);
      const n = (c.p[name] || 0) + 1;
      const g = o.groups[p.regItem] = o.groups[p.regItem] || { item: p.regItem, reg, lots: 0, nMin: n, nMax: n };
      g.lots++; g.nMin = Math.min(g.nMin, n); g.nMax = Math.max(g.nMax, n);
      if (!reg) { if (!o.noReg.includes(p.regItem)) o.noReg.push(p.regItem); }
      else if (reg.max && n > reg.max) o.over.push(p.id + ' ' + planName(p) + '：' + n + '回目（上限' + reg.max + '）');
      pr.ings.forEach(ing => {
        ingN[ing] = (ingN[ing] !== undefined ? ingN[ing] : (c.i[ing] || 0)) + 1;
        const lim = pestIngLimit(p.regItem, ing);
        if (!lim || !lim.max) return;
        const key = p.regItem + '｜' + ing;
        const l = o.ingLines[key] = o.ingLines[key] || { item: p.regItem, ing, max: lim.max, nMax: 0 };
        l.nMax = Math.max(l.nMax, ingN[ing]);
        if (ingN[ing] > lim.max) o.over.push(p.id + ' ' + planName(p) + '：成分「' + ing + '」' + ingN[ing] + '回目（上限' + lim.max + '）');
      });
    });
  });
  return out;
}

// ---------- 農薬計画の対象農薬・ボトルの写真 ----------
// 対象農薬：「農薬計画」シート（NAS の農薬使用計画書から取り込む）のうち、選んだロットの品目の行。
// ボトルの写真：「農薬」シートの「写真」の列（URL）。画面から撮って登録できる。

(function () {
  const st = document.createElement('style');
  st.textContent = `
  .tg-h { font-size: 13px; font-weight: bold; color: var(--gray); margin: 10px 0 4px; }
  .tg { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
  .tg-t { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid #ccc; border-radius: 10px; background: #fff;
    padding: 6px 4px; font-size: 12px; font-family: inherit; cursor: pointer; text-align: center; line-height: 1.3; color: #222; }
  .tg-t.on { border-color: var(--green); background: var(--green-l); box-shadow: inset 0 0 0 1px var(--green); }
  .tg-t.no { opacity: .55; }
  .tg-t img, .tg-t .noimg { width: 64px; height: 64px; object-fit: contain; border-radius: 6px; background: #f4f4f4; }
  .noimg { display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 11px; }
  .tg-t b { font-size: 12px; word-break: break-all; }
  .tg-t small { color: var(--gray); }
  .tg-t small.warn { color: var(--orange-d); }
  .tg-end { border-bottom: 1px dashed #ddd; margin: 12px 0 4px; }
  .bottle { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 6px; }
  .bottle img, .bottle .noimg { width: 120px; height: 150px; object-fit: contain; border: 1px solid #ddd; border-radius: 8px; background: #fff; flex: none; }
  label.sub-btn { display: inline-block; }
  .log img.th { width: 36px; height: 36px; object-fit: contain; border-radius: 4px; background: #f4f4f4; flex: none; margin-right: 6px; }
  #printarea { display: none; }
  @media print {
    body.pest-print > *:not(#printarea) { display: none !important; }
    body.pest-print { background: #fff; }
    body.pest-print #printarea { display: block; color: #000; font-size: 10pt; }
    #printarea h1 { font-size: 15pt; margin: 0 0 6px; }
    #printarea table { border-collapse: collapse; width: 100%; }
    #printarea th, #printarea td { border: 1px solid #000; padding: 3px 4px; vertical-align: top; text-align: left; font-size: 9pt; }
    #printarea th { background: #eee; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #printarea table.pi { margin-bottom: 8px; }
    #printarea table.pi th { width: 9em; }
    #printarea thead { display: table-header-group; }
    #printarea tr { break-inside: avoid; }
    #printarea p { margin: 6px 0 0; font-size: 9pt; }
  }`;
  document.head.appendChild(st);
})();

function pestPhoto(name) { const p = pestProduct(name); return p && p.photo ? p.photo : ''; }
function bottleImg(name, cls) {
  const u = pestPhoto(name);
  return u ? `<img${cls ? ' class="' + cls + '"' : ''} src="${esc(u)}" alt="${esc(name)}のボトル" loading="lazy" referrerpolicy="no-referrer">`
    : (cls ? '' : '<span class="noimg">写真なし</span>');
}
function photoButton(name) {
  return `<label class="sub-btn">${pestPhoto(name) ? '写真を撮り直す' : 'ボトルの写真を撮って登録'}<input type="file" accept="image/*" capture="environment" data-photo="${esc(name)}" hidden></label>`;
}

// 選んだロットの品目の、農薬計画の行（同じ区分・対象・薬剤・倍率は1つにまとめる）
let tgList = [];
function pestTargets(lots) {
  const all = (state.pest && state.pest.plan) || [];
  const map = {}, list = [], noPlan = [], labels = [];
  lots.forEach(p => {
    if (!p.planItem) { if (!noPlan.includes(p.regItem)) noPlan.push(p.regItem); return; }
    all.filter(r => r.item === p.planItem && r.year === p.planYear).forEach(r => {
      const label = r.year + '年 ' + r.item + (r.cond ? '（' + r.cond + '）' : '');
      if (!labels.includes(label)) labels.push(label);
      const key = [r.cat, r.target, r.product, r.dilution].join('｜');
      let t = map[key];
      if (!t) { t = map[key] = { cat: r.cat, target: r.target, product: r.product, dilution: r.dilution, notes: [], items: [] }; list.push(t); }
      if (!t.items.includes(r.item)) t.items.push(r.item);
      if (r.note && !t.notes.includes(r.note)) t.notes.push(r.note);
    });
  });
  return { list, noPlan, labels, items: [...new Set(lots.map(p => p.planItem).filter(Boolean))] };
}
// 農薬計画でのその薬剤の倍率（選んだロットで1つに決まるときだけ）
function planDilution(lots, name) {
  const d = [...new Set(pestTargets(lots).list.filter(t => t.product === name).map(t => t.dilution).filter(Boolean))];
  return d.length === 1 ? d[0] : '';
}
function targetsHtml(lots) {
  tgList = [];
  if (!lots.length || !state.pest.plan || !state.pest.plan.length) return '';
  const t = pestTargets(lots);
  const none = t.noPlan.length ? `<p class="muted">農薬計画にない品目：${esc(t.noPlan.join('、'))}（下の「薬剤を選ぶ」から選ぶ）</p>` : '';
  if (!t.list.length) return none;
  tgList = t.list;
  const sel = sprayForm.products.map(p => p.name);
  const many = t.items.length > 1;
  let last = '', h = `<div class="muted">農薬計画の対象農薬：${esc(t.labels.join('、'))}。押すと薬剤に入る（もう一度押すと外れる）。</div>`;
  t.list.forEach((x, i) => {
    const g = x.cat + (x.target ? '：' + x.target : '');
    if (g !== last) { h += (last ? '</div>' : '') + `<div class="tg-h">${esc(g)}</div><div class="tg">`; last = g; }
    h += `<button type="button" class="tg-t${sel.includes(x.product) ? ' on' : ''}${pestProduct(x.product) ? '' : ' no'}" data-tg="${i}">
      ${bottleImg(x.product)}<b>${esc(x.product)}</b><small>${esc(x.dilution)}${many ? '・' + esc(x.items.join('/')) : ''}</small>
      ${x.notes.length ? `<small class="warn">${esc(x.notes.join(' '))}</small>` : ''}${pestProduct(x.product) ? '' : '<small class="warn">農薬シートにない</small>'}</button>`;
  });
  return h + '</div>' + none + '<div class="tg-end"></div>';
}
function pickTarget(t) {
  if (!pestProduct(t.product)) { toast('「農薬」シートにない薬剤です。計画担当に、農薬シートへ足してもらってください', true); return; }
  const k = sprayForm.products.findIndex(p => p.name === t.product);
  if (k >= 0) {
    sprayForm.products.splice(k, 1);
    if (!sprayForm.products.length) sprayForm.products.push({ name: '', dilution: '' });
  } else {
    const e = sprayForm.products.findIndex(p => !p.name);
    if (e >= 0) sprayForm.products[e] = { name: t.product, dilution: t.dilution };
    else if (sprayForm.products.length < 3) sprayForm.products.push({ name: t.product, dilution: t.dilution });
    else { toast('一度に混ぜられる薬剤は3つまでです', true); return; }
  }
  render();
}

// 写真を縮めて（長い辺 1000px・JPEG）、窓口に送る
function shrinkImage(file, max) {
  return new Promise((ok, ng) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ng(new Error('写真を読めませんでした。撮り直してください')); };
    img.src = url;
  });
}
async function uploadPestPhoto(name, file) {
  popup('wait', '写真を登録しています…', name);
  try {
    const data = await shrinkImage(file, 1000);
    server = await postApi({ action: 'pestPhoto', name, data, person: getName() });
    rebuild(); render();
    popup('ok', '写真を登録しました', name);
  } catch (e) {
    popup('err', '写真を登録できませんでした', e.message);
  }
}
function bindPhotoInputs() {
  document.querySelectorAll('input[data-photo]').forEach(i => i.onchange = () => { if (i.files && i.files[0]) uploadPestPhoto(i.dataset.photo, i.files[0]); });
}

// ---------- 画面：農薬散布担当 ----------

// 散布の対象に選んであるロット（計画から消えたものは外す）
function sprayLotList() {
  const lots = sprayLots().map(id => state.plans.find(p => p.id === id)).filter(Boolean);
  if (lots.length !== sprayLots().length) setSprayLots(lots.map(p => p.id));
  return lots;
}

// 散布の入力（① ロット ② 薬剤 ③ 使用量・機材・場所）。fixedId があれば、そのロットは外せない（計画画面の「薬剤散布」の中の入力）
function sprayFormHtml(lots, fixedId) {
  let body;
  {
    const names = sprayForm.products.map(p => p.name);
    const chk = sprayCheck(lots, names.filter(Boolean));
    const overAll = chk.some(c => c.over.length);
    const needCheck = chk.some(c => c.noReg.length);
    const ready = lots.length && names.filter(Boolean).length && sprayForm.products.every(p => p.name && String(p.dilution).trim())
      && Number(sprayForm.amount) > 0 && sprayForm.equipment && sprayForm.regChecked && !overAll;
    let ci = 0;
    body = `
      <div class="card sp">
        <h3>① 散布したロット <span class="muted">${lots.length}ロット</span></h3>
        <div class="chips">${lots.map(p => `<span class="chip">${esc(planName(p))} <small>${esc(p.id)}・${esc(p.regItem)}</small>${p.id === fixedId ? '&nbsp;' : `<button type="button" data-unlot="${esc(p.id)}" aria-label="外す">×</button>`}</span>`).join('') || '<span class="muted">まだ選んでいません。下の「ロットを選ぶ」か、ロットの QR を読んで「散布の対象に入れる」で足します。</span>'}</div>
        <button type="button" class="sub-btn" id="pick">${pickerOpen ? '選び終わった' : fixedId ? '＋ 一緒に散布したロットを足す' : '＋ ロットを選ぶ'}</button>
        ${pickerOpen ? `<div class="picker">
          <input type="search" id="pq" placeholder="品種・品目・QRID で探す" autocomplete="off">
          <div id="plist"></div></div>` : ''}
      </div>
      <div class="card sp">
        <h3>② 薬剤（混ぜた薬剤は3つまで）</h3>
        ${targetsHtml(lots)}
        ${sprayForm.products.map((pr, k) => {
          const c = pr.name ? chk[ci++] : null;
          const regs = lots.map(p => pestReg(p.regItem, pr.name)).filter(Boolean);
          return `<div class="prow">
            <div class="pline"><select data-prod="${k}">${productOptions(pr.name)}</select>
              ${sprayForm.products.length > 1 ? `<button type="button" class="x" data-rmprod="${k}" aria-label="外す">×</button>` : ''}</div>
            ${pr.name ? `<div class="bottle">${bottleImg(pr.name)}<div><div class="muted">手元のボトルと同じか、写真で確かめる</div>${photoButton(pr.name)}</div></div>
              <div class="pline"><input type="text" data-dil="${k}" value="${esc(pr.dilution)}" placeholder="倍率（例：2000倍）" autocomplete="off">
              <span class="muted">${regs.length ? '登録：' + esc([...new Set(regs.map(r => r.dilution))].join('／')) : ''}</span></div>
              ${checkHtml(c, pr.name)}` : ''}
          </div>`;
        }).join('')}
        ${sprayForm.products.length < 3 ? '<button type="button" class="sub-btn" id="addprod">＋ 薬剤を足す（混用）</button>' : ''}
      </div>
      <div class="card sp">
        <h3>③ 使用量・機材・場所</h3>
        <label class="fl">使用量（L・散布した全体）<input type="number" inputmode="decimal" step="any" id="amount" value="${esc(sprayForm.amount)}" placeholder="例：10"></label>
        <div class="fl">使用機材<div class="eq">${state.pest.equipment.map(e => `<button type="button" data-eq="${esc(e)}" class="${sprayForm.equipment === e ? 'on' : ''}">${esc(e)}</button>`).join('')}</div></div>
        <label class="fl">使用場所（圃場・ハウス・ベンチ）<input type="text" id="place" value="${esc(load('sprayPlace'))}" placeholder="例：1H A15" autocomplete="off"></label>
        <label class="fl">散布面積・散布場所の割合（なくてもよい）<input type="text" id="area" value="${esc(sprayForm.area)}" autocomplete="off"></label>
        <label class="fl">メモ（なくてもよい）<input type="text" id="memo" value="${esc(sprayForm.memo)}" autocomplete="off"></label>
        <label class="ck"><input type="checkbox" id="regck"${sprayForm.regChecked ? ' checked' : ''}> 「適用病害虫と使用方法」のラベルで、登録と使用方法を確認した${needCheck ? '<br><b class="warn">※ 適用登録のデータがない組み合わせがあります。ラベルで必ず確かめてください</b>' : ''}</label>
        <label class="ck"><input type="checkbox" id="washck"${sprayForm.washed ? ' checked' : ''}> 使用後に機材を洗浄した</label>
      </div>
      ${overAll ? '<div class="overbox">使用回数の上限を超えるロットがあるので、記録できません。ロットか薬剤を変えてください。</div>' : ''}
      <button type="button" class="primary" id="spgo"${ready ? '' : ' disabled'}>散布を記録する（${lots.length}ロット × ${names.filter(Boolean).length}剤）</button>
      <p class="muted">使用量は、ロットの TR 数で分けて、ロットごとの量（按分量）も残します。</p>`;
  }
  return body;
}

function renderSpray() {
  if (!tab) tab = 'new';
  const lots = sprayLotList();
  let body;
  if (tab === 'new') body = sprayFormHtml(lots, '');
  else {
    const events = sprayEvents(state.pest.sprays.filter(s => isPlanner() || s.person === getName()));
    body = events.map(eventHtml).join('') || '<div class="empty">散布の記録はまだありません</div>';
    body += '<p class="muted">押しまちがえた記録は、24時間以内なら「消す」で消せます（散布記録シートからも消えます）。</p>';
  }
  document.getElementById('app').innerHTML = headerHtml('', false) + `
    <main style="max-width:640px">
      <div class="tabs"><button type="button" data-tab="new" class="${tab === 'new' ? 'on' : ''}">散布を記録</button>
        <button type="button" data-tab="mine" class="${tab === 'mine' ? 'on' : ''}">記録した散布</button></div>
      ${body}
    </main>`;
  bindHeader();
  document.getElementById('bulkbar').hidden = true;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  bindSprayDelete();
  if (tab === 'new') bindSprayForm(lots);
}
function bindSprayForm(lots) {
  document.querySelectorAll('[data-unlot]').forEach(b => b.onclick = () => { setSprayLots(sprayLots().filter(id => id !== b.dataset.unlot)); render(); });
  document.getElementById('pick').onclick = () => { pickerOpen = !pickerOpen; render(); };
  if (pickerOpen) {
    const q = document.getElementById('pq');
    q.oninput = () => drawPicker(q.value);
    drawPicker('');
  }
  document.querySelectorAll('[data-prod]').forEach(s => s.onchange = () => {
    const k = Number(s.dataset.prod);
    sprayForm.products[k] = { name: s.value, dilution: planDilution(lots, s.value) };   // 農薬計画に倍率があれば入れておく
    render();
  });
  document.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const t = tgList[Number(b.dataset.tg)]; if (t) pickTarget(t); });
  bindPhotoInputs();
  document.querySelectorAll('[data-dil]').forEach(i => i.oninput = () => { sprayForm.products[Number(i.dataset.dil)].dilution = i.value; updateGo(); });
  document.querySelectorAll('[data-rmprod]').forEach(b => b.onclick = () => { sprayForm.products.splice(Number(b.dataset.rmprod), 1); render(); });
  const ap = document.getElementById('addprod'); if (ap) ap.onclick = () => { sprayForm.products.push({ name: '', dilution: '' }); render(); };
  document.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => { sprayForm.equipment = b.dataset.eq; render(); });
  document.getElementById('amount').oninput = e => { sprayForm.amount = e.target.value; updateGo(); };
  document.getElementById('place').oninput = e => save('sprayPlace', e.target.value);
  document.getElementById('area').oninput = e => { sprayForm.area = e.target.value; };
  document.getElementById('memo').oninput = e => { sprayForm.memo = e.target.value; };
  document.getElementById('regck').onchange = e => { sprayForm.regChecked = e.target.checked; updateGo(); };
  document.getElementById('washck').onchange = e => { sprayForm.washed = e.target.checked; };
  document.getElementById('spgo').onclick = submitSpray;
}

// 入力のたびに画面全体を描き直すと打ちにくいので、「記録する」ボタンの押せる・押せないだけ直す
function updateGo() {
  const lots = sprayLots();
  const names = sprayForm.products.map(p => p.name).filter(Boolean);
  const over = sprayCheck(lots.map(id => state.plans.find(p => p.id === id)).filter(Boolean), names).some(c => c.over.length);
  const ok = lots.length && names.length && sprayForm.products.every(p => p.name && String(p.dilution).trim())
    && Number(sprayForm.amount) > 0 && sprayForm.equipment && sprayForm.regChecked && !over;
  const b = document.getElementById('spgo'); if (b) b.disabled = !ok;
}

function productOptions(sel) {
  const groups = {};
  state.pest.products.forEach(p => { (groups[p.type || 'その他'] = groups[p.type || 'その他'] || []).push(p); });
  return `<option value="">薬剤を選ぶ</option>` + Object.keys(groups).map(t => `<optgroup label="${esc(t)}">${groups[t]
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map(p => `<option value="${esc(p.name)}"${p.name === sel ? ' selected' : ''}>${esc(p.name)}${p.rac ? '［' + esc(p.rac) + '］' : ''}</option>`).join('')}</optgroup>`).join('');
}

function checkHtml(c, name) {
  if (!c) return '';
  const pr = pestProduct(name);
  const lines = Object.values(c.groups).map(g => {
    const n = g.nMin === g.nMax ? g.nMax + '回目' : g.nMin + '〜' + g.nMax + '回目';
    if (!g.reg) return `<div class="ck-line warn">${esc(g.item)}（${g.lots}ロット）：適用登録のデータなし → ラベルで確認（今回 ${n}）</div>`;
    const bad = g.reg.max && g.nMax > g.reg.max;
    return `<div class="ck-line ${bad ? 'bad' : 'ok'}">${esc(g.item)}（${g.lots}ロット）：今回 ${n}${g.reg.max ? '／上限 ' + g.reg.max + '回' : ''}　${esc(g.reg.timing)}</div>`;
  });
  Object.values(c.ingLines).forEach(l => {
    lines.push(`<div class="ck-line ${l.nMax > l.max ? 'bad' : 'ok'}">　成分「${esc(l.ing)}」（${esc(l.item)}）：今回 ${l.nMax}回目／上限 ${l.max}回</div>`);
  });
  return `<div class="ck">${pr && pr.ings.length ? `<div class="muted">成分：${esc(pr.ings.join('、'))}${pr.target ? '　対象：' + esc(pr.target) : ''}</div>` : ''}${lines.join('')}</div>`;
}

// ロットを選ぶ一覧（探す文字を打つたびに、ここだけ描き直す）
function drawPicker(q) {
  const box = document.getElementById('plist');
  if (!box) return;
  const sel = new Set(sprayLots());
  const key = String(q || '').normalize('NFKC').toLowerCase();
  const list = state.plans.filter(p => !key || (planName(p) + ' ' + p.id + ' ' + p.regItem + ' ' + (p.v['出荷先'] || '')).normalize('NFKC').toLowerCase().includes(key))
    .sort((a, b) => String(a.w['出荷日'] || '').localeCompare(String(b.w['出荷日'] || '')) || a.id.localeCompare(b.id));
  box.innerHTML = `<button type="button" class="sub-btn" id="pall">表示中の ${list.length} ロットを全部選ぶ</button>` + list.slice(0, 200).map(p =>
    `<label class="prow2"><input type="checkbox" data-lot="${esc(p.id)}"${sel.has(p.id) ? ' checked' : ''}>
      <span><b>${esc(planName(p))}</b> <small class="muted">${esc(p.id)}・${esc(p.regItem)}・${esc(p.v['出荷先'])} ${esc(p.v['出荷日'])}出荷</small></span></label>`).join('')
    + (list.length > 200 ? '<p class="muted">200件まで出しています。探す文字で絞ってください。</p>' : '');
  box.querySelectorAll('[data-lot]').forEach(c => c.onchange = () => {
    const ids = sprayLots().filter(id => id !== c.dataset.lot);
    if (c.checked) ids.push(c.dataset.lot);
    setSprayLots(ids);
    refreshChips();
  });
  document.getElementById('pall').onclick = () => { setSprayLots(sprayLots().concat(list.slice(0, 200).map(p => p.id))); drawPicker(q); refreshChips(); };
}
// 一覧で選んでいる間は、上の「選んだロット」だけ描き直す（探す文字が消えないように）
function refreshChips() {
  const q = document.getElementById('pq');
  const keep = q ? q.value : '';
  render();
  const q2 = document.getElementById('pq');
  if (q2 && keep) { q2.value = keep; drawPicker(keep); }
}

async function submitSpray() {
  const qrids = sprayLots();
  const products = sprayForm.products.filter(p => p.name).map(p => ({ name: p.name, dilution: String(p.dilution).trim() }));
  popup('wait', '記録しています…', qrids.length + 'ロット × ' + products.length + '剤');
  try {
    const s = await postApi({ action: 'spray', qrids, products, amount: Number(sprayForm.amount), equipment: sprayForm.equipment,
      place: load('sprayPlace'), area: sprayForm.area, regChecked: sprayForm.regChecked, washed: sprayForm.washed, memo: sprayForm.memo, person: getName() });
    server = s; rebuild();
    const created = s.created || [];
    setSprayLots([]);
    sprayOpenId = '';
    Object.assign(sprayForm, { products: [{ name: '', dilution: '' }], amount: '', area: '', regChecked: false, washed: false, memo: '' });
    pickerOpen = false;
    render();
    popup('ok', '散布を記録しました', qrids.length + 'ロット × ' + products.length + '剤', () => undoSpray(created));
  } catch (e) {
    popup('err', '記録できませんでした', e.message);
  }
}
async function undoSpray(ids) {
  popup('wait', '取り消しています…');
  try { server = await postApi({ action: 'deleteSpray', logIds: ids, person: getName(), planner: isPlanner() }); rebuild(); render(); popup('ok', '取り消しました'); }
  catch (e) { popup('err', '取り消せませんでした', e.message); }
}

// 散布記録の行（ロット×薬剤）を、1回の散布ごとにまとめる
function sprayEvents(rows) {
  const ev = {};
  rows.forEach(r => {
    const e = ev[r.sprayId] = ev[r.sprayId] || { id: r.sprayId, time: r.time, person: r.person, place: r.place, amount: r.amount, equipment: r.equipment,
      products: {}, lots: {}, logIds: [], canDelete: true };
    e.products[r.product] = r.dilution;
    e.lots[r.id] = r.variety || r.item;
    e.logIds.push(r.logId);
    e.canDelete = e.canDelete && r.canDelete;
  });
  return Object.values(ev);
}
function eventHtml(e) {
  const lots = Object.keys(e.lots);
  return `<div class="log"><div class="body">
    <div><b>${esc(Object.keys(e.products).map(p => p + (e.products[p] ? '（' + e.products[p] + '）' : '')).join(' ＋ '))}</b></div>
    <div class="t">${esc(e.time)}　${esc(e.place)}　${esc(e.amount)}L・${esc(e.equipment)}　${esc(e.person)}</div>
    <div class="t">${lots.length}ロット：${esc(lots.slice(0, 6).map(id => id + ' ' + e.lots[id]).join('、'))}${lots.length > 6 ? ' ほか' : ''}</div></div>
    ${e.canDelete && (isPlanner() || e.person === getName()) ? `<button type="button" class="del" data-delspray="${esc(e.logIds.join(','))}">消す</button>` : ''}</div>`;
}
function bindSprayDelete() {
  document.querySelectorAll('[data-delspray]').forEach(b => b.onclick = () => {
    if (!confirm('この散布の記録（全部のロットの分）を消しますか？（散布記録シートからも消えます）')) return;
    undoSpray(b.dataset.delspray.split(','));
  });
}

// ---------- 計画画面：このロットの農薬の使用履歴 ----------

// 鉢上げなどの工程と同じ見た目（✓の丸＋カードの縦の並び）で、散布の記録を古い順に出し、最後に「薬散を記録する」を置く。
// viewOnly（作業を調べる）のときは、ボタンを押すと記録の画面へ移って入力を開く
function pestHistoryHtml(plan, viewOnly) {
  if (!state.pest) return "";
  const rows = state.pest.sprays.filter(s => s.id === plan.id);
  const c = state.pest.counts[plan.id] || { p: {}, i: {} };
  const chips = Object.keys(c.p).map(name => {
    const reg = pestReg(plan.regItem, name);
    const bad = reg && reg.max && c.p[name] >= reg.max;
    return `<span class="tag ${bad ? "now" : "ok"}">${esc(name)} ${c.p[name]}${reg && reg.max ? "/" + reg.max : ""}</span>`;
  }).join(" ");
  const open = !viewOnly && sprayOpenId === plan.id;
  inlineLots = [];
  if (open) {
    inlineLots = sprayLotList();
    if (!inlineLots.some(p => p.id === plan.id)) inlineLots = [plan].concat(inlineLots);   // このロットは必ず入れる
    if (inlineLots.length !== sprayLots().length) setSprayLots(inlineLots.map(p => p.id));
  }
  // 混用した薬剤は1回の散布にまとめる（古い順）
  const events = [];
  rows.slice().reverse().forEach(r => { let e = events.find(x => x.id === r.sprayId); if (!e) events.push(e = { id: r.sprayId, rows: [] }); e.rows.push(r); });
  const items = events.map(e => {
    const r0 = e.rows[0];
    const prods = e.rows.map(r => `<div>${esc(r.product)}（${esc(r.dilution)}）　${esc(r.share)}L　本剤 ${esc(r.count)}${r.ingCount ? "　" + esc(r.ingCount) : ""}</div>`).join("");
    return `<li class="done"><span class="mark">✓</span><div class="box">
      <div class="t">${esc(e.rows.map(r => r.product).join(" ＋ "))}<span class="tag ok">完了</span></div>
      <div class="info">${esc(r0.time)}　${esc(r0.person)}${r0.place ? "　" + esc(r0.place) : ""}${r0.equipment ? "　" + esc(r0.equipment) : ""}${r0.timing ? "　" + esc(r0.timing) : ""}${prods}</div></div></li>`;
  }).join("");
  const add = open
    ? `<li class="cur"><span class="mark"></span><div class="box"><div class="t">薬散を記録する<span class="tag now">入力中</span></div>
        ${sprayFormHtml(inlineLots, plan.id)}<button type="button" class="others" id="sprayclose" style="width:100%;margin:8px 0 0">記録せずに閉じる</button></div></li>`
    : `<li class="todo"><span class="mark"></span><div class="box"><div class="t">次の薬散<span class="tag ng">未記録</span></div>
        <div class="desc">農薬をまいたら、ここから記録する（担当に関係なく、誰でも記録できる）</div>
        <div class="row"><button type="button" class="do" id="sprayopen">薬散を記録する</button></div></div></li>`;
  return `<section class="major"><h2>薬剤散布${events.length ? '<span class="tag ok">' + events.length + '回</span>' : '<span class="tag ng">0回</span>'}</h2>
    ${chips ? `<div class="fs muted" style="margin:-4px 0 8px"><b>使用回数</b> ${chips}</div>` : ""}
    <ol class="tl">${items}${add}</ol>
    ${rows.length ? '<button type="button" class="sub-btn" id="pesthprint" style="margin:0 0 8px">この苗の散布履歴を印刷する（A4 横）</button>' : ""}</section>`;
}
let sprayOpenId = '';     // 計画画面で「薬剤散布」の入力を開いているロット
let inlineLots = [];      // その入力の対象のロット（このロット ＋ 一緒に散布したロット）
// 和暦の日付（記入シートと同じ「令和 年 月 日」）
function wareki(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const y = Number(m[1]);
  return (y >= 2019 ? '令和' + (y - 2018) : y) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
}

// この苗（ロット）の散布履歴を、記入シートと同じ項目の一覧にして印刷する（A4 横）。混用した薬剤は、1回の散布としてまとめる
function printPestHistory(plan) {
  const rows = state.pest.sprays.filter(s => s.id === plan.id).slice().reverse();   // 古い順
  const events = [];
  rows.forEach(r => { let e = events.find(x => x.id === r.sprayId); if (!e) events.push(e = { id: r.sprayId, rows: [] }); e.rows.push(r); });
  const c = state.pest.counts[plan.id] || { p: {}, i: {} };
  const total = Object.keys(c.p).map(name => {
    const reg = pestReg(plan.regItem, name);
    return name + ' ' + c.p[name] + '回' + (reg && reg.max ? '（上限' + reg.max + '回）' : '');
  }).join('、');
  const td = (v, n) => `<td${n > 1 ? ' rowspan="' + n + '"' : ''}>${esc(v)}</td>`;
  const body = events.map(e => e.rows.map((r, k) => {
    const n = e.rows.length;
    return '<tr>' + (k ? '' : td(wareki(r.date) || r.time, n) + td(r.person, n) + td(r.place, n) + td(r.area, n))
      + td(r.product) + td(r.ings) + td(r.count) + td(r.ingCount) + td(r.check) + td(r.method + '・' + r.dilution) + td(r.timing)
      + (k ? '' : td(r.share + 'L' + (String(r.share) !== String(r.amount) ? '（全体 ' + r.amount + 'L）' : ''), n) + td(r.equipment, n) + td(r.washed, n)) + '</tr>';
  }).join('')).join('');
  let el = document.getElementById('printarea');
  if (!el) { el = document.createElement('div'); el.id = 'printarea'; document.body.appendChild(el); }
  const now = new Date();
  el.innerHTML = `<h1>農薬使用履歴（病害虫防除 使用農薬）</h1>
    <table class="pi">
      <tr><th>対象品目名・品種名</th><td>${esc(planName(plan))}</td><th>QRID</th><td>${esc(plan.id)}</td><th>出荷予定日</th><td>${esc(plan.w['出荷日'] || plan.v['出荷日'] || '')}</td></tr>
      <tr><th>農薬適用作物名</th><td>${esc(plan.regItem || '')}</td><th>出荷先</th><td>${esc(plan.v['出荷先'] || '')}</td><th>印刷日</th><td>${esc(wareki(now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2)))}　${esc(getName())}</td></tr>
      <tr><th>使用回数の合計</th><td colspan="5">${esc(total || 'なし')}</td></tr>
    </table>
    <table><thead><tr><th>農薬使用年月日</th><th>作業者名</th><th>使用場所</th><th>散布面積・割合</th><th>薬剤名</th><th>成分名</th>
      <th>本剤 使用回数<br>累計/上限</th><th>成分別 使用回数<br>累計/上限</th><th>登録確認<br>（確認者）</th><th>使用方法・希釈倍数</th><th>使用時期</th>
      <th>使用量</th><th>使用機材</th><th>洗浄確認<br>（確認者）</th></tr></thead>
      <tbody>${body || '<tr><td colspan="14">散布の記録はありません</td></tr>'}</tbody></table>
    <p>散布 ${events.length}回・薬剤のべ ${rows.length}件。使用量は、このロットの分（TR 数で分けた量）。同じ日時にまとめて書いてある薬剤は混用。</p>`;
  const pg = document.createElement('style');
  pg.textContent = '@page { size: A4 landscape; margin: 10mm; }';
  document.head.appendChild(pg);
  document.body.classList.add('pest-print');
  const done = () => { document.body.classList.remove('pest-print'); pg.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

function bindPest(plan) {
  const hp = document.getElementById('pesthprint');
  if (hp) hp.onclick = () => printPestHistory(plan);
  const o = document.getElementById('sprayopen');
  if (o) o.onclick = () => { sprayOpenId = plan.id; setSprayLots([plan.id]); pickerOpen = false;
    if (VIEW) openPlan(plan.id, false); else render();   // 調べる画面からは、記録の画面へ移って入力を開く
  };   // 対象は、このロットだけから始める
  const c = document.getElementById('sprayclose');
  if (c) c.onclick = () => { sprayOpenId = ''; setSprayLots([]); pickerOpen = false; render(); };
  if (sprayOpenId === plan.id && document.getElementById('spgo')) bindSprayForm(inlineLots);
}

// ---------- 計画担当：「農薬」タブ ----------

// 取引先に出す「使用農薬履歴」：商品名（品種）ごとに、農薬名・含有有効成分・使用方法・回数。回数はロットごとの回数の一番多いもの
function usageHistory(shipTo) {
  const plans = state.plans.filter(p => !shipTo || p.v['出荷先'] === shipTo);
  const byName = {};
  plans.forEach(p => {
    const key = p.v['商品名'] || planName(p);
    const g = byName[key] = byName[key] || { name: key, rows: {}, dates: [] };
    if (p.w['出荷日']) g.dates.push(p.w['出荷日']);
    const c = state.pest.counts[p.id];
    if (!c) return;
    Object.keys(c.p).forEach(prod => {
      const pr = pestProduct(prod);
      const r = g.rows[prod] = g.rows[prod] || { product: prod, ings: pr ? pr.ings.join('・') : '', method: '散布', n: 0 };
      r.n = Math.max(r.n, c.p[prod]);
    });
  });
  return Object.values(byName).filter(g => Object.keys(g.rows).length);
}
function plannerPestHtml() {
  const shipTos = [...new Set(state.plans.map(p => p.v['出荷先']).filter(Boolean))];
  const hist = usageHistory(pestShipTo);
  const table = hist.map(g => Object.values(g.rows).map((r, k) =>
    `<tr><td>${k ? '' : esc(g.name)}</td><td>${esc(r.product)}</td><td>${esc(r.ings)}</td><td>${esc(r.method)}</td><td>${r.n}</td></tr>`).join('')).join('');
  const events = sprayEvents(state.pest.sprays);
  return `<div class="card sp"><h3>使用農薬履歴（取引先に出す形）</h3>
      <div class="filter"><button type="button" data-ship="" class="${!pestShipTo ? 'on' : ''}">すべて</button>${shipTos.map(s =>
        `<button type="button" data-ship="${esc(s)}" class="${pestShipTo === s ? 'on' : ''}">${esc(s)}</button>`).join('')}</div>
      ${table ? `<div style="overflow-x:auto"><table class="ut"><tr><th>商品名</th><th>農薬名</th><th>含有有効成分</th><th>使用方法</th><th>回数</th></tr>${table}</table></div>
      <button type="button" class="sub-btn" id="copyhist">表をコピー（Excel に貼れる形）</button>` : '<div class="empty">まだ散布の記録はありません</div>'}
      <p class="muted">回数は、同じ商品名のロットのうち一番多いロットの回数。</p></div>
    <div class="card sp"><h3>散布の記録（全員・新しい順）</h3>${events.map(eventHtml).join('') || '<div class="empty">まだありません</div>'}</div>
    <div class="card sp"><h3>ボトルの写真 <span class="muted">${state.pest.products.filter(p => p.photo).length} / ${state.pest.products.length} 登録済</span></h3>
      <details><summary class="muted">薬剤ごとの写真を見る・登録する</summary><div class="tg" style="margin-top:8px">${state.pest.products.slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(p => `<div class="tg-t" style="cursor:default">${bottleImg(p.name)}<b>${esc(p.name)}</b>${photoButton(p.name)}</div>`).join('')}</div></details>
      <p class="muted">散布の画面で、選んだ薬剤の横に出る。写真は「農薬」シートの「写真」の列（URL）。</p></div>`;
}
function bindPlannerPest() {
  bindPhotoInputs();
  document.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => { pestShipTo = b.dataset.ship; render(); });
  const c = document.getElementById('copyhist');
  if (c) c.onclick = () => {
    const lines = [['商品名', '農薬名', '含有有効成分', '使用方法', '回数'].join('\t')];
    usageHistory(pestShipTo).forEach(g => Object.values(g.rows).forEach((r, k) => lines.push([k ? '' : g.name, r.product, r.ings, r.method, r.n].join('\t'))));
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast('コピーしました。Excel に貼ってください'), () => toast('コピーできませんでした', true));
  };
  bindSprayDelete();
}
