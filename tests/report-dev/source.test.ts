import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp,mkdir,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const sha = (bytes:Uint8Array) => createHash("sha256").update(bytes).digest("hex");
test("source sync makes a prose edit reproducible without changing question sources or release authorization",async()=>{
 const scratch=path.resolve(".codex-temp");await mkdir(scratch,{recursive:true});
 const root=await mkdtemp(path.join(scratch,"source-sync-"));
 const cli=path.join(root,"scripts/report-dev/source.ts");
 const run=(...args:string[])=>spawnSync(process.execPath,["--import","tsx",cli,...args],{cwd:root,encoding:"utf8",timeout:20000});
 try{
  for(const name of ["lib","specs","reporting"])await cp(name,path.join(root,name),{recursive:true});
  await mkdir(path.dirname(cli),{recursive:true});await cp("scripts/report-dev/source.ts",cli);
  const question=path.join(root,"lib/question-engine/pwqe51-source.ts"),questionBefore=sha(await readFile(question));
  assert.equal(run("--check").status,0);
  const prompt=path.join(root,"reporting/prompts/02_IFS_REPORT_PROMPT.md");
  await writeFile(prompt,(await readFile(prompt,"utf8"))+"\nKeep supported functional relationships clear.\n");
  assert.equal(run("--check").status,1,"unbound prose edits must fail closed");
  const synced=run("--sync","--change","prose");assert.equal(synced.status,0,synced.stderr);
  const receipt=JSON.parse(synced.stdout);assert.equal(receipt.operationalApproval,false);
  assert.deepEqual(receipt.changed,["prompts/02_IFS_REPORT_PROMPT.md"]);
  const verified=run("--check");assert.equal(verified.status,0,verified.stderr);
  assert.equal(sha(await readFile(question)),questionBefore);
  const policy=JSON.parse(await readFile(path.join(root,"reporting/contracts/report_policy.json"),"utf8"));
  assert.equal(policy.activation,"requires_external_provider_qualification_and_authorized_release_approval");
  const schema=path.join(root,"reporting/schemas/report_draft.schema.json");
  await writeFile(schema,(await readFile(schema,"utf8"))+"\n");
  assert.equal(run("--sync","--change","prose").status,1,"schema changes cannot be disguised as prose");
 }finally{await rm(root,{recursive:true,force:true});}
});
