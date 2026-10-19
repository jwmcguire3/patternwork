import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPwrp71AuthoredQuestionContext, PWRP71_QUESTION_CONTEXT_VERSION } from "../../lib/server/reports/pwrp71-question-context.ts";
import { loadPwqe51SourcePackage, type Pwqe51Question, type Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

function observation(question: Pwqe51Question, optionId?: string, variantId = "base", source?: Pwqe51SourcePackage): Record<string, unknown> {
  const variant = variantId === "base" ? undefined : source?.questionBank.variants.find((candidate) => candidate.id === variantId);
  const option = (variant?.options ?? question.options).find((candidate) => candidate.id === optionId) ?? (variant?.options ?? question.options)[0];
  if (!option) throw new Error(`No authored option for ${question.id}`);
  return {
    id: `O${question.id.padEnd(20, "0").slice(0, 20)}`,
    response_id: "opaque-response-lineage",
    administration_id: "opaque-administration-lineage",
    item_id: question.id,
    option_id: option.id,
    variant: variantId,
    text: option.text,
    reported_value: option.reported_value ?? option.text,
    source_version: question.version,
    capture: variant?.captures ?? question.captures,
    step_id: question.step_binding,
    occurrence_id: "pwep_11111111-2222-4333-8444-555555555555",
    person_id: "should-not-leave-this-function",
  };
}

function makePacket(source: Pwqe51SourcePackage, observations: Record<string, unknown>[]): JsonObject {
  return {
    release_id: source.questionBank.release,
    source_binding: {
      question_release: source.manifest.source_binding.question_release,
      runtime_version: source.manifest.source_binding.runtime_version,
      source_sha256: source.manifest.source_binding.source_sha256,
    },
    content_sha256: "a".repeat(64),
    episodes: [...new Set(observations.map(row => String(row.occurrence_id)))].map(id => ({ id, context: "work" })),
    observations,
  } as JsonObject;
}

const sourcePromise = loadPwqe51SourcePackage();

test("projects authored prompts and selected source text for D02, D04, D44 and conditional items", async () => {
  const source = await sourcePromise;
  const ids = ["D02", "D04", "D44", "M09", "M19", "D13"];
  const rows = ids.map((id) => observation(source.questionBank.items.find((question) => question.id === id)!, undefined, "base", source));
  const projected = buildPwrp71AuthoredQuestionContext(makePacket(source, rows), source) as Record<string, unknown>;
  assert.equal(projected.context_version, PWRP71_QUESTION_CONTEXT_VERSION);
  const contexts = projected.observations as Record<string, unknown>[];
  const byItem = new Map(contexts.map((context) => [context.item_id, context]));
  assert.match(String(byItem.get("D02")?.prompt), /What were you trying to change/u);
  assert.match(String(byItem.get("D04")?.prompt), /What actually let .* stop/u);
  assert.match(String(byItem.get("D44")?.prompt), /what had contact .* been like in similar situations/u);
  assert.equal(byItem.get("D44")?.authored_capture, "availability_history");
  assert.doesNotMatch(String(byItem.get("D44")?.prompt), /speech|access/u);
  assert.match(String(byItem.get("M09")?.prompt), /what did you expect would happen/u);
  assert.match(String(byItem.get("M19")?.prompt), /what changed first/u);
  assert.match(String(byItem.get("D13")?.prompt), /what concern came with not allowing yourself/u);
  assert.equal(byItem.get("D02")?.option_text, source.questionBank.items.find((question) => question.id === "D02")!.options[0].text);
});

test("uses authored variant prompt and options, with the router's base-prompt fallback", async () => {
  const source = await sourcePromise;
  const question = source.questionBank.items.find((row) => row.id === "M10")!;
  const variant = source.questionBank.variants.find((row) => row.id === "M10.observable")!;
  const selected = observation(question, variant.options[0].id, variant.id, source);
  const projected = buildPwrp71AuthoredQuestionContext(makePacket(source, [selected]), source);
  const context = (projected.observations as Record<string, unknown>[])[0];
  assert.equal(context.variant, variant.id);
  assert.equal(context.prompt, variant.prompt);
  assert.equal(context.option_id, variant.options[0].id);
  assert.equal(context.option_text, variant.options[0].text);

  const fallback = structuredClone(source) as unknown as { questionBank: { variants: Record<string, unknown>[] } } & Pwqe51SourcePackage;
  const fallbackVariant = fallback.questionBank.variants.find((row) => row.id === variant.id)!;
  delete fallbackVariant.prompt;
  const fallbackContext = buildPwrp71AuthoredQuestionContext(makePacket(fallback, [selected]), fallback);
  assert.equal((fallbackContext.observations as Record<string, unknown>[])[0].prompt, question.prompt);
});

test("fails closed on packet/source binding, variant, and observation meaning mismatches", async () => {
  const source = await sourcePromise;
  const question = source.questionBank.items.find((row) => row.id === "D02")!;
  const good = observation(question, undefined, "base", source);
  const packet = makePacket(source, [good]);
  const badPacket = structuredClone(packet) as Record<string, unknown>;
  (badPacket.source_binding as Record<string, unknown>).source_sha256 = "0".repeat(64);
  assert.throws(() => buildPwrp71AuthoredQuestionContext(badPacket as JsonObject, source));
  assert.throws(() => buildPwrp71AuthoredQuestionContext(packet, { ...source, sourceManifestSha256: "0".repeat(64) } as Pwqe51SourcePackage));

  for (const field of ["item_id", "variant", "option_id", "text", "reported_value", "source_version", "capture"] as const) {
    const altered = { ...good, [field]: field === "item_id" ? "D04" : "wrong" };
    assert.throws(() => buildPwrp71AuthoredQuestionContext(makePacket(source, [altered]), source), field);
  }
  const wrongVariant = { ...good, variant: "M10.observable" };
  assert.throws(() => buildPwrp71AuthoredQuestionContext(makePacket(source, [wrongVariant]), source));
});

test("returns only authored context and opaque evidence IDs, without respondent or answer extras", async () => {
  const source = await sourcePromise;
  const question = source.questionBank.items.find((row) => row.id === "D44")!;
  const result = buildPwrp71AuthoredQuestionContext(makePacket(source, [observation(question, undefined, "base", source)]), source) as Record<string, unknown>;
  const projected = (result.observations as Record<string, unknown>[])[0];
  assert.deepEqual(Object.keys(projected).sort(), ["authored_capture", "capture", "context", "episode_family", "evidence_id", "is_response_control", "item_id", "occurrence_id", "option_id", "option_text", "prompt", "step_binding", "step_id", "variant"].sort());
  assert.equal(projected.evidence_id, "OD4400000000000000000");
  assert.equal(Object.hasOwn(projected, "response_id"), false);
  assert.equal(Object.hasOwn(projected, "person_id"), false);
  assert.equal(projected.occurrence_id, "pwep_11111111-2222-4333-8444-555555555555");
  assert.equal(projected.is_response_control, false);
  assert.equal(Object.hasOwn(result, "respondent"), false);
});

test("supports a common response control only when authored for that question", async () => {
  const source = await sourcePromise;
  const question = source.questionBank.items.find((row) => row.id === "D02")!;
  const controlId = question.response_controls[0];
  const control = source.questionBank.common_response_controls.find((row) => row.id === controlId)!;
  const controlObservation = { ...observation(question, undefined, "base", source), option_id: control.id, text: control.text, reported_value: control.text };
  const projected = buildPwrp71AuthoredQuestionContext(makePacket(source, [controlObservation]), source);
  assert.equal((projected.observations as Record<string, unknown>[])[0].option_text, control.text);
});

test("D02-only binding guidance preserves other explicitly referential authored follow-ups", async () => {
  const source = await sourcePromise;
  const selected = [["M02", "M02.feedback"], ["M03", "M03.approval"], ["M17", "M17.send"], ["D43", "D43.notice"]].map(([id, option]) => observation(source.questionBank.items.find(q => q.id === id)!, option, "base", source));
  for (const row of selected.slice(2)) row.occurrence_id = "pwep_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const packet = makePacket(source, selected), before = structuredClone(packet);
  const result = buildPwrp71AuthoredQuestionContext(packet, source);
  assert.equal(result.context_version, "pwrp71-authored-question-context-v5");
  assert.deepEqual(result.response_aim_bindings, [], "other explicit referents need no fabricated D02 entries");
  const contexts = result.observations as Record<string, unknown>[];
  const byItem = new Map(contexts.map(row => [row.item_id, row]));
  assert.match(String(byItem.get("M03")?.prompt), /with that preparation/u);
  assert.equal(byItem.get("M03")?.option_text, "Get a sign that it was good enough.");
  assert.equal(byItem.get("M02")?.option_text, "I asked someone else to look it over.");
  assert.match(String(byItem.get("D43")?.prompt), /hoping \{contact_response_label\} would change/u);
  assert.equal(byItem.get("D43")?.option_text, "I wanted them to notice that I was affected.");
  assert.equal(byItem.get("M17")?.option_text, "I sent another message.");
  for (const [aim, action] of [["M03", "M02"], ["D43", "M17"]]) {
    assert.equal(byItem.get(aim)?.occurrence_id, byItem.get(action)?.occurrence_id);
    assert.equal(byItem.get(aim)?.step_id, byItem.get(action)?.step_id);
  }
  const rule = String(result.response_aim_binding_rule);
  assert.match(rule, /For D02 entries, only resolved_single with answer_kind stated_aim/u);
  assert.match(rule, /M03 asks about M02's preparation or leaving it alone/u);
  assert.match(rule, /D43's contact_response_label refers to the reported M17 response/u);
  assert.match(rule, /absence from the D02-only array does not make those links unspecified/u);
  assert.deepEqual(packet, before, "context construction does not rewrite source evidence");
});

test("D02 still resolves only one exact-step substantive response", async () => {
  const source = await sourcePromise;
  const action = observation(source.questionBank.items.find(q => q.id === "M02")!, "M02.feedback", "base", source);
  const aim = { ...observation(source.questionBank.items.find(q => q.id === "D02")!, "D02.prevent", "base", source), step_id: "first" };
  const bindings = (rows: Record<string, unknown>[]) => buildPwrp71AuthoredQuestionContext(makePacket(source, rows), source).response_aim_bindings as JsonObject[];
  const resolved = bindings([action, aim])[0];
  assert.equal(resolved.binding_status, "resolved_single");
  assert.equal(resolved.answer_kind, "stated_aim");
  assert.deepEqual((resolved.response_observations as JsonObject[]).map(row => row.evidence_id), [action.id]);
  for (const changed of [{ ...action, step_id: "next" }, { ...action, occurrence_id: "pwep_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }]) {
    const unbound = bindings([changed, aim])[0];
    assert.equal(unbound.binding_status, "unbound");
    assert.deepEqual(unbound.response_observations, []);
  }
  const secondAction = { ...observation(source.questionBank.items.find(q => q.id === "M02")!, "M02.recheck", "base", source), id: "Osecond-action" };
  const ambiguous = bindings([action, secondAction, aim])[0];
  assert.equal(ambiguous.binding_status, "ambiguous");
  assert.equal((ambiguous.response_observations as JsonObject[]).length, 2);
});

test("D02 response controls and no-aim answers do not become positive aim bindings", async () => {
  const source = await sourcePromise;
  const actionQuestion = source.questionBank.items.find(q => q.id === "M02")!;
  const aimQuestion = source.questionBank.items.find(q => q.id === "D02")!;
  const action = observation(actionQuestion, "M02.feedback", "base", source);
  const noAim = { ...observation(aimQuestion, "D02.none", "base", source), step_id: "first" };
  const control = source.questionBank.common_response_controls.find(c => aimQuestion.response_controls.includes(c.id))!;
  const controlledAim = { ...noAim, option_id: control.id, text: control.text, reported_value: control.text };
  for (const [aim, kind] of [[noAim, "no_particular_aim"], [controlledAim, "response_control"]] as const) {
    const result = buildPwrp71AuthoredQuestionContext(makePacket(source, [action, aim]), source);
    const binding = (result.response_aim_bindings as JsonObject[])[0];
    assert.equal(binding.binding_status, "resolved_single");
    assert.equal(binding.answer_kind, kind, "resolution alone never turns a non-aim answer into stated_aim");
  }
  const actionControl = source.questionBank.common_response_controls.find(c => actionQuestion.response_controls.includes(c.id))!;
  const controlledAction = { ...action, option_id: actionControl.id, text: actionControl.text, reported_value: actionControl.text };
  const result = buildPwrp71AuthoredQuestionContext(makePacket(source, [controlledAction, { ...noAim, ...observation(aimQuestion, "D02.prevent", "base", source), step_id: "first" }]), source);
  const binding = (result.response_aim_bindings as JsonObject[])[0];
  assert.equal(binding.binding_status, "unbound");
  assert.deepEqual(binding.response_observations, []);
});

test("other authored referents retain step, ambiguity, and limited-answer boundaries", async () => {
  const source = await sourcePromise;
  const selected = [["M02", "M02.none"], ["M03", "M03.no_aim"], ["M17", "M17.send"], ["D43", "D43.automatic"]].map(([id, option]) => observation(source.questionBank.items.find(q => q.id === id)!, option, "base", source));
  selected[0].step_id = "next";
  selected[2].occurrence_id = "pwep_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const result = buildPwrp71AuthoredQuestionContext(makePacket(source, selected), source);
  const contexts = result.observations as JsonObject[];
  assert.equal(contexts.find(row => row.item_id === "M02")?.step_id, "next");
  assert.equal(contexts.find(row => row.item_id === "M03")?.step_id, "first");
  assert.equal(contexts.find(row => row.item_id === "M03")?.option_text, "I was not aiming for anything beyond the task.");
  assert.equal(contexts.find(row => row.item_id === "D43")?.option_text, "It was more automatic than purposeful.");
  assert.deepEqual(result.response_aim_bindings, [], "the context does not manufacture a link across steps or occurrences");
  const rule = String(result.response_aim_binding_rule);
  assert.match(rule, /exact current occurrence and step/u);
  assert.match(rule, /Do not choose an action from an ambiguous referent/u);
  assert.match(rule, /borrow a response from another step or occurrence/u);
  assert.match(rule, /without a substantive selected answer/u);
  assert.match(rule, /Preserve task-limited, automatic, no-aim, and response-control answers at their stated strength/u);
});

test("other authored follow-up controls remain controls rather than positive aims", async () => {
  const source = await sourcePromise;
  for (const itemId of ["M03", "D43"]) {
    const question = source.questionBank.items.find(q => q.id === itemId)!;
    const control = source.questionBank.common_response_controls.find(c => question.response_controls.includes(c.id))!;
    const selected = { ...observation(question, undefined, "base", source), option_id: control.id, text: control.text, reported_value: control.text };
    const result = buildPwrp71AuthoredQuestionContext(makePacket(source, [selected]), source);
    assert.equal((result.observations as JsonObject[])[0].is_response_control, true);
    assert.equal((result.observations as JsonObject[])[0].option_text, control.text);
    assert.deepEqual(result.response_aim_bindings, []);
  }
});

test("ambiguous non-D02 referents remain visible without choosing or distributing an aim", async () => {
  const source = await sourcePromise;
  const actionQuestion = source.questionBank.items.find(q => q.id === "M17")!;
  const aimQuestion = source.questionBank.items.find(q => q.id === "D43")!;
  const first = observation(actionQuestion, "M17.send", "base", source);
  const second = { ...observation(actionQuestion, "M17.reread", "base", source), id: "Osecond-contact-action" };
  const aim = observation(aimQuestion, "D43.notice", "base", source);
  const result = buildPwrp71AuthoredQuestionContext(makePacket(source, [first, second, aim]), source);
  assert.deepEqual((result.observations as JsonObject[]).filter(row => row.item_id === "M17").map(row => row.evidence_id), [first.id, second.id]);
  assert.deepEqual(result.response_aim_bindings, [], "no automatic single-action assignment or distribution is introduced");
  assert.match(String(result.response_aim_binding_rule), /Do not choose an action from an ambiguous referent/u);
});

test("visible source wording distinguishes a future-change answer from explicit preventive effort", async () => {
  const source = await sourcePromise;
  const actionQuestion = source.questionBank.items.find(q => q.id === "M11")!;
  const aimQuestion = source.questionBank.items.find(q => q.id === "D02")!;
  const effectQuestion = source.questionBank.items.find(q => q.id === "M06")!;
  const action = observation(actionQuestion, "M11.help", "base", source);
  const aim: JsonObject = { ...observation(aimQuestion, "D02.prevent", "base", source), step_id: "first" };
  const effort = { ...observation(effectQuestion, "M06.prevent", "base", source), occurrence_id: "pwep_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
  const packet = makePacket(source, [action, aim, effort]), before = structuredClone(packet);
  const result = buildPwrp71AuthoredQuestionContext(packet, source);
  const contexts = result.observations as JsonObject[];
  assert.equal(aim.reported_value, "prevent", "symbolic source codes remain unchanged");
  assert.ok(aimQuestion.options.find(o => o.id === "D02.prevent")?.candidate_signals?.includes("prevention_aim"));
  assert.equal(contexts.find(row => row.item_id === "D02")?.option_text, "What might happen next.");
  assert.match(String(contexts.find(row => row.item_id === "D02")?.prompt), /trying to change/u);
  assert.equal(contexts.find(row => row.item_id === "M06")?.option_text, "I worked harder to prevent another one.");
  const binding = (result.response_aim_bindings as JsonObject[])[0];
  assert.equal(binding.aim_option_id, "D02.prevent");
  assert.equal(binding.aim_option_text, "What might happen next.");
  assert.equal(binding.binding_status, "resolved_single");
  assert.equal(binding.answer_kind, "stated_aim", "the broad aim stays linked to the exact action without being upgraded to prevention");
  const rule = String(result.interpretation_rule);
  assert.match(rule, /visible authored question and selected option text govern/u);
  assert.match(rule, /not explicit prevention by itself, despite the D02.prevent ID/u);
  assert.match(rule, /A preventive interpretation needs additional evidence and its proper claim kind and scope/u);
  assert.match(rule, /explicitly reports preventive effort in that mistake account; preserve it/u);
  assert.deepEqual(packet, before);
});

test("authored first and later effect referents survive unordered observation projection", async () => {
  const source = await sourcePromise;
  const selections = [["M14", "M14.brief"], ["M12", "M12.function"], ["M13", "M13.company"], ["M11", "M11.help"]];
  const selected = selections.map(([id, option]) => observation(source.questionBank.items.find(q => q.id === id)!, option, "base", source));
  const result = buildPwrp71AuthoredQuestionContext(makePacket(source, selected), source);
  const contexts = result.observations as JsonObject[];
  assert.deepEqual(contexts.map(row => row.item_id), selections.map(([id]) => id), "projection order is source order, not asserted chronology");
  const byItem = new Map(contexts.map(row => [row.item_id, row]));
  assert.match(String(byItem.get("M12")?.prompt), /Right after that first response/u);
  assert.equal(byItem.get("M12")?.step_id, "first");
  assert.equal(byItem.get("M12")?.option_text, "I could carry on, but did not feel better.");
  assert.match(String(byItem.get("M13")?.prompt), /Later that day/u);
  assert.equal(byItem.get("M13")?.step_id, "later");
  assert.equal(byItem.get("M13")?.option_text, "I spent time with someone I wanted to be with.");
  assert.match(String(byItem.get("M14")?.prompt), /After that later attempt/u);
  assert.equal(byItem.get("M14")?.step_id, "later");
  assert.equal(byItem.get("M14")?.option_text, "I got a break, but it faded when I stopped.");
  const rule = String(result.interpretation_rule);
  assert.match(rule, /Keep each outcome with its own response and stage in claims and readable prose/u);
  assert.match(rule, /Do not flatten these into one undifferentiated effect/u);
  assert.match(rule, /do not license an order among unordered selections, a causal mechanism, a handoff between parts/u);
  assert.match(rule, /preserve supported meanings and restore their correct referents rather than deleting the distinctions/u);
});
