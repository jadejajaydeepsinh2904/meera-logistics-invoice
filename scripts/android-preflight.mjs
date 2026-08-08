
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const required=[
  'capacitor.config.json',
  'public/index.html',
  'public/manifest.webmanifest',
  'public/src/android-v63.js',
  'public/src/core/api.js',
  'public/src/app.js',
  'public/src/styles.css',
  'public/src/mobile-v64.css',
  'public/src/mobile-v68.css',
  'public/src/language-v683.js',
  'public/src/language-v683.css',
  'public/src/fleet-v69.js',
  'public/src/fleet-v69.css',
  'public/vendor/xlsx.full.min.js',
  'public/src/invoice-v36.js',
  'public/src/invoice-v36.css',
  'public/src/party-ledger-v40.js',
  'public/src/party-ledger-v40.css',
  'public/src/party-ledger-pdf-v40.js',
  'public/src/supplier-ledger-v41.js',
  'public/src/supplier-ledger-v41.css',
  'public/src/supplier-ledger-pdf-v41.js',
  'public/src/advanced-v44.js',
  'public/src/advanced-v44.css',
  'public/src/desktop-v66.css',
  'public/assets/meera-logo.png',
  'public/assets/meera-partner-stamp.png'
];
const androidRoot=path.join(root,'android');
if(fs.existsSync(androidRoot))required.push(
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/in/meeralogistics/transporterp/MainActivity.java',
  'android/app/src/main/java/in/meeralogistics/transporterp/DownloadNotificationPlugin.java'
);
let ok=true;
for(const rel of required){
  if(!fs.existsSync(path.join(root,rel))){console.error('MISSING',rel);ok=false}
}
if(!ok){
  console.error('\nAndroid web files are incomplete. Use the V67.1 FULL PROJECT folder; do not open the old changed-files ZIP by itself.');
  process.exit(1);
}
const config=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));
if(!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(config.appId||'')){
  console.error('Invalid Android appId:',config.appId);ok=false;
}
const api=fs.readFileSync(path.join(root,'public/src/core/api.js'),'utf8');
if(!api.includes('https://')||!api.includes('/api')){
  console.error('API endpoint not found in public/src/core/api.js');ok=false;
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!String(pkg.dependencies?.['@capacitor/android']||'').startsWith('8.')){
  console.error('Capacitor Android 8.x is required for Android 16 / API 36');ok=false;
}
const variablesPath=path.join(root,'android','variables.gradle');
if(fs.existsSync(variablesPath)){
  const variables=fs.readFileSync(variablesPath,'utf8');
  if(!/targetSdkVersion\s*=\s*36\b/.test(variables)){
    console.error('Android targetSdkVersion 36 is required');ok=false;
  }
}
if(fs.existsSync(androidRoot)){
  const manifest=fs.readFileSync(path.join(androidRoot,'app/src/main/AndroidManifest.xml'),'utf8');
  const appGradle=fs.readFileSync(path.join(androidRoot,'app/build.gradle'),'utf8');
  const mainActivity=fs.readFileSync(path.join(androidRoot,'app/src/main/java/in/meeralogistics/transporterp/MainActivity.java'),'utf8');
  if(!manifest.includes('android.permission.POST_NOTIFICATIONS')){console.error('Android notification permission is missing');ok=false}
  if(!/versionCode\s+9\b/.test(appGradle)||!/versionName\s+"1\.6\.0"/.test(appGradle)){console.error('Android V69.2 version is required');ok=false}
  if(!mainActivity.includes('registerPlugin(DownloadNotificationPlugin.class)')){console.error('Download notification plugin is not registered');ok=false}
}
if(ok){
  console.log('V69.2 Android API 36 + language + Driver/Truck/Excel + download notification preflight passed');
  console.log('App ID:',config.appId);
  console.log('App Name:',config.appName);
  console.log('Web Dir:',config.webDir);
  console.log(fs.existsSync(androidRoot)?'Android native folder exists. Run npm run android:sync.':'Android folder not generated yet. After npm install run: npm run android:add');
}else process.exit(1);
