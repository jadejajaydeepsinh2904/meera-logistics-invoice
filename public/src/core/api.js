const API_BASE = 'https://meera-logistics-invoice.jadejajaydeepsinhk007.workers.dev/api';
export const token = () => localStorage.getItem('ml_token') || '';
export const setToken = value => localStorage.setItem('ml_token', value);
export const clearToken = () => localStorage.removeItem('ml_token');

export async function api(path, options={}){
  const controller=new AbortController();
  const timeoutMs=Number(options.timeoutMs||((path==='/login'||path==='/bootstrap')?45000:20000));
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  const headers = {...(options.headers||{})};
  if(!(options.body instanceof FormData)) headers['Content-Type']='application/json';
  if(options.auth!==false&&token()) headers.Authorization=`Bearer ${token()}`;
  try{
    const res=await fetch(API_BASE+path,{...options,headers,signal:controller.signal});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
    return data;
  }catch(error){
    if(error.name==='AbortError')throw new Error('Server response is taking too long. Please retry.');
    throw error;
  }finally{clearTimeout(timeout)}
}

export async function apiBlob(path,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),Number(options.timeoutMs||30000));
  const headers={...(options.headers||{})};
  if(options.auth!==false&&token())headers.Authorization=`Bearer ${token()}`;
  try{
    const res=await fetch(API_BASE+path,{...options,headers,signal:controller.signal});
    if(!res.ok){
      const data=await res.json().catch(()=>({}));
      throw new Error(data.error||`Request failed (${res.status})`);
    }
    return await res.blob();
  }catch(error){
    if(error.name==='AbortError')throw new Error('Server response is taking too long. Please retry.');
    throw error;
  }finally{clearTimeout(timeout)}
}

