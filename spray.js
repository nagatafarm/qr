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

// ---------- 画面：農薬散布担当 ----------

function renderSpray() {
  if (!tab) tab = 'new';
  const lots = sprayLots().map(id => state.plans.find(p => p.id === id)).filter(Boolean);
  if (lots.length !== sprayLots().length) setSprayLots(lots.map(p => p.id));
  let body;
  if (tab === 'new') {
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
        <div class="chips">${lots.map(p => `<span class="chip">${esc(planName(p))} <small>${esc(p.id)}・${esc(p.regItem)}</small><button type="button" data-unlot="${esc(p.id)}" aria-label="外す">×</button></span>`).join('') || '<span class="muted">まだ選んでいません。下の「ロットを選ぶ」か、ロットの QR を読んで「散布の対象に入れる」で足します。</span>'}</div>
        <button type="button" class="sub-btn" id="pick">${pickerOpen ? '選び終わった' : '＋ ロットを選ぶ'}</button>
        ${pickerOpen ? `<div class="picker">
          <input type="search" id="pq" placeholder="品種・品目・QRID で探す" autocomplete="off">
          <div id="plist"></div></div>` : ''}
      </div>
      <div class="card sp">
        <h3>② 薬剤（混ぜた薬剤は3つまで）</h3>
        ${sprayForm.products.map((pr, k) => {
          const c = pr.name ? chk[ci++] : null;
          const regs = lots.map(p => pestReg(p.regItem, pr.name)).filter(Boolean);
          return `<div class="prow">
            <div class="pline"><select data-prod="${k}">${productOptions(pr.name)}</select>
              ${sprayForm.products.length > 1 ? `<button type="button" class="x" data-rmprod="${k}" aria-label="外す">×</button>` : ''}</div>
            ${pr.name ? `<div class="pline"><input type="text" data-dil="${k}" value="${esc(pr.dilution)}" placeholder="倍率（例：2000倍）" autocomplete="off">
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
  } else {
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
  if (tab !== 'new') return;
  document.querySelectorAll('[data-unlot]').forEach(b => b.onclick = () => { setSprayLots(sprayLots().filter(id => id !== b.dataset.unlot)); render(); });
  document.getElementById('pick').onclick = () => { pickerOpen = !pickerOpen; render(); };
  if (pickerOpen) {
    const q = document.getElementById('pq');
    q.oninput = () => drawPicker(q.value);
    drawPicker('');
  }
  document.querySelectorAll('[data-prod]').forEach(s => s.onchange = () => {
    const k = Number(s.dataset.prod);
    sprayForm.products[k] = { name: s.value, dilution: '' };
    render();
  });
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

function pestHistoryHtml(plan) {
  if (!state.pest) return '';
  const rows = state.pest.sprays.filter(s => s.id === plan.id);
  const c = state.pest.counts[plan.id] || { p: {}, i: {} };
  const chips = Object.keys(c.p).map(name => {
    const reg = pestReg(plan.regItem, name);
    const bad = reg && reg.max && c.p[name] >= reg.max;
    return `<span class="tag ${bad ? 'now' : 'ok'}">${esc(name)} ${c.p[name]}${reg && reg.max ? '/' + reg.max : ''}</span>`;
  }).join(' ');
  const inList = sprayLots().includes(plan.id);
  return `<section class="major"><h2>農薬の使用履歴<span class="tag ng">${rows.length}件</span></h2>
    ${isSpray() ? `<button type="button" class="${inList ? 'others' : 'do'}" id="addlot" style="width:100%;margin-bottom:10px">${inList ? '✓ 散布の対象に入っています（外す）' : 'このロットを散布の対象に入れる'}</button>` : ''}
    ${chips ? `<div style="margin-bottom:8px">${chips}</div>` : ''}
    ${rows.map(r => `<div class="log"><div class="body"><div><b>${esc(r.product)}</b>（${esc(r.dilution)}）　${esc(r.share)}L</div>
      <div class="t">${esc(r.time)}　${esc(r.timing)}　${esc(r.place)}　${esc(r.equipment)}　${esc(r.person)}　本剤 ${esc(r.count)}　${esc(r.ingCount)}</div></div></div>`).join('')
      || '<div class="empty">まだ散布の記録はありません</div>'}
    ${isSpray() && sprayLots().length ? `<a class="open" href="${esc(APP_URL)}">散布の記録へ（${sprayLots().length}ロット選択中）</a>` : ''}</section>`;
}
function bindPest(plan) {
  const b = document.getElementById('addlot');
  if (b) b.onclick = () => {
    const ids = sprayLots();
    setSprayLots(ids.includes(plan.id) ? ids.filter(id => id !== plan.id) : ids.concat(plan.id));
    toast(ids.includes(plan.id) ? '対象から外しました' : '散布の対象に入れました（' + sprayLots().length + 'ロット）');
    render();
  };
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
    <div class="card sp"><h3>散布の記録（全員・新しい順）</h3>${events.map(eventHtml).join('') || '<div class="empty">まだありません</div>'}</div>`;
}
function bindPlannerPest() {
  document.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => { pestShipTo = b.dataset.ship; render(); });
  const c = document.getElementById('copyhist');
  if (c) c.onclick = () => {
    const lines = [['商品名', '農薬名', '含有有効成分', '使用方法', '回数'].join('\t')];
    usageHistory(pestShipTo).forEach(g => Object.values(g.rows).forEach((r, k) => lines.push([k ? '' : g.name, r.product, r.ings, r.method, r.n].join('\t'))));
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast('コピーしました。Excel に貼ってください'), () => toast('コピーできませんでした', true));
  };
  bindSprayDelete();
}
