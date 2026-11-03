/**
 * 肥肥 API（Apps Script 網頁應用程式）
 * 指令碼屬性（專案設定 → 指令碼屬性）需設定：
 *   PASS       通關密碼（輸入頁第一次開啟時輸入）
 *   GEMINI_KEY Gemini API 金鑰
 * 部署：部署 → 新增部署作業 → 網頁應用程式 → 執行身分「我」→ 存取權「所有人」
 */
const MODEL = 'gemini-2.5-flash';
const P = k => PropertiesService.getScriptProperties().getProperty(k);
const ss = () => SpreadsheetApp.getActiveSpreadsheet();
const d8 = v => v instanceof Date ? Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v);

function doPost(e) {
  let out;
  try {
    const a = JSON.parse(e.postData.contents);
    if (!P('PASS') || a.pw !== P('PASS')) throw new Error('auth');
    out = { load: load_, add: add_, set: set_, del: del_, body: body_, food: food_, est: est_ }[a.act](a);
  } catch (err) {
    out = { error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function rows_(name, n) {
  const s = ss().getSheetByName(name), l = s.getLastRow();
  return l < 2 ? [] : s.getRange(2, 1, l - 1, n).getValues();
}

// 在 key 欄第一個空白列寫入（保留右側統計欄，不用 appendRow、不刪列）
function put_(name, keyCol, vals) {
  const s = ss().getSheetByName(name);
  const v = s.getRange(1, keyCol, s.getMaxRows(), 1).getValues();
  let row = v.findIndex((x, i) => i > 0 && x[0] === '') + 1;
  if (row < 2) row = s.getMaxRows() + 1;
  if (row > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), 20);
  s.getRange(row, 1, 1, vals.length).setValues([vals]);
}

function load_(a) {
  return {
    foods: rows_('食物資料庫', 7).filter(r => r[0] !== '').map(r => ({ n: r[0], s: r[1], k: r[2], p: r[3], c: r[4], f: r[5], g: r[6] })),
    log: rows_('每日紀錄', 8).map((r, i) => ({ r: i + 2, d: d8(r[0]), m: r[1], n: r[2], q: r[3], k: r[4], p: r[5], c: r[6], f: r[7] }))
      .filter(x => x.n !== '' && x.d === a.date),
    body: rows_('身體紀錄', 8).filter(r => r[0] !== '').map(r => ({ d: d8(r[0]), w: r[1], b: r[2], l: r[3], bmr: r[4], t: r[5], cap: r[6], pr: r[7] }))
  };
}

const add_ = a => { a.rows.forEach(v => put_('每日紀錄', 3, v)); return { ok: 1 }; };
const food_ = a => { put_('食物資料庫', 1, a.vals); return { ok: 1 }; };

function set_(a) {
  if (a.row < 2) throw new Error('bad row');
  ss().getSheetByName('每日紀錄').getRange(a.row, 1, 1, 8).setValues([a.vals]);
  return { ok: 1 };
}

function del_(a) {
  if (a.row < 2) throw new Error('bad row');
  ss().getSheetByName('每日紀錄').getRange(a.row, 1, 1, 8).clearContent();
  return { ok: 1 };
}

// 依日期寫入或更新；null 代表保留原值
function body_(a) {
  const s = ss().getSheetByName('身體紀錄'), rows = rows_('身體紀錄', 8);
  const i = rows.findIndex(r => d8(r[0]) === a.v[0]);
  const old = i >= 0 ? rows[i] : [];
  const vals = a.v.map((x, k) => x === null ? (old[k] === undefined ? '' : old[k]) : x);
  if (i >= 0) s.getRange(i + 2, 1, 1, 8).setValues([vals]); else put_('身體紀錄', 1, vals);
  return { ok: 1 };
}

function est_(a) {
  const parts = [{ text: '你是營養師。估算下列餐點「一份」的營養，以台灣常見食物與連鎖店為主。若是營養標示或菜單照片，直接讀取數字；若是餐點照片，依份量估算。只回傳 JSON：{"name":"品名","serving":"份量說明","kcal":數字,"p":蛋白質g,"c":碳水g,"f":脂肪g}。描述：' + (a.text || '（見照片）') }];
  if (a.img) parts.push({ inline_data: { mime_type: a.mime || 'image/jpeg', data: a.img } });
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': P('GEMINI_KEY') },
    payload: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })
  });
  const j = JSON.parse(r.getContentText());
  if (!j.candidates) throw new Error('AI：' + ((j.error && j.error.message) || '無回應'));
  return JSON.parse(j.candidates[0].content.parts[0].text);
}
