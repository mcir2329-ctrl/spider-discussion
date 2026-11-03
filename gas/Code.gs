// スパイダー討論：記録を先生のスプレッドシートに集める Apps Script。
// ウェブアプリとして「実行するユーザー：自分」「アクセス：学校のドメインの全員」で公開する。

var SHEET_NAME = '記録';
var HEADERS = ['受信日時', '日付', '班', 'テーマ', '送信者', '記録ID', '記録'];
var MAX_JSON = 45000; // セルの上限は 50,000 文字
var COL_DATE = 2;
var COL_ID = 6;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('スパイダー討論')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 先頭に ' を付けると、日付への自動変換や数式としての実行が起きない
function text_(v) {
  return "'" + String(v);
}

function untext_(v) {
  return String(v).replace(/^'/, '');
}

function valid_(d) {
  return !!d && d.app === 'spider-discussion' && d.version === 1
    && typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 64
    && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
    && typeof d.group === 'string' && typeof d.topic === 'string'
    && Array.isArray(d.members) && Array.isArray(d.types) && Array.isArray(d.turns);
}

function isTeacher() {
  var me = Session.getActiveUser().getEmail();
  return me !== '' && me === Session.getEffectiveUser().getEmail();
}

function requireTeacher_() {
  if (!isTeacher()) throw new Error('先生のアカウントでのみ使えます');
}

function submitRecord(text) {
  if (typeof text !== 'string') return { ok: false, error: '記録を読めません' };
  if (text.length > MAX_JSON) return { ok: false, error: '記録が大きすぎます' };
  var d;
  try {
    d = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '記録を読めません' };
  }
  if (!valid_(d)) return { ok: false, error: '記録の形式が正しくありません' };

  var row = [new Date(), text_(d.date), text_(d.group), text_(d.topic),
    text_(Session.getActiveUser().getEmail()), text_(d.id), text];
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, COL_ID, last - 1, 1).getValues() : [];
    for (var i = 0; i < ids.length; i++) {
      if (untext_(ids[i][0]) === d.id) {
        sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return { ok: true };
      }
    }
    sh.appendRow(row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function rows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
}

function listDates() {
  requireTeacher_();
  var counts = {};
  rows_().forEach(function (r) {
    var date = untext_(r[COL_DATE - 1]);
    counts[date] = (counts[date] || 0) + 1;
  });
  return Object.keys(counts).sort().reverse().map(function (date) {
    return { date: date, count: counts[date] };
  });
}

function getRecords(date) {
  requireTeacher_();
  return rows_().filter(function (r) {
    return untext_(r[COL_DATE - 1]) === date;
  }).map(function (r) {
    return {
      receivedAt: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      submitter: untext_(r[4]),
      json: String(r[6]),
    };
  });
}
