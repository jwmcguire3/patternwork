import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePwqe51Route, type Pwqe51CanonicalResponse, type Pwqe51RouterInput } from "../../lib/server/assessment/pwqe51-router.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";

async function main(): Promise<void> {
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const json = async (file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const py = spawnSync(process.env.PYTHON ?? "python", ["-B", path.join(here, "collect.py")], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
if (py.status !== 0) throw new Error(`Python replay collector failed (${py.status}): ${py.stderr || py.stdout}`);
const independent = JSON.parse(py.stdout) as { plans: any[]; legacy_profile_ids: string[]; coverage_ids: string[] };
const [worked, coverage, source] = await Promise.all([
  json("specs/patternwork/question-engine-v5/examples/worked_paths.json"),
  json("specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json"),
  loadPwqe51SourcePackage(root),
]);
const pyById = new Map(independent.plans.map((p) => [p.id, p]));
function routeReplay(replay: any): ReturnType<typeof compilePwqe51Route> {
  const config = replay?.config ?? {};
  const pairMap = new Map<string, [string, string]>();
  for (const episode of replay?.episodes ?? []) for (const prior of episode.distinct_from ?? []) {
    const pair = [prior, episode.id].sort() as [string, string];
    pairMap.set(pair.join("\u0000"), pair);
  }
  const distinctPairs = [...pairMap.values()];
  const comparisonIdsByResponseId = Object.fromEntries(Object.entries(replay?.comparison_ids_by_response_id ?? {})) as NonNullable<Pwqe51RouterInput["comparisonIdsByResponseId"]>;
  const responses = (replay?.canonical_responses ?? []).map(({ comparisonIds: _comparisonIds, ...response }: any) => response);
  const input: Pwqe51RouterInput = {
    phase: "deepening", responses, comparisonIdsByResponseId,
    // PW Python focus_topics name authored entry points; TS models those as
    // explicit topic opt-ins alongside its ordinary topic preferences.
    optedInTopics: [...new Set([...(config.topics ?? []), ...(config.focus_topics ?? [])])], details: config.details ?? [],
    focusOccurrences: replay?.focus_occurrences ?? [], contextFacts: replay?.context_facts ?? [],
    // Forward state from the independent replay. C relations may be synthesized
    // from unused answer queues and are not fixture-authored distinctness.
    distinctPairs,
  };
  return compilePwqe51Route(input, source);
}

function compareProjection(python: any, ts: ReturnType<typeof compilePwqe51Route>): any {
  const pyObs = new Set<string>((python?.observations ?? []).map((o: any) => `${o.item_id}|${o.occurrence_id}|${o.step_id}|${o.option_id}`));
  const tsObs = new Set<string>(ts.observations.map((o) => `${o.itemId}|${o.occurrenceId}|${o.stepId}|${o.optionId}`));
  const pyMissing = new Set<string>((python?.missingness ?? []).map((m: any) => `${m.item_id}|${m.occurrence_id}|${m.status}`));
  const tsMissing = new Set<string>(ts.missingness.map((m) => `${m.questionId}|${m.occurrenceId}|${m.status}`));
  const targetKey = (t: any) => `${t.target_id ?? t.targetId}|${t.occurrence_id ?? t.occurrenceId}|${t.step_id ?? t.stepId}`;
  const pyTargets = new Map<string, string>((python?.targets ?? []).map((t: any) => [targetKey(t), t.state]));
  const tsTargets = new Map<string, string>(ts.targets.map((t) => [targetKey(t), t.state]));
  const pySteps = new Set<string>((python?.steps ?? []).map((s: any) => `${s.occurrence_id}|${s.step_id}`));
  const tsSteps = new Set<string>(ts.steps.map((s) => `${s.occurrenceId}|${s.id.split(":").slice(1).join(":")}`));
  const edgeKey = (e: any) => `${e.occurrence_id ?? e.occurrenceId}|${e.from_step ?? e.fromStep}|${e.to_step ?? e.toStep}|${e.relation}`;
  const pyEdges = new Set<string>((python?.sequence_edges ?? []).map(edgeKey));
  const tsEdges = new Set<string>(ts.sequenceEdges.map(edgeKey));
  const canonicalPair = (a: string, b: string) => [a, b].sort().join("|");
  const pyDistinctPairs: string[] = [...new Set<string>((python?.episodes ?? []).flatMap((episode: any) => (episode.distinct_from ?? []).map((prior: string) => canonicalPair(prior, episode.id))))];
  const tsDistinctPairs: string[] = [...new Set<string>(ts.episodes.flatMap((episode) => (episode.distinctFrom ?? []).map((prior) => canonicalPair(prior, episode.id))))];
  const pyEpisodes = new Map<string, any>((python?.episodes ?? []).map((episode: any) => [episode.id, episode]));
  const tsEpisodes = new Map<string, any>(ts.episodes.map((episode) => [episode.id, episode]));
  const episodeIds = new Set([...pyEpisodes.keys(), ...tsEpisodes.keys()]);
  const episodeMismatches = [...episodeIds].flatMap((id) => {
    const py = pyEpisodes.get(id); const route = tsEpisodes.get(id);
    if (!py || !route) return [{ id, python: py ?? null, typescript: route ?? null }];
    const differing = ["basis", "context", "family"].filter((field) => py[field] !== route[field]);
    return differing.length ? [{ id, fields: differing, python: py, typescript: route }] : [];
  });
  const distinctnessMismatches = pyDistinctPairs.filter((pair) => !tsDistinctPairs.includes(pair))
    .concat(tsDistinctPairs.filter((pair) => !pyDistinctPairs.includes(pair)));
  const keys = new Set([...pyTargets.keys(), ...tsTargets.keys()]);
  const targetStateMismatches = [...keys].filter((key) => pyTargets.get(key) !== tsTargets.get(key));
  return {
    python_observations: pyObs.size, typescript_observations: tsObs.size,
    observation_missing_from_typescript: [...pyObs].filter((key) => !tsObs.has(key)),
    observation_extra_in_typescript: [...tsObs].filter((key) => !pyObs.has(key)),
    python_missingness: pyMissing.size, typescript_missingness: tsMissing.size,
    missingness_missing_from_typescript: [...pyMissing].filter((key) => !tsMissing.has(key)),
    missingness_extra_in_typescript: [...tsMissing].filter((key) => !pyMissing.has(key)),
    python_steps: pySteps.size, typescript_steps: tsSteps.size,
    steps_missing_from_typescript: [...pySteps].filter((key) => !tsSteps.has(key)),
    steps_extra_in_typescript: [...tsSteps].filter((key) => !pySteps.has(key)),
    python_sequence_edges: pyEdges.size, typescript_sequence_edges: tsEdges.size,
    sequence_edges_missing_from_typescript: [...pyEdges].filter((key) => !tsEdges.has(key)),
    sequence_edges_extra_in_typescript: [...tsEdges].filter((key) => !pyEdges.has(key)),
    python_target_instances: pyTargets.size, typescript_target_instances: tsTargets.size,
    target_state_mismatches: targetStateMismatches.map((key) => ({ key, python: pyTargets.get(key) ?? null, typescript: tsTargets.get(key) ?? null })),
    projection_mismatch_count: [...pyObs].filter((key) => !tsObs.has(key)).length + [...tsObs].filter((key) => !pyObs.has(key)).length
      + [...pyMissing].filter((key) => !tsMissing.has(key)).length + [...tsMissing].filter((key) => !pyMissing.has(key)).length
      + [...pySteps].filter((key) => !tsSteps.has(key)).length + [...tsSteps].filter((key) => !pySteps.has(key)).length
      + [...pyEdges].filter((key) => !tsEdges.has(key)).length + [...tsEdges].filter((key) => !pyEdges.has(key)).length
      + distinctnessMismatches.length + episodeMismatches.length + targetStateMismatches.length,
    typescript_final_candidate_items: [...new Set(ts.candidates.map((candidate) => candidate.questionId))].sort(),
    python_trace_candidate_items: python?.trace_candidate_items ?? [],
    python_distinct_pair_count: pyDistinctPairs.length,
    typescript_distinct_pair_count: tsDistinctPairs.length,
    distinctness_forwarded: true,
    distinctness_mismatch: distinctnessMismatches,
    python_episodes: pyEpisodes.size, typescript_episodes: tsEpisodes.size,
    episode_mismatches: episodeMismatches,
    synthetic_binding_count: python?.synthetic_binding_count ?? 0,
  };
}

const report: any[] = [];
for (const profile of worked.profiles) {
  const pyPlan = pyById.get(profile.id);
  try {
    const ts = routeReplay(pyPlan);
    report.push({
      id: profile.id, kind: "P", python_replay_ok: pyPlan?.ok ?? false,
      python_asked_count: pyPlan?.asked_items?.length ?? 0,
      python_synthetic_binding_count: pyPlan?.synthetic_binding_count ?? 0,
      parity: "cross-engine projection on identical canonical Python replay rows and replay controls; candidate walk is not compared step by step",
      projection: compareProjection(pyPlan, ts),
    });
  } catch (error) {
    report.push({ id: profile.id, kind: "P", error: String(error), python_replay_ok: pyPlan?.ok ?? false });
  }
}
for (const plan of coverage.plans) {
  const pyPlan = pyById.get(plan.id);
  try {
    const asked = new Set<string>(pyPlan?.asked_items ?? []);
    const expected = plan.expected_items ?? [];
    const forbidden = plan.forbidden_items ?? [];
    const ts = routeReplay(pyPlan);
    report.push({
      id: plan.id, kind: "C", python_replay_ok: pyPlan?.ok ?? false,
      python_expected_items_present: expected.filter((x: string) => asked.has(x)),
      python_expected_items_missing: expected.filter((x: string) => !asked.has(x)),
      python_forbidden_items_present: forbidden.filter((x: string) => asked.has(x)),
      python_synthetic_binding_count: pyPlan?.synthetic_binding_count ?? 0,
      python_trace_candidate_items: (pyPlan?.trace_candidate_items ?? []).length,
      projection: compareProjection(pyPlan, ts),
      TypeScript_distinctness: pyPlan?.synthetic_binding_count
        ? `forwarded from independent Python replay; ${pyPlan.synthetic_binding_count} replay-driver synthetic binding(s), not fixture-authored`
        : "forwarded from independent Python replay episode state",
      parity: "cross-engine projection on identical canonical Python replay rows and replay controls; candidate walk is not compared step by step",
    });
  } catch (error) {
    report.push({ id: plan.id, kind: "C", error: String(error), python_replay_ok: pyPlan?.ok ?? false });
  }
}

const pythonFailures = independent.plans.filter((p) => !p.ok).map((p) => ({ id: p.id, error: p.error }));
const p = report.filter((r) => r.kind === "P");
const c = report.filter((r) => r.kind === "C");
const mismatches = [
  ...c.flatMap((r) => [...(r.python_expected_items_missing ?? []).map((item: string) => ({ id: r.id, kind: "C", item, mismatch: "python_expected_item_not_asked" })), ...(r.python_forbidden_items_present ?? []).map((item: string) => ({ id: r.id, kind: "C", item, mismatch: "python_forbidden_item_asked" }))]),
  ...report.flatMap((r) => {
    const projection = r.projection;
    if (!projection) return [];
    return [
      ...projection.observation_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "observation_missing_from_typescript" })),
      ...projection.observation_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "observation_extra_in_typescript" })),
      ...projection.missingness_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "missingness_missing_from_typescript" })),
      ...projection.missingness_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "missingness_extra_in_typescript" })),
      ...projection.steps_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "step_missing_from_typescript" })),
      ...projection.steps_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "step_extra_in_typescript" })),
      ...projection.sequence_edges_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "sequence_edge_missing_from_typescript" })),
      ...projection.sequence_edges_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "sequence_edge_extra_in_typescript" })),
      ...projection.distinctness_mismatch.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "distinctness_projection_mismatch" })),
      ...projection.episode_mismatches.map((item: any) => ({ id: r.id, kind: r.kind, item: item.id, mismatch: "episode_projection_mismatch" })),
      ...projection.target_state_mismatches.map((item: any) => ({ id: r.id, kind: r.kind, item: item.key, mismatch: "target_state_mismatch", python: item.python, typescript: item.typescript })),
    ];
  }),
];
const coverageCounts = {
  required_plans: 25, python_replayed: independent.plans.filter((p) => p.ok).length,
  P_originals: p.length, C_new: c.length,
  projected_observations: report.reduce((n, r) => n + (r.projection?.python_observations ?? 0), 0),
  typescript_observations: report.reduce((n, r) => n + (r.projection?.typescript_observations ?? 0), 0),
  projected_missingness_rows: report.reduce((n, r) => n + (r.projection?.python_missingness ?? 0), 0),
  typescript_missingness_rows: report.reduce((n, r) => n + (r.projection?.typescript_missingness ?? 0), 0),
  projected_steps: report.reduce((n, r) => n + (r.projection?.python_steps ?? 0), 0),
  typescript_steps: report.reduce((n, r) => n + (r.projection?.typescript_steps ?? 0), 0),
  projected_episodes: report.reduce((n, r) => n + (r.projection?.python_episodes ?? 0), 0),
  typescript_episodes: report.reduce((n, r) => n + (r.projection?.typescript_episodes ?? 0), 0),
  projected_sequence_edges: report.reduce((n, r) => n + (r.projection?.python_sequence_edges ?? 0), 0),
  typescript_sequence_edges: report.reduce((n, r) => n + (r.projection?.typescript_sequence_edges ?? 0), 0),
  projected_target_instances: report.reduce((n, r) => n + (r.projection?.python_target_instances ?? 0), 0),
  typescript_target_instances: report.reduce((n, r) => n + (r.projection?.typescript_target_instances ?? 0), 0),
  synthetic_replay_bindings: report.reduce((n, r) => n + (r.projection?.synthetic_binding_count ?? 0), 0),
  C_expected_checks: c.reduce((n, r) => n + (r.python_expected_items_present?.length ?? 0) + (r.python_expected_items_missing?.length ?? 0), 0),
  C_forbidden_checks: coverage.plans.reduce((n: number, plan: any) => n + (plan.forbidden_items?.length ?? 0), 0),
  observation_projection_mismatches: report.reduce((n, r) => n + (r.projection?.observation_missing_from_typescript.length ?? 0) + (r.projection?.observation_extra_in_typescript.length ?? 0), 0),
  missingness_projection_mismatches: report.reduce((n, r) => n + (r.projection?.missingness_missing_from_typescript.length ?? 0) + (r.projection?.missingness_extra_in_typescript.length ?? 0), 0),
  step_projection_mismatches: report.reduce((n, r) => n + (r.projection?.steps_missing_from_typescript.length ?? 0) + (r.projection?.steps_extra_in_typescript.length ?? 0), 0),
  episode_projection_mismatches: report.reduce((n, r) => n + (r.projection?.episode_mismatches.length ?? 0), 0),
  distinctness_projection_mismatches: report.reduce((n, r) => n + (r.projection?.distinctness_mismatch.length ?? 0), 0),
  sequence_edge_projection_mismatches: report.reduce((n, r) => n + (r.projection?.sequence_edges_missing_from_typescript.length ?? 0) + (r.projection?.sequence_edges_extra_in_typescript.length ?? 0), 0),
  target_state_mismatches: report.reduce((n, r) => n + (r.projection?.target_state_mismatches.length ?? 0), 0),
  projection_mismatches: report.reduce((n, r) => n + (r.projection?.projection_mismatch_count ?? 0), 0),
  mismatch_records: mismatches.length,
  TypeScript_routes_completed: report.filter((r) => !r.error).length,
};
console.log(JSON.stringify({ audit_status: "completed; not a parity-pass assertion", coverage_counts: coverageCounts, python_failures: pythonFailures, mismatches, plans: report }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
