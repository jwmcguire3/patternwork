import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownPdf } from "../../lib/server/pdf/renderer.ts";

interface TextRun {text:string;font:string;size:number;x:number;baselineFromTop:number;color:readonly number[]}
/** Bounded inspection of this renderer's uncompressed PDFKit output, not a general PDF reader.
 * Read the flat page tree, core-font resource names, and emitted RGB/Tm/Tf/hex-TJ operators.
 * ASCII fixture tokens need no font encoding interpretation beyond their emitted hexadecimal bytes.
 */
function inspectPdf(bytes:Buffer):TextRun[][] {
 const source=bytes.toString("latin1");
 const objects=new Map(Array.from(source.matchAll(/^(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/gmu),match=>[Number(match[1]),match[2]]));
 const pageTree=[...objects.values()].find(body=>/\/Type \/Pages\b/u.test(body));assert.ok(pageTree);
 const kids=pageTree.match(/\/Kids \[([^\]]*)\]/u);assert.ok(kids);
 const pages=Array.from(kids[1].matchAll(/(\d+) 0 R/gu),match=>objects.get(Number(match[1]))!);
 return pages.map(page=>{
  assert.match(page,/\/Type \/Page\b/u);
  const content=page.match(/\/Contents (\d+) 0 R/u),resources=page.match(/\/Resources (\d+) 0 R/u);assert.ok(content);assert.ok(resources);
  const resourceBody=objects.get(Number(resources[1]))!;
  const fonts=new Map(Array.from(resourceBody.matchAll(/\/(F\d+) (\d+) 0 R/gu),match=>{
   const font=objects.get(Number(match[2]))!.match(/\/BaseFont \/([A-Za-z-]+)/u);assert.ok(font);return [match[1],font[1]];
  }));
  const contentBody=objects.get(Number(content[1]))!;assert.doesNotMatch(contentBody,/\/Filter\b/u);
  const stream=contentBody.match(/stream\r?\n([\s\S]*?)\r?\nendstream/u);assert.ok(stream);
  let color:readonly number[]=[0,0,0];const graphicsStack:(readonly number[])[]=[];const runs:TextRun[]=[];
  const lines=stream[1].split(/\r?\n/u);
  for(let index=0;index<lines.length;index++){
   const line=lines[index].trim();
   if(line==="q")graphicsStack.push(color);
   else if(line==="Q"){const restored=graphicsStack.pop();assert.ok(restored);color=restored;}
   else if(/^[\d.]+ [\d.]+ [\d.]+ scn$/u.test(line))color=line.split(" ").slice(0,3).map(Number);
   else if(line==="BT"){
    const block:string[]=[];while(++index<lines.length&&lines[index].trim()!=="ET")block.push(lines[index]);
    assert.ok(index<lines.length,"a text object must have its emitted ET terminator");
    const text=block.join("\n"),position=text.match(/^1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm$/mu),font=text.match(/^\/(F\d+) ([\d.]+) Tf$/mu);
    assert.ok(position);assert.ok(font);
    const glyphs=text.match(/\[([^\]]*)\] TJ/u);assert.ok(glyphs);
    const decoded=Array.from(glyphs[1].matchAll(/<([a-f\d]+)>/giu),match=>Buffer.from(match[1],"hex").toString("ascii")).join("");
    runs.push({text:decoded,font:fonts.get(font[1])!,size:Number(font[2]),x:Number(position[1]),baselineFromTop:792-Number(position[2]),color:[...color]});
   }
  }
  assert.equal(graphicsStack.length,0);return runs;
 });
}
const tokenList=Array.from({length:1800},(_,index)=>`token${String(index).padStart(4,"0")}`);
const longParagraph=tokenList.join(" ");
function isBody(run:TextRun){return /token\d{4}/u.test(run.text);}
function assertColor(actual:readonly number[],hex:string){
 const expected=Array.from(Buffer.from(hex,"hex"),value=>value/255);assert.equal(actual.length,3);
 actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<0.000001,`RGB ${actual.join(",")} must match ${hex}`));
}

test("one paragraph retains all tokens, font, size and color while it continues across actual PDF pages",async()=>{
 const rendered=await renderMarkdownPdf(longParagraph,"Pagination continuity");const pages=inspectPdf(rendered.bytes);
 assert.ok(pages.length>=3,"fixture must force automatic continuation within one text call");assert.equal(pages.length,rendered.layout.pageCount);
 const body=pages.flat().filter(isBody);
 assert.deepEqual(body.flatMap(run=>run.text.match(/token\d{4}/gu)??[]),tokenList,"every source token must occur once and in order");
 for(const [index,page]of pages.entries()){
  const bodyLines=page.filter(isBody);assert.ok(bodyLines.length,`page ${index+1} must contain paragraph text`);
  for(const run of bodyLines){assert.equal(run.font,"Helvetica");assert.equal(run.size,10.5,`continued paragraph on page ${index+1} must retain body size`);assertColor(run.color,"263442");assert.equal(run.x,58);assert.ok(run.baselineFromTop>=58&&run.baselineFromTop<=738);}
 }
});

test("deferred headers and footers occupy reserved margins without changing pagination or body geometry",async()=>{
 const rendered=await renderMarkdownPdf(longParagraph,"Pagination margins");const pages=inspectPdf(rendered.bytes);
 assert.equal(pages.length,rendered.layout.pageCount);assert.ok(rendered.layout.minimumRemainingPoints>=0);
 for(const [index,page]of pages.entries()){
  const headers=page.filter(run=>run.text==="PATTERNWORK"),footers=page.filter(run=>run.text===`${index+1} / ${pages.length}`);
  assert.equal(headers.length,1);assert.equal(footers.length,1);
  assert.equal(headers[0].size,8);assert.equal(footers[0].size,8);assert.ok(headers[0].baselineFromTop<58);
  assert.ok(footers[0].baselineFromTop>=760&&footers[0].baselineFromTop<792,"footer must be below the 738pt body region");
  assert.ok(footers[0].x>500&&footers[0].x<554,"footer stays right aligned within the side margin");
  const body=page.filter(isBody);assert.ok(body.length,"decoration must not append blank footer-only pages");
  assert.ok(Math.min(...body.map(run=>run.baselineFromTop))-headers[0].baselineFromTop>=20);
  assert.ok(footers[0].baselineFromTop-Math.max(...body.map(run=>run.baselineFromTop))>18,"last body baseline must clear footer text");
 }
 const title=pages[0].find(run=>run.text==="Pagination margins");assert.ok(title);assert.ok(title.baselineFromTop>=58,"title starts in the reserved body area");
});

test("a long quote preserves its italic body style through automatic page breaks",async()=>{
 const rendered=await renderMarkdownPdf(`> ${longParagraph}`,"Quote continuity");const pages=inspectPdf(rendered.bytes);assert.ok(pages.length>=3);
 assert.deepEqual(pages.flat().filter(isBody).flatMap(run=>run.text.match(/token\d{4}/gu)??[]),tokenList);
 for(const run of pages.flat().filter(isBody)){assert.equal(run.font,"Helvetica-Oblique");assert.equal(run.size,10.5);assertColor(run.color,"526273");}
});

test("a boundary heading stays with the opening lines of its following paragraph",async()=>{
 const filler=Array.from({length:38},(_,index)=>`Prefill line ${index+1}.`).join("\n");
 const rendered=await renderMarkdownPdf(`${filler}\n## A heading at the boundary\n\n${longParagraph}`,"Heading continuity");
 const pages=inspectPdf(rendered.bytes);
 const headingPage=pages.findIndex(page=>page.some(run=>run.text==="A heading at the boundary"));
 const openingPage=pages.findIndex(page=>page.some(run=>run.text.includes("token0000")));
 assert.ok(headingPage>=0);assert.equal(headingPage,openingPage,"a heading must share its page with its following paragraph");
 const openingLines=pages[headingPage].filter(isBody);assert.ok(openingLines.length>=2,"keep at least the first two lines of a long paragraph with its heading");
 assert.ok(pages.length>openingPage+1,"a long paragraph must still be able to continue onto later pages");
 assert.deepEqual(pages.flat().filter(isBody).flatMap(run=>run.text.match(/token\d{4}/gu)??[]),tokenList);
 assert.equal(pages.length,rendered.layout.pageCount);
 for(const [index,page]of pages.entries()){
  assert.ok(page.some(run=>run.size>8),"keeping a heading must not append an otherwise blank page");
  assert.equal(page.filter(run=>run.text===`${index+1} / ${pages.length}`).length,1);
 }
});
