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
