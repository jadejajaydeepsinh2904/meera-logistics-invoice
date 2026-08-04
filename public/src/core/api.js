const API_BASE = 'https://meera-logistics-invoice.jadejajaydeepsinhk007.workers.dev/api';
export const token = () => localStorage.getItem('ml_token') || '';
export const setToken = value => localStorage.setItem('ml_token', value);
export const clearToken = () => localStorage.removeItem('ml_token');

export async function api(path, options={}){
  const headers = {...(options.headers||{})};
  if(!(options.body instanceof FormData)) headers['Content-Type']='application/json';
  if(token()) headers.Authorization=`Bearer ${token()}`;
  const res=await fetch(API_BASE+path,{...options,headers});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}
