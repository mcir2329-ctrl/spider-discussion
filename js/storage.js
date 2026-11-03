const CURRENT = 'spider.current';
const SETUPS = 'spider.setups';
const OUTBOX = 'spider.outbox';
export const MAX_SETUPS = 10;

function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createStore(backend = defaultBackend()) {
  const read = (key, fallback) => {
    try {
      const v = backend.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      backend.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  return {
    saveCurrent: (session) => write(CURRENT, session),
    loadCurrent: () => read(CURRENT, null),
    clearCurrent() {
      try {
        backend.removeItem(CURRENT);
      } catch {
        // 保存が使えない端末では消すものもない
      }
    },
    listSetups: () => read(SETUPS, []),
    saveSetup(setup) {
      const others = read(SETUPS, []).filter((x) => x.group !== setup.group);
      return write(SETUPS, [setup, ...others].slice(0, MAX_SETUPS));
    },
    listOutbox: () => read(OUTBOX, []),
    addOutbox(record) {
      const others = read(OUTBOX, []).filter((r) => r.id !== record.id);
      return write(OUTBOX, [...others, record]);
    },
    removeOutbox: (id) => write(OUTBOX, read(OUTBOX, []).filter((r) => r.id !== id)),
  };
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename, text, mime) {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function readFileTexts(files) {
  return Promise.all([...files].map((f) => f.text().then(
    (text) => ({ name: f.name, text }),
    () => ({ name: f.name, text: '' }),
  )));
}
