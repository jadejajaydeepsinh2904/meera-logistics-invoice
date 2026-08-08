import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const css=read('public/src/mobile-v68.css');
const index=read('public/index.html');
const app=read('public/src/app.js');
const androidPath=path.join(root,'android/app/build.gradle');
const androidApp=fs.existsSync(androidPath)?fs.readFileSync(androidPath,'utf8'):'';

assert.match(index,/mobile-v68\.css\?v=685/,'Current scroll CSS cache key is active');
assert.match(css,/html\{[\s\S]*?height:100%;[\s\S]*?overflow:hidden!important/,'The root viewport cannot become an accidental nested scroller');
assert.match(css,/body\{[\s\S]*?height:100%;[\s\S]*?overflow:hidden!important/,'Body is pinned to the Android viewport');
assert.match(css,/#app>\.erp\{[\s\S]*?height:100%;[\s\S]*?overflow:hidden/,'The ERP shell is pinned to the viewport');
assert.match(css,/\.main\{[\s\S]*?height:100dvh;[\s\S]*?overflow-y:auto!important;[\s\S]*?-webkit-overflow-scrolling:touch;[\s\S]*?touch-action:pan-y/,'Every app panel shares one native vertical scroller');
assert.match(css,/#app>\.login-shell\{[\s\S]*?height:100dvh;[\s\S]*?overflow-y:auto;[\s\S]*?touch-action:pan-y/,'Login keeps an independent mobile scroller');
assert.match(css,/\.sidebar\{[\s\S]*?max-height:100dvh!important;[\s\S]*?overflow-y:auto!important;[\s\S]*?touch-action:pan-y/,'The mobile drawer remains independently scrollable');
assert.doesNotMatch(app,/touchmove[\s\S]{0,120}preventDefault/,'App JavaScript does not cancel vertical swipe');
if(androidApp){assert.match(androidApp,/versionCode\s+9\b/,'Current Android update preserves V68 scrolling');assert.match(androidApp,/versionName\s+"1\.6\.0"/,'Android update preserves the V68 scroll fix')}

if(androidApp)for(const rel of ['index.html','src/mobile-v68.css']){
  const publicFile=read(`public/${rel}`);
  const copiedFile=read(`android/app/src/main/assets/public/${rel}`);
  assert.equal(copiedFile,publicFile,`Android copied asset matches public/${rel}`);
}

console.log('V68.1 global Android scrolling regression passed');
