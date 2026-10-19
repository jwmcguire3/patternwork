import assert from "node:assert/strict";
import test from "node:test";
import { probeReportPdfTools } from "../../lib/server/reports/preflight.ts";

test("explicit Python+pypdf text extraction does not require pdftotext",async()=>{
 const calls:{command:string;args:string[]}[]=[];
 const checks=await probeReportPdfTools({PDF_PYTHON_PATH:"configured-python",PDFTOTEXT_PATH:"absent-pdftotext",PDFINFO_PATH:"configured-info",PDFTOPPM_PATH:"configured-raster"},async(command,args)=>{
  calls.push({command,args});assert.notEqual(command,"absent-pdftotext");
 });
 assert.ok(checks.every(c=>c.ok));assert.deepEqual(calls[0],{command:"configured-python",args:["-c","from pypdf import PdfReader"]});
 assert.deepEqual(calls.slice(1).map(c=>c.command),["configured-info","configured-raster"]);
});
test("Python import failure remains a text-verifier failure with metadata and raster checks intact",async()=>{
 const checks=await probeReportPdfTools({PDF_PYTHON_PATH:"python-without-pypdf"},async(command)=>{if(command==="python-without-pypdf")throw new Error("missing module");});
 assert.equal(checks[0].ok,false);assert.match(checks[0].message,/pypdf/);assert.ok(checks.slice(1).every(c=>c.ok));
});
test("default text-verifier selection honors Poppler configuration when Python is not selected",async()=>{
 const calls:string[]=[];
 await probeReportPdfTools({PDFTOTEXT_PATH:"selected-pdftotext",PDF_PYTHON_PATH:" "},async(command,args)=>{calls.push(command);assert.deepEqual(args,["-v"]);});
 assert.deepEqual(calls,["selected-pdftotext","pdfinfo","pdftoppm"]);
});
