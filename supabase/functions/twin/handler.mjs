import { SYSTEM_PROMPT } from './profile.mjs';
const encoder = new TextEncoder();
export function validate(body) {
 if (!body || typeof body !== 'object' || !/^[0-9a-f-]{36}$/i.test(body.visitorId ?? '')) throw Error('invalid');
 if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 300) throw Error('invalid');
 const history = body.history ?? [];
 if (!Array.isArray(history) || history.length > 4 || history.length % 2) throw Error('invalid');
 history.forEach((m,i) => {if (!m || m.role !== (i%2 ? 'assistant':'user') || typeof m.content !== 'string' || m.content.length > (i%2 ? 1000:300)) throw Error('invalid');});
 return {visitorId:body.visitorId, messages:[{role:'system',content:SYSTEM_PROMPT},...history.map(m=>({role:m.role,content:m.content})),{role:'user',content:body.question.trim()}]};
}
async function hash(value, secret) {
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function createHandler(env, fetcher=fetch) {
 return async req => {
 const origin=env('ALLOWED_ORIGIN') || 'https://mascotxts.github.io';
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type, apikey, authorization, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const respond=(status,data)=>Response.json(data,{status,headers});
 if (req.headers.get('origin') !== origin) return respond(403,{code:'origin'});
 if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
 if (req.method!=='POST') return respond(405,{code:'method'});
 const apiKey=env('DEEPSEEK_API_KEY')?.trim(), serviceKey=env('SUPABASE_SERVICE_ROLE_KEY'), url=env('SUPABASE_URL'), salt=env('TWIN_HASH_SECRET');
 if (!apiKey || !serviceKey || !url || !salt) return respond(503,{code:'unavailable'});
 let data;
 try {
  // Bound the stream even when Content-Length is missing or forged.
  const reader=req.body?.getReader(); if (!reader) throw Error('invalid');
  let size=0; const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();return respond(413,{code:'invalid'});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  data=validate(JSON.parse(new TextDecoder().decode(bytes)));
 } catch {return respond(400,{code:'invalid'});}
 // Anonymous identity is best effort. Global DB caps remain binding even if headers/IDs change.
 const ip=req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
 if (!ip || ip.length>128) return respond(503,{code:'identity'});
 try {
  const browserHash=await hash('browser:'+data.visitorId,salt),ipHash=await hash('ip:'+ip,salt);
  const reserved=await fetcher(url+'/rest/v1/rpc/reserve_twin_quota',{method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({browser_hash:browserHash,ip_hash:ipHash}),signal:AbortSignal.timeout(8000)});
  if(!reserved.ok)return respond(503,{code:'unavailable'});
  const quota=await reserved.json();
  if(quota.allowed!==true)return respond(429,{code:quota.code==='cooldown'?'cooldown':quota.code==='disabled'?'disabled':'quota'});
  // No refunds or retries: upstream may still bill after a timeout.
  const response=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},tool_choice:'none',max_tokens:512,stream:false,messages:data.messages}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)return respond(502,{code:'upstream',upstreamStatus:response.status});
  const result=await response.json();const answer=result.choices?.[0]?.message?.content;
  if(typeof answer!=='string'||!answer.trim())return respond(502,{code:'upstream'});
  return respond(200,{answer:answer.slice(0,4000),remaining:quota.remaining,truncated:result.choices[0].finish_reason==='length'});
 } catch {return respond(503,{code:'unavailable'});}
 };
}
