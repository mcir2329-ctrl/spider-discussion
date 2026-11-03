// Apps Script 版で、先生のスプレッドシートとやりとりする（google.script.run）。
// GitHub 版など google.script.run がない場所では createRemote() が null を返し、送信機能なしで動く。

export function createRemote(runner = globalThis.google?.script?.run) {
  if (!runner) return null;
  const call = (name, ...args) => new Promise((resolve, reject) => {
    runner.withSuccessHandler(resolve).withFailureHandler(reject)[name](...args);
  });
  return {
    submit: (record) => call('submitRecord', JSON.stringify(record)),
    isTeacher: () => call('isTeacher'),
    listDates: () => call('listDates'),
    getRecords: (date) => call('getRecords', date),
  };
}

let flushing = null;

// 送信待ちを順に送り、Google 側が ok を返したものだけ送信待ちから消す
export function flushOutbox(store, remote) {
  if (!remote) return Promise.resolve({ sent: 0, left: store.listOutbox().length, error: null });
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    let error = null;
    for (const record of store.listOutbox()) {
      try {
        const r = await remote.submit(record);
        if (r && r.ok) {
          store.removeOutbox(record.id);
          sent++;
        } else {
          error = r?.error ?? '送信できませんでした';
        }
      } catch {
        error = '通信できませんでした';
      }
    }
    return { sent, left: store.listOutbox().length, error };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
