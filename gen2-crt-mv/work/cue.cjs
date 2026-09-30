const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = require('../tools/lib/env.cjs').chrome();
const URL = 'file:///' + path.resolve(__dirname, '..', 'src', 'index.html').split(path.sep).join('/');
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(URL);
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const r = await p.evaluate(() => {
    const keys = ['Though we are trapped', 'If I can have you back', 'We are trapped ah',
      'I will run the', 'Though you have left', 'Then I can be your only'];
    const out = {};
    for (const k of keys) out[k] = MV.cue(k);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
