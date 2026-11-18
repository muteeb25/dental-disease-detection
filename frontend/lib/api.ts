export const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
export type Box={label:string;confidence:number;x1:number;y1:number;x2:number;y2:number};
export type Patient={id:number;name:string;age?:number;gender?:string;phone?:string;notes?:string;created_at:string};
export type Scan={id:number;patient_id:number;created_at:string;findings:Box[];model_name:string;original_url:string;annotated_url:string};
export type Dashboard={patients:number;scans:number;recent_scans:Scan[]};
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
 const token=typeof window!=='undefined'?localStorage.getItem('token'):null;
 const headers=new Headers(init.headers); if(token) headers.set('Authorization',`Bearer ${token}`);
 if(!(init.body instanceof FormData)&&init.body)headers.set('Content-Type','application/json');
 const r=await fetch(`${API}${path}`,{...init,headers}); if(!r.ok){let msg=`Request failed (${r.status})`;try{msg=(await r.json()).detail||msg}catch{};
  if(r.status===401&&token&&typeof window!=='undefined'&&!path.startsWith('/auth/')){
   localStorage.removeItem('token');
   if(window.location.pathname!=='/login'&&window.location.pathname!=='/register')window.location.replace('/login?expired=1');
   msg='Your session expired. Please sign in again.';
  }
  throw new Error(msg)
 }
 return r.headers.get('content-type')?.includes('application/json')?r.json():r as unknown as T;
}
export const auth=(t:string)=>{localStorage.setItem('token',t);location.href='/dashboard'};
export const logout=()=>{localStorage.removeItem('token');location.href='/login'};
export async function authenticatedImage(path:string):Promise<string>{
 const token=localStorage.getItem('token');
 const response=await fetch(`${API}${path}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
 if(!response.ok)throw new Error(`Could not load image (${response.status})`);
 return URL.createObjectURL(await response.blob());
}
