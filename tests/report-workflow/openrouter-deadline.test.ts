import assert from "node:assert/strict";
import test from "node:test";
import { OpenRouterClient, resolveOpenRouterTimeoutMs, OPENROUTER_DEFAULT_TIMEOUT_MS } from "../../lib/server/openrouter/client.ts";
import { OpenRouterTransportError, type OpenRouterGenerationRequest } from "../../lib/server/openrouter/types.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";

const request:OpenRouterGenerationRequest={model:"mock/luna",reasoningEffort:"low",system:"Return JSON.",prompt:"Bound input.",schemaName:"offline_deadline_test",schema:{type:"object",additionalProperties:false,required:["ok"],properties:{ok:{type:"boolean"}}},maxOutputTokens:1024,idempotencyKey:"offline-deadline-test"};
function completedResponse(){return Response.json({id:"offline-generation",model:request.model,usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2,cost:0.001},choices:[{message:{content:'{"ok":true}'},finish_reason:"stop"}]});}

/** Real Response.json consumes a pending stream that observes the actual fetch AbortSignal. */
for(const status of[200,500])test(`full deadline aborts a pending HTTP ${status} body after immediate headers`,async(t)=>{
 let signal:AbortSignal|undefined;
 let streamController:ReadableStreamDefaultController<Uint8Array>|undefined;
 let cleanup=()=>{};
 const client=new OpenRouterClient({apiKey:"offline-test",timeoutMs:15,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT,fetch:async(_url,init)=>{
  signal=init!.signal!;
  const stream=new ReadableStream<Uint8Array>({start(controller){
   streamController=controller;
   const abort=()=>controller.error(new DOMException("offline body aborted","AbortError"));
   signal!.addEventListener("abort",abort,{once:true});
   // Bound a regression run without pretending an unresponsive body has honored the signal.
   const guard=setTimeout(()=>controller.error(new Error("offline body guard expired")),200);
   cleanup=()=>{clearTimeout(guard);signal!.removeEventListener("abort",abort);};
  }});
  return new Response(stream,{status,headers:{"content-type":"application/json"}});
 }});
 t.after(()=>{cleanup();streamController?.error(new Error("offline test cleanup"));});
 await assert.rejects(client.generate(request),(error:unknown)=>{
  assert.ok(error instanceof OpenRouterTransportError);assert.equal(error.kind,"timeout");assert.equal(error.retryable,true);assert.equal(signal?.aborted,true);return true;
 });
});

test("full deadline also aborts delayed response headers",async()=>{
 const client=new OpenRouterClient({apiKey:"offline-test",timeoutMs:15,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT,fetch:async(_url,init)=>new Promise((_resolve,reject)=>{
  init!.signal!.addEventListener("abort",()=>reject(new DOMException("offline headers aborted","AbortError")),{once:true});
 })});
 await assert.rejects(client.generate(request),(error:unknown)=>error instanceof OpenRouterTransportError&&error.kind==="timeout"&&error.retryable);
});

test("a promptly completed real response body succeeds and the deadline is cleaned up",async()=>{
 let signal:AbortSignal|undefined;
 const client=new OpenRouterClient({apiKey:"offline-test",timeoutMs:15,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT,fetch:async(_url,init)=>{signal=init!.signal!;return completedResponse();}});
 const result=await client.generate(request);assert.equal(result.ok,true);
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(signal?.aborted,false);
});

test("full-request timeout configuration validates environment, constructor precedence and Node timer limits",()=>{
 assert.equal(OPENROUTER_DEFAULT_TIMEOUT_MS,1_200_000);
 assert.equal(resolveOpenRouterTimeoutMs(undefined,{}),1_200_000);
 assert.equal(resolveOpenRouterTimeoutMs(undefined,{OPENROUTER_TIMEOUT_MS:"  "}),1_200_000);
 assert.equal(resolveOpenRouterTimeoutMs(undefined,{OPENROUTER_TIMEOUT_MS:" 12345 "}),12345);
 assert.equal(resolveOpenRouterTimeoutMs(45,{OPENROUTER_TIMEOUT_MS:"invalid"}),45);
 assert.equal(resolveOpenRouterTimeoutMs(undefined,{OPENROUTER_TIMEOUT_MS:"2147483647"}),2_147_483_647);
 for(const value of["0","-1","1.5","NaN","Infinity","2147483648","9007199254740991","not-a-timeout"]){assert.throws(()=>resolveOpenRouterTimeoutMs(undefined,{OPENROUTER_TIMEOUT_MS:value}),/positive integer/);}
 for(const value of[0,-1,0.5,NaN,Infinity,2_147_483_648,Number.MAX_SAFE_INTEGER])assert.throws(()=>new OpenRouterClient({timeoutMs:value}),/positive integer/);
});

test("the constructor applies the explicit timeout environment to the actual request signal",async(t)=>{
 const previous=process.env.OPENROUTER_TIMEOUT_MS;process.env.OPENROUTER_TIMEOUT_MS="15";
 t.after(()=>{if(previous===undefined)delete process.env.OPENROUTER_TIMEOUT_MS;else process.env.OPENROUTER_TIMEOUT_MS=previous;});
 const client=new OpenRouterClient({apiKey:"offline-test",privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT,fetch:async(_url,init)=>new Promise((_resolve,reject)=>{
  init!.signal!.addEventListener("abort",()=>reject(new DOMException("offline env timeout","AbortError")),{once:true});
 })});
 await assert.rejects(client.generate(request),(error:unknown)=>error instanceof OpenRouterTransportError&&error.kind==="timeout"&&error.message.includes("15 ms"));
});

for(const status of[200,400])test(`full-request timer is cleared after a prompt HTTP ${status} body error`,async()=>{
 let signal:AbortSignal|undefined;
 const client=new OpenRouterClient({apiKey:"offline-test",timeoutMs:15,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT,fetch:async(_url,init)=>{signal=init!.signal!;return status===200?new Response("invalid envelope",{status}):Response.json({error:{message:"offline request rejected"}},{status});}});
 await assert.rejects(client.generate(request),(error:unknown)=>error instanceof OpenRouterTransportError&&error.kind===(status===200?"protocol":"client_error"));
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(signal?.aborted,false);
});
