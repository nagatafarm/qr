// 一覧・計画画面・ラベル印刷で共通の処理

// このフォルダのURL（= index.html）。QRの中身は「このURL + ?id=QRID」
const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, '');

function planUrl(id) { return APP_URL + '?id=' + encodeURIComponent(id); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Apps Script（データの窓口）を呼ぶ。
// credentials: 'omit' で Google のログイン情報を送らないので、スマホが Google にどうログインしていても結果は同じ。
// POST の本文は文字列のまま送る（Content-Type が text/plain になり、事前確認の通信が要らない）。
// options が文字なら GET の問い合わせ（例：'api=schedule&from=2026-11-13'）、なければ ?api=state、それ以外は POST
async function callApi(options) {
  let res;
  const query = typeof options === 'string' ? options : '';
  if (query) options = null;
  try {
    res = await fetch(options ? API_URL : API_URL + '?' + (query || 'api=state&slim=1'),
      Object.assign({ credentials: 'omit', cache: 'no-store', redirect: 'follow' }, options || {}));
  } catch (e) {
    throw new Error('通信できませんでした。電波の状態を確認してください');
  }
  if (!res.ok) throw new Error('通信に失敗しました（' + res.status + '）');
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('データの窓口から正しい返事がありません。config.js のURLと、Apps Script のデプロイを確認してください');
  }
  if (!data.ok) throw new Error(data.error || '失敗しました');
  return unslim(data.state);
}

// 窓口が空の欄を省いて送った状態（slim）を、元の形（どの欄もある）に戻す。並びも元のまま（2026-11-23 速さ.gs）
function unslim(st) {
  if (!st || !st.slim || !Array.isArray(st.plans)) return st;
  const fill = (o, keys) => { const n = {}; keys.forEach(k => { n[k] = k in o ? o[k] : ''; }); Object.keys(o).forEach(k => { if (!(k in n)) n[k] = o[k]; }); return n; };
  st.plans.forEach(p => {
    p.v = fill(p.v || {}, st.slim.v);
    Object.keys(p.status || {}).forEach(k => { p.status[k] = fill(p.status[k] || {}, st.slim.st); });
  });
  if (Array.isArray(st.logs)) st.logs = st.logs.map(l => fill(l, st.slim.log));
  delete st.slim;
  return st;
}

function fetchState() { return callApi(); }

// スケジュールの状態（from をふくむ週。空なら今週）
function fetchSchedule(from) { return callApi('api=schedule' + (from ? '&from=' + encodeURIComponent(from) : '')); }

function postRecord(rec) { return postApi(Object.assign({ action: 'record' }, rec)); }

// body.action：record（1件）／recordMany（まとめて）／delete（24時間以内の記録を消す）
// ログインの合言葉（token）は、どの POST にも付けて送る（計画担当・総務の操作を、窓口が本人と部署で確かめる）
function authToken() { try { return localStorage.getItem('qrdemo.token') || ''; } catch (e) { return ''; } }
// ログインした人のできること：{ depts[], planner, wish, majors[] }（index.html がログインのときと、窓口の状態が届くたびに覚え直す）
function authCaps() { try { return JSON.parse(localStorage.getItem('qrdemo.caps') || '{}') || {}; } catch (e) { return {}; } }
function postApi(body) { return callApi({ method: 'POST', body: JSON.stringify(Object.assign({ token: authToken(), slim: true }, body)) }); }
