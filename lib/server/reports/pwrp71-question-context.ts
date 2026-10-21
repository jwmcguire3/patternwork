import type { JsonObject } from "../../question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256, type Pwqe51Question, type Pwqe51QuestionVariant, type Pwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";

export const PWRP71_QUESTION_CONTEXT_VERSION = "pwrp71-authored-question-context-v7" as const;

const contextError = "Authored question context is unavailable for this evidence packet.";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) && value.every((row) => object(row) !== undefined) ? value as Record<string, unknown>[] : [];
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.length > 0; }

function assertSourceBinding(packet: Record<string, unknown>, source: Pwqe51SourcePackage): Record<string, string> {
  const binding = object(source.manifest.source_binding);
  const packetBinding = object(packet.source_binding);
  if (source.sourceManifestSha256 !== PWQE51_SOURCE_MANIFEST_SHA256
    || source.questionBank.release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || !binding || !packetBinding
    || binding.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || binding.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || binding.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || packet.release_id !== PWQE51_RELEASE_IDENTITY.questionRelease
    || packetBinding.question_release !== binding.question_release
    || packetBinding.runtime_version !== binding.runtime_version
    || packetBinding.source_sha256 !== binding.source_sha256
    || !nonempty(packet.content_sha256)) throw new Error(contextError);
  return {
    question_release: binding.question_release as string,
    runtime_version: binding.runtime_version as string,
    source_sha256: binding.source_sha256 as string,
  };
}

function authoredText(question: Pwqe51Question, variant: Pwqe51QuestionVariant | undefined): string {
  return variant?.prompt ?? question.prompt;
}

export function buildPwrp71AuthoredQuestionContext(packetValue: JsonObject, source: Pwqe51SourcePackage): JsonObject {
  const packet = object(packetValue);
  if (!packet) throw new Error(contextError);
  const sourceBinding = assertSourceBinding(packet, source);
  const observations = rows(packet.observations);
  if (!Array.isArray(packet.observations) || observations.length !== packet.observations.length || observations.length === 0) throw new Error(contextError);
  const episodes = rows(packet.episodes);
  if (!Array.isArray(packet.episodes) || episodes.length !== packet.episodes.length || episodes.length === 0) throw new Error(contextError);
  const episodeById = new Map<string, Record<string, unknown>>();
  for (const episode of episodes) {
    if (!nonempty(episode.id) || !nonempty(episode.context) || episodeById.has(episode.id)) throw new Error(contextError);
    episodeById.set(episode.id, episode);
  }

  const questions = new Map<string, Pwqe51Question>();
  for (const question of source.questionBank.items) {
    if (!nonempty(question.id) || questions.has(question.id)) throw new Error(contextError);
    questions.set(question.id, question);
  }
  const variants = new Map<string, Pwqe51QuestionVariant>();
  for (const variant of source.questionBank.variants) {
    if (!nonempty(variant.id) || variants.has(variant.id)) throw new Error(contextError);
    variants.set(variant.id, variant);
  }
  const commonControls = new Map(source.questionBank.common_response_controls.map((control) => [control.id, control.text]));
  const seenObservationIds = new Set<string>();
  const projected = observations.map((observation) => {
    const id = observation.id;
    const itemId = observation.item_id;
    const optionId = observation.option_id;
    const variantId = observation.variant;
    if (!nonempty(id) || seenObservationIds.has(id) || !nonempty(itemId) || !nonempty(optionId) || !nonempty(variantId)) throw new Error(contextError);
    seenObservationIds.add(id);

    const question = questions.get(itemId);
    if (!question) throw new Error(contextError);
    const variant = variantId === "base" ? undefined : variants.get(variantId);
    if (variantId !== "base" && (!variant || variant.replaces !== question.id)) throw new Error(contextError);
    const options = variant?.options ?? question.options;
    const selectedOption = options.find((option) => option.id === optionId);
    const controlText = commonControls.get(optionId);
    const selectedText = selectedOption?.text ?? (question.response_controls.includes(optionId) ? controlText : undefined);
    const expectedReportedValue = selectedOption ? selectedOption.reported_value ?? selectedOption.text : selectedText;
    const authoredCapture = variant?.captures ?? question.captures;

    if (!selectedText || !nonempty(question.context) || !nonempty(question.episode_family)
      || !nonempty(question.step_binding) || !nonempty(authoredCapture) || !nonempty(authoredText(question, variant))
      || observation.text !== selectedText || observation.reported_value !== expectedReportedValue
      || observation.source_version !== question.version || observation.capture !== authoredCapture
      || !nonempty(observation.step_id) || !nonempty(observation.occurrence_id)
      || !episodeById.has(observation.occurrence_id)) throw new Error(contextError);

    return {
      evidence_id: id,
      item_id: question.id,
      variant: variantId,
      context: question.context,
      episode_family: question.episode_family,
      capture: observation.capture as string,
      authored_capture: authoredCapture,
      step_id: observation.step_id as string,
      occurrence_id: observation.occurrence_id as string,
      step_binding: question.step_binding,
      prompt: authoredText(question, variant),
      option_id: optionId,
      option_text: selectedText,
      is_response_control: selectedOption === undefined,
    };
  });

  // Same capture set as the live renderer. Reporting requires an exact step match;
  // it must never use the renderer's occurrence-wide fallback as proof of a link.
  const actionCaptures = new Set(["first_action", "next_action", "later_action", "during_action", "self_response"]);
  const responseAimBindings = projected.filter(row => row.item_id === "D02").map(aim => {
    const actions = projected.filter(row => row.occurrence_id === aim.occurrence_id && row.step_id === aim.step_id
      && actionCaptures.has(row.capture) && !row.is_response_control);
    return {
      question_evidence_id: aim.evidence_id,
      item_id: aim.item_id,
      occurrence_id: aim.occurrence_id,
      episode_context: episodeById.get(aim.occurrence_id)!.context as string,
      step_id: aim.step_id,
      binding_status: actions.length === 1 ? "resolved_single" : actions.length === 0 ? "unbound" : "ambiguous",
      authored_prompt_template: aim.prompt,
      answer_kind: aim.is_response_control ? "response_control" : aim.option_id === "D02.none" ? "no_particular_aim" : "stated_aim",
      aim_option_id: aim.option_id,
      aim_option_text: aim.option_text,
      response_observations: actions.map(action => ({
        evidence_id: action.evidence_id, item_id: action.item_id, capture: action.capture,
        option_id: action.option_id, option_text: action.option_text,
      })),
    };
  });

  return {
    context_version: PWRP71_QUESTION_CONTEXT_VERSION,
    interpretation_rule: [
      "Treat the full authored question, selected variant, and selected option as the source facts: preserve their conditions, exact answer meaning, timing, referent, and any explicit response-to-aim link. Join each evidence_id to its observation's occurrence and step. Citation and referent limits govern what a claim can assert; they do not require routine caveats in reader prose. State a supported present-day formulation directly when converging observations warrant it, and identify it as interpretation in the claim record. The question supplies context for the answer, not another respondent answer or proof of an unstated cause or outcome.",
      "Use authored question and option text to establish what was reported. IDs, reported_value codes, capture names, and candidate signals help locate evidence but cannot strengthen its meaning. D02 asks what the person was trying to change: 'What might happen next' reports a future-facing change aim; the D02.prevent ID alone does not make it an explicit prevention aim. A preventive formulation can draw on additional current evidence under the shared interpretation and scope rules. M06's 'I worked harder to prevent another one' does explicitly report preventive effort in that mistake account. Preserve both distinctions in formulation and repair.",
      "Keep the authored temporal referents for M12, M13, and M14: M12 reports experience right after the first response in M11; M13 introduces a later attempt to get room back; M14 reports experience after that later attempt in M13. Keep each outcome attached to its response and stage. These links preserve the source's actual timing without creating an order among unordered selections, a causal mechanism, a handoff, or a sequence from list order or shared occurrence. In repair, restore the supported referent and distinction.",
      "A reported outcome supports that experience at its stated time. It establishes completion of an intended action, receipt of requested support, or an effect caused by the response only when the authored question and selected answer report that fact.",
      "When materially useful, compare explicitly reported conditions that let responses stop across sampled situations. Use each condition's actual meaning and referent; the comparison can clarify a pattern without requiring a common identity, complete sequence, shared motive, or mechanism. Labels, response controls, and reports that a response did not stop do not provide a shared positive stopping condition.",
    ].join(" "),
    response_aim_binding_rule: "response_aim_bindings contains D02 links only; it does not enumerate every authored response-to-aim link or add an answer. For D02, resolved_single with answer_kind stated_aim links the selected intended change to that exact-step response. Preserve that reported aim as part of the formulation; it is not an outcome or the aim of another step. Role and relationship interpretations follow the shared warrant rules, including timing and practical circumstances. A response control states no positive aim, and no_particular_aim reports no particular intended change. For ambiguous or unbound D02 entries, retain the unresolved link rather than distributing the aim across candidates. Other authored links remain explicit: M03 asks about M02's preparation or leaving it alone, and D43's contact_response_label refers to the reported M17 response. Preserve each link using its full question and answer at the exact current occurrence and step; its absence from the D02-only array does not make it unspecified. Do not choose an action from an ambiguous referent, borrow a response from another step or occurrence, or infer a purpose from a question template without a substantive selected answer. Preserve task-limited, automatic, no-aim, and response-control answers at their stated strength; they do not supply an extra positive motive. Keep unresolved source links in the claim record unless they materially change the reader's interpretation.",
    source_manifest_sha256: source.sourceManifestSha256,
    source_binding: sourceBinding,
    question_release: source.questionBank.release,
    packet_content_sha256: packet.content_sha256 as string,
    observations: projected,
    response_aim_bindings: responseAimBindings,
  } as JsonObject;
}
