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
async function callApi(options) {
  let res;
  try {
    res = await fetch(options ? API_URL : API_URL + '?api=state',
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
  return data.state;
}

function fetchState() { return callApi(); }

function postRecord(rec) { return postApi(Object.assign({ action: 'record' }, rec)); }

// body.action：record（1件）／recordMany（まとめて）／delete（24時間以内の記録を消す）
function postApi(body) { return callApi({ method: 'POST', body: JSON.stringify(body) }); }
