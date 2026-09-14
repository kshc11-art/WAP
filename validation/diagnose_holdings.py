"""Synthetic checks against the supplied specification; never opens user workbooks."""
import ast
import importlib.util
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT.parent/'programs/patent-holdings/patent_yearend_classifier_v5.3.py'
spec=importlib.util.spec_from_file_location('holdings_intake',SOURCE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
pd=mod.pd
(ROOT/'reports').mkdir(exist_ok=True)

def row(**overrides):
    r={'관리번호':'SYNTHETIC-001','등록일자':pd.Timestamp('2015-01-01'),'등록번호':'SYNTHETIC-REG',
       '_기부연도':float('nan'),'_계약연도':[],'계약세부':'','상태세부':'등록','전략보유':'N','마케팅':'N',
       '_전략적용':'N','_공동기관':False,'_만료추정':pd.Timestamp('2035-01-01'),'_포기힌트':float('nan')}
    r.update(overrides)
    return r

ev={k:{} for k in ['status','status25','strat25','mk24','mk25','hint_batch']}
ev.update({k:set() for k in ['alive22','alive24','disp24','ref_held','batch24','sa24']})
P=('2026상반기','2026-06-30',2026)
results=[]
def check(label, expected, actual, source_lines):
    results.append(dict(name=label,expected=expected,actual=actual,passed=expected==actual,source_lines=source_lines))
def cls(label, changes, expected, period=P):
    check(label,expected,mod.classify(row(**changes),period,ev),'255-337')

cls('유지 중인 오래된 특허',{},mod.CAT_J)
cls('등록 후 5년 미경과',{'등록일자':pd.Timestamp('2024-01-01')},mod.CAT_G)
cls('기준일 당일 등록 포함',{'등록일자':pd.Timestamp('2026-06-30')},mod.CAT_G)
cls('기준일 다음날 등록 제외',{'등록일자':pd.Timestamp('2026-07-01')},mod.CAT_X)
cls('정확히 5년 경과',{'등록일자':pd.Timestamp('2021-06-30')},mod.CAT_J)
cls('5년 경계 다음날',{'등록일자':pd.Timestamp('2021-07-01')},mod.CAT_G)
cls('전략보유 정확히 5년',{'등록일자':pd.Timestamp('2021-06-30'),'전략보유':'Y'},mod.CAT_I)
cls('전략보유가 마케팅보다 우선',{'전략보유':'Y','마케팅':'Y'},mod.CAT_I)
cls('마케팅이 최근등록보다 우선',{'등록일자':pd.Timestamp('2024-01-01'),'마케팅':'Y'},mod.CAT_H)
cls('조건부 생존 명분 없음 제외',{'상태세부':'연차포기'},mod.CAT_X)
cls('조건부 생존 마케팅 유지',{'상태세부':'연차포기','마케팅':'Y'},mod.CAT_H)
cls('존속만료 마케팅 제외',{'상태세부':'존속만료','마케팅':'Y'},mod.CAT_X)
cls('기술실시 이력은 소멸 후에도 포함',{'상태세부':'존속만료','_계약연도':[2024]},mod.CAT_C)
cls('당해 양도는 기술실시보다 우선',{'_기부연도':2026,'_계약연도':[2024]},mod.CAT_D)
cls('등록번호 null 제외',{'등록번호':None},mod.CAT_X)
cls('등록번호 빈 문자열 제외',{'등록번호':''},mod.CAT_X)
cls('등록번호 공백 문자열 제외',{'등록번호':'   '},mod.CAT_X)
cls('상태 null은 빈칸으로 생존',{'상태세부':float('nan')},mod.CAT_J)
cls('상태 빈 문자열은 빈칸으로 생존',{'상태세부':''},mod.CAT_J)
cls('상태 공백 문자열은 빈칸으로 생존',{'상태세부':'   '},mod.CAT_J)
base=mod.classify(row(**{'상태세부':'양도','_계약연도':[2024]}),('2025년말','2025-12-31',2025),ev)
with_future=mod.classify(row(**{'상태세부':'양도','_계약연도':[2024,2027]}),('2025년말','2025-12-31',2025),ev)
check('미래 계약 추가가 과거 분류를 바꾸지 않아야 함',base,with_future,'280-286')

# Execute the exact supplied merge statement against synthetic duplicate reference keys.
tree=ast.parse(SOURCE.read_text(encoding='utf-8'))
merge=next(n for n in ast.walk(tree) if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='merge' and isinstance(n.value.func.value,ast.Name) and n.value.func.value.id=='pt')
env={'pt':pd.DataFrame([{'관리번호':'SYNTHETIC-001'}]),
     'ref':pd.DataFrame([{'관리번호':'SYNTHETIC-001','_전략25':'N'},{'관리번호':'SYNTHETIC-001','_전략25':'N'}])}
exec(compile(ast.Module(body=[merge],type_ignores=[]),str(SOURCE),'exec'),env)
check('참조 중복으로 특허 한 건이 두 행으로 늘어나면 안 됨',1,len(env['pt']),'567')

result={'source_sha256':__import__('hashlib').sha256(SOURCE.read_bytes()).hexdigest(),
        'scope':'합성 데이터 단위·경계 검증; 업무 원본/서버 미사용; 전체 보고서 재현 아님',
        'total':len(results),'passed':sum(x['passed'] for x in results),
        'failed':sum(not x['passed'] for x in results),'cases':results}
(ROOT/'reports/holdings_test_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:result[k] for k in ('total','passed','failed')},ensure_ascii=False))
sys.exit(1 if result['failed'] else 0)
