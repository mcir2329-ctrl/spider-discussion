// 記録係向けの使い方ガイド。各画面の「？ 使い方」ボタンと、はじめて開いたときの自動表示に使う。
import { h } from './dom.js';
import { createSession, DEFAULT_TYPES, layoutPositions, start, addTurn, setTurnType } from './model.js';
import { createSvg, renderWeb } from './web.js';

// ガイドの図に使う見本の記録（4人、1人は発言なし）
function sampleSession() {
  const names = ['12', '5', 'たなか', '23'];
  const members = layoutPositions('circle', 4).map((p, i) => ({ id: `m${i + 1}`, name: names[i], ...p }));
  const s = start(createSession({ group: '見本', topic: '', date: '', layout: 'circle', members, types: DEFAULT_TYPES }), 0);
  [['m1', 't1'], ['m2', 't2'], ['m1', null], ['m2', 't3'], ['m3', 't4']].forEach(([m, t], i) => {
    addTurn(s, m, i * 10000);
    if (t) setTurnType(s, t);
  });
  return s;
}

function sampleWeb(options) {
  const svg = createSvg('web', 'guide-web');
  renderWeb(svg, sampleSession(), options);
  return svg;
}

function guides({ remote }) {
  return {
    setup: {
      title: '準備のしかた',
      steps: [
        '「班の名前」と「討論のテーマ」を入れます。',
        '「人数」と「座席の並び」を選びます。実際に座っている形に合わせて、図の席を指でドラッグして動かせます。',
        '「メンバー」の欄に、席ごとの名前か出席番号を入れます。図の席と同じ順番です。',
        '「発言の種類」は、先生から指示がなければそのままで大丈夫です。',
        '最後に「記録をはじめる」を押します。',
      ],
      tips: ['前に使った設定は、いちばん上の「前回の設定を使う」から呼び出せます。'],
    },
    record: {
      title: '記録のしかた',
      steps: [
        '討論が始まったら「開始」を押します。',
        '話し始めた人の席をタップします。前に話した人から線がのびます。',
        '余裕があれば、下に出るボタンで発言の種類（質問・根拠など）を選びます。押さなくてもかまいません。もう一度押すと外れます。',
        '押しまちがえたら「取り消し」。休けいのときは「一時停止」、続けるときは「再開」。',
        '討論が終わったら「終了」を押します。',
      ],
      figure: () => sampleWeb({ highlightLast: true }),
      caption: 'いま話している人の席は黄色、最後にのびた線は発言の種類の色になります。やりとりが多い2人ほど線が太くなります。',
      tips: [
        '同じ人が続けて話したときは、少し間をあけてもう一度タップします（すばやい2回押しは1回と数えます）。',
        '記録は自動で保存されます。ページを閉じても、ホームの「続きから記録する」で戻れます。',
        'Chromebook のふたを閉じると自動で一時停止します。開いたら「再開」を押します。',
      ],
    },
    result: {
      title: '結果の見かたと提出',
      steps: remote
        ? [
          '「✓ 先生に送りました」と出ていれば、提出は完了です。',
          '「送信待ち」のときは、通信がつながると自動で送られます。心配なときは「もう一度送る」を押します。',
          'まだ討論が続く場合は「記録に戻る」で続きを記録できます。',
        ]
        : [
          '「提出用に保存」を押すと、記録ファイル（.json）と図（.png）がダウンロードフォルダに保存されます。「複数のファイルのダウンロード」の確認が出たら「許可」を押します。',
          '保存した2つのファイルを、Classroom の課題に添付して提出します。',
          'まだ討論が続く場合は「記録に戻る」で続きを記録できます。',
        ],
      figure: () => sampleWeb({ markSilent: true }),
      caption: '線が太いほど、その2人のやりとりが多かったことを表します。赤い点線の席は、一度も発言しなかった人です。席のまわりの色の点は発言の種類で、色は表の見出しと同じです。',
      tips: [],
    },
  };
}

export function openGuide(name, { remote = false } = {}) {
  const g = guides({ remote })[name];
  // close イベントは遅れて届くことがあるので、ボタンで閉じたときはその場で取り除く
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  const dlg = h('dialog', { class: 'guide' },
    h('div', { class: 'guide-head' },
      h('h3', {}, `使い方：${g.title}`),
      h('button', { onClick: close }, '閉じる')),
    h('ol', { class: 'guide-steps' }, ...g.steps.map((s) => h('li', {}, s))),
    g.figure ? h('figure', { class: 'guide-figure' }, g.figure(), h('figcaption', {}, g.caption)) : null,
    g.tips.length ? h('div', { class: 'guide-tips' }, h('strong', {}, 'こんなときは'), h('ul', {}, ...g.tips.map((t) => h('li', {}, t)))) : null,
    h('div', { class: 'row end' }, h('button', { class: 'big primary', onClick: close }, 'わかった')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

// 記録画面に常に出す手順バーの中身。state は done（済み）／now（今の手順）／next（これから）
export function recordSteps(s) {
  const last = s.turns[s.turns.length - 1];
  const started = s.status !== 'ready';
  return [
    s.status === 'paused'
      ? { text: '「再開」を押す', state: 'now' }
      : { text: '「開始」を押す', state: started ? 'done' : 'now' },
    { text: '話した人の席をタップ', state: s.status === 'running' ? 'now' : 'next' },
    { text: '発言の種類を選ぶ（なくてもよい）', state: !last || s.status === 'ready' ? 'next' : last.type ? 'done' : 'now' },
    { text: '終わったら「終了」', state: 'next' },
  ];
}

export function guideButton(name, options) {
  return h('button', { class: 'guide-btn', onClick: () => openGuide(name, options) }, '？ 使い方');
}

// その端末ではじめてその画面を開いたときだけ、ガイドを自動で開く
export function showGuideOnce(name, store, options) {
  if (store.hasSeenGuide(name)) return;
  store.markGuideSeen(name);
  openGuide(name, options);
}
