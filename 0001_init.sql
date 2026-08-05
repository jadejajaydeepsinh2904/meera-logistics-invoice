const API_BASE = 'https://meera-logistics-invoice.jadejajaydeepsinhk007.workers.dev/api';
export const token = () => localStorage.getItem('ml_token') || '';
export const setToken = value => localStorage.setItem('ml_token', value);
export const clearToken = () => localStorage.removeItem('ml_token');

export async function api(path, options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  const headers = {...(options.headers||{})};
  if(!(options.body instanceof FormData)) headers['Content-Type']='application/json';
  if(token()) headers.Authorization=`Bearer ${token()}`;
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
