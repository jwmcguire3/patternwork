"""Offline reference source/composition regression; no provider or customer data."""
import json
import hashlib
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'reporting' / 'implementation'))
from patternwork_reports import ReportContract, ReportValidationError  # noqa: E402


class ReferenceSourceTests(unittest.TestCase):
    def test_default_contract_uses_integrated_pinned_router(self):
        contract = ReportContract()
        self.assertEqual(contract.router_root, ROOT / 'specs' / 'patternwork' /
                         'question-engine-v5.1' / 'assessment_runtime')
        self.assertEqual(contract.source.binding['source_sha256'],
                         contract.policy['compatible_router_source_sha256'])
        self.assertTrue(all('\\' not in member for member in contract.source.hashes))

    def test_explicit_standalone_router_is_still_source_validated(self):
        router = ROOT / 'specs' / 'patternwork' / 'question-engine-v5.1' / 'assessment_runtime'
        contract = ReportContract(ROOT / 'reporting', router_root=router)
        self.assertEqual(contract.router_root, router)

    def test_path_portability_never_hides_changed_source_bytes(self):
        router = ROOT / 'specs' / 'patternwork' / 'question-engine-v5.1' / 'assessment_runtime'
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory) / 'router'
            shutil.copytree(router, copied, ignore=shutil.ignore_patterns('__pycache__'))
            bank = copied / 'assessment' / 'question_bank.json'
            bank.write_bytes(bank.read_bytes() + b'\n')
            with self.assertRaisesRegex(ReportValidationError, 'Router changed'):
                ReportContract(ROOT / 'reporting', router_root=copied)

    def test_every_direct_layer_includes_constructs_in_effective_prompt(self):
        contract = ReportContract()
        packet = json.loads((ROOT / 'qualification' / 'pwrp71' / 'coverage_candidates' /
                             'C01_packet.json').read_text(encoding='utf-8'))
        guide = (ROOT / 'reporting' / 'contracts' / 'CONSTRUCT_GUIDE.md').read_text(encoding='utf-8')
        for report_type in ['MAP', 'IFS', 'PV', 'ATT']:
            with self.subTest(report_type=report_type):
                prepared = contract.prepare_request(packet, report_type)
                self.assertIn(guide, prepared['system'])
                self.assertEqual(prepared['binding']['prompt_sha256'],
                                 hashlib.sha256(prepared['system'].encode()).hexdigest())


if __name__ == '__main__':
    unittest.main()
