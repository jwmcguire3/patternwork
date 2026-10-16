import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadAssessment, runAssessmentPlan, writeImmutableJson, type AnswerPlan } from "../../scripts/report-dev/assessment.ts";
import { assertAssessmentRoute } from "../../scripts/report-dev/verify-assessment.ts";
import { canonical, contentHash } from "../../scripts/report-dev/source.ts";
import { assertNoRespondentClassification } from "../../lib/server/reports/content-boundary.ts";

const sourcePromise = loadPwqe51SourcePackage();
async function plan(id: string): Promise<AnswerPlan> {
  return JSON.parse(await readFile(path.join("scripts/report-dev/cases",`${id}.json`),"utf8"));
}
for (const id of ["mara", "ellis"]) {
  test(`${id}: real issued Mapping/Deepening, immutable save and repeatable load`, async () => {
    const source = await sourcePromise;
    const assessment = runAssessmentPlan(await plan(id),source);
    assert.equal(assessment.mapping.responses.length,28);
    assert.equal(assessment.deepening.responses.length,56);
    assert.equal(assessment.deepening.routerResult.completionReason,"administration_or_decision_limit");
    assert.doesNotThrow(() => assertAssessmentRoute(assessment,source));
    assert.doesNotThrow(() => assertNoRespondentClassification(assessment));
    const directory = await mkdtemp(path.join(os.tmpdir(),"pw-dev-assessment-"));
    try {
      const file=path.join(directory,`${assessment.contentSha256}.json`);
      await writeImmutableJson(file,assessment);
      await writeImmutableJson(file,assessment);
      const loaded=await loadAssessment(file,source);
      assert.equal(canonical(loaded),canonical(assessment));
      await assert.rejects(writeImmutableJson(file,{different:true}),/different bytes/);
      const tampered=structuredClone(assessment);
      (tampered.deepening.routerResult as unknown as Record<string,unknown>).completionReason="fabricated_completion";
      const body=Object.fromEntries(Object.entries(tampered).filter(([key])=>key!=="contentSha256"));
      tampered.contentSha256=contentHash(canonical(body));
      const bad=path.join(directory,"rehash.json");await writeImmutableJson(bad,tampered);
      await assert.rejects(loadAssessment(bad,source),/router result differs/);
    } finally {await rm(directory,{recursive:true,force:true});}
  });
}

test("a valid hash cannot make a reordered or edited transcript eligible", async () => {
  const source=await sourcePromise, assessment=runAssessmentPlan(await plan("mara"),source);
  const edits=structuredClone(assessment);
  [edits.transcript[0],edits.transcript[1]]=[edits.transcript[1],edits.transcript[0]];
  assert.throws(()=>assertAssessmentRoute(edits,source),/transcript\/answer mismatch/);
  const bad=structuredClone(assessment);
  const first=bad.transcript[0] as {acceptedInput:{selectedOptionIds:string[]}};
  first.acceptedInput.selectedOptionIds=["M01.foreign"];
  assert.throws(()=>assertAssessmentRoute(bad,source),/transcript\/answer mismatch/);
});

test("answer plans reject unknown questions, invalid issued options and conflicting answers",async()=>{
  const source=await sourcePromise,p=await plan("mara");
  const foreign=structuredClone(p);foreign.answers[0].questionId="NOT_IN_BANK";
  assert.throws(()=>runAssessmentPlan(foreign,source),/outside the current bank/);
  const wrong=structuredClone(p);delete wrong.answers[0].optionText;wrong.answers[0].optionIds=["M01.foreign"];
  assert.throws(()=>runAssessmentPlan(wrong,source),/does not match the issued/);
  const ambiguous=structuredClone(p);ambiguous.answers.push({...p.answers[0],optionText:"another choice"});
  assert.throws(()=>runAssessmentPlan(ambiguous,source),/Ambiguous answer plan/);
});

test("origin labels cannot enter new records, including nested fields and former selection warnings",()=>{
  for(const value of [{response:{isSynthetic:true}},{responseProvenanceByResponseId:{}},{notes:"source provenance: new_synthetic_mapping_response"}]) {
    assert.throws(()=>assertNoRespondentClassification(value),/Retired respondent classification/);
  }
  assert.doesNotThrow(()=>assertNoRespondentClassification({responseId:"r",source_version:"v1",status:"answered"}));
});
