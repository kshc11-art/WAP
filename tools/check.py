"""Repository integrity, syntax and data checks. Does not certify business accuracy."""
from pathlib import Path
import ast, hashlib, json, re, subprocess, sys
import guard

ROOT=Path(__file__).resolve().parents[1]

def main():
    files=guard.tracked_files()
    if not files:raise ValueError('no tracked files')
    catalog=json.loads((ROOT/'validation/catalog.json').read_text(encoding='utf-8'))
    records=catalog['files'];programs=catalog['programs']
    for entries,key in ((records,'path'),(programs,'id')):
        vals=[r[key] for r in entries]
        if len(vals)!=len(set(vals)):raise ValueError('duplicate catalog '+key)
    for rec in records:
        p=ROOT/rec['path']
        if rec['path'] not in files:raise ValueError('catalog file untracked: '+rec['path'])
        if hashlib.sha256(p.read_bytes()).hexdigest()!=rec['sha256']:
            raise ValueError('file changed; review and update catalog sha256: '+rec['path'])
    for p in programs:
        if not (ROOT/p['path']).exists():raise ValueError('missing program path')
        if p['kind']=='userscript':
            data=(ROOT/p['path']).read_text(encoding='utf-8-sig')
            for tag,key in (('name','title'),('version','version'),('namespace','namespace')):
                m=re.search(r'^//\s*@'+tag+r'\s+(.+)$',data,re.M)
                if not m or m.group(1).strip()!=p[key]:raise ValueError('metadata mismatch: '+p['id']+' '+tag)
    counts={'python':0,'javascript':0,'json':0}
    for name in files:
        p=ROOT/name;suffix=p.suffix.lower()
        if suffix in ('.py','.pyw'):
            ast.parse(p.read_bytes(),filename=name);counts['python']+=1
        elif suffix in ('.js','.cjs'):
            result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
            if result.returncode:raise ValueError(name+': '+result.stderr)
            counts['javascript']+=1
        elif suffix=='.json':
            json.loads(p.read_text(encoding='utf-8-sig'));counts['json']+=1
    print('Catalog:',len(programs),'programs,',len(records),'original import files. Syntax:',counts)
    return guard.main(['--all'])

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,OSError,subprocess.SubprocessError) as e:
        print('ERROR:',e,file=sys.stderr);sys.exit(1)
