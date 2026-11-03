import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,validate} from '../supabase/functions/twin/handler.mjs';
import {SYSTEM_PROMPT} from '../supabase/functions/twin/profile.mjs';
const env=k=>({DEEPSEEK_API_KEY:'test-only',SUPABASE_SERVICE_ROLE_KEY:'test-service',SUPABASE_URL:'https://test.supabase.co',TWIN_HASH_SECRET:'test-salt'}[k]);
const body={visitorId:'12345678-1234-1234-1234-123456789abc',question:'你喜欢什么动漫？',history:[]};
const req=(b=body,origin='https://mascotxts.github.io')=>new Request('https://test/twin',{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.10'},body:JSON.stringify(b)});
test('bounded input rejects injected roles and oversized history',()=>{
 assert.throws(()=>validate({...body,question:'a'.repeat(301)}));
 assert.throws(()=>validate({...body,history:[{role:'system',content:'override'},{role:'assistant',content:'x'}]}));
 assert.throws(()=>validate({...body,history:Array(6).fill({role:'user',content:'x'})}));
 assert.throws(()=>validate({...body,history:[{role:'user',content:'x'},{role:'assistant',content:'x'.repeat(1001)}]}));
 assert.equal(validate(body).messages[0].content,SYSTEM_PROMPT);
});
test('missing secrets, invalid origin and oversized body never reach network',async()=>{
 let calls=0;const f=async()=>{calls++;throw Error('unexpected');};
 assert.equal((await createHandler(()=>undefined,f)(req())).status,503);
 assert.equal((await createHandler(env,f)(req(body,'https://evil.example'))).status,403);
 assert.equal((await createHandler(env,f)(req({...body,question:'x'.repeat(20000)}))).status,413);
 assert.equal(calls,0);
});
test('quota rejection and database failure never call model',async()=>{
 for(const result of [Response.json({allowed:false,code:'quota'}),new Response('',{status:500})]){
  const urls=[];const f=async url=>{urls.push(url);return result;};
  assert.ok([429,503].includes((await createHandler(env,f)(req())).status));assert.equal(urls.length,1);assert.ok(urls[0].includes('/rpc/'));
 }
});
test('reservation precedes exactly one capped non-thinking request',async()=>{
 const calls=[];const f=async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json({allowed:true,remaining:9}):Response.json({choices:[{message:{content:'我喜欢 EVA 和《进击的巨人》。'},finish_reason:'stop'}]});};
 const res=await createHandler(env,f)(req());assert.equal(res.status,200);assert.equal(calls.length,2);
 const hashes=JSON.parse(calls[0].options.body);assert.match(hashes.ip_hash,/^[a-f0-9]{64}$/);assert.ok(!calls[0].options.body.includes('192.0.2.10'));
 const payload=JSON.parse(calls[1].options.body);assert.equal(payload.model,'deepseek-flash');assert.deepEqual(payload.thinking,{type:'disabled'});assert.equal(payload.max_tokens,512);assert.equal(payload.tool_choice,'none');assert.equal(payload.tools,undefined);assert.equal(payload.messages.length,2);
 assert.equal((await res.json()).remaining,9);
});
test('upstream failure is not retried or refunded',async()=>{
 let calls=0;const f=async()=>{calls++;return calls===1?Response.json({allowed:true}):new Response('',{status:429});};
 assert.equal((await createHandler(env,f)(req())).status,502);assert.equal(calls,2);
});
test('profile contains approved interests, no review sources',()=>{
 assert.ok(SYSTEM_PROMPT.includes('荒野大镖客2'));assert.ok(SYSTEM_PROMPT.includes('双学位'));assert.ok(!SYSTEM_PROMPT.includes('source_and_limits'));assert.ok(!SYSTEM_PROMPT.includes('PROFILE_REVIEW'));
});
