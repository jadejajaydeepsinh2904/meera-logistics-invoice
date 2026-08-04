
const API = '/api';
export const token = () => localStorage.getItem('ml_token') || '';
export const setToken = t => localStorage.setItem('ml_token', t);
export const clearToken = () => localStorage.removeItem('ml_token');

export async function request(path, options={}){
  const headers = {'Content-Type':'application/json', ...(options.headers||{})};
  if(token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(API+path, {...options, headers});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
