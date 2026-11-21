// 天気の帯（藤沢市の「今日」「明日」「7日間」を、数秒ごとに切り替えて出す）。どのページの上の帯にも入れる。
// 使い方：上の帯（header）の中に <span class="wx" id="wx" hidden></span> を置いて wxStart() を呼ぶ。wxMount(header) は、無ければ題名のとなりに足してから始める。
(function () {
  const st = document.createElement('style');
  st.textContent = `
  .wx { display: inline-grid; justify-items: start; text-align: left; color: #fff; font-size: 12px; cursor: default; padding: 4px 0; white-space: nowrap; overflow: hidden; max-width: 100%; min-width: 0; transition: background .4s, color .4s; }
  /* 見比べ用：URL に ?wxpill を付けると、前の形（文の後ろに角丸の帯）に戻る */
  .wx.pill { background: rgba(255,255,255,.16); border-radius: 999px; padding: 4px 12px; }
  /* 文は全部、同じマスに重ねる（枠の幅がいちばん長い文に合う）。出番でない文は下に待たせ、出番が来たら下から上へ送る */
  .wx .wxs { grid-area: 1 / 1; transform: translateY(140%); opacity: 0; }
  .wx .wxs.cur { transform: none; opacity: 1; transition: transform .5s cubic-bezier(.2,.8,.2,1), opacity .35s; }
  .wx .wxs.out { transform: translateY(-140%); opacity: 0; transition: transform .5s cubic-bezier(.2,.8,.2,1), opacity .35s; }
  /* 帯の中の7日間：1日ぶん ＝ 日付・絵・最高/最低。広い画面は横1列、せまい画面は7列のます（上に日付と絵、下に気温） */
  .wx .wk { display: inline-flex; gap: 4px; align-items: center; }
  .wx .wkd { display: inline-flex; gap: 3px; align-items: baseline; border-radius: 999px; padding: 0 6px; }
  .wx .wkd .d { font-weight: bold; } .wx .wkd .d small { font-size: 10px; font-weight: normal; margin-left: 1px; }
  /* 7日間の中の荒れそうな日：色は付けるが、うすく（透かして）目立ちすぎないように */
  .wx .wkd.warn { background: rgba(255, 210, 77, .38); } .wx .wkd.danger { background: rgba(229, 72, 77, .5); }
  /* 気をつける項目（雷・強い雨・突風など）：その言葉だけを太字にして、色を付ける（黄＝注意、うすい赤＝強い注意） */
  .wx .hz { font-weight: bold; } .wx .hz.l1 { color: #ffe27a; } .wx .hz.l2 { color: #ffc4c6; }
  .wx .wkd.warn, .wx .wkd.danger { font-weight: bold; }
  .wx.pill.warn { background: #ffd24d; color: #4a3500; }
  .wx.pill.danger { background: #e5484d; color: #fff; }
  .wx.pill .hz { color: inherit; }
  @media (prefers-reduced-motion: reduce) { .wx .wxs.cur, .wx .wxs.out { transition: none; } }
  .wx[hidden] { display: none; }
  /* せまい画面：帯を題名の下の段に回し、長い文は切らずに折り返す（高さは、いちばん長い文に合う） */
  @media (max-width: 900px) { .wx { order: 9; flex: 1 0 100%; justify-items: start; align-items: center; white-space: normal; text-align: left; line-height: 1.45; }
    .wx.pill { border-radius: 12px; }
    .wx .wxs.week { justify-self: stretch; }
    .wx .wk { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .wx .wkd { display: grid; grid-template-columns: auto auto; justify-content: center; column-gap: 2px; padding: 0 1px; border-radius: 8px; white-space: nowrap; }
    .wx .wkd .t { grid-column: 1 / 3; } }
  @media (max-width: 900px) { header { flex-wrap: wrap; } }
  /* どの画面でも同じ位置：題名と名前の札の段のすぐ下に、1段使って右寄せで出す（3つのボタンがある画面は、そのボタンの段の上） */
  header .wx { order: 8; flex: 1 0 100%; justify-items: end; text-align: right; margin: 0; padding: 0; }
  @media (min-width: 901px) { header .wx .wxs.week { justify-self: end; } }
`;
  document.head.appendChild(st);
})();
// 上の帯 h に、天気の帯が無ければ足して（題名のとなり）、切り替えを始める
function wxMount(h) {
  if (!h) return;
  if (!document.getElementById('wx')) {
    const s = document.createElement('span');
    s.className = 'wx'; s.id = 'wx'; s.hidden = true; s.title = '藤沢市の天気（Open-Meteo の予報）';
    h.insertBefore(s, h.children[1] || null);
  }
  wxStart();
}
// ---------- 天気：上の帯に、藤沢市の「今日」「明日」「7日間（天気と最高/最低気温）」を数秒ごとに切り替えて出す ----------
// 予報は Open-Meteo（鍵のいらない公開の予報。送るのは藤沢市の緯度・経度だけ）。15分はこのブラウザに覚えて、読み直さない
// 切り替えは、駅の行き先表示のように下から上へ送る。枠の幅は、いちばん長い文に合わせて変えない。
// 雷・強い雨・突風のおそれがあるときは、「注意」の文を足し、その文とその日の文で枠の色を変える（黄＝注意、赤＝強い注意）
const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=35.339&longitude=139.490&timezone=Asia%2FTokyo&forecast_days=7&forecast_hours=6&wind_speed_unit=ms'
  + '&hourly=weather_code,precipitation,wind_gusts_10m'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max';
const WX_KEEP_MS = 15 * 60000, WX_TURN_MS = 4500, WX_WARN_MS = 10000, WX_WEEK_MS = 5000;   // 文を出しておく時間。荒天の文（黄・赤）は長めに出す
// 色を変える目安：突風（最大瞬間風速）15m/s から注意・20m/s から強い注意。雨 1時間に 10mm から注意・30mm から強い注意。雷はいつも強い注意
const WX_GUST = [15, 20], WX_RAIN = [10, 30];
let wx = null, wxAt = 0, wxNo = 0, wxTimer = 0, wxBusy = false;
// 天気の番号（WMO）→ 絵と言葉
function wxWord(c) {
  if (c === 0) return ['☀', '快晴'];
  if (c === 1) return ['🌤', '晴れ'];
  if (c === 2) return ['⛅', '晴れ時々くもり'];
  if (c === 3) return ['☁', 'くもり'];
  if (c === 45 || c === 48) return ['🌫', '霧'];
  if (c >= 51 && c <= 57) return ['🌦', '霧雨'];
  if (c === 61 || c === 80) return ['🌧', '弱い雨'];
  if (c === 63 || c === 81) return ['🌧', '雨'];
  if (c === 65 || c === 82) return ['🌧', '強い雨'];
  if (c === 66 || c === 67) return ['🌧', '冷たい雨'];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['❄', '雪'];
  if (c >= 95) return ['⛈', '雷雨'];
  return ['', ''];
}
const wxDir = d => ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(Number(d) / 45) % 8] || '';
const wxNum = v => String(Math.round(Number(v)));
// 荒れ具合：0 ＝ ふつう、1 ＝ 注意、2 ＝ 強い注意（code ＝ 天気の番号、gust ＝ 最大瞬間風速 m/s、rain ＝ 1時間の雨 mm）
function wxLevel(code, gust, rain) {
  let lv = 0;
  if (code >= 95) lv = 2;
  else if (code === 65 || code === 82) lv = 1;
  if (gust >= WX_GUST[1]) lv = 2; else if (gust >= WX_GUST[0]) lv = Math.max(lv, 1);
  if (rain >= WX_RAIN[1]) lv = 2; else if (rain >= WX_RAIN[0]) lv = Math.max(lv, 1);
  return lv;
}
// これから6時間のうちに、雷・強い雨・突風がありそうなら、その知らせ（なければ null）
// 気をつける言葉を太字にする（lv：1 ＝ 注意、2 ＝ 強い注意）
const wxHz = (t, lv) => `<span class="hz l${lv}">${t}</span>`;
function wxAlert() {
  const h = wx && wx.hourly;
  if (!h || !h.time) return null;
  const at = i => Number(String(h.time[i]).slice(11, 13)) + '時ごろ', parts = [];
  let lv = 0;
  const th = h.weather_code.findIndex(c => c >= 95);
  if (th >= 0) { parts.push(wxHz('⛈ 雷雨のおそれ', 2) + '（' + at(th) + '）'); lv = 2; }
  let ri = -1; (h.precipitation || []).forEach((v, i) => { if (v >= WX_RAIN[0] && (ri < 0 || v > h.precipitation[ri])) ri = i; });
  if (ri >= 0) { parts.push(wxHz('🌧 ' + (h.precipitation[ri] >= WX_RAIN[1] ? '激しい雨' : '強い雨') + ' ' + wxNum(h.precipitation[ri]) + 'mm/時', h.precipitation[ri] >= WX_RAIN[1] ? 2 : 1) + '（' + at(ri) + '）'); lv = Math.max(lv, h.precipitation[ri] >= WX_RAIN[1] ? 2 : 1); }
  let gi = -1; (h.wind_gusts_10m || []).forEach((v, i) => { if (v >= WX_GUST[0] && (gi < 0 || v > h.wind_gusts_10m[gi])) gi = i; });
  if (gi >= 0) { parts.push(wxHz('🌬 突風 ' + wxNum(h.wind_gusts_10m[gi]) + 'm/s', h.wind_gusts_10m[gi] >= WX_GUST[1] ? 2 : 1) + '（' + at(gi) + '）'); lv = Math.max(lv, h.wind_gusts_10m[gi] >= WX_GUST[1] ? 2 : 1); }
  return parts.length ? { html: '<b>⚠ 藤沢 注意</b> ' + parts.join('　'), lv: lv } : null;
}
// 出す文の並び：{ html, lv }
function wxSlides() {
  if (!wx || !wx.daily || !wx.daily.weather_code) return [];
  const d = wx.daily, out = [];
  const al = wxAlert();
  if (al) out.push(al);
  ['今日', '明日'].forEach((lb, i) => {
    if (d.weather_code[i] == null) return;
    const w = wxWord(d.weather_code[i]), rain = d.precipitation_probability_max && d.precipitation_probability_max[i];
    const gust = (d.wind_gusts_10m_max && d.wind_gusts_10m_max[i]) || 0, lv = wxLevel(d.weather_code[i], gust, 0);
    const clv = wxLevel(d.weather_code[i], 0, 0), word = clv ? wxHz(w[0] + ' ' + w[1], clv) : w[0] + ' ' + w[1];
    out.push({ html: `<b>藤沢 ${lb}</b> ${word}　${wxNum(d.temperature_2m_max[i])}℃ / ${wxNum(d.temperature_2m_min[i])}℃${rain == null ? '' : '　雨 ' + wxNum(rain) + '%'}　風 ${wxDir(d.wind_direction_10m_dominant[i])} ${wxNum(d.wind_speed_10m_max[i])}m/s`
      + (gust >= WX_GUST[0] ? '（' + wxHz('突風 ' + wxNum(gust) + 'm/s', gust >= WX_GUST[1] ? 2 : 1) + '）' : ''), lv: lv });
  });
  const wk = wxWeekHtml();
  if (wk) out.push({ html: wk, lv: 0, week: true });
  return out;
}
// 7日間：日ごとに、日付（曜日）・天気の絵・最高/最低気温（数字だけ）。帯の中の1枚として出す。荒れそうな日は、その日だけ色を付ける
function wxWeekHtml() {
  const d = wx && wx.daily;
  if (!d || !d.time || d.time.length < 3) return '';
  return '<span class="wk">' + d.time.slice(0, 7).map((k, i) => {
    const dow = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))).getUTCDay();
    const w = wxWord(d.weather_code[i]), lv = wxLevel(d.weather_code[i], (d.wind_gusts_10m_max && d.wind_gusts_10m_max[i]) || 0, 0);
    return `<span class="wkd${lv === 2 ? ' danger' : lv === 1 ? ' warn' : ''}"><span class="d">${i === 0 ? '今日' : Number(k.slice(8, 10)) + '<small>' + '日月火水木金土'[dow] + '</small>'}</span><span class="i">${w[0]}</span><span class="t">${wxNum(d.temperature_2m_max[i])}/${wxNum(d.temperature_2m_min[i])}</span></span>`;
  }).join('') + '</span>';
}
// 枠の中に、文を全部重ねて置く（枠の幅は、いちばん長い文に合う）。出すのは cur の1つ。step ＝ true なら次の文へ送る
function wxDraw(step) {
  const el = document.getElementById('wx'), s = wxSlides();
  if (!el) { clearTimeout(wxTimer); wxTimer = 0; return; }      // 最初の画面を離れたら、切り替えを止める
  if (!s.length) { el.hidden = true; return; }
  const sig = s.map(x => x.html).join('|');
  const prev = wxNo % s.length;
  if (step) wxNo++;
  const cur = wxNo % s.length;
  if (el.dataset.sig !== sig) {       // 初めて描く・中身が変わった・画面が描き直された：作り直す（このときは送らない）
    el.innerHTML = s.map((x, i) => `<span class="wxs${x.week ? ' week' : ''}${i === cur ? ' cur' : ''}">${x.html}</span>`).join('');
    el.dataset.sig = sig;
  } else if (step && cur !== prev) {
    [...el.children].forEach((c, i) => { c.classList.toggle('out', i === prev); c.classList.toggle('cur', i === cur); });
  }
  el.classList.toggle('warn', s[cur].lv === 1); el.classList.toggle('danger', s[cur].lv === 2);
  el.hidden = false;
}
// 今出ている文の荒れ具合に合わせて、次に送るまでの時間を決める
function wxNext() {
  const s = wxSlides(), x = s.length ? s[wxNo % s.length] : {};
  wxTimer = setTimeout(() => { wxTimer = 0; wxDraw(true); if (document.getElementById('wx')) wxNext(); }, x.week ? WX_WEEK_MS : x.lv ? WX_WARN_MS : WX_TURN_MS);
}
function wxStart() {
  const el0 = document.getElementById('wx');
  if (el0 && /[?&]wxpill(?![\w-])/.test(location.search)) el0.classList.add('pill');
  if (!wx) { try { const v = JSON.parse(localStorage.getItem('qrdemo.wx') || 'null'); if (v && v.d) { wx = v.d; wxAt = v.at; } } catch (e) {} }
  wxDraw();
  if (!wxTimer) wxNext();
  if (wxBusy || Date.now() - wxAt < WX_KEEP_MS) return;
  wxBusy = true;
  fetch(WX_URL, { credentials: 'omit' }).then(r => r.ok ? r.json() : Promise.reject()).then(d => {
    wx = d; wxAt = Date.now(); wxDraw();
    clearTimeout(wxTimer); wxTimer = 0; if (document.getElementById('wx')) wxNext();   // 届いた中身に合わせて、出しておく時間を数え直す
    try { localStorage.setItem('qrdemo.wx', JSON.stringify({ at: wxAt, d: d })); } catch (e) {}
  }).catch(() => { wxAt = Date.now() - WX_KEEP_MS + 5 * 60000; }).finally(() => { wxBusy = false; });   // 取れなければ出さない。5分後にもう一度
}
