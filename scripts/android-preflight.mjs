
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const required=[
  'capacitor.config.json',
  'public/index.html',
  'public/manifest.webmanifest',
  'public/src/android-v63.js',
  'public/src/core/api.js'
];
let ok=true;
for(const rel of required){
  if(!fs.existsSync(path.join(root,rel))){console.error('MISSING',rel);ok=false}
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
if(ok){
  console.log('V67 Android API 36 preflight passed');
  console.log('App ID:',config.appId);
  console.log('App Name:',config.appName);
  console.log('Web Dir:',config.webDir);
  console.log(fs.existsSync(path.join(root,'android'))?'Android native folder exists. Run npm run android:sync.':'Android folder not generated yet. After npm install run: npm run android:add');
}else process.exit(1);
