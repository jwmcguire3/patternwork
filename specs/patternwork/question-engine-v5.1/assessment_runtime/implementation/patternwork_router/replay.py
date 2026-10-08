"""Public-interface fictional respondent replay. No synthetic target snapshots.

A plan describes answers a fictional respondent is prepared to give. It does not
select the next item: only AssessmentEngine.next() does that. Unlisted answers
are explicit missingness. Never use this driver to fill a real person's answers.
"""
from __future__ import annotations
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path
from typing import Any
import json

from .engine import AssessmentEngine
from .model import Config, ContractError
from .source import Source


def replay_plan(plan: dict[str, Any], source: Source | None = None) -> tuple[AssessmentEngine, list[dict[str, Any]]]:
    source = source or Source()
    engine = AssessmentEngine(Config(**plan.get('config', {})), source)
    answers: dict[str, list[dict[str, Any]]] = plan['answers']
    if any(not isinstance(v, list) or any(not isinstance(a, dict) for a in v) for v in answers.values()):
        raise ContractError('Replay answers must be per-item lists of canonical answer objects.')
    counts: dict[str, int] = defaultdict(int)
    log: list[dict[str, Any]] = []
    for _ in range(240):
        trace = engine.trace()
        form = engine.next()
        entry = {'form': form, 'selection_trace': trace}
        if form['action'] == 'ask':
            item = form['item_id']; i = counts[item]; counts[item] += 1
            queue = answers.get(item, [])
            payload = queue[i] if i < len(queue) else {'status': 'no_event' if form['recall_basis_control'] else 'not_sure'}
            entry['answer_origin'] = 'authored_fixture' if i < len(queue) else 'explicit_fixture_missingness'
            entry['submitted_response'] = payload
            entry['receipt'] = engine.answer(form['administration_id'], payload, expected_revision=engine.revision, request_id=f'answer-{engine.revision}')
            if item in plan.get('focus_roots', []) and engine.state.episodes[form['occurrence_id']].status == 'actual':
                engine.control('focus_occurrence', occurrence_id=form['occurrence_id'], expected_revision=engine.revision, request_id=f'focus-{engine.revision}')
        elif form['action'] == 'bind':
            remaining = len(answers.get(form['item_id'], [])) > counts[form['item_id']]
            binding = {'outcome': 'no_event'}
            if remaining:
                binding = {'outcome': 'confirm', 'relation': 'different'}
                if form['needs_person']:
                    source_ep = engine.state.episodes.get(form.get('source_occurrence_id'))
                    binding['person_id'] = source_ep.person_id if source_ep and source_ep.person_id else plan.get('binding_person', 'P1')
            entry['submitted_binding'] = binding
            entry['receipt'] = engine.bind(binding, expected_revision=engine.revision, request_id=f'bind-{engine.revision}')
        elif form['action'] == 'confirm_context':
            value = plan.get('context_facts', {}).get(form['fact'])
            entry['submitted_context'] = {'fact': form['fact'], 'value': value}
            entry['receipt'] = engine.control('context_fact', occurrence_id=form['occurrence_id'], fact=form['fact'], value=value, expected_revision=engine.revision, request_id=f'context-{engine.revision}')
        elif form['action'] == 'mapping_ready':
            command = 'continue_deepening' if plan.get('continue_deepening', True) else 'end'
            entry['receipt'] = engine.control(command, expected_revision=engine.revision, request_id=f'phase-{engine.revision}')
        elif form['action'] == 'finished':
            log.append(entry)
            return engine, log
        else:
            raise ContractError(f'Unexpected noninteractive replay state: {form["action"]}')
        engine.packet()  # Validate lineage after every public command.
        log.append(entry)
    raise ContractError('Replay exceeded its finite control/screen guard.')


def architecture_plans(source: Source | None = None) -> list[dict[str, Any]]:
    source = source or Source()
    original = json.loads((source.root/'examples/worked_paths.json').read_text(encoding='utf-8'))
    plans = []
    for profile in original['profiles']:
        pid = profile['id']
        config = Config(people={'P1':'partner','P2':'supervisor','P3':'friend'},
                        referents={'evaluator':'P2','boundary_person':'P2','close_person':'P1','support_person':'P3','repair_person':'P1','conflict_person':'P1'},topics=['body_detail'])
        if pid in {'P02','P06','P09'}:config.focus_topics=['conflict']
        if pid == 'P08':config.focus_topics=['disclosure']
        if pid == 'P05':config.details=['state']
        if pid == 'P09':config.details=['recurrence']
        answer_queues: dict[str,list[dict[str,Any]]] = defaultdict(list)
        for a in profile['answers']:
            answer_queues[a['item_id']].append({k:a[k] for k in ('selected','status','mode') if k in a})
        plans.append({'id':pid,'title':profile['title'],'fictional':True,
                      'source_kind':'adapted_authored_branch_segment_not_complete_observed_respondent',
                      'config':asdict(config),'answers':dict(answer_queues),
                      'focus_roots':['D61'] if pid in {'P02','P06','P09'} else []})
    return plans


def write_replay(plan: dict[str, Any], out: str | Path, source: Source | None = None) -> dict[str, Any]:
    source=source or Source();engine, log = replay_plan(plan,source)
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    pid=plan.get('id','replay')
    if not isinstance(pid,str) or len(pid)>80 or not pid.replace('_','').replace('-','').isalnum():
        raise ContractError('Use a simple bounded replay ID.')
    packet=engine.packet()
    asked=[e['form']['item_id'] for e in log if e['form']['action']=='ask']
    used = defaultdict(int)
    for e in log:
        if e.get('answer_origin')=='authored_fixture':used[e['form']['item_id']]+=1
    omitted={k:len(v)-used[k] for k,v in plan['answers'].items() if len(v)>used[k]}
    summary={'id':pid,'title':plan.get('title',pid),'fictional':True,'source_binding':source.binding,
             'administrations':len(engine.history.administrations),'decisions':engine.history.decisions,
             'controls':engine.history.controls_count,'completion_reason':engine.history.completion_reason,
             'packet_sha256':packet['content_sha256'],'asked_items':asked,
             'fixture_answers_not_administered':omitted,
             'structural_codes':[f.code for f in engine.state.findings],
             'note':'Missing fixture contexts were explicitly answered no_event/not_sure. Omitted fixture answers are not evidence. Counts are not estimated real-user completion distributions.'}
    for suffix,data in [('plan.json',plan),('route.json',log),('packet.json',packet),('summary.json',summary)]:
        (out/f'{pid}_{suffix}').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    # Explicitly local/unsigned snapshot, not an accepted production/server record.
    (out/f'{pid}_LOCAL_UNSIGNED_state.json').write_text(engine.dumps(),encoding='utf-8')
    return summary
