"""Check tracked files; original code literals have fingerprints, never credentials."""
from pathlib import Path
import collections, hashlib, json, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT/'tools/rules/pii.txt'
BUSINESS = {'연구기관 이메일 주소', '사번-이름 형식', '휴대전화번호', '특허 관리번호 형식'}
BLOCKED_EXT = {'.xlsx','.xlsm','.xlsb','.xls','.csv','.tsv','.har','.zip','.7z','.rar',
               '.hwp','.hwpx','.msg','.eml','.pcap','.pdf','.doc','.docx','.ppt','.pptx'}
BLOCKED_NAME = re.compile(r'(^|/)(\.env($|\..*)|id_rsa.*|.*\.(pem|key|p12|pfx|jks))$')
ESCAPE_RE = re.compile(r'\\u([0-9a-fA-F]{4})')

def load_rules():
    result=[]
    for line in RULES.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):continue
        level, pattern, desc=line.split('\t',2)
        if level not in ('BLOCK','WARN'):raise ValueError('unknown rule level')
        result.append((level,re.compile(pattern),desc))
    if not result:raise ValueError('empty rules')
    return result

def tracked_files():
    result=subprocess.run(['git','ls-files','-z'],cwd=ROOT,capture_output=True,check=True)
    return [x for x in result.stdout.decode('utf-8').split('\0') if x]

def decoded_text(raw):
    try:text=raw.decode('utf-8-sig')
    except UnicodeDecodeError:text=raw.decode('cp949')
    return ESCAPE_RE.sub(lambda m:chr(int(m.group(1),16)),text)

def fingerprint(rx,text):
    hits=sorted(m.group(0) for m in rx.finditer(text))
    return hashlib.sha256(json.dumps(hits,ensure_ascii=False).encode('utf-8')).hexdigest() if hits else None

def scan(path,rules,baseline):
    path=Path(path).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():raise ValueError('missing/outside repository file')
    relative=path.relative_to(ROOT).as_posix()
    problems=[];warnings=[]
    if relative.startswith(('validation/raw/','validation/golden/','validation/actual/','validation/reports/')):
        if relative not in ('validation/raw/.gitkeep','validation/golden/.gitkeep') or path.stat().st_size:
            problems.append('local validation data must not be tracked')
    if path.suffix.lower() in BLOCKED_EXT:problems.append('business output/document extension')
    if BLOCKED_NAME.search(relative):problems.append('credential filename')
    if relative=='tools/rules/pii.txt':return problems,warnings
    text=decoded_text(path.read_bytes())
    for level,rx,desc in rules:
        fp=fingerprint(rx,text)
        if not fp:continue
        if level=='WARN':warnings.append(desc);continue
        if desc in BUSINESS and baseline.get(relative,{}).get(desc)==fp:continue
        problems.append(desc)
    return problems,warnings

def main(argv=None):
    argv=sys.argv[1:] if argv is None else argv
    files=tracked_files() if argv==['--all'] else argv
    if not files:
        print('ERROR: no files inspected');return 2
    rules=load_rules()
    catalog=json.loads((ROOT/'validation/catalog.json').read_text(encoding='utf-8'))
    baseline={x['path']:x.get('business_pattern_baseline',{}) for x in catalog['files']}
    failures=[];warns=collections.Counter()
    for filename in files:
        try:
            problems,warnings=scan(ROOT/filename,rules,baseline)
            failures.extend((filename,p) for p in problems);warns.update(warnings)
        except (OSError,ValueError,UnicodeError) as e:failures.append((filename,str(e)))
    for filename,problem in failures:print('BLOCK:',filename,problem)
    print('Guard:',len(files),'files;',len(failures),'blocks; warning file counts:',dict(warns))
    return 1 if failures else 0

if __name__=='__main__':sys.exit(main())
