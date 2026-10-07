#!/usr/bin/env python3
"""Local report preparation/structural validation; never a production release tool."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
from patternwork_reports import ReportContract, ReportValidationError, digest


def load(path):
    with Path(path).open(encoding='utf-8') as f:return json.load(f)


def write(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    data=value if isinstance(value,str) else json.dumps(value,indent=2,ensure_ascii=False)+'\n'
    fd, temp=tempfile.mkstemp(prefix=path.name+'.',suffix='.tmp',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:f.write(data)
        os.replace(temp,path)
    finally:
        if os.path.exists(temp):os.unlink(temp)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    for name in ['prepare','validate','render','review-request','repair-request']:
        p=sub.add_parser(name);p.add_argument('--packet',required=True,type=Path)
        p.add_argument('--accepted-layer',action='append',default=[],metavar='TYPE=FILE',
                       help='Synthesis input from an externally accepted artifact store; not an approval claim.')
        if name=='repair-request':p.add_argument('--review',type=Path,help='Optional bound semantic revision receipt. Without it, only actual structural errors trigger repair.')
        if name=='prepare':p.add_argument('--type',required=True,choices=['MAP','IFS','PV','ATT','SYNTHESIS'])
        else:p.add_argument('--draft',required=True,type=Path)
        if name!='validate':p.add_argument('--out',required=True,type=Path)
    args=parser.parse_args(argv)
    try:
        contract=ReportContract();packet=load(args.packet);layers={}
        for item in args.accepted_layer:
            layer,path=item.split('=',1)
            if layer in layers:raise ReportValidationError('Duplicate accepted layer.')
            layers[layer]=load(path)
        if args.command=='prepare':
            result=contract.prepare_request(packet,args.type,accepted_layers=layers or None);write(args.out,result)
        else:
            draft=load(args.draft)
            if args.command=='repair-request':
                write(args.out,contract.prepare_repair(draft,packet,review=load(args.review) if args.review else None,accepted_layers=layers or None))
                return 0
            contract.validate_draft(draft,packet,accepted_layers=layers or None)
            if args.command=='render':write(args.out,contract.render_markdown(draft,packet))
            elif args.command=='review-request':write(args.out,contract.prepare_review(draft,packet,accepted_layers=layers or None))
            else: print(json.dumps({'status':'structural_pass','draft_sha256':digest(draft),
                                   'semantic_review':'not_performed','production_release':'not_authorized'}))
        return 0
    except (ReportValidationError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f'ERROR: {exc}',file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
