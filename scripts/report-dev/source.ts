import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPwrp71SourceIntegrity, PWRP71_RELEASE_MANIFEST_PATH, PWRP71_RELEASE_MANIFEST_SHA256 } from "../../lib/server/reports/pwrp71-source.ts";

export function contentHash(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
export function canonical(value: unknown): string {
 if (value === undefined) return "null";
 if (value === null || typeof value !== "object") return JSON.stringify(value);
 if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
 const object = value as Record<string, unknown>;
 return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
export async function syncReportSource(root: string, change: "prose" | "interpretation" | "schema") {
 const base = path.join(root,"reporting"), manifestPath = path.join(root,PWRP71_RELEASE_MANIFEST_PATH);
 const sourcePath = path.join(root,"lib/server/reports/pwrp71-source.ts");
 const manifestText = await readFile(manifestPath,"utf8"), sourceText = await readFile(sourcePath,"utf8");
 if (contentHash(manifestText) !== PWRP71_RELEASE_MANIFEST_SHA256) throw new Error("Manifest and checked-in pin disagree. Reconcile that edit before generating a new binding.");
 const manifest = JSON.parse(manifestText) as {report_release:string;kind:string;content_binding:string;files:Record<string,string>};
 const paths = Object.keys(manifest.files).sort();
 if (!paths.length || manifest.kind !== "content_binding_not_approval") throw new Error("Unsupported source manifest.");
 const seen: string[] = [];
 async function walk(directory: string) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
   const absolute = path.join(directory,entry.name);
   if (entry.isSymbolicLink()) throw new Error("Active reporting source cannot contain symbolic links.");
   if (entry.isDirectory()) await walk(absolute);
   else if (entry.isFile()) seen.push(path.relative(base,absolute).replaceAll("\\","/"));
   else throw new Error("Active reporting source must contain regular files only.");
  }
 }
 await walk(base);
 const expected = [...paths,"contracts/report_release_manifest.json"].sort();
 if (canonical(seen.sort()) !== canonical(expected)) throw new Error("Source population changed. Review the explicit member allowlist separately; sync never adds or deletes members.");
 const files: Record<string,string> = {};
 for (const relative of paths) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/u).some(p => p === ".." || p === ".")) throw new Error("Unsafe manifest member.");
  const absolute = path.join(base,relative);
  if (!(await lstat(absolute)).isFile()) throw new Error("Manifest member is not a regular file.");
  files[relative] = contentHash(await readFile(absolute));
 }
 const changed = paths.filter(p => files[p] !== manifest.files[p]);
 if (change === "prose" && changed.some(p => !p.startsWith("prompts/"))) throw new Error("Prose classification may change prompt text only; choose interpretation or schema.");
 if (change !== "schema" && changed.some(p => p.startsWith("schemas/") || p.startsWith("implementation/"))) throw new Error("Schema or executable contract changes require --change schema.");
 if (!changed.length) return {changed, manifestSha256:PWRP71_RELEASE_MANIFEST_SHA256, operationalApproval:false};
 const replacement = `${JSON.stringify({...manifest,files,content_binding:contentHash(canonical(files))},null,2)}\n`;
 const digest = contentHash(replacement);
 const pinned = sourceText.replace(/(export const PWRP71_RELEASE_MANIFEST_SHA256 = ")[a-f0-9]{64}(" as const;)/u, `$1${digest}$2`);
 if (pinned === sourceText) throw new Error("Source pin declaration not found exactly.");
 const directory = path.join(root,".report-dev"); await mkdir(directory,{recursive:true,mode:0o700});
 const lock = path.join(directory,"source-sync.lock"); await mkdir(lock,{mode:0o700});
 try {
  await writeFile(`${manifestPath}.pending`,replacement,{flag:"wx",mode:0o600});
  await writeFile(`${sourcePath}.pending`,pinned,{flag:"wx",mode:0o600});
  // Keep the previous pair available until both replacements have succeeded.
  try { await rename(`${manifestPath}.pending`,manifestPath); await rename(`${sourcePath}.pending`,sourcePath); }
  catch (error) { await writeFile(manifestPath,manifestText); await writeFile(sourcePath,sourceText); throw error; }
  const receipt = {changeDeclared:change,changed,previousManifestSha256:PWRP71_RELEASE_MANIFEST_SHA256,manifestSha256:digest,contentBindingOnly:true,operationalApproval:false,routerChanged:false};
  await writeFile(path.join(directory,`source-change-${digest}.json`),JSON.stringify(receipt,null,2),{mode:0o600});
  return receipt;
 } finally {
  await rm(`${manifestPath}.pending`,{force:true}); await rm(`${sourcePath}.pending`,{force:true}); await rm(lock,{recursive:true,force:true});
 }
}
async function main() {
 const args = process.argv.slice(2), sync = args.includes("--sync"), declaration = args[args.indexOf("--change")+1];
 if (args.some((a,i) => !["--sync","--check","--change"].includes(a) && args[i-1] !== "--change")) throw new Error("Usage: npm run reports:source -- --check | --sync --change prose|interpretation|schema");
 if (sync) {
  if (!["prose","interpretation","schema"].includes(declaration)) throw new Error("Source sync requires an explicit change classification.");
  console.log(JSON.stringify(await syncReportSource(process.cwd(),declaration as "prose"|"interpretation"|"schema"),null,2));
 } else {
  const result = await verifyPwrp71SourceIntegrity(); console.log(JSON.stringify(result.ok ? {ok:true,manifestSha256:PWRP71_RELEASE_MANIFEST_SHA256,operationalApproval:false} : result,null,2));
  if (!result.ok) process.exitCode = 1;
 }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error instanceof Error ? error.message : "Source operation failed."); process.exitCode=1; });
