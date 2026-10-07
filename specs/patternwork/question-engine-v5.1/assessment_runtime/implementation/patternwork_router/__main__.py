"""Offline CLI. No model calls, networking, deployment or real-user auto-answering."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile

from .engine import AssessmentEngine
from .model import Config, ContractError
from .replay import architecture_plans, write_replay
from .source import Source


def main() -> int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,help='Alternate complete package root; defaults to this package.')
    sub=p.add_subparsers(dest='command',required=True)
    demo=sub.add_parser('demo',help='Replay nine authored fictional branches through the public core.')
    demo.add_argument('--out',type=Path,required=True)
    replay=sub.add_parser('replay',help='Run a fictional respondent plan, never a real-user answer filler.')
    replay.add_argument('plan',type=Path);replay.add_argument('--out',type=Path,required=True)
    console=sub.add_parser('console',help='Local JSON-lines command interface with atomic signed state save.')
    console.add_argument('--state',type=Path,required=True);console.add_argument('--config',type=Path)
    console.add_argument('--key-env',default='PATTERNWORK_STATE_KEY_HEX')
    inspect=sub.add_parser('inspect',help='Validate and print a saved signed state packet.')
    inspect.add_argument('state',type=Path);inspect.add_argument('--key-env',default='PATTERNWORK_STATE_KEY_HEX')
    args=p.parse_args()
    try:
        source=Source(args.source)
        if args.command in {'demo','replay'}:
            plans=architecture_plans(source) if args.command=='demo' else [json.loads(args.plan.read_text(encoding='utf-8'))]
            summaries=[write_replay(plan,args.out,source) for plan in plans]
            (args.out/'INDEX.json').write_text(json.dumps(summaries,indent=2)+'\n',encoding='utf-8')
            print(json.dumps(summaries,indent=2));return 0
        try:key=bytes.fromhex(os.environ.get(args.key_env,''))
        except ValueError as exc:raise ContractError('Signing-key environment variable must contain hexadecimal bytes.') from exc
        if len(key)<32:raise ContractError('Supply at least 32 random signing-key bytes as 64+ hexadecimal characters in the named environment variable.')
        if args.command=='inspect':
            e=AssessmentEngine.loads(args.state.read_text(encoding='utf-8'),source,signing_key=key)
            print(json.dumps(e.packet(),indent=2,ensure_ascii=False));return 0
        print('Local plaintext assessment data; HMAC authenticates but does not encrypt. Do not publish the state file.',file=sys.stderr)
        if args.state.exists():e=AssessmentEngine.loads(args.state.read_text(encoding='utf-8'),source,signing_key=key)
        else:e=AssessmentEngine(Config(**json.loads(args.config.read_text(encoding='utf-8'))) if args.config else Config(),source)
        args.state.parent.mkdir(parents=True,exist_ok=True)
        def save():
            fd,name=tempfile.mkstemp(prefix='.router-',dir=args.state.parent)
            try:
                with os.fdopen(fd,'w',encoding='utf-8') as stream:
                    stream.write(e.dumps(key));stream.flush();os.fsync(stream.fileno())
                os.replace(name,args.state)
            finally:
                if os.path.exists(name):os.unlink(name)
        print(json.dumps(e.next(),ensure_ascii=False),flush=True);save()
        for line in sys.stdin:
            try:
                request=json.loads(line)
                if not isinstance(request,dict):raise ContractError('Commands must be JSON objects.')
                method=request.pop('method',None)
                if method not in {'next','answer','correct','control','bind','packet','trace'}:raise ContractError('Unknown public method.')
                result=getattr(e,method)(**request)
                save();print(json.dumps(result,ensure_ascii=False),flush=True)
            except (ContractError,TypeError,ValueError) as exc:
                print(json.dumps({'error':type(exc).__name__,'message':str(exc)}),flush=True)
        return 0
    except (OSError,ContractError,ValueError) as exc:
        print(json.dumps({'error':type(exc).__name__,'message':str(exc)}),file=sys.stderr);return 2


if __name__=='__main__':
    raise SystemExit(main())
