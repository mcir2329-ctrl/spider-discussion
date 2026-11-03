// 手元で Apps Script 版を確かめるための、にせものの google.script.run（gas/build/preview.html に埋め込まれる）。
// 届いた記録は localStorage の fake.sheet に入る。window.fakeGas.offline = true で通信できない状態をまねる。
// 生徒のアカウントでは、本物と同じく listDates / getRecords が失敗する。
(() => {
  const KEY = 'fake.sheet';
  const rows = () => JSON.parse(localStorage.getItem(KEY) || '[]');
  const handlers = {
    isTeacher: () => !window.fakeGas.student,
    submitRecord(text) {
      const d = JSON.parse(text);
      const list = rows().filter((r) => r.id !== d.id);
      list.push({ id: d.id, date: d.date, json: text, submitter: 'student@example.ed.jp', receivedAt: new Date().toISOString() });
      localStorage.setItem(KEY, JSON.stringify(list));
      return { ok: true };
    },
    listDates() {
      const counts = {};
      for (const r of rows()) counts[r.date] = (counts[r.date] || 0) + 1;
      return Object.keys(counts).sort().reverse().map((date) => ({ date, count: counts[date] }));
    },
    getRecords: (date) => rows().filter((r) => r.date === date).map(({ json, submitter, receivedAt }) => ({ json, submitter, receivedAt })),
  };
  const make = (ok = () => {}, ng = () => {}) => new Proxy({}, {
    get(_, prop) {
      if (prop === 'withSuccessHandler') return (f) => make(f, ng);
      if (prop === 'withFailureHandler') return (f) => make(ok, f);
      return (...args) => setTimeout(() => {
        if (window.fakeGas.offline) {
          ng(new Error('NetworkError: Connection failure due to HTTP 0'));
          return;
        }
        window.fakeGas.calls.push(prop);
        try {
          if (window.fakeGas.student && (prop === 'listDates' || prop === 'getRecords')) throw new Error('先生のアカウントでのみ使えます');
          ok(handlers[prop](...args));
        } catch (err) {
          ng(err);
        }
      }, 200);
    },
  });
  // localStorage の fake.student を '1' にしてから開くと、生徒のアカウントとしてふるまう
  window.fakeGas = { offline: false, student: localStorage.getItem('fake.student') === '1', calls: [] };
  window.google = { script: { run: make() } };
})();
