// Run only two extracted response helpers with a local fake fetch.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const source = fs.readFileSync(path.join(__dirname,'../scripts/stats-patent.user.js'),'utf8');
function section(start,end) {
  const a=source.indexOf(start), b=source.indexOf(end,a+start.length);
  if(a<0 || b<0) throw Error('diagnostic function boundaries changed');
  return source.slice(a,b);
}
const helpers=section('function findFirstObjectArray(', 'async function fetchExpenseDirect(')+'\n'+section('async function postKrissJson(', 'async function fetchIprsDirect(');
const cases = [
  {name:'정상 목록 응답',body:{errorCode:0,total:1,data:[{id:'SYNTHETIC'}]},status:200,reject:false},
  {name:'정상 빈 목록',body:{errorCode:0,total:0,data:[]},status:200,reject:false},
  {name:'HTTP 오류',body:{errorCode:-1,data:[]},status:500,reject:true},
  {name:'JSON 아닌 응답',raw:'<html>login</html>',status:200,reject:true},
  {name:'HTTP 200이지만 업무 오류 + 빈 목록',body:{errorCode:-1,errorMessage:'SYNTHETIC FAILURE',data:[]},status:200,reject:true},
  {name:'HTTP 200이지만 업무 오류 + 잔여 목록',body:{errorCode:-1,errorMessage:'SYNTHETIC FAILURE',data:[{id:'SYNTHETIC'}]},status:200,reject:true},
];
fs.mkdirSync(path.join(__dirname,'reports'),{recursive:true});
(async()=>{
  const results=[];
  for(const tc of cases){
    const context=vm.createContext({URLSearchParams,console:{log(){}},fetch:async()=>({status:tc.status,ok:tc.status>=200 && tc.status<300,text:async()=>tc.raw??JSON.stringify(tc.body)})});
    vm.runInContext('let LAST_FETCH_TOTAL=null; let LAST_FETCH_DIAG=null;\n'+helpers,context,{timeout:1000});
    let rejected=false, count=null;
    try { count=(await vm.runInContext("postKrissJson('https://synthetic.invalid',{})",context,{timeout:1000})).length; }
    catch { rejected=true; }
    results.push({name:tc.name,expected_rejected:tc.reject,actual_rejected:rejected,returned_rows:count,passed:rejected===tc.reject});
  }
  const out={source_sha256:crypto.createHash('sha256').update(source).digest('hex'),scope:'추출한 공통 응답 함수에 합성 fetch 응답 주입; 외부 통신 없음; 실서버 응답 형식 확인 전',total:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,cases:results};
  fs.writeFileSync(path.join(__dirname,'reports/stats_response_results.json'),JSON.stringify(out,null,2));
  console.log(JSON.stringify({total:out.total,passed:out.passed,failed:out.failed}));
  process.exitCode=out.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
