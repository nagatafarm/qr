// Apps Script をウェブアプリとしてデプロイしたURL（末尾が /exec）。
// 「デプロイを管理」→ 鉛筆 → 新バージョン で更新すればURLは変わらないので、書き換えは最初の1回だけ。
const API_URL = 'https://script.google.com/macros/s/AKfycbwWMC5nlLG23wpI5JOG-xs2gf-ksvIgn6tVaiirPpW6bDrV5IUXkNuF56bjdJoL3inm/exec';
// Google でログインするための、このサイトの名札（クライアント ID）。空にすると、Google のログインを使わない
const GOOGLE_CLIENT_ID = '866623691634-iue46s0u6l731haa2jd1bt4tatnjps9i.apps.googleusercontent.com';
