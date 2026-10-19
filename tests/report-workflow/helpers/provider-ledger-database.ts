import assert from "node:assert/strict";
import type { ProviderLedgerDatabase, ProviderLedgerLegacyRun, ProviderLedgerRow, ProviderLedgerSnapshot, ProviderLedgerTransaction, ProviderLedgerWorkflowAttempt } from "../../../lib/server/reports/prisma-provider-attempt-store.ts";
import type { EncryptionKeyring } from "../../../lib/server/security/index.ts";
import type { PassReportWorkflowInput, PreparedReportInputs } from "../../../lib/server/reports/types.ts";

export const TEST_PROVIDER_KEYRING: EncryptionKeyring = { activeVersion: "test", keys: { test: Buffer.alloc(32, 17) } };
interface State {
  sessions: Set<string>; snapshots: Map<string, ProviderLedgerSnapshot>; owners: Map<string, ProviderLedgerWorkflowAttempt>;
  runs: (ProviderLedgerLegacyRun & {assessmentSessionId:string})[]; ledgers: Map<string,ProviderLedgerRow>;
}
type Args = {where?:Record<string,unknown>;data?:Record<string,unknown>};
/** Serializable transactional test double: independent adapter instances share one durable state and rollback. */
export class TestProviderLedgerDatabase implements ProviderLedgerDatabase {
  state: State = {sessions:new Set(),snapshots:new Map(),owners:new Map(),runs:[],ledgers:new Map()};
  private tail: Promise<unknown> = Promise.resolve();
  transactionCount=0;
  failCommits=0;
  constructor(context?:{input:PassReportWorkflowInput;prepared:PreparedReportInputs}) {if(context)this.addContext(context.input,context.prepared);}
  addContext(input:PassReportWorkflowInput,prepared:PreparedReportInputs) {
    this.state.sessions.add(input.assessmentSessionId);
    this.state.snapshots.set(prepared.snapshot.databaseId,{...prepared.snapshot,id:prepared.snapshot.databaseId,currentReportAttemptNumber:input.attemptNumber!});
    this.state.owners.set(input.attemptId!,{id:input.attemptId!,assessmentSnapshotId:prepared.snapshot.databaseId,attemptNumber:input.attemptNumber!,invocationKey:input.invocationKey,status:"RUNNING",startedAt:new Date()});
  }
  async deleteSession(id:string){
    const turn=this.tail.then(()=>{const next=structuredClone(this.state);next.sessions.delete(id);next.ledgers.delete(id);this.state=next;});
    this.tail=turn.then(()=>undefined,()=>undefined);await turn;
  }
  async $transaction<T>(fn:(tx:ProviderLedgerTransaction)=>Promise<T>,options:{isolationLevel:"Serializable"}):Promise<T>{
    assert.equal(options.isolationLevel,"Serializable");
    const turn=this.tail.then(async()=>{
      this.transactionCount++;
      const data=structuredClone(this.state);
      const tx:ProviderLedgerTransaction={
        patternworkV31AssessmentSession:{findUnique:async a=>data.sessions.has(String((a as Args).where!.id))?{id:String((a as Args).where!.id)}:null},
        patternworkV31AssessmentSnapshot:{
          findFirst:async a=>{const w=(a as Args).where!;return [...data.snapshots.values()].find(s=>s.id===w.id&&s.assessmentSessionId===w.assessmentSessionId&&s.snapshotId===w.snapshotId)??null;},
          updateMany:async a=>{const {where:w,data:d}=a as Args;const s=data.snapshots.get(String(w!.id));if(!s||s.currentReportAttemptNumber!==w!.currentReportAttemptNumber)return {count:0};Object.assign(s,d);return {count:1};},
        },
        patternworkV31ReportWorkflowAttempt:{
          findUnique:async a=>data.owners.get(String((a as Args).where!.id))??null,
          findMany:async a=>{const session=String(((a as Args).where!.assessmentSnapshot as {assessmentSessionId:string}).assessmentSessionId);return [...data.owners.values()].filter(o=>data.snapshots.get(o.assessmentSnapshotId)?.assessmentSessionId===session);},
          updateMany:async a=>{const {where:w,data:d}=a as Args;const o=data.owners.get(String(w!.id));if(!o||o.attemptNumber!==w!.attemptNumber||o.status!==w!.status)return {count:0};Object.assign(o,d);return {count:1};},
        },
        patternworkV31ReportRun:{findMany:async a=>{const session=String(((a as Args).where!.assessmentSnapshot as {assessmentSessionId:string}).assessmentSessionId);return data.runs.filter(r=>r.assessmentSessionId===session);}},
        patternworkV31ReportProviderLedger:{
          findUnique:async a=>data.ledgers.get(String((a as Args).where!.assessmentSessionId))??null,
          create:async a=>{const row=(a as Args).data as unknown as ProviderLedgerRow;if(!data.sessions.has(row.assessmentSessionId))throw Object.assign(new Error("FK"),{code:"P2003"});if(data.ledgers.has(row.assessmentSessionId))throw Object.assign(new Error("Unique"),{code:"P2002"});data.ledgers.set(row.assessmentSessionId,structuredClone(row));return row;},
          updateMany:async a=>{const {where:w,data:d}=a as Args;const row=data.ledgers.get(String(w!.assessmentSessionId));if(!row||row.revision!==w!.revision)return {count:0};Object.assign(row,d);return {count:1};},
        },
      };
      const value=await fn(tx);
      if(this.failCommits>0){this.failCommits--;throw Object.assign(new Error("Serialization conflict"),{code:"P2034"});}
      this.state=data;
      return value;
    });
    this.tail=turn.then(()=>undefined,()=>undefined);return turn;
  }
}
export function providerTestContext(overrides:Partial<PassReportWorkflowInput>={}) {
 const input:PassReportWorkflowInput={assessmentSessionId:"session-budget-test",snapshotId:"snapshot-a",completedPass:2,attemptId:"workflow-owner-1",attemptNumber:1,invocationKey:"workflow-call-1",...overrides};
 const prepared={contractVersion:"v7.1",snapshot:{databaseId:`database-${input.snapshotId}`,assessmentSessionId:input.assessmentSessionId,snapshotId:input.snapshotId,snapshotRevision:"1",completedPass:input.completedPass,evidenceSha256:"a".repeat(64),scopeSha256:"b".repeat(64)},packets:[]}as unknown as PreparedReportInputs;
 return {input,prepared};
}
export function fakeOpenRouterResponse(output:unknown={ok:true},costMicros=1000,model="openai/gpt-6-luna") {
 return Response.json({id:"provider-test-generation",model,usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16,cost:costMicros/1_000_000},choices:[{finish_reason:"stop",message:{content:JSON.stringify(output)}}]});
}
