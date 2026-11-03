// Apps Script 用に、アプリを 1 つの HTML（gas/build/index.html）にまとめる。
// 各 JS ファイルを関数で包み、import を「前にまとめたファイルの戻り値から取り出す」形に置き換える。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ORDER = ['dom', 'model', 'web', 'storage', 'remote', 'guide', 'setup', 'record', 'result', 'teacher', 'app'];
const OUT = 'gas/build';
const read = (p) => readFileSync(p, 'utf8');

function wrap(name) {
  let code = read(`js/${name}.js`);
  code = code.replace(/^import \{([^}]+)\} from '\.\/([\w-]+)\.js';\r?\n/gm, (_, names, from) => {
    if (!ORDER.includes(from) || ORDER.indexOf(from) >= ORDER.indexOf(name)) throw new Error(`${name}.js の読み込み順が合いません: ${from}`);
    return `const {${names}} = __m_${from};\n`;
  });
  if (/^import /m.test(code)) throw new Error(`${name}.js にまとめられない import があります`);
  const exports = [...code.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  if (/^export (?!(?:async )?(?:function|const) )/m.test(code)) throw new Error(`${name}.js にまとめられない export があります`);
  code = code.replace(/^export /gm, '');
  return `const __m_${name} = (() => {\n${code}\nreturn { ${exports.join(', ')} };\n})();\n`;
}

const bundle = ORDER.map(wrap).join('\n');
if (/<\/script/i.test(bundle)) throw new Error('JS の中に </script が含まれています');

const html = read('index.html')
  .replace(/<link rel="manifest"[^>]*>\r?\n/, '')
  .replace(/<link rel="icon"[^>]*>\r?\n/, '')
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${read('css/style.css')}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>\n${bundle}</script>`);
if (!html.includes('const __m_app')) throw new Error('index.html に JS を埋め込めませんでした');

// Apps Script のエディタに 1 回貼るだけで動くよう、画面の HTML を Code.gs の中に文字列として埋め込む。
// エディタが重くならないよう、長い 1 行にせず短い行に分ける
function singleFile() {
  const chunks = html.match(/[\s\S]{1,200}/g).map((c) => `  ${JSON.stringify(c)},`);
  const code = read('gas/Code.gs');
  const body = code.replace("HtmlService.createHtmlOutputFromFile('index')", 'HtmlService.createHtmlOutput(INDEX_HTML.join(\'\'))');
  if (body === code) throw new Error('Code.gs の doGet を置き換えられませんでした');
  return `/** @OnlyCurrentDoc */\n${body}\n// 画面の HTML（npm run build:gas で作られる。直接は編集しない）\nvar INDEX_HTML = [\n${chunks.join('\n')}\n];\n`;
}

mkdirSync(OUT, { recursive: true });
mkdirSync('deploy', { recursive: true });
writeFileSync(`${OUT}/bundle.check.js`, bundle); // 構文チェック用
writeFileSync(`${OUT}/preview.html`, html.replace('<script>\n', () => `<script>\n${read('tests/fake-gas.js')}\n</script>\n<script>\n`));
writeFileSync('deploy/apps-script.txt', singleFile());
console.log(`deploy/apps-script.txt (${Math.round(singleFile().length / 1024)} KB)`);
