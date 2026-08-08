import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/src/app.js');
const advanced=read('public/src/advanced-v44.js');
const language=read('public/src/language-v683.js');
const mobile=read('public/src/mobile-v68.css');
const index=read('public/index.html');
const sw=read('public/sw-v69.js');
const androidApp=read('android/app/build.gradle');

const checks=[
  ['Gujarati route map',language.includes("DAHEJ:'દહેજ'")&&language.includes("JAMNAGAR:'જામનગર'")&&language.includes("JHAGADIA:'ઝઘડિયા'")],
  ['Hindi route map',language.includes("DAHEJ:'दहेज'")&&language.includes("JAMNAGAR:'जामनगर'")],
  ['display-only route API',language.includes('place:value=>translateRoutePart')&&language.includes('route:value=>translateRouteValue')],
  ['route text selectors',language.includes('[data-route-text],select[name="loadingPoint"],select[name="unloadingPoint"]')],
  ['mobile and table route wrappers',(app.match(/data-route-text/g)||[]).length>=7],
  ['workflow route wrapper',advanced.includes('<p data-route-text>')],
  ['sidebar owns vertical scroll',mobile.includes('overflow-y:auto!important')&&mobile.includes('height:100dvh!important')&&mobile.includes('touch-action:pan-y')],
  ['sidebar safe bottom',mobile.includes('padding-bottom:calc(36px + var(--v68-safe-bottom))!important')],
  ['current cache bust',index.includes('mobile-v68.css?v=685')&&index.includes('language-v683.js?v=690')&&sw.includes("transport-v690-shell")],
  ['Android update version',/versionCode\s+8\b/.test(androidApp)&&/versionName\s+"1\.5\.0"/.test(androidApp)]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){
  console.error(`V68.4 regression failed: ${failed.map(([name])=>name).join(', ')}`);
  process.exit(1);
}
console.log('V68.4 route localization and sidebar scrolling regression passed.');
