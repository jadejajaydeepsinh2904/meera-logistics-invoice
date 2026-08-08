import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const css=read('public/src/mobile-v68.css');
const app=read('public/src/app.js');
const advanced=read('public/src/advanced-v44.js');
const index=read('public/index.html');
const preflight=read('scripts/android-preflight.mjs');

assert.match(index,/interactive-widget=resizes-content/,'Android keyboard resizes the viewport');
assert.match(index,/mobile-v68\.css\?v=685/,'Current V68 mobile layer is loaded');
assert.ok(index.indexOf('desktop-v66.css')<index.indexOf('mobile-v68.css'),'Mobile compatibility rules load last');
assert.match(index,/app\.js\?v=691/);
assert.match(index,/advanced-v44\.js\?v=692/);
assert.match(preflight,/public\/src\/mobile-v68\.css/,'Android sync requires the mobile layer');

assert.match(app,/class="v68-network-status" data-v68-network/,'Connection state lives in the mobile header');
assert.match(advanced,/querySelectorAll\('\[data-v68-network\]'\)/,'Connection state updates online and offline');
assert.match(css,/\.a43-online\{display:none!important\}/,'Floating status cannot cover mobile navigation');
assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,'All four bottom tabs have equal mobile width');
assert.match(css,/\.responsive-table td\{[\s\S]*?overflow-wrap:anywhere/,'Record cards wrap long table content');
assert.match(css,/\.invoice-line,[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/,'Invoice lines use a mobile field stack');
assert.match(css,/\.ut-route-card\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/,'Trip route and amount cannot compete for width');
assert.match(css,/\.a43-modal\{[\s\S]*?100dvh/,'Smart Operations dialogs respect the viewport');
assert.match(css,/\.modal,.modal\.small,.wide-modal,.invoice-modal\{[\s\S]*?100dvh/,'App dialogs respect the viewport');

const feedStart=advanced.indexOf('function localNotificationFeedV672()');
const feedEnd=advanced.indexOf('function renderNotificationsV672(',feedStart);
assert.ok(feedStart>=0&&feedEnd>feedStart);
assert.match(advanced.slice(feedStart,feedEnd),/window\.ML_APP_DATA\|\|A43\.bootstrap\|\|\{\}/,'Notifications always have an immediate renderable feed');

for(const file of ['public/src/mobile-v68.css','public/src/app.js','public/src/advanced-v44.js']){
  assert.ok(fs.statSync(path.join(root,file)).size>0,`${file} is not empty`);
}

if(fs.existsSync(path.join(root,'android/app/src/main/assets/public')))for(const rel of ['index.html','src/mobile-v68.css','src/app.js','src/advanced-v44.js']){
  const source=read(`public/${rel}`);
  const copied=read(`android/app/src/main/assets/public/${rel}`);
  assert.equal(copied,source,`Android copied asset matches public/${rel}`);
}

console.log('V68 mobile compatibility regression passed');
