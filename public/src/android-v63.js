
const isNative=()=>!!window.Capacitor?.isNativePlatform?.() || !!window.Capacitor?.getPlatform?.() && window.Capacitor.getPlatform()==='android';
const plugin=name=>window.Capacitor?.Plugins?.[name]||null;
const safeFileName=value=>String(value||'Transport-ERP-file').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();

function blobToBase64(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error||new Error('Unable to prepare file'));
    reader.onloadend=()=>resolve(String(reader.result||'').split(',')[1]||'');
    reader.readAsDataURL(blob);
  });
}

async function writeNativeBlob(blob,fileName,directory,folder){
  const Filesystem=plugin('Filesystem');
  if(!Filesystem?.writeFile)throw new Error('Android file storage is unavailable');
  const name=safeFileName(fileName);
  const path=folder?`${folder}/${name}`:name;
  const result=await Filesystem.writeFile({path,data:await blobToBase64(blob),directory,recursive:true});
  return {...result,fileName:name,path,directory};
}

async function saveBlob(blob,fileName){
  let saved;
  try{
    saved={...await writeNativeBlob(blob,fileName,'DOCUMENTS','TransportBahi'),location:'Documents/TransportBahi'};
  }catch(storageError){
    const cached=await writeNativeBlob(blob,fileName,'CACHE','TransportBahi');
    const Share=plugin('Share');
    if(!Share?.share)throw storageError;
    await Share.share({title:cached.fileName,files:[cached.uri],dialogTitle:'Save or share file'});
    saved={...cached,location:'Android share menu'};
  }
  await notifyDownload(saved,blob);
  return saved;
}

async function notifyDownload(saved,blob){
  const notifier=plugin('DownloadNotification');
  if(!notifier?.notifyDownload)return false;
  try{
    const t=value=>window.TransportLanguage?.text?.(value)||value;
    await notifier.notifyDownload({
      uri:saved.uri,
      path:saved.path,
      fileName:saved.fileName,
      mimeType:blob?.type||'',
      title:t('Download complete'),
      body:t('Tap to open the downloaded file')
    });
    return true;
  }catch(error){
    console.warn('Download notification unavailable',error);
    return false;
  }
}

async function shareBlob(blob,fileName,title='',text=''){
  const cached=await writeNativeBlob(blob,fileName,'CACHE','TransportBahi');
  const Share=plugin('Share');
  if(!Share?.share)throw new Error('Android sharing is unavailable');
  await Share.share({title:title||cached.fileName,text,files:[cached.uri],dialogTitle:title||'Share file'});
  return true;
}

function visibleOverlay(){
  return document.querySelector('.v683-language-overlay,.a43-overlay,.modal-bg');
}
function clickDashboard(){
  const b=document.querySelector('[data-panel="dashboard"]');
  if(b){b.click();return true}
  return false;
}
function closeTopOverlay(){
  const overlay=visibleOverlay();
  if(!overlay)return false;
  const close=overlay.querySelector('[data-language-close],[data-a43-close],[data-close],[data-close-form],[data-v59-close],.modal-close');
  if(close){close.click();return true}
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  return true;
}
async function externalUrl(url){
  const value=String(url||'');
  if(!value)return;
  try{
    const Browser=plugin('Browser');
    if(Browser&&/^https?:/i.test(value)){await Browser.open({url:value});return}
  }catch{}
  location.href=value;
}
async function shareText(title,text,url=''){
  try{
    const Share=plugin('Share');
    if(Share){await Share.share({title,text,url,dialogTitle:title});return true}
  }catch{}
  if(navigator.share){
    try{await navigator.share({title,text,url});return true}catch{}
  }
  return false;
}
async function playBillingProducts(){
  const billing=plugin('PlayBilling');
  if(!billing?.getProducts)throw new Error('Google Play Billing is unavailable in this app build.');
  return billing.getProducts();
}
async function purchasePlaySubscription(productId,basePlanId,obfuscatedAccountId){
  const billing=plugin('PlayBilling');
  if(!billing?.purchase)throw new Error('Google Play Billing is unavailable in this app build.');
  return billing.purchase({productId,basePlanId,obfuscatedAccountId});
}
async function restorePlaySubscriptions(){
  const billing=plugin('PlayBilling');
  if(!billing?.restorePurchases)throw new Error('Google Play Billing is unavailable in this app build.');
  return billing.restorePurchases();
}
async function nativeBack(){
  if(closeTopOverlay())return;
  const sidebar=document.getElementById('sidebar');
  if(sidebar?.classList.contains('open')){
    sidebar.classList.remove('open');
    return;
  }
  try{
    if(typeof window.TransportERPBack==='function'&&window.TransportERPBack())return;
  }catch{}
  const active=document.querySelector('.sidebar [data-panel].active');
  if(active&&active.dataset.panel!=='dashboard'){clickDashboard();return}
  try{
    const App=plugin('App');
    if(App?.exitApp)await App.exitApp();
  }catch{}
}
async function initializeAndroid(){
  if(!isNative())return;
  document.documentElement.classList.add('android-native-v63');
  window.TransportNative={
    isAndroid:true,
    openExternal:externalUrl,
    shareText,
    saveBlob,
    shareBlob,
    back:nativeBack,
    billing:{
      getProducts:playBillingProducts,
      purchase:purchasePlaySubscription,
      restore:restorePlaySubscriptions
    }
  };
  try{
    const SystemBars=plugin('SystemBars');
    if(SystemBars?.setStyle)await SystemBars.setStyle({style:'DARK'});
    else await plugin('StatusBar')?.setStyle?.({style:'DARK'});
  }catch{}
  try{
    const App=plugin('App');
    App?.addListener?.('backButton',nativeBack);
    App?.addListener?.('appStateChange',({isActive})=>{if(isActive)window.dispatchEvent(new Event('online'))});
  }catch{}
  try{
    const Network=plugin('Network');
    Network?.addListener?.('networkStatusChange',status=>{
      document.documentElement.classList.toggle('android-offline-v63',!status.connected);
      window.dispatchEvent(new Event(status.connected?'online':'offline'));
    });
  }catch{}
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[href]');
    if(!a)return;
    const href=a.getAttribute('href')||'';
    if(/^https?:\/\//i.test(href)&&!href.includes(location.host)){
      event.preventDefault();externalUrl(href);
    }
  },true);
}
initializeAndroid();

export {isNative,externalUrl,shareText,nativeBack,playBillingProducts,purchasePlaySubscription,restorePlaySubscriptions};
