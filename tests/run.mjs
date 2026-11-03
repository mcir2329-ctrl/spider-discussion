import { run } from './harness.js';
import './model.test.js';
import './storage.test.js';
import './remote.test.js';
import './gas.test.js';
import './guide.test.js';

const results = await run();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' — ' + r.error}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
