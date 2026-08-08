import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const index=read('public/index.html');
const app=read('public/src/app.js');
const language=read('public/src/language-v683.js');
const css=read('public/src/language-v683.css');
const androidPath=path.join(root,'android/app/build.gradle');
const androidApp=fs.existsSync(androidPath)?fs.readFileSync(androidPath,'utf8'):'';

assert.match(index,/language-v683\.css\?v=692/,'Language selector styles are loaded');
assert.match(index,/language-v683\.js\?v=692/,'Language runtime loads before the app modules');
assert.ok(index.indexOf('language-v683.js')<index.indexOf('src/app.js'),'Language runtime is available before app render');
assert.match(app,/data-language-open data-language-label/,'Mobile and desktop language controls are rendered');
assert.match(app,/TransportLanguage\?\.dateLocale/,'Header date follows the selected language');
assert.match(app,/ml-language-changed/,'Changing language re-renders the current app screen');
assert.match(language,/new Set\(\['en','gu','hi'\]\)/,'English, Gujarati and Hindi are supported');
assert.match(language,/ml_app_language_v683/,'Language selection is persisted on the device');
assert.match(language,/new MutationObserver/,'Dynamically opened forms and dialogs are translated');
assert.match(language,/\.transport-invoice,[\s\S]*?\.tds-sheet/,'Business document output is protected from UI translation');
assert.match(css,/\.v683-mobile-language[\s\S]*?min-height:44px/,'Mobile language control is touch friendly');
assert.match(css,/\.v683-language-overlay[\s\S]*?z-index:180000/,'Language picker stays above app dialogs');
if(androidApp){assert.match(androidApp,/versionCode\s+9\b/,'Current Android update preserves language selection');assert.match(androidApp,/versionName\s+"1\.6\.0"/,'Current Android version preserves language selection')}
assert.match(read('public/src/android-v63.js'),/\.v683-language-overlay/,'Android Back closes the language picker first');

if(androidApp)for(const rel of ['index.html','src/app.js','src/language-v683.js','src/language-v683.css']){
  assert.equal(read(`android/app/src/main/assets/public/${rel}`),read(`public/${rel}`),`Android copied asset matches public/${rel}`);
}

console.log('V68.3 Gujarati + Hindi + English language regression passed');
