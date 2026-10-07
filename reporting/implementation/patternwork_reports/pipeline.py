"""Source-bound report request construction and deterministic structural checks.

Semantic truth, part identity, prose quality, and omissions require the semantic
reviewer and human qualification. These functions cannot certify them. Callers
must authenticate snapshots before this boundary: checksums are not identity.
"""
from __future__ import annotations
from copy import deepcopy
from pathlib import Path
from typing import Any
import hashlib
import json
import sys

import jsonschema


class ReportValidationError(ValueError):
    """Malformed, stale, unbound, or structurally inconsistent report input."""


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def _index(rows: list[dict[str, Any]], key: str, label: str) -> dict[str, dict[str, Any]]:
    result = {row[key]: row for row in rows}
    if len(result) != len(rows):
        raise ReportValidationError(f'Duplicate {label} identity.')
    return result


class ReportContract:
    def __init__(self, root: str | Path | None = None, *, verify_manifest: bool = True):
        self.root = Path(root) if root else Path(__file__).resolve().parents[2]
        self.policy = self.load('contracts/report_policy.json')
        if verify_manifest:
            self.verify_release()
        self.draft_schema = self.load(self.policy['draft_schema'])
        self.review_schema = self.load(self.policy['review_schema'])
        jsonschema.Draft202012Validator.check_schema(self.draft_schema)
        jsonschema.Draft202012Validator.check_schema(self.review_schema)
        self.router_root = self.root.parent / 'assessment_runtime'
        path = str(self.router_root / 'implementation')
        if path not in sys.path:
            sys.path.insert(0, path)
        from patternwork_router import Source
        self.source = Source(self.router_root)
        if self.source.binding['source_sha256'] != self.policy['compatible_router_source_sha256']:
            raise ReportValidationError('Router changed; compatibility must be requalified, not silently resumed.')

    def load(self, path: str) -> Any:
        return json.loads((self.root / path).read_text(encoding='utf-8'))

    def verify_release(self) -> None:
        manifest = self.load('contracts/report_release_manifest.json')
        if manifest.get('report_release') != self.policy['release']:
            raise ReportValidationError('Report manifest release mismatch.')
        if not manifest.get('files'):
            raise ReportValidationError('Report manifest is empty.')
        for rel, sha in manifest['files'].items():
            path = (self.root / rel).resolve()
            if not path.is_relative_to(self.root.resolve()):
                raise ReportValidationError('Unsafe manifest path.')
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != sha:
                raise ReportValidationError(f'Report release drift: {rel}')
        if digest(manifest['files']) != manifest['content_binding']:
            raise ReportValidationError('Report manifest binding mismatch.')

    def validate_packet(self, packet: dict[str, Any]) -> None:
        from patternwork_router.packet import validate_packet
        try:
            schema = json.loads((self.router_root / 'schemas/router_packet.schema.json').read_text())
            jsonschema.Draft202012Validator(schema).validate(packet)
            validate_packet(packet, self.source)
        except (ValueError, KeyError, TypeError, jsonschema.ValidationError) as exc:
            raise ReportValidationError(f'Invalid router evidence packet: {exc}') from exc

    def prepare_request(self, packet: dict[str, Any], report_type: str,
                        *, accepted_layers: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
        """Build a request from a trusted server snapshot, never browser evidence.

        accepted_layers must come from the application's accepted-artifact store.
        This parameter is not authorization and must not be exposed to the client.
        No live key, raw note, provider call, or mutable evidence alias is returned.
        """
        self.validate_packet(packet)
        if report_type not in self.policy['layer_prompts']:
            raise ReportValidationError('Unknown report type.')
        if report_type != 'SYNTHESIS' and accepted_layers:
            raise ReportValidationError('Layer claims are only composed for synthesis.')
        layers = accepted_layers or {}
        if report_type == 'SYNTHESIS' and not layers:
            raise ReportValidationError('Synthesis requires accepted layer artifacts; missing lenses need not be fabricated.')
        for layer, draft in layers.items():
            if layer not in {'IFS', 'PV', 'ATT'} or draft.get('report_type') != layer:
                raise ReportValidationError('Invalid synthesis source layer.')
            self.validate_draft(draft, packet)
        self._consistent_registry(list(layers.values()))
        shared = (self.root / self.policy['shared_prompt']).read_text()
        layer_prompt = (self.root / self.policy['layer_prompts'][report_type]).read_text()
        # The original envelope remains the validator's authority. This view keeps
        # all observations but removes administrative response history and totals.
        keys = ['release_id', 'snapshot_id', 'source_binding', 'observations', 'episodes', 'steps',
                'sequence_edges', 'target_resolutions', 'structural_evidence_summaries',
                'supported_alternatives', 'counterexamples', 'missingness', 'unresolved_bindings',
                'referent_scopes', 'context_comparisons', 'reported_context_controls',
                'interpretation_disputes', 'open_questions', 'corrections']
        view = {key: deepcopy(packet[key]) for key in keys}
        view['assessment_scope'] = {key: deepcopy(packet['assessment_scope'][key]) for key in
                                   ('recall_window', 'report_language', 'phase', 'completion_reason', 'evidence_basis')}
        view['evidence_sha256'] = packet['content_sha256']
        view['report_release'] = self.policy['release']
        view['report_type'] = report_type
        view['accepted_layers'] = deepcopy(layers)
        # This is a structural aid, not a computed evidence-completeness score.
        view['interpretation_note'] = 'Structural summaries are non-exhaustive; current source observations control.'
        return {'system': shared + '\n\n' + layer_prompt, 'user_data': view,
                'response_schema': deepcopy(self.draft_schema),
                'binding': {'report_release': self.policy['release'], 'report_type': report_type,
                            'snapshot_id': packet['snapshot_id'], 'evidence_sha256': packet['content_sha256'],
                            'prompt_sha256': hashlib.sha256((shared+'\n\n'+layer_prompt).encode()).hexdigest()}}

    @staticmethod
    def _consistent_registry(drafts: list[dict[str, Any]]) -> None:
        registry: dict[str, tuple[str, str, str]] = {}
        names: dict[str, str] = {}
        for draft in drafts:
            for row in draft['name_registry']:
                definition = (row['name'], row['entity_kind'], row['role'])
                if row['name_id'] in registry and registry[row['name_id']] != definition:
                    raise ReportValidationError('Cross-layer name/identity conflict; reconciliation is required.')
                if row['name'].casefold() in names and names[row['name'].casefold()] != row['name_id']:
                    raise ReportValidationError('Same label has conflicting entity IDs; do not merge by string.')
                registry[row['name_id']] = definition
                names[row['name'].casefold()] = row['name_id']

    def validate_draft(self, draft: dict[str, Any], packet: dict[str, Any],
                       *, accepted_layers: dict[str, dict[str, Any]] | None = None) -> None:
        self.validate_packet(packet)
        try:
            jsonschema.Draft202012Validator(self.draft_schema).validate(draft)
        except jsonschema.ValidationError as exc:
            raise ReportValidationError(f'Report schema: {exc.message}') from exc
        for field, expected in [('report_release', self.policy['release']), ('release_id', packet['release_id']),
                                ('snapshot_id', packet['snapshot_id']), ('evidence_sha256', packet['content_sha256'])]:
            if draft[field] != expected:
                raise ReportValidationError(f'Stale or wrong {field}.')
        obs = _index(packet['observations'], 'id', 'observation')
        eps = _index(packet['episodes'], 'id', 'occurrence')
        edges = _index(packet['sequence_edges'], 'id', 'sequence')
        people = {p['person_id'] for p in packet['referent_scopes']}
        claims = _index(draft['claims'], 'id', 'claim')
        names = _index(draft['name_registry'], 'name_id', 'name')
        sections = _index(draft['sections'], 'id', 'section')
        _index(draft['relationships'], 'id', 'relationship')
        live_responses = {a['live_response_id'] for a in packet['administration_provenance'] if a['live_response_id']}
        def require(test: bool, message: str) -> None:
            if not test:
                raise ReportValidationError(message)
        visited: set[str] = set(); stack: set[str] = set()
        def visit(cid: str) -> None:
            require(cid in claims, 'Dangling claim dependency.')
            require(cid not in stack, 'Cyclic claim dependencies.')
            if cid in visited: return
            stack.add(cid)
            for dep in claims[cid]['depends_on_claim_ids']:
                visit(dep)
                if claims[cid]['kind'] in {'reported','supported_interpretation'}:
                    require(claims[dep]['kind'] in {'reported','supported_interpretation'},
                            'An open premise cannot support a settled claim.')
                require(set(claims[dep]['evidence_ids']) <= set(claims[cid]['evidence_ids']),
                        'Derived claims must retain premise leaf evidence.')
                require(set(claims[dep]['counterevidence_ids']) <= set(claims[cid]['counterevidence_ids']),
                        'Derived claims must retain premise counterevidence.')
            stack.remove(cid); visited.add(cid)
        for cid in claims: visit(cid)
        for claim in claims.values():
            cited = set(claim['evidence_ids'] + claim['counterevidence_ids'])
            require(cited <= set(obs), 'Claim cites nonexistent or stale observation.')
            require(all(obs[e]['response_id'] in live_responses for e in cited), 'Claim cites noncurrent response.')
            scope = claim['scope']; scoped_eps=set(scope['occurrence_ids'])
            require(scoped_eps <= set(eps) and set(scope['person_ids']) <= people, 'Claim has forged scope.')
            require({obs[e]['occurrence_id'] for e in cited} <= scoped_eps, 'Evidence lies outside declared occurrence scope.')
            cited_people={obs[e]['person_id'] for e in cited if obs[e]['person_id']}
            require(cited_people <= set(scope['person_ids']), 'Evidence lies outside declared person scope.')
            # Scope cannot silently introduce people/events with no supporting or
            # contrary observations. not_assessed may name an unavailable context.
            if claim['kind'] in {'reported','supported_interpretation'}:
                require(scoped_eps <= {obs[e]['occurrence_id'] for e in cited}, 'Unsupported extra occurrence scope.')
                require(set(scope['person_ids']) <= cited_people, 'Unsupported extra person scope.')
            require(set(claim['sequence_edge_ids']) <= set(edges), 'Unknown sequence edge.')
            for gid in claim['sequence_edge_ids']:
                edge=edges[gid]
                require(edge['occurrence_id'] in scoped_eps, 'Sequence lies outside claim scope.')
                require(set(edge['evidence_ids']) <= cited, 'Sequence leaf evidence omitted.')
            if claim['kind'] == 'supported_interpretation' and 'handoff' in claim['constructs']:
                require(any(edges[g]['relation']=='before' for g in claim['sequence_edge_ids']),
                        'Handoff lacks a reported sequential relation.')
            if claim['kind'] == 'supported_interpretation' and ('recurrence' in claim['constructs'] or scope['level']=='recurring_within_context'):
                evidence_eps={obs[e]['occurrence_id'] for e in claim['evidence_ids']}
                require(len(evidence_eps)>1, 'Recurrence cannot be manufactured from one occurrence.')
                for a in evidence_eps:
                    require(eps[a]['basis']=='actual_recalled', 'Distinct actual recurrence needs actual occurrences.')
                    for b in evidence_eps-{a}:
                        require(b in eps[a]['distinct_from'] or a in eps[b]['distinct_from'],
                                'Independent recurrence lacks confirmed distinctness.')
            if scope['level']=='reported_tendency' and claim['kind'] in {'reported','supported_interpretation'}:
                require(any(obs[e]['basis']=='reported_typicality' for e in claim['evidence_ids']),
                        'Reported tendency needs an actual typicality basis.')
            if scope['level']=='across_sampled_contexts' and claim['kind'] in {'reported','supported_interpretation'}:
                require(len({eps[e]['context'] for e in scoped_eps})>1 or len(cited_people)>1,
                        'Cross-context scope has one sampled context/referent.')
            if claim['kind']=='reported':
                modeled={'manager','firefighter','exile','vulnerable_part','self_led_capacity','unblending','burden'}
                require(not (set(claim['constructs']) & modeled), 'A modeled role is not a literal questionnaire report.')
        represented=set(draft['title_claim_ids'])
        require(represented <= set(claims), 'Unknown title claim.')
        for section in sections.values():
            require(set(section['claim_ids']) <= set(claims), 'Unknown section claim.')
            represented.update(section['claim_ids'])
        require(set(claims) <= represented, 'Ledger claim not represented in client content.')
        self._consistent_registry([draft])
        for name in names.values():
            require(name['name'].strip().casefold() != 'self', 'Self is represented through claims, not a name-registry entity.')
            require(set(name['supporting_claim_ids']) <= set(claims), 'Name has dangling supporting claim.')
            require(name['author_generated'], 'This bank does not collect respondent-authored names.')
            role=name['role']
            if role != 'descriptive_pattern':
                require(name['entity_kind']=='ifs_part', 'IFS role assigned to a non-part entity.')
            if role in {'manager','firefighter','exile','vulnerable_part'}:
                require(any(claims[c]['kind']=='supported_interpretation' and role in claims[c]['constructs']
                            for c in name['supporting_claim_ids']), 'Named role lacks an explicit supported role claim.')
        for link in draft['relationships']:
            require(link['from_name_id'] in names and link['to_name_id'] in names, 'Relationship has unknown endpoint.')
            require(link['from_name_id'] != link['to_name_id'], 'Relationship self-edge is invalid.')
            require(set(link['claim_ids']) <= set(claims), 'Relationship has unknown claim.')
            require(all(claims[c]['kind']=='supported_interpretation' for c in link['claim_ids']),
                    'Asserted relationship requires supported interpretation; keep open relations in open claims.')
            if link['relation']=='takes_over_from':
                require(any('handoff' in claims[c]['constructs'] for c in link['claim_ids']),
                        'Takeover link lacks a handoff claim.')
        if accepted_layers:
            require(draft['report_type']=='SYNTHESIS', 'Only synthesis accepts layer registry reconciliation.')
            for layer, source_draft in accepted_layers.items():
                require(layer in {'IFS', 'PV', 'ATT'} and source_draft.get('report_type') == layer,
                        'Invalid synthesis source layer.')
                self.validate_draft(source_draft, packet)
            self._consistent_registry([*accepted_layers.values(), draft])
        # Deliberately no automatic keyword psychology or exact finding counts.
        # Privacy/recurrence/role shapes can pass while the prose is still false.

    def validate_generation(self, draft: dict[str, Any], packet: dict[str, Any], *, finish_reason: str,
                            accepted_layers: dict[str, dict[str, Any]] | None = None) -> None:
        """finish_reason is trusted transport metadata, not supplied by the writer."""
        if finish_reason not in {'stop', 'completed'}:
            raise ReportValidationError('Generation was not complete; no silent truncation or release.')
        self.validate_draft(draft, packet, accepted_layers=accepted_layers)

    def prepare_review(self, draft: dict[str, Any], packet: dict[str, Any], *,
                       accepted_layers: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
        self.validate_draft(draft, packet, accepted_layers=accepted_layers)
        request = self.prepare_request(packet, draft['report_type'], accepted_layers=accepted_layers)
        return {'system': 'REVIEW TASK: The writer contracts below are evaluation criteria, not an instruction to write a report. Return only the review schema.\n\n'+request['system']+'\n\n'+(self.root/self.policy['reviewer_prompt']).read_text(),
                'user_data': {'draft':deepcopy(draft), 'source':request['user_data'],
                              'reviewed_draft_sha256':digest(draft),'reviewed_evidence_sha256':packet['content_sha256']},
                'response_schema':deepcopy(self.review_schema)}

    def prepare_repair(self, draft: dict[str, Any], packet: dict[str, Any], *,
                       review: dict[str, Any] | None = None,
                       accepted_layers: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
        """Build a repair request; recompute structural errors, never trust client errors.

        Semantic objections must be a bound review of this exact draft. Accepted
        drafts are not silently rewritten; every replacement needs a fresh review.
        Transport truncation should be retried as generation, not marked complete.
        """
        request = self.prepare_request(packet, draft.get('report_type', ''), accepted_layers=accepted_layers)
        if review is not None:
            self.validate_review(review, draft, packet, accepted_layers=accepted_layers)
            if review['verdict'] != 'revise':
                raise ReportValidationError('Semantic repair requires a revise receipt, not acceptance or invalid source.')
            feedback = {'kind': 'bound_semantic_review', 'review': deepcopy(review)}
        else:
            try:
                self.validate_draft(draft, packet, accepted_layers=accepted_layers)
            except ReportValidationError as exc:
                feedback = {'kind': 'recomputed_structural_error', 'error': str(exc)}
            else:
                raise ReportValidationError('Structurally valid draft needs bound semantic feedback to request repair.')
        return {'system': request['system']+'\n\n'+(self.root/self.policy['repair_prompt']).read_text(),
                'user_data': {'source': request['user_data'], 'draft': deepcopy(draft),
                              'draft_sha256': digest(draft), 'feedback': feedback},
                'response_schema': deepcopy(self.draft_schema), 'binding': deepcopy(request['binding'])}

    def validate_review(self, review: dict[str, Any], draft: dict[str, Any], packet: dict[str, Any], *,
                        accepted_layers: dict[str, dict[str, Any]] | None = None) -> None:
        try: jsonschema.Draft202012Validator(self.review_schema).validate(review)
        except jsonschema.ValidationError as exc: raise ReportValidationError(f'Review schema: {exc.message}') from exc
        if review['reviewed_draft_sha256']!=digest(draft) or review['reviewed_evidence_sha256']!=packet['content_sha256']:
            raise ReportValidationError('Review is bound to another draft or source.')
        if review['verdict'] != 'invalid_input':
            self.validate_draft(draft, packet, accepted_layers=accepted_layers)
        _index(review['issues'], 'id', 'review issue')
        if review['verdict']=='accept' and review['issues']:
            raise ReportValidationError('Review with outstanding issues cannot accept.')
        if review['verdict']=='revise' and not review['issues']:
            raise ReportValidationError('Revision needs an actionable issue.')
        obs={x['id'] for x in packet['observations']}
        sets={'claim_ids':{x['id'] for x in draft['claims']},'section_ids':{x['id'] for x in draft['sections']},
              'name_ids':{x['name_id'] for x in draft['name_registry']},'relationship_ids':{x['id'] for x in draft['relationships']}}
        for issue in review['issues']:
            if not set(issue['evidence_ids'])<=obs: raise ReportValidationError('Review cites unknown evidence.')
            for field,allowed in sets.items():
                if not set(issue[field])<=allowed: raise ReportValidationError('Review cites unknown draft object.')
            if issue['category']=='material_omission' and not issue['evidence_ids']:
                raise ReportValidationError('An omission objection needs actual neglected evidence, not a theory quota.')

    def render_markdown(self, draft: dict[str, Any], packet: dict[str, Any]) -> str:
        self.validate_draft(draft,packet)
        lines=['# '+draft['title'],'',
               '*Patternwork is nonclinical self-reflection. Parts and state names are working interpretations, not diagnoses or physiological measurements.*','']
        for section in draft['sections']:
            if section['heading']:lines += ['## '+section['heading'],'']
            lines += [section['text'],'']
        if draft['reflection_questions']:
            lines += ['## To notice','']
            for question in draft['reflection_questions']:lines += [question,'']
        return '\n'.join(lines).rstrip()+'\n'
