import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";
import { maximumQuotedCallCostMicros, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";
import { OpenRouterTransportError, type OpenRouterGenerationRequest } from "../../lib/server/openrouter/types.ts";
import { decryptJson } from "../../lib/server/security/index.ts";
import { createProductionPwrp71Provider, productionProviderBudget } from "../../lib/server/reports/provider-factory.ts";
import { providerLedgerEncryptionPurpose } from "../../lib/server/reports/prisma-provider-attempt-store.ts";
import { TestProviderLedgerDatabase,TEST_PROVIDER_KEYRING,providerTestContext,fakeOpenRouterResponse } from "./helpers/provider-ledger-database.ts";

function fixture(costCap=500_000) {
 const context={...providerTestContext(),reportType:"IFS"as const,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT};
 const database=new TestProviderLedgerDatabase(context);
 for(let index=0;index<4;index++)database.state.runs.push({assessmentSessionId:context.input.assessmentSessionId,reportWorkflowAttemptId:context.input.attemptId!,status:"RUNNING",costMicros:null,costCurrency:null,provider:null,attemptCount:0,startedAt:new Date(),openRouterGenerationId:null});
 const calls:{body:Record<string,unknown>;headers:Headers}[]=[];
 let respond=async()=>fakeOpenRouterResponse({ok:true,reportText:"confidential provider result"});
 const options={aggregateCostCapMicros:costCap,maxCallCostMicros:500_000,database,keyring:TEST_PROVIDER_KEYRING,clientOptions:{apiKey:"local-not-a-provider-key",fetch:async(_url:unknown,init?:RequestInit)=>{calls.push({body:JSON.parse(String(init?.body)),headers:new Headers(init?.headers)});return respond();}}};
 const request:OpenRouterGenerationRequest={model:"openai/gpt-6-luna",reasoningEffort:"max",system:"Return JSON.",prompt:"Bound evidence.",schemaName:"patternwork_ifs_pwrp71_candidate_1",schema:{type:"object",properties:{ok:{type:"boolean"}},required:["ok"],additionalProperties:false},maxOutputTokens:128_000,idempotencyKey:`${context.input.invocationKey}:IFS:initial:luna:attempt-1`};
 return {context,database,calls,options,request,setRespond(fn:typeof respond){respond=fn;},factory:()=>createProductionPwrp71Provider(context,options)};
}
async function waitForCall(f:{calls:unknown[]},pending:Promise<unknown>){
 pending.catch(()=>undefined);
 for(let i=0;i<100&&!f.calls.length;i++)await new Promise(resolve=>setImmediate(resolve));
 if(!f.calls.length)await pending;
 assert.ok(f.calls.length,"the admitted request must reach fake HTTP");
}
function records(f:ReturnType<typeof fixture>){
 const row=f.database.state.ledgers.get(f.context.input.assessmentSessionId)!;
 return decryptJson<{openingReportedCostMicros:number;attempts:{status:string;usageStatus:string;reservedCostMicros:number;usage?:{costMicros:number};reviewReceipt?:unknown;validation?:unknown}[]}>({ciphertext:Buffer.from(row.ledgerCiphertext),nonce:Buffer.from(row.ledgerNonce),keyVersion:row.encryptionKeyVersion},providerLedgerEncryptionPurpose(row.assessmentSessionId),TEST_PROVIDER_KEYRING);
}

test("a clean initialized RUNNING report set with null costs admits its first journaled call",async()=>{const f=fixture();await f.factory().provider.generate(f.request);assert.equal(f.calls.length,1);assert.equal(records(f).openingReportedCostMicros,0);});

test("production factory uses the actual guarded client, exact price/privacy pins, encrypted receipts and cached replay",async()=>{
 const f=fixture();let reservedBeforeFetch=false;
 f.setRespond(async()=>{reservedBeforeFetch=records(f).attempts[0].status==="started";return fakeOpenRouterResponse({ok:true,reportText:"confidential provider result"});});
 const budgeted=f.factory();const result=await budgeted.provider.generate(f.request);
 assert.ok(reservedBeforeFetch);assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.max_completion_tokens,128_000);
 assert.deepEqual(f.calls[0].body.provider,GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY);assert.equal(f.calls[0].body.usage&&typeof f.calls[0].body.usage,"object");
 assert.equal(f.calls[0].headers.get("x-request-id"),f.request.idempotencyKey);
 assert.equal(records(f).attempts[0].status,"completed");assert.equal(records(f).attempts[0].usage?.costMicros,1000);
 await budgeted.onPwrp71Event({type:"draft_validation",attemptId:f.request.idempotencyKey,reportType:"IFS",ok:true,issues:[],draftSha256:"c".repeat(64)});
 await budgeted.onPwrp71Event({type:"review_receipt",attemptId:f.request.idempotencyKey,reportType:"IFS",verdict:"accept",receipt:{secret:"encrypted review receipt"}});
 assert.ok(records(f).attempts[0].reviewReceipt);assert.ok(records(f).attempts[0].validation);
 const stored=f.database.state.ledgers.get(f.context.input.assessmentSessionId)!;assert.doesNotMatch(Buffer.from(stored.ledgerCiphertext).toString(),/confidential provider result|encrypted review receipt|Bound evidence|Return JSON/u);
 assert.equal(Object.keys(stored).filter(k=>/prompt|result|receipt|usage|cost|identity/iu.test(k)).length,0);
 assert.deepEqual(await f.factory().provider.generate(f.request),JSON.parse(JSON.stringify(result)));assert.equal(f.calls.length,1);
 await assert.rejects(f.factory().provider.generate({...f.request,prompt:"changed request"}),/no longer matches/);assert.equal(f.calls.length,1);
 const plain=new OpenRouterClient(f.options.clientOptions);await assert.rejects(plain.generate(f.request,REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT),/durable budget-prepared/);assert.equal(f.calls.length,1);
});

test("aggregate reservations serialize across independent factories, reports, snapshots and workflow attempts",async()=>{
 const f=fixture(200_000);let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 f.setRespond(async()=>{await wait;return fakeOpenRouterResponse();});
 const first=f.factory().provider.generate(f.request);
 await waitForCall(f,first);
 const other={...f.context,reportType:"PV"as const};
 const pv=createProductionPwrp71Provider(other,f.options);
 await assert.rejects(pv.provider.generate({...f.request,schemaName:"patternwork_pv_pwrp71_candidate_1",idempotencyKey:`${other.input.invocationKey}:PV:initial:luna:attempt-1`}),/aggregate budget blocked/);
 assert.equal(f.calls.length,1);release();await first;
 // Settlement replaces the conservative reservation with the reported charge.
 await pv.provider.generate({...f.request,schemaName:"patternwork_pv_pwrp71_candidate_1",idempotencyKey:`${other.input.invocationKey}:PV:initial:luna:attempt-1`});assert.equal(f.calls.length,2);
 const next={...providerTestContext({snapshotId:"snapshot-b",attemptId:"workflow-owner-2",invocationKey:"workflow-call-2"}),reportType:"MAP"as const,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT};
 f.database.addContext(next.input,next.prepared);
 const cap=maximumQuotedCallCostMicros(f.request)+1500;
 const map=createProductionPwrp71Provider(next,{...f.options,aggregateCostCapMicros:cap});
 await assert.rejects(map.provider.generate({...f.request,schemaName:"patternwork_map_pwrp71_candidate_1",idempotencyKey:`${next.input.invocationKey}:MAP:initial:luna:attempt-1`}),/aggregate budget blocked/);
 assert.equal(f.calls.length,2);assert.equal(f.database.state.ledgers.size,1);
});

test("unknown requests remain reserved and cannot be repeated or bypassed by a new workflow owner",async()=>{
 const f=fixture(200_000);f.setRespond(async()=>{throw new Error("network disconnected");});
 await assert.rejects(f.factory().provider.generate(f.request),/failed before a response/);
 assert.equal(records(f).attempts[0].status,"unknown");
 await assert.rejects(f.factory().provider.generate(f.request),/not safe to repeat/);assert.equal(f.calls.length,1);
 const next={...providerTestContext({attemptId:"workflow-owner-2",attemptNumber:2,invocationKey:"workflow-call-2"}),reportType:"IFS"as const,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT};f.database.addContext(next.input,next.prepared);
 await assert.rejects(createProductionPwrp71Provider(next,f.options).provider.generate({...f.request,idempotencyKey:`${next.input.invocationKey}:IFS:initial:luna:attempt-1`}),/aggregate budget blocked/);
 assert.equal(f.calls.length,1);
});

test("stale owners cannot admit calls; admitted calls settle after ownership changes",async()=>{
 const f=fixture();let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});f.setRespond(async()=>{await waiting;return fakeOpenRouterResponse();});
 const ongoing=f.factory().provider.generate(f.request);await waitForCall(f,ongoing);
 const next=providerTestContext({attemptId:"workflow-owner-2",attemptNumber:2,invocationKey:"workflow-call-2"});f.database.addContext(next.input,next.prepared);
 release();await ongoing;assert.equal(records(f).attempts[0].status,"completed");
 await assert.rejects(f.factory().provider.generate({...f.request,idempotencyKey:`${f.context.input.invocationKey}:IFS:initial:luna:attempt-2`}),/stale_report_attempt/);assert.equal(f.calls.length,1);
});

test("privacy rejection precedes persistence and HTTP, including local-only identity metadata",async()=>{
 const f=fixture();const context={...f.context,privacyIdentityContext:{identityInventoryReviewed:true as const,respondentNames:["Alice Private"],accountIds:["customer-account-secret"]}};
 const provider=createProductionPwrp71Provider(context,f.options).provider;
 await assert.rejects(provider.generate({...f.request,prompt:"Alice Private described this."}),/privacy boundary/);
 await assert.rejects(provider.generate({...f.request,prompt:"customer-account-secret"}),/privacy boundary/);
 await assert.rejects(createProductionPwrp71Provider(context,{...f.options,clientOptions:{...f.options.clientOptions,appTitle:"Alice Private"}}).provider.generate(f.request),/privacy boundary/);
 assert.equal(f.database.state.ledgers.size,0);assert.equal(f.database.transactionCount,0);assert.equal(f.calls.length,0);
 await assert.rejects(createProductionPwrp71Provider({...f.context,privacyIdentityContext:undefined},f.options).provider.generate(f.request),/privacy boundary/);
 assert.equal(f.database.state.ledgers.size,0);
});

test("caps, pinned request dimensions and production namespace fail closed before HTTP",async()=>{
 for(const change of [{maxOutputTokens:64000},{model:"openai/foreign"},{reasoningEffort:"invalid"},{schemaName:"patternwork_pv_pwrp71_candidate_1"},{idempotencyKey:"another-owner:IFS:initial"}]as const){const f=fixture();await assert.rejects(f.factory().provider.generate({...f.request,...change} as OpenRouterGenerationRequest));assert.equal(f.calls.length,0);assert.equal(f.database.state.ledgers.size,0);}
 const f=fixture();await assert.rejects(createProductionPwrp71Provider(f.context,{...f.options,maxCallCostMicros:maximumQuotedCallCostMicros(f.request)-1}).provider.generate(f.request),/Per-call ceiling/);assert.equal(f.calls.length,0);
 assert.deepEqual(productionProviderBudget({OPENROUTER_MAX_COST_PER_ASSESSMENT_USD:"0.60"}),{aggregateCostCapMicros:600_000,maxCallCostMicros:500_000});
 for(const v of [undefined,"0","no","0.0000001","9007199254740991"])assert.throws(()=>productionProviderBudget({OPENROUTER_MAX_COST_PER_ASSESSMENT_USD:v}));
 assert.throws(()=>productionProviderBudget({OPENROUTER_MAX_COST_PER_ASSESSMENT_USD:"1",OPENROUTER_MAX_COST_PER_CALL_USD:"0"}));
});

test("historical known spending is reconciled once; missing historical usage cannot reset the budget",async()=>{
 const f=fixture(200_000),old=providerTestContext({snapshotId:"snapshot-b",attemptId:"old-owner",invocationKey:"old-calls"});f.database.addContext(old.input,old.prepared);f.database.state.owners.get(old.input.attemptId!)!.status="SUCCEEDED";
 f.database.state.runs.push({assessmentSessionId:f.context.input.assessmentSessionId,reportWorkflowAttemptId:old.input.attemptId!,status:"SUCCEEDED",costMicros:BigInt(40_000),costCurrency:"USD",provider:"openrouter",attemptCount:1,startedAt:new Date(),openRouterGenerationId:"historical"});
 await assert.rejects(f.factory().provider.generate(f.request),/aggregate budget blocked/);assert.equal(f.calls.length,0);assert.equal(f.database.state.ledgers.size,0);
 f.options.aggregateCostCapMicros=500_000;await f.factory().provider.generate(f.request);assert.equal(records(f).openingReportedCostMicros,40_000);
 f.database.state.runs[0].costMicros=BigInt(100_000);
 await f.factory().provider.generate({...f.request,idempotencyKey:`${f.context.input.invocationKey}:IFS:initial:luna:attempt-2`});assert.equal(records(f).openingReportedCostMicros,40_000);
 const ambiguous=fixture();ambiguous.database.state.runs.push({assessmentSessionId:ambiguous.context.input.assessmentSessionId,reportWorkflowAttemptId:"old-missing",status:"FAILED",costMicros:null,costCurrency:null,provider:"openrouter",attemptCount:1,startedAt:new Date(),openRouterGenerationId:null});
 await assert.rejects(ambiguous.factory().provider.generate(ambiguous.request),/Historical report usage/);assert.equal(ambiguous.calls.length,0);
});

test("serialization failures retry only transactions; corruption and deletion cannot resurrect receipts",async()=>{
 const f=fixture();f.database.failCommits=2;await f.factory().provider.generate(f.request);assert.equal(f.calls.length,1);assert.equal(records(f).attempts.length,1);
 const row=f.database.state.ledgers.get(f.context.input.assessmentSessionId)!;row.ledgerCiphertext[0]^=1;
 await assert.rejects(f.factory().provider.generate({...f.request,idempotencyKey:`${f.context.input.invocationKey}:IFS:initial:luna:attempt-2`}));assert.equal(f.calls.length,1);
 const deletion=fixture();let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});deletion.setRespond(async()=>{await wait;return fakeOpenRouterResponse();});
 const pending=deletion.factory().provider.generate(deletion.request);await waitForCall(deletion,pending);
 await deletion.database.deleteSession(deletion.context.input.assessmentSessionId);release();await assert.rejects(pending,/deleted|ledger cannot/);
 assert.equal(deletion.database.state.ledgers.size,0);await assert.rejects(deletion.factory().provider.generate(deletion.request),/deleted/);assert.equal(deletion.calls.length,1);
});

test("migration keeps receipts encrypted and cascades session deletion",async()=>{
 const schema=await readFile("prisma/schema.prisma","utf8"),sql=await readFile("prisma/migrations/20261018120000_encrypted_report_provider_ledger/migration.sql","utf8");
 assert.match(schema,/model PatternworkV31ReportProviderLedger[\s\S]*onDelete: Cascade/u);assert.match(sql,/ON DELETE CASCADE/u);assert.match(sql,/ledgerCiphertext.*BYTEA/u);assert.match(sql,/octet_length\("ledgerNonce"\) = 12/u);assert.doesNotMatch(sql,/\bUPDATE\s+"PatternworkV31ReportRun"/u);
});

test("a journal cannot be transplanted across sessions, and report events cannot cross workflow scopes",async()=>{
 const f=fixture();const budgeted=f.factory();await budgeted.provider.generate(f.request);
 await assert.rejects(budgeted.onPwrp71Event({type:"draft_validation",attemptId:f.request.idempotencyKey,reportType:"PV",ok:true,issues:[]}),/outside its workflow/);
 const other={...providerTestContext({assessmentSessionId:"other-assessment",attemptId:"other-owner",invocationKey:"other-calls"}),reportType:"IFS"as const,privacyIdentityContext:REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT};
 f.database.addContext(other.input,other.prepared);
 f.database.state.ledgers.set(other.input.assessmentSessionId,{...f.database.state.ledgers.get(f.context.input.assessmentSessionId)!,assessmentSessionId:other.input.assessmentSessionId});
 await assert.rejects(createProductionPwrp71Provider(other,f.options).provider.generate({...f.request,idempotencyKey:`${other.input.invocationKey}:IFS:initial:luna:attempt-1`}));assert.equal(f.calls.length,1);
});

test("a response-body deadline becomes an unknown reserved journal attempt and cannot dispatch again",async(t)=>{
 const f=fixture(200_000);let dispatches=0;let cleanup=()=>{};
 const budgeted=createProductionPwrp71Provider(f.context,{...f.options,clientOptions:{apiKey:"offline-test",timeoutMs:15,fetch:async(_url,init)=>{
  dispatches++;
  return new Response(new ReadableStream<Uint8Array>({start(controller){
   const abort=()=>controller.error(new DOMException("offline body timeout","AbortError"));
   init!.signal!.addEventListener("abort",abort,{once:true});
   const guard=setTimeout(()=>controller.error(new Error("offline body guard expired")),200);
   cleanup=()=>{clearTimeout(guard);init!.signal!.removeEventListener("abort",abort);};
  }}),{status:200,headers:{"content-type":"application/json"}});
 }}});
 t.after(()=>cleanup());
 await assert.rejects(budgeted.provider.generate(f.request),(error:unknown)=>error instanceof OpenRouterTransportError&&error.kind==="timeout");
 const row=records(f).attempts[0];assert.equal(row.status,"unknown");assert.equal(row.usageStatus,"unknown");assert.equal(row.reservedCostMicros,maximumQuotedCallCostMicros(f.request));assert.equal(row.usage,undefined);
 await assert.rejects(budgeted.provider.generate(f.request),/not safe to repeat/);
 await assert.rejects(budgeted.provider.generate({...f.request,idempotencyKey:`${f.context.input.invocationKey}:IFS:initial:luna:attempt-2`}),/aggregate budget blocked/);
 assert.equal(dispatches,1);
});
