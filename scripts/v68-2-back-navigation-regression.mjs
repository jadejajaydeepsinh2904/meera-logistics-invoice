import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const app=read('public/src/app.js');
const native=read('public/src/android-v63.js');
const css=read('public/src/mobile-v68.css');
const index=read('public/index.html');
const androidPath=path.join(root,'android/app/build.gradle');
const androidApp=fs.existsSync(androidPath)?fs.readFileSync(androidPath,'utf8'):'';

assert.match(index,/mobile-v68\.css\?v=685/,'Current back-button CSS cache key is active');
assert.match(index,/app\.js\?v=691/,'Current app navigation cache key is active');
assert.match(index,/android-v63\.js\?v=683/,'V68.3 Android back handler cache key is active');

assert.match(app,/const panelTrail=\[\]/,'Panel navigation keeps a previous-screen trail');
assert.match(app,/function navigatePanel\(panel,\{search=''\}=\{\}\)/,'All panel links use the shared navigator');
assert.match(app,/function appGoBack\(\)[\s\S]*?panelTrail\.pop\(\)[\s\S]*?render\(\)/,'Back returns to the previous rendered panel');
assert.match(app,/window\.TransportERPBack=appGoBack/,'Android can call the same navigation behavior');
assert.match(app,/data-nav-back aria-label="Go back"/,'Every non-home mobile header exposes a Back button');
assert.match(app,/state\.panel==='dashboard'\?'':`<button[^`]+data-nav-back/,'Desktop inner screens expose Back without adding one to Dashboard');
assert.match(app,/const backButton=event\.target\.closest\('\[data-nav-back\]'\)/,'Visible Back clicks are delegated reliably');
assert.match(app,/navigatePanel\(panelButton\.dataset\.panel\)/,'Sidebar, cards and bottom tabs share navigation history');

const nativeBackStart=native.indexOf('async function nativeBack()');
const nativeBackEnd=native.indexOf('async function initializeAndroid()',nativeBackStart);
const nativeBack=native.slice(nativeBackStart,nativeBackEnd);
assert.ok(nativeBack.indexOf('closeTopOverlay()')<nativeBack.indexOf("sidebar?.classList.contains('open')"),'Android Back closes a popup before the sidebar');
assert.ok(nativeBack.indexOf("sidebar?.classList.contains('open')")<nativeBack.indexOf('window.TransportERPBack'),'Android Back closes the sidebar before leaving a page');
assert.match(nativeBack,/window\.TransportERPBack\(\)/,'Android system Back follows the same previous-screen trail');
assert.match(nativeBack,/App\?\.exitApp/,'Dashboard system Back can still exit the app');

assert.match(css,/\.v64-date-line\.has-back\{[\s\S]*?grid-template-columns:auto minmax\(0,1fr\) auto/,'Back, page title and Online badge fit one mobile header row');
assert.match(css,/\.v682-back\{[\s\S]*?min-height:34px[\s\S]*?color:#fff/,'Mobile Back is visible and touch-friendly');
if(androidApp){assert.match(androidApp,/versionCode\s+8\b/,'Current Android update preserves V68 back navigation');assert.match(androidApp,/versionName\s+"1\.5\.0"/,'Current Android version preserves V68 back navigation')}

if(androidApp)for(const rel of ['index.html','src/app.js','src/android-v63.js','src/mobile-v68.css']){
  assert.equal(read(`android/app/src/main/assets/public/${rel}`),read(`public/${rel}`),`Android copied asset matches public/${rel}`);
}

console.log('V68.2 mobile Back navigation regression passed');
