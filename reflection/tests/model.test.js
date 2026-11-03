import { test, eq } from './harness.js';
import { RUBRIC, LEVEL_LABELS } from '../js/rubric.js';
import {
  findItem, findCategory, emptyDraft, missingFields, buildRecord, parseRecord, sortRecords, classesIn, csvForRecords, todayString,
} from '../js/model.js';

function filled(over = {}) {
  return {
    ...emptyDraft({}, '2026-11-04'),
    klass: '3組', number: 12, name: '岡山 太郎', theme: '情報の信頼性',
    category: 'II', item: 'II-3', level: 3,
    icReflection: '根拠を2つ示して説明できた。', lessonReflection: '班で意見をまとめられた。',
    ...over,
  };
}

test('ルーブリックは 3 つの大分類に 5 つずつ、計 15 の力がある', () => {
  eq(RUBRIC.map((c) => c.code), ['Ⅰ', 'Ⅱ', 'Ⅲ']);
  eq(RUBRIC.map((c) => c.items.length), [5, 5, 5]);
  const ids = RUBRIC.flatMap((c) => c.items.map((i) => i.id));
  eq(new Set(ids).size, 15);
  eq(LEVEL_LABELS.length, 5);
});

test('どの力にも観点の説明と 1〜5 段階の文がそろっている', () => {
  for (const c of RUBRIC) {
    for (const item of c.items) {
      eq(item.id.startsWith(`${c.id}-`), true, item.id);
      eq(item.code.startsWith(`${c.code}-`), true, item.code);
      eq(item.aim.length > 5 && item.name.endsWith('力'), true, item.id);
      eq(item.levels.length, 5, item.id);
      eq(item.levels.every((t) => typeof t === 'string' && t.length > 5), true, item.id);
    }
  }
});

test('力の番号から大分類と力を引ける', () => {
  eq(findItem('II-3').name, '根拠提示力');
  eq(findCategory('III').name, '決断実行力');
  eq(findItem('IV-1'), null);
});

test('新しい下書きは、覚えておいた組・番号・氏名と今日の日付から始まる', () => {
  eq(emptyDraft({ klass: '2組', number: 5, name: '花子' }, '2026-11-04'), {
    klass: '2組', number: 5, name: '花子', date: '2026-11-04', theme: '',
    category: null, item: null, level: null, icReflection: '', lessonReflection: '',
  });
  eq(emptyDraft({}, '2026-11-04').klass, '');
});

test('入力が足りない項目を順番どおりに返す', () => {
  eq(missingFields(filled()), []);
  eq(missingFields(emptyDraft({}, '')), [
    '組', '出席番号', '氏名', '日付', '授業テーマ', 'iCの力', 'iCの自己評価', 'iCの振り返り', '授業の振り返り',
  ]);
  eq(missingFields(filled({ name: '   ', icReflection: ' \n ' })), ['氏名', 'iCの振り返り']);
});

test('大分類と違う力が選ばれていたら、力が選ばれていないものとみなす', () => {
  eq(missingFields(filled({ category: 'I', item: 'II-3' })), ['iCの力']);
});

test('送信する記録には、力の名前と段階の言葉も入る', () => {
  const r = buildRecord(filled(), { id: 'abc', now: Date.UTC(2026, 10, 4, 6, 0) });
  eq(r, {
    app: 'ic-reflection', version: 1, id: 'abc',
    klass: '3組', number: 12, name: '岡山 太郎', date: '2026-11-04', theme: '情報の信頼性',
    ic: {
      category: 'Ⅱ 論理的思考力', item: 'II-3', code: 'Ⅱ-3', name: '根拠提示力',
      level: 3, levelLabel: 'おおむね身についている',
      levelText: '根拠を示して自分の主張の正当性を説明することができる',
    },
    icReflection: '根拠を2つ示して説明できた。', lessonReflection: '班で意見をまとめられた。',
    createdAt: '2026-11-04T06:00:00.000Z',
  });
});

test('前後の空白は送る前に取り除く', () => {
  const r = buildRecord(filled({ name: ' 岡山 太郎　', theme: ' 情報 ' }), { id: 'x', now: 0 });
  eq([r.name, r.theme], ['岡山 太郎', '情報']);
});

test('受け取った記録の形を確かめる', () => {
  const r = buildRecord(filled(), { id: 'abc', now: 0 });
  eq(parseRecord(JSON.stringify(r)).ok, true);
  eq(parseRecord('{').ok, false);
  eq(parseRecord(JSON.stringify({ ...r, app: 'other' })).ok, false);
  eq(parseRecord(JSON.stringify({ ...r, ic: null })).ok, false);
});

test('一覧は組の順、出席番号の順に並べる', () => {
  const rs = [
    { klass: '10組', number: 1 }, { klass: '2組', number: 30 }, { klass: '2組', number: 4 }, { klass: '1組', number: 9 },
  ];
  eq(sortRecords(rs).map((r) => `${r.klass}${r.number}`), ['1組9', '2組4', '2組30', '10組1']);
  eq(classesIn(rs), ['1組', '2組', '10組']);
});

test('CSV は BOM 付きで、数式になる文字を無害にする', () => {
  const r = buildRecord(filled({ name: '=1+1', lessonReflection: 'a,"b"\n次の行' }), { id: 'abc', now: 0 });
  const csv = csvForRecords([r]);
  eq(csv.startsWith('﻿日付,組,出席番号,氏名,授業テーマ,iCの力,自己評価,iCの振り返り,授業の振り返り'), true);
  eq(csv.split('\r\n')[1], `2026-11-04,3組,12,'=1+1,情報の信頼性,Ⅱ-3 根拠提示力,3 おおむね身についている,根拠を2つ示して説明できた。,"a,""b""\n次の行"`);
});

test('todayString は端末の日付を YYYY-MM-DD にする', () => {
  eq(todayString(new Date(2026, 10, 4, 23, 59)), '2026-11-04');
});
