import type { JsonObject } from "../../../question-engine/types.ts";
import type { Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../../report-contracts/delivery-validator.ts";
import { compilePwqe51Route } from "../../assessment/pwqe51-router.ts";
import { isPwqe51SessionState } from "../../assessment/pwqe51-session.ts";
import { buildPwqe51RouterPacket } from "../pwqe51-packet.ts";

const object = (value: unknown): Record<string,unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
const rows = (value: unknown): Record<string,unknown>[] => Array.isArray(value) ? value.map(object) : [];

/**
 * Called only after the retained archive and question-source hashes are verified.
 * Rebuild, never relabel, old packets. Their prior report approval is not carried forward.
 */
export function rebuildRetainedPacket(replay: Readonly<Record<string,unknown>>, archived: JsonObject, mapping: boolean, source: Pwqe51SourcePackage): JsonObject {
  const state = replay.state;
  if (!isPwqe51SessionState(state) || state.sourceRelease !== source.questionBank.release) throw new Error("Retained session has no current canonical source state.");
  const archivedAdmin = rows(archived.administration_provenance);
  const count = mapping ? archivedAdmin.length : state.responses.length;
  if (!count || count > state.responses.length) throw new Error("Retained Mapping boundary is not recoverable from its administration record.");
  const responses = state.responses.slice(0,count);
  const liveIds = new Set(responses.map(r => r.responseId));
  if (archivedAdmin.some(row => row.live_response_id !== null && !liveIds.has(String(row.live_response_id)))) throw new Error("Retained administrations and canonical response prefix disagree.");
  const context = object(replay.contextDecisions);
  const mappingTopics = rows(context.mappingEntryTopicOptIns).map(row => String(row.topic));
  const occurrenceIds = new Set(responses.map(r=>r.occurrenceId));
  const routerResult = mapping ? compilePwqe51Route({
    responses, phase:"mapping", controls:[], occurrenceBindings:state.occurrenceBindings, optedInTopics:mappingTopics,
    episodeLinks:(state.routerInput.episodeLinks??[]).filter(link=>occurrenceIds.has(link.occurrenceId)),
  },source) : state.routerResult;
  if (routerResult.phase !== "finished") throw new Error("Retained stage needs questionnaire replay; it is not complete under the current engine.");
  const packet = buildPwqe51RouterPacket({snapshotId:String(archived.snapshot_id),responses,routerResult,pass:mapping?1:2,
    controls:mapping?[]:state.controls,comparisonDecisions:mapping?[]:state.comparisonDecisions,source}) as JsonObject;
  const semantic = (value:JsonObject) => rows(value.observations).map(row=>({id:row.id,response_id:row.response_id,item_id:row.item_id,option_id:row.option_id,
    occurrence_id:row.occurrence_id,step_id:row.step_id,text:row.text,variant:row.variant}));
  if (sha256Canonical(semantic(packet)) !== sha256Canonical(semantic(archived))) throw new Error("Rebuilt evidence differs from the retained selections; replay the questionnaire explicitly.");
  return packet;
}
