import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("dated authorization cannot invoke the retired provider diagnostic",()=>{
 const result=spawnSync(process.execPath,["--import","tsx","scripts/pwrp71-fictional-ifs-diagnostic/index.ts","--mode","live"],{
  encoding:"utf8",timeout:10000,env:{...process.env,OPENROUTER_API_KEY:"not-a-real-key"},
 });
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/one-off diagnostic is retired/);
 assert.match(result.stderr,/fresh --mode generate --allow-spend/);
});
