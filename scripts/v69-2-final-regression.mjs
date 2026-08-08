import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const index=read('public/index.html');
const language=read('public/src/language-v683.js');
const androidJs=read('public/src/android-v63.js');
const sw=read('public/sw-v69.js');
const hasAndroid=fs.existsSync(path.join(root,'android/app/build.gradle'));

assert.match(index,/language-v683\.js\?v=692/,'Web loads the fixed language runtime');
assert.match(index,/language-v683\.css\?v=692/,'Web loads the current language styles');
assert.match(index,/advanced-v44\.js\?v=692/,'Web loads the current service-worker registration');
assert.match(index,/android-v63\.js\?v=692/,'Android loads the notification-aware bridge');
assert.match(index,/'v692'/,'One-tap V69.2 cache reset is available');
assert.match(language,/const boundLanguageButtons=new WeakSet\(\)/,'Language buttons are bound once per render');
assert.match(language,/button\.addEventListener\('click',handleLanguageOpen\)/,'Language button has a direct click handler');
assert.match(language,/document\.addEventListener\('click',handleLanguageOpen\)/,'Dynamic language buttons have delegated fallback');
assert.match(language,/target instanceof Element\?target:target\?\.parentElement/,'Language clicks safely resolve nested/text targets');
assert.match(language,/'Download complete':'ડાઉનલોડ પૂર્ણ'/,'Gujarati download notification is translated');
assert.match(language,/'Download complete':'डाउनलोड पूरा हुआ'/,'Hindi download notification is translated');
assert.match(sw,/transport-v692-shell/,'V69.2 installs a fresh shell cache');
assert.match(sw,/\['script','style'\]\.includes\(req\.destination\)/,'Critical UI assets use a refresh-safe strategy');

assert.match(androidJs,/await notifyDownload\(saved,blob\)/,'Every successful native save requests a notification');
assert.match(androidJs,/plugin\('DownloadNotification'\)/,'Android bridge calls the native download notifier');
if(hasAndroid){
  const manifest=read('android/app/src/main/AndroidManifest.xml');
  const gradle=read('android/app/build.gradle');
  const activity=read('android/app/src/main/java/in/meeralogistics/transporterp/MainActivity.java');
  const nativePlugin=read('android/app/src/main/java/in/meeralogistics/transporterp/DownloadNotificationPlugin.java');
  assert.match(manifest,/android\.permission\.POST_NOTIFICATIONS/,'Android 13+ notification permission is declared');
  assert.match(activity,/registerPlugin\(DownloadNotificationPlugin\.class\)/,'Native plugin is registered with Capacitor');
  assert.match(nativePlugin,/requestPermissionForAlias\("notifications"/,'Notification permission is requested at download time');
  assert.match(nativePlugin,/Intent\.ACTION_VIEW/,'Notification tap opens the downloaded file');
  assert.match(nativePlugin,/FileProvider\.getUriForFile/,'Downloaded file is shared through a secure content URI');
  assert.match(nativePlugin,/setContentIntent\(openFile\)/,'Notification owns the tap-to-open intent');
  assert.match(nativePlugin,/application\/pdf/,'PDF files receive an openable MIME type');
  assert.match(nativePlugin,/spreadsheetml\.sheet/,'Excel files receive an openable MIME type');
  assert.match(gradle,/versionCode\s+9\b/);
  assert.match(gradle,/versionName\s+"1\.6\.0"/);
}

for(const rel of ['index.html','src/language-v683.js','src/android-v63.js','src/advanced-v44.js','sw-v69.js','version-v69-2.txt']){
  const copied=path.join(root,'android/app/src/main/assets/public',rel);
  if(fs.existsSync(copied))assert.equal(fs.readFileSync(copied,'utf8'),read(`public/${rel}`),`Android copied asset matches public/${rel}`);
}

console.log('V69.2 final web language + Android download notification regression passed.');
