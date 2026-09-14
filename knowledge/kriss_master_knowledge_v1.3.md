# KRISS 시스템 지식 마스터 문서 (v1.3)

개정 기준일: 2026년 09월 11일 (기존 지식 보존 + 논문 인사평가·인사명단·본부매칭·사용자 운영 확인 추가)
범위: 기존 정찰기·업무 스크립트 지식과 2026-09-08 개정 내용을 보존하고, 2026-09-11 논문 인사평가 자동화 및 인사조회 정보를 추가했다. 1~12장의 수치·계약은 당시 기록이며 최신 보완은 13장을 함께 확인한다. 기계가독형 최신 파일은 kriss_knowledge_pack_v1.2.json이다.

## 0. 출처 세대 요약

| 출처 | 특징 | 고유 기여 |
|---|---|---|
| 정찰기 v5.3.2 | 포털 index.do 심층(6.3MB), 19화면 | 포털 위젯 API 39종 · 팝업 패밀리 15종(BPM 2패턴 최초 실측) · 통합검색 Check.jsp 계약 |
| 정찰기 v6.0.0 | 재설계 직후 | 출원 팝업(S_PMS_03012020) 단독 심층(345KB) |
| 정찰기 v6.0.2 | IPMS 전 탭 순회, 22화면 | **나의 업무(_bpm_worklist)** 심층 — ST/프로세스코드 대량 관측 · 화면 라벨 최상 |
| 정찰기 v7.0.0 (활성) | 2026-08-10~18, 21화면 | Capability 계약 · 지출[발의,결의](S_ACC_01020000) 회계 API 13종 · 팝업 상태벡터 |
| 행정업무 정찰기 v1.0.0 | 2026-08-05, 28화면 | **실행계약 15종(예시값 포함)** · B_RES00016 발견 · 전자결재(.act) 화면 · 쓰기차단 원장 |
| 스크립트 19종 | 활성 18 + 연차유지료 v0.8.3 | 대시보드 실측 라우팅 규칙 · B_ACT00002 계약 · 각 도구의 검증된 업무 API |

## 1. 시스템 지도 (호스트)

- **krisstar.kriss.re.kr** — 포털 메인 · IPMS(pms) · 회계 MIS(mis/acc) · 인사(mis/hrm) · BPM 목록 프록시
- **gw.kriss.re.kr(:8088)** — 그룹웨어 — 메일(wma) · 전자결재(bms/*.act) · 프레임(jsp/main)
- **bpm.kriss.re.kr** — BPM 원 서버(정찰기 @match 관측)
- **search.kriss.re.kr:9443** — 통합검색(kriss/search.jsp · Check.jsp)

## 2. 업무 프로세스 코드 사전 (13종)

| 코드 | 업무명 | 근거 | 관측 |
|---|---|---|---:|
| B_ACT00002 | 지출발의 신청(회계) | 행정업무 정찰기 화면 제목·연차유지료 상수 | 82 |
| B_BUS00002 | (미확정) | 미확정 — 워크리스트 원문 관측만 존재 | 8 |
| B_BUS00005 | (미확정) | 미확정 — 워크리스트 원문 관측만 존재 | 4 |
| B_GEA00007 | (미확정) | 미확정 — 워크리스트 원문 관측만 존재 | 1 |
| B_GEA00027 | (미확정) | 미확정 — 워크리스트 원문 관측만 존재 | 3 |
| B_RES00002 | (업무명 미확정) | 실행계약 경로 실측: /pms/res/tets/B_RES00002_01.do → res/tets 영역 | 107 |
| B_RES00004 | 지식재산권 신청 | 워크리스트 defname 실측 | 512 |
| B_RES00011 | (업무명 미확정) | 실행계약 경로 실측: /pms/iprs/aply/B_RES00011_01.do → 출원(aply) 영역 | 66 |
| B_RES00012 | 업무요청사항검토 | 워크리스트 defname 실측(12회) | 409 |
| B_RES00013 | (미확정) | 미확정 — 워크리스트 원문 관측만 존재 | 6 |
| B_RES00014 | (미확정) | 미확정 — 워크리스트 원문 관측만 존재 | 5 |
| B_RES00015 | 비용청구서 검토 | 워크리스트 defname 실측 | 389 |
| B_RES00016 | 특허 연차유지여부 관리 | 행정업무 정찰기 화면 제목 | 50 |

## 3. 상태 체계

### 3-1. workFlag (진입 모드)
- **readOnly**: 조회 전용(목록화면 발)  (필수키: bizKey · workFlag · from)
- **myWork**: 내 처리 컨텍스트(워크리스트 발)  (필수키: processCode · bizKey · statusCode · workFlag)
- **newWork**: 신규 작성(연차유지료 실측)  (필수키: bizKey(빈값) · workFlag · processCode · statusCode · subFlag)
- **work**: 실측 미존재 — 사용 금지  (필수키: —)

### 3-2. BPM 상태코드(ST****) 11종

| 코드 | 의미 | 확정도 | 관측 |
|---|---|---|---:|
| ST0100 | 연차유지료(B_ACT00002) 신규(newWork)·임시저장 재개(myWork) 공통 관측값 | 확정 | 73 |
| ST0101 | B_RES00016(연차유지여부) readOnly 샘플 관측값 | 확정 | 14 |
| ST0102 | — | 관측만(의미 미확정) | 4 |
| ST0103 | 업무요청(B_RES00012) — 실무 규칙상 특허사무소 전달사항(mssage) 필수 단계(대시보드 실측: 박사 검토완료→특허사무소 전달) | 확정 | 261 |
| ST0200 | — | 관측만(의미 미확정) | 5 |
| ST0301 | 비용청구서(B_RES00015) 검토중 계열 관측값(하위상태 미확정) | 확정 | 169 |
| ST0500 | — | 관측만(의미 미확정) | 61 |
| ST2088 | — | 관측만(의미 미확정) | 1 |
| ST2089 | — | 관측만(의미 미확정) | 1 |
| ST3000 | — | 관측만(의미 미확정) | 9 |
| ST4000 | — | 관측만(의미 미확정) | 37 |

### 3-3. 화면별 상태 옵션(select/radio 실측) — 전량

**S_PMS_03010100**
- `apvStat` (결재상태, select): ∅=전체 / 00=임시저장 / 01=신청 / 03=내부결재 / 04=완료
- `aplyRqstYn` (신청일, radio): Y=완료 / N=미완료 / ∅=전체
- `cntCls` (국내/외구분, radio): I=국내 / O=국외 / M=PCT / ∅=전체

**S_PMS_03012010**
- `ivenTyp` (지재권종류, select): ∅=선택 / 01=특허 / 07=실용신안 / 08=디자인 / 09=상표 / 03=프로그램 / 10=기타
- `apvStat` (진행상태, select): ∅=전체 / 10=출원지시전 / 01=출원지시 / 02=접수 / 03=처리중 / 04=제출 / 05=출원검토 / 09=완료

**S_ACC_01020000**
- `docuType` (지출구분, select): ∅=선택 / 01=결정된방침에 의한 지출결의 / 02=회의비 및 유사비목 지출결의 / 04=제세및 공공요금 지출발의 / 05=기타 지출발의(학회연회비포함) / 06=해외출장비 / 07=소액구매지출발의 / 08=연구원 공공요금(수도,전기,전화) / 09=국내,국외 세미나및 연구자문발의 / 12=선택적 복리후생비 / 13=연구활동 진흥비(1,2) 및 보안수당 발의 / 14=내자구매지출발의 / 15=외자구매지출발의 / 16=급여 지출발의 / 17=기술료 보상금 지출발의 / 18=장려금지출발의 / 21=학자금융자 지출발의 / 22=예수금(소급료) 지출발의 / 23=퇴직금지급(정규직)지출발의 / 24=퇴직금지급(비정규)지출발의 / 26=위탁/협동/공동 연구비 / 27=특허 출원/등록/연차료 / 28=국내출장 / 30=학회관련(참가/등록/교육비)지출발의 / 32=인공지능챗봇구독서비스 지출발의 / 41=연구비반납[연구비정산] / 44=고용,산재보험 지출발의 / 45=국민/건강/고용/산재보험 지출발의
- `acctStatus` (결재상태, select): ∅=선택 / 00=임시저장 / 01=신청중 / 02=검토중 / 03=승인중 / 04=결재 / 05=반려
- `dangYn` (결의일자, radio): A=당좌여부 / Y=발행 / N=미발행
- `errorYn` (거래처, radio): A=전체 / Y=오류발생 / N=정상처리

**_bpm_worklist**
- `status` (상태, select): all=전체 / NEW=대기중 / CONFIRMED=처리중 / DELEGATED=위임중

**S_PMS_03011020**
- `apvStat` (진행상태, select): ∅=전체 / 00=임시저장 / 01=신청 / 02=접수 / 03=처리중 / 04=완료

**S_PMS_03013010**
- `apvStat` (진행상태, select): ∅=전체 / 01=결정보고제출(사무소) / 02=결정보고접수 / 03=결정보고검토중 / 04=결정보고검토완료 / 05=결정보고결과확인(사무소) / 06=완료보고작성중(사무소) / 07=완료보고제출(사무소) / 08=완료보고접수 / 09=완료보고검토 중비중 / 10=완료
- `cntCls` (기간, radio): I=국내 / O=국외 / M=PCT / ∅=전체

**S_PMS_03014010**
- `apvCls` (진행상태, select): ∅=전체 / 01=표준연 → 사무소 / 02=사무소 → 표준연
- `apvStat` (진행상태, select): ∅=전체 / 00=임시저장 / 01=신청 / 02=접수 / 03=검토중 / 04=확인대기 / 05=완료

**S_PMS_03015020**
- `apvStat` (진행상태, select): ∅=전체 / 01=접수대기 / 02=접수 / 03=검토준비중 / 04=검토중 / 09=계산서발행대기(사무소) / 10=지출발의대기 / 11=완료

**S_PMS_03019010**
- `cntCls` (기간, radio): I=국내 / O=국외 / M=PCT / ∅=전체

**S_PMS_03017010**
- `apvStat` (진행상태, select): ∅=전체 / 00=임시저장 / 01=신청 / 02=접수 / 03=처리중 / 04=확인대기 / 05=완료

**S_PMS_03020305**
- `q_inOut` (직원구분, ): ∅=전체 / I=내부 / O=외부

### 3-4. 대시보드 실측 상태 의미(v1.21.0)
- **exp.apvStat**: 10 → 지출발의·결의 대기 → 03015040 · 04|07 → 검토(cnfRqstNo 보유 시 B_RES00015 myWork/ST0301) · 기타 → 03015030 폴백
- **task**: 목록 apvStat → 03 없음(03은 별도 축 bpmApvStat 값) · apvStatNm 실측 → 04=검토중, 05·06=완료 · 03|04 → B_RES00012 readOnly · 01 등 → 03014020
- **reg**: cmplRqstApvStat → 12=완료 다수 실측, 09=미관측(로직만 유지) · REG_DONE → ['07','12']
- **apply**: 흐름 → 신청완료(apvStat=04)+ppsRqstNo無+reRqstType=G → 선행조사 요청 생성 제안(updateIntellPpsInfo.json, 확인 게이트)

## 4. 실행계약(팝업·런치) 카탈로그 — 71종 전량

서명 표기: `METHOD 경로|파라미터키`. ⟨⟩=관측 출처. 예시값은 정찰기가 마스킹 저장한 실측 파라미터.

### BPM 컨테이너(B_*) — 핵심 (8종)
- `POST /pms/iprs/aply/B_RES00011_01.do|bizKey,from,workFlag`  ⟨v7⟩
- `POST /pms/iprs/etcTask/B_RES00012_01.do|bizKey,from,workFlag`  ⟨v532⟩
- `POST /pms/iprs/etcTask/B_RES00012_01.do|bizKey,processCode,statusCode,workFlag`  ⟨v532,v602,v7⟩
- `POST /pms/iprs/exp/B_RES00015_01.do|bizKey,processCode,statusCode,workFlag`  ⟨v532,v602⟩
- `POST /pms/iprs/pm/B_RES00016_01.do|bizKey,processCode,resperEmpNo,rqstDt,rqstEmpNo,rqstNo,statusCode,workFlag`  ⟨admin⟩
  - 예시: `{"workFlag": "readOnly", "processCode": "B_RES00016", "statusCode": "ST0101", "bizKey": "[alnum:10]", "rqstNo": "[alnum:10]", "rqstEmpNo": "[digits:5]", "rqstDt": "[date:10]", "resperEmpNo": ""}`
- `POST /pms/res/intellppty/B_RES00004_01.do|bizKey,from,workFlag`  ⟨v532,v602,v7⟩
- `POST /pms/res/tets/B_RES00002_01.do|bizKey,processCode,statusCode,workFlag`  ⟨v602⟩
- `POST /pms/res/tets/B_RES00002_01.do|bizKey,workFlag`  ⟨v532⟩

### 회계(지출발의·계좌·검색) (10종)
- `GET /mis/acc/S_ACC_01000000_P06.do|`  ⟨admin⟩
- `GET /mis/acc/S_ACC_01000000_P07.do|`  ⟨admin⟩
- `GET /mis/acc/S_ACC_01020000.do|`  ⟨v7⟩
- `GET /mis/acc/popup/S_ACC_01020100.do|`  ⟨v602,v7⟩
- `GET /mis/acc/popup/S_ACC_01020100.do|popupAt`  ⟨v7⟩
- `GET /mis/acc/popup/S_ACC_01020101.do|`  ⟨v7⟩
- `POST /mis/acc/S_ACC_01000000_P05.do|apvlNo,bankAcctNo,bankCd,bankNm,billKind,busiRegNo,cardNo,custNm,dpstor,dpstorNo,mgmtNo,payCls`  ⟨v7⟩
- `POST /mis/acc/popup/S_ACC_01020100.do|bizKey,processCode,statusCode,subFlag,workFlag`  ⟨admin⟩
  - 예시: `{"bizKey": "", "workFlag": "newWork", "processCode": "B_ACT00002", "statusCode": "ST0100", "subFlag": "N"}`
- `POST /mis/acc/popup/S_ACC_01020100.do|bizKey,processCode,statusCode,workFlag`  ⟨v602,v7⟩
- `POST /mis/acc/popup/S_ACC_01020101.do|bizKey,workFlag`  ⟨v7⟩

### IPMS·PMS 팝업 (18종)
- `GET /pms/iprs/aply/S_PMS_03012010.do|`  ⟨v7⟩
- `GET /pms/iprs/aply/popup/S_PMS_03012020.do|`  ⟨v7⟩
- `GET /pms/iprs/etcTask/S_PMS_03014040_P02.do|popupAt`  ⟨v602⟩
- `GET /pms/iprs/etcTask/popup/S_PMS_03014020.do|`  ⟨v7⟩
- `GET /pms/iprs/exp/S_PMS_03015030.do|popupAt`  ⟨v7⟩
- `GET /pms/iprs/pm/S_PMS_03016010.do|`  ⟨admin⟩
- `GET /pms/iprs/pm/popup/S_PMS_03016040.do|`  ⟨admin⟩
- `GET /pms/res/intellppty/S_PMS_03010100.do|`  ⟨v602,v7⟩
- `GET /pms/res/intellppty/S_PMS_03010100.do|krissBatch,krissIndex`  ⟨v602⟩
- `GET /pms/res/tets/S_PMS_03020305.do|`  ⟨v532⟩
- `POST /pms/bus/prog/projhistory/S_PMS_01040101.do|`  ⟨v532⟩
- `POST /pms/bus/prog/projhistory/popup/S_PMS_01040101_P01.do|deg,projCd`  ⟨v532⟩
- `POST /pms/iprs/aply/popup/S_PMS_03012020.do|intellRqstNo,rqstNo`  ⟨v7⟩
- `POST /pms/iprs/etcTask/S_PMS_03014040_P02.do|`  ⟨v602⟩
- `POST /pms/iprs/etcTask/popup/S_PMS_03014020.do|rqstNo`  ⟨v7⟩
- `POST /pms/iprs/exp/S_PMS_03015030.do|rqstNo`  ⟨v7⟩
- `POST /pms/iprs/mng/popup/S_PMS_03019020.do|intellRqstNo`  ⟨v532,v602,v7⟩
- `POST /pms/iprs/pps/popup/S_PMS_03011010.do|rqstNo`  ⟨v532,v602⟩

### BPM 목록 (4종)
- `GET /bpm/worklist/workList.do|krissBatch,krissIndex,popupAt`  ⟨v602⟩
- `GET /bpm/worklist/workList.do|popupAt`  ⟨v602,v7⟩
- `POST /bpm/instancelist/runningInstanceList.do|`  ⟨v532⟩
- `POST /bpm/worklist/workList.do|`  ⟨v532,v602,v7⟩

### 그룹웨어 (7종)
- `POST /bms/com/hs/gwweb/appr/retrieveCmmnFormatList.act|displayFlag`  ⟨admin⟩
  - 예시: `{"displayFlag": ""}`
- `POST /bms/com/hs/gwweb/appr/retrieveFldrPrivate.act|auditorFlag,fMode,selectMode`  ⟨admin⟩
  - 예시: `{"selectMode": "1", "auditorFlag": "", "fMode": "appr"}`
- `POST /bms/com/hs/gwweb/appr/retrieveRceptWaitDocList.act|selectMode`  ⟨admin⟩
  - 예시: `{"selectMode": "1"}`
- `POST /jsp/custom/SSOLogin.jsp|IN_OUT_FLAG`  ⟨admin⟩
  - 예시: `{"IN_OUT_FLAG": "10.167.11.198"}`
- `POST /jsp/main/frame.jsp|`  ⟨v532⟩
- `POST /wma/fld.do|mailBoxPreServeDays,trashPreServeDays`  ⟨admin⟩
  - 예시: `{"mailBoxPreServeDays": "0", "trashPreServeDays": "61"}`
- `POST /wma/wma.do|toJSONString`  ⟨admin⟩
  - 예시: `{"toJSONString": "[text:950]"}`

### 통합검색 (2종)
- `POST /kriss/Check.jsp|K,allsearch_text,dept_cd,emp_cd,emp_cls,kwd,sso_token`  ⟨v532,v602⟩
- `POST /kriss/search.jsp|reSrchFlag`  ⟨admin⟩
  - 예시: `{"reSrchFlag": "false"}`

### 인사(HRM) (3종)
- `GET /mis/hrm/edumng/edurqst/popup/S_HRM_01021200_P01.do|eduNo,workFlag`  ⟨v7⟩
- `GET /mis/hrm/popup/S_HRM_01010100_P02.do|`  ⟨admin⟩
- `GET /mis/hrm/popup/S_HRM_01050300.do|`  ⟨v532⟩

### 포털·공통·기타 (19종)
- `GET /etc/user/popup/selectUserList.do|`  ⟨admin⟩
- `GET /index.do|`  ⟨v602,v7⟩
- `GET /index.do|krissBatch,krissIndex`  ⟨v602⟩
- `GET /index.do|krissReconBatch,krissReconIndex`  ⟨v532⟩
- `GET /mis/index.do|`  ⟨v7⟩
- `GET /popup/S_COM_00000000P07.do|`  ⟨v7⟩
- `GET /popup/S_COM_00000000P13.do|`  ⟨v602,v7⟩
- `GET /popup/S_COM_00000000P16.do|`  ⟨v602,v7⟩
- `GET /popup/scheduleList.do|`  ⟨v532,v7⟩
- `GET /portalPopup/totalMenuList.do|`  ⟨v7⟩
- `GET /servlet/HIServlet|BMID,BRDID,GADGET,MENUBAR,SLET`  ⟨v7⟩
- `GET blank|`  ⟨v602,v7⟩
- `POST /__tmax_eam_server__|tmaxsso_algorithm,tmaxsso_checksingle,tmaxsso_enco,tmaxsso_keysize,tmaxsso_keytype,tmaxsso_method,tmaxsso_next,tmaxsso_serv,tmaxsso_tokn,tmaxsso_yesnoanswer`  ⟨v7⟩
- `POST /chart/viewBizFlowChart.do|bizKey,processCode,ssoEmpNo,workFlag`  ⟨v532⟩
- `POST /com/cmm/rd/reportView.do|docuType,rdUrl,rqstDeptNm,rqstEmpNm,rqstNo`  ⟨v7⟩
- `POST /etc/user/popup/selectUserList.do|deptCd,deptNm,empNm,empNo,from,layoffYn,param2,param3,param4,param5,selectMode,title`  ⟨v602⟩
- `POST /mis/bud/S_BUD_01000000_P19.do|undefined`  ⟨v7⟩
- `POST /portalPopup/totalMenuList.do|`  ⟨v7⟩
- `POST /uat/uia/actionLogin.do|id,message,password`  ⟨v7⟩

## 5. API 카탈로그 — 108종 전량

⟨정찰기 세대⟩ [사용 스크립트] @대표화면. '스크립트만'=정찰기 미관측, 코드에서만 확인.

### BPM 나의업무 (2종)
- `GET /selectMyWork.json` ⟨v532,v602,v7⟩ [KRISS 정찰기 v7.0.0 (복합업무셀 , [KRISS Portal] 업무 대시보드] @__index_do
- `GET /selectMyWorkIng.json` ⟨v532,v602,v7⟩ [KRISS 정찰기 v7.0.0 (복합업무셀 , [KRISS Portal] 업무 대시보드] @__index_do

### IPMS 업무(선행조사~연차) (29종)
- `GET /pms/iprs/aply/selectAplyRqstInfo.json` ⟨v7⟩ @S_PMS_03012010
- `POST /pms/iprs/aply/selectAplyRqstList.json` ⟨v532,v602,v7⟩ [[KRISS Portal] 업무 대시보드, [특허] 통합검색, [특허] 팔레트 (Ctrl+Space)] @S_PMS_03012010,__index_do
- `(스크립트 사용만) /pms/iprs/aply/selectEmpInfo.json` ⟨스크립트만⟩ [KRISS 입력 Helper]
- `GET /pms/iprs/aply/selectIntellRqstInfo.json` ⟨v602,v7⟩ @S_PMS_03012010,S_PMS_03012020
- `GET /pms/iprs/etcTask/selectApvStatDropDownList.json` ⟨v602⟩ @S_PMS_03019010
- `POST /pms/iprs/etcTask/selectBudgIncost.json` ⟨v532,v602⟩ @__index_do,_bpm_worklist
- `GET /pms/iprs/etcTask/selectEtcTaskIvenRqstInfo.json` ⟨v532,v602,v7⟩ @B_RES00012_01,__index_do
- `POST /pms/iprs/etcTask/selectEtcTaskRqstList.json` ⟨v602,v7⟩ [[KRISS Portal] 업무 대시보드, [특허] 통합검색, [특허] 팔레트 (Ctrl+Space)] @S_PMS_03014010,__index_do
- `GET /pms/iprs/etcTask/selectIntellRqstInfo.json` ⟨v532,v602,v7⟩ @B_RES00012_01,S_PMS_03014020
- `GET /pms/iprs/etcTask/selectOetcTaskRqstInfo.json` ⟨v602,v7⟩ @S_PMS_03014020
- `POST /pms/iprs/etcTask/selectRefContList.json` ⟨v602⟩ [KRISS 입력 Helper] @S_PMS_03014040
- `GET /pms/iprs/exp/selectExpRqstCnf.json` ⟨v532,v602⟩ @__index_do,_bpm_worklist
- `POST /pms/iprs/exp/selectExpRqstCnfBudgList.json` ⟨v532,v602⟩ @__index_do,_bpm_worklist
- `POST /pms/iprs/exp/selectExpRqstDetailList.json` ⟨v602⟩ @S_PMS_03015020
- `POST /pms/iprs/exp/selectExpRqstInfo.json` ⟨v7⟩ @S_PMS_03015030
- `POST /pms/iprs/exp/selectExpRqstList.json` ⟨v602⟩ [[KRISS Portal] 업무 대시보드, [특허] 통합검색, [특허] 팔레트 (Ctrl+Space)] @S_PMS_03015020
- `(스크립트 사용만) /pms/iprs/intellPm/selectIprsPmMgmtList.json` ⟨스크립트만⟩ [KRISS 요구자료 콘솔 — 항목 어댑터]
- `POST /pms/iprs/intellReg/selectIntellRegRqstList.json` ⟨v602,v7⟩ [[KRISS Portal] 업무 대시보드, [특허] 통합검색, [특허] 팔레트 (Ctrl+Space)] @S_PMS_03013010,__index_do
- `POST /pms/iprs/mng/selectIntellAplyList.json` ⟨v602,v7⟩ [KRISS 요구자료 콘솔 — 항목 어댑터, KRISS 정찰기 v7.0.0 (복합업무셀 , [KRISS Portal] 업무 대시보드, [특허] 통합검색, [특허] 팔레트 (Ctrl+Space)] @S_PMS_03019010,__index_do
- `(스크립트 사용만) /pms/iprs/mng/selectIprsPmMgmtList.json` ⟨스크립트만⟩ [KRISS 요구자료 콘솔 — 항목 어댑터]
- `GET /pms/iprs/mng/selectIprsTrnsRqstInfo.json` ⟨v602⟩ @S_PMS_03019020
- `(스크립트 사용만) /pms/iprs/mng/updateIntell.json` ⟨스크립트만⟩ [KRISS 정찰기 v7.0.0 (복합업무셀 ]
- `(스크립트 사용만) /pms/iprs/pm/selectIprsPmList.json` ⟨스크립트만⟩ [KRISS 요구자료 콘솔 — 항목 어댑터]
- `POST /pms/iprs/pm/selectIprsPmMgmtList.json` ⟨v602⟩ [KRISS 요구자료 콘솔 — 항목 어댑터, [KRISS Portal] 업무 대시보드] @S_PMS_03016010
- `(스크립트 사용만) /pms/iprs/pm/selectIprsPmPsrvMngBpmList.json` ⟨스크립트만⟩ [KRISS 요구자료 콘솔 — 항목 어댑터, [KRISS Portal] 업무 대시보드]
- `POST /pms/iprs/pps/selectPpsList.json` ⟨v602,v7⟩ [KRISS 요구자료 콘솔, [KRISS Portal] 업무 대시보드, [특허] 통합검색, [특허] 팔레트 (Ctrl+Space)] @S_PMS_03011020,__index_do
- `GET /pms/iprs/pps/selectPpsRqst.json` ⟨v602⟩ [KRISS 입력 Helper] @S_PMS_03012020
- `(스크립트 사용만) /pms/iprs/pps/updateIntellPpsInfo.json` ⟨스크립트만⟩ [KRISS 정찰기 v7.0.0 (복합업무셀 , [KRISS Portal] 업무 대시보드]
- `POST /pms/iprs/trns/selectIprsTrnsRqstList.json` ⟨v602⟩ [[KRISS Portal] 업무 대시보드] @S_PMS_03017010

### IPMS 지재권 신청·마스터 (6종)
- `POST /pms/res/intellppty/searchIntellIven.json` ⟨v600,v602,v7⟩ @S_PMS_03010100,S_PMS_03012020
- `POST /pms/res/intellppty/searchIntellOwr.json` ⟨v600,v602,v7⟩ @S_PMS_03010100,S_PMS_03012020
- `GET /pms/res/intellppty/searchIntellRqst.json` ⟨v600,v602,v7⟩ [[KRISS Portal] 업무 대시보드] @S_PMS_03010100,S_PMS_03012020
- `POST /pms/res/intellppty/searchPlanRelnProjList.json` ⟨v600,v602,v7⟩ @S_PMS_03010100,S_PMS_03012020
- `GET /pms/res/intellppty/selectCurrentBpmLine.json` ⟨v600,v602,v7⟩ @S_PMS_03010100,S_PMS_03012020
- `POST /pms/res/intellppty/selectIntellpptyList.json` ⟨v600,v602,v7⟩ [KRISS 입력 Helper, [KRISS Portal] 업무 대시보드, [특허] 통합검색, [특허] 팔레트 (Ctrl+Space)] @S_PMS_03010100,S_PMS_03012020

### 회계(MIS) (18종)
- `POST /mis/acc/checkInformation.json` ⟨v7⟩ @S_ACC_01020100
- `POST /mis/acc/closing/asstnLedgrSttus/selectAsstnLedgrSttus.json` ⟨v532⟩ @S_ACC_01080250
- `POST /mis/acc/expndtrMng/expndtrResol/getExpndtrResolList.json` ⟨v7⟩ @S_ACC_01020000
- `POST /mis/acc/expndtrMng/expndtrResol/selectExpsMangPayout.json` ⟨v7⟩ [KRISS 연차유지료 포털 자동화, KRISS 요구자료 콘솔 — 항목 어댑터, [연차유지료] 지출발의 자동화(최종)] @S_ACC_01020000,S_ACC_01020100
- `POST /mis/acc/expndtrMng/prufScan/getAccBudgNm.json` ⟨v7⟩ @S_ACC_01020100
- `POST /mis/acc/getAcctValues.json` ⟨v7⟩ @S_ACC_01020100
- `POST /mis/acc/getCardAmtInfo.json` ⟨v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `POST /mis/acc/getCardUserApintNm.json` ⟨v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `POST /mis/acc/inputSetlGetValue.json` ⟨v7⟩ @S_ACC_01020100
- `POST /mis/acc/searchCalcGrid.json` ⟨v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `POST /mis/acc/searchCrditGrid.json` ⟨v602,v7⟩ @S_ACC_01020100
- `POST /mis/acc/searchExpndtrGrid.json` ⟨v602,v7⟩ @S_ACC_01020100
- `POST /mis/acc/searchPymntGrid.json` ⟨v602,v7⟩ @S_ACC_01020100
- `POST /mis/acc/selectBillKindList.json` ⟨v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `POST /mis/acc/selectExpndtrCodeList.json` ⟨v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `POST /mis/acc/selectPymntGridResl.json` ⟨v7⟩ @S_ACC_01020000
- `POST /mis/acc/selectRqstHead.json` ⟨v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `POST /mis/acc/selectRqstM.json` ⟨v7⟩ @S_ACC_01020000

### 인사(HRM) (5종)
- `POST /mis/hrm/certificateMng/chkLaborCtrtcList.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /mis/hrm/edumng/edurqst/selectEduCrsInfo.json` ⟨v7⟩ @S_HRM_01021200
- `POST /mis/hrm/hrmng/dutyChagMng/searchDutyChagList.json` ⟨v532,v602,v7⟩ [KRISS 정찰기 v7.0.0 (복합업무셀 ] @__index_do
- `POST /mis/hrm/pInfoAgree/selectPrivacyAgreeYn.json` ⟨v532,v602,v7⟩ @__index_do
- `GET /mis/hrm/worktime/selectEmpCheckIn.json` ⟨v532,v602,v7⟩ @__index_do

### 감사 (2종)
- `GET /mis/aud/auditItem/cleanSelfCheck/selectCleanSurveyNo.json` ⟨v602,v7⟩ @__index_do
- `GET /mis/aud/auditItem/cleanSelfCheck/selectDgnsSurveyNo.json` ⟨v532,v602,v7⟩ @__index_do

### 포털 위젯 (14종)
- `POST /portal/main/selectBusBdgList.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /portal/main/selectBusPlanList.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potail/main/selectBrithList.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potail/main/selectCalendar.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potail/main/selectFoodList.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potail/main/selectMenberConut.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potail/main/selectSchdulGridList.json` ⟨v7⟩ @__popup_scheduleList_do
- `POST /potail/main/selectSchdulList.json` ⟨v7⟩ @__popup_scheduleList_do
- `GET /potal/main/getKistiOutsideMailCnt.json` ⟨v532,v7⟩ @__index_do
- `POST /potal/main/selectDcs.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potal/main/selectFavoriteBoards.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potal/main/selectFevent.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potal/main/selectNewBbs.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /potal/main/selectUserTmprData.json` ⟨v532,v602,v7⟩ @__index_do

### 루트(포털 종합) (11종)
- `POST /bpm/worklist/selectWorkList.json` ⟨v602,v7⟩ @_bpm_worklist
- `POST /getAnnualVacationYn.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /getRestWorkTimeOverYn.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /selectCardUser.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /selectHrmBasInfo.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /selectPwdCheck.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /selectSafetyWorkPermitInfo.json` ⟨v532,v602,v7⟩ @S_COM_00000000,__index_do
- `POST /selectSeminarInfo.json` ⟨v532,v602,v7⟩ @S_COM_00000000,__index_do
- `POST /selectTaxBill.json` ⟨v532,v602,v7⟩ @S_COM_00000000,__index_do
- `POST /selectTaxBillSale.json` ⟨v532,v602,v7⟩ @S_COM_00000000,__index_do
- `POST /wethrInfo.json` ⟨v532,v602,v7⟩ @__index_do

### 공통(첨부·코드) (6종)
- `GET /com/cmm/fms/download/selectFileItem.json` ⟨v602,v7⟩ [KRISS 개인저작물 논문 대조 Helper, KRISS 지재권 대조 Helper] @S_PMS_03015030,__index_do
- `GET /com/cmm/fms/external/selectFileList.json` ⟨v532,v602,v7⟩ @B_RES00012_01,S_PMS_03011020
- `GET /com/cmm/fms/selectFileList.json` ⟨v600,v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `GET /com/cmm/selectAuthList.json` ⟨v600,v602,v7⟩ @S_PMS_03010100,S_PMS_03012020
- `GET /com/cmm/selectComCodeAccList.json` ⟨v602,v7⟩ @S_ACC_01020000,S_ACC_01020100
- `GET /com/cmm/selectComCodeList.json` ⟨v7⟩ @S_HRM_01021200

### 공통(사용자·북마크) (3종)
- `POST /etc/bkmk/selectBkmkList.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /etc/dept/selectDeptTree.json` ⟨v7⟩ @__popup_scheduleList_do
- `POST /etc/user/selectUserList.json` ⟨v7⟩ @S_ACC_01020000

### PMS 기타(사업·공통) (6종)
- `POST /pms/amn/common/codereader/selectComCodeDropDownList.json` ⟨v600,v602,v7⟩ @S_PMS_03010100,S_PMS_03012010
- `POST /pms/bus/emppartirate/getEmpRate.json` ⟨v532,v602,v7⟩ @__index_do
- `POST /pms/res/tets/getPartiDetail.json` ⟨v602⟩ @_bpm_worklist
- `GET /pms/res/tets/getTets.json` ⟨v602⟩ @_bpm_worklist
- `POST /pms/res/tets/getTetsRelProjList.json` ⟨v602⟩ @_bpm_worklist
- `POST /pms/res/tets/selectTetsRawData.json` ⟨v532⟩ [KRISS Paper→HR Eval Engi] @S_PMS_03020305

### 그룹웨어 (3종)
- `POST /jsp/bbs/board/BBSScrapCheck.jsp` ⟨v7⟩ @_gw__servlet_HIServlet
- `POST /jsp/custom/mailGrant.jsp` ⟨v602⟩ @_gw__jsp_buddy_buddy_jsp
- `POST /jsp/custom/sample/gw_count.jsp` ⟨v532,v602,v7⟩ @__index_do

### 로그인 (3종)
- `POST /uat/uia/checkLastLogin.do` ⟨v7⟩ @__uat_uia_actionLoginMain_do
- `POST /uat/uia/searchIFList.json` ⟨v7⟩ @__uat_uia_actionLoginMain_do
- `POST /uat/uia/selectQnaNoReplyList.json` ⟨v532,v602,v7⟩ @__index_do

## 6. 화면 카탈로그 — 71종 전량

### IPMS (20종)
- **S_ACC_01080250** (라벨 미수집) — `/pms/res/techtrns/S_ACC_01080250.do` ⟨v532⟩
- **S_PMS_03010100** 지식재산권 신청 목록 — `/pms/res/intellppty/S_PMS_03010100.do` ⟨v7,v602⟩
- **S_PMS_03011020** 선행기술조사 — `/pms/iprs/pps/S_PMS_03011020.do` ⟨v602⟩
- **S_PMS_03012010** 출원관리 — `/pms/iprs/aply/S_PMS_03012010.do` ⟨v7,v602,v532⟩
- **S_PMS_03012020** (라벨 미수집) — `/pms/iprs/aply/popup/S_PMS_03012020.do` ⟨v602,v600⟩
- **S_PMS_03013010** 등록관리 — `/pms/iprs/reg/S_PMS_03013010.do` ⟨v602⟩
- **S_PMS_03013020** (라벨 미수집) — `/pms/iprs/reg/popup/S_PMS_03013020.do` ⟨v532⟩
- **S_PMS_03014010** 업무요청 — `/pms/iprs/etcTask/S_PMS_03014010.do` ⟨v602⟩
- **S_PMS_03014020** (라벨 미수집) — `/pms/iprs/etcTask/popup/S_PMS_03014020.do` ⟨v7,v602⟩
- **S_PMS_03014040** (라벨 미수집) — `/pms/iprs/etcTask/S_PMS_03014040_P02.do?popupAt=popup` ⟨v602,v532⟩
- **S_PMS_03015020** 청구서관리 — `/pms/iprs/exp/S_PMS_03015020.do` ⟨v602⟩
- **S_PMS_03015030** (라벨 미수집) — `/pms/iprs/exp/S_PMS_03015030.do?popupAt=popup` ⟨v7⟩
- **S_PMS_03016010** 연차관리 — `/pms/iprs/pm/S_PMS_03016010.do` ⟨v602,admin⟩
- **S_PMS_03016040** 특허 연차유지여부 관리(BPM) — `/pms/iprs/pm/popup/S_PMS_03016040.do` ⟨admin⟩
- **S_PMS_03017010** 이관요청 — `/pms/iprs/trns/S_PMS_03017010.do` ⟨v602⟩
- **S_PMS_03019010** 지식재산권 마스터 — `/pms/iprs/mng/S_PMS_03019010.do` ⟨v602⟩
- **S_PMS_03019020** (라벨 미수집) — `/pms/iprs/mng/popup/S_PMS_03019020.do` ⟨v602⟩
- **S_PMS_03019030** 특허별 지출관리 — `/pms/iprs/exp/S_PMS_03019030.do` ⟨v602⟩
- **S_PMS_03020305** (라벨 미수집) — `/pms/res/tets/S_PMS_03020305.do` ⟨v532⟩
- **S_PMS_03031100** (라벨 미수집) — `/pms/res/techtrns/S_PMS_03031100.do` ⟨v532⟩

### 회계 (5종)
- **S_ACC_01000000_P06** 예금계좌 검색 — `/mis/acc/S_ACC_01000000_P06.do` ⟨admin⟩
- **S_ACC_01000000_P07** 은행코드 검색 — `/mis/acc/S_ACC_01000000_P07.do` ⟨admin⟩
- **S_ACC_01020000** 지출[발의,결의] 목록 — `/mis/acc/S_ACC_01020000.do` ⟨v7⟩
- **S_ACC_01020100** 지출발의 신청[BPM] — `/mis/acc/popup/S_ACC_01020100.do` ⟨v602,admin⟩
- **S_ACC_01020100** (라벨 미수집) — `/mis/acc/popup/S_ACC_01020100.do?popupAt=popup` ⟨v7⟩

### BPM 컨테이너 화면 (4종)
- **B_RES00002_01** (라벨 미수집) — `/pms/res/tets/B_RES00002_01.do` ⟨v532⟩
- **B_RES00012_01** 한국표준과학연구원 — `/pms/iprs/etcTask/B_RES00012_01.do` ⟨v7,v532⟩
- **B_RES00015_01** (라벨 미수집) — `/pms/iprs/exp/B_RES00015_01.do` ⟨v532⟩
- **B_RES00016_01** 한국표준과학연구원 — `/pms/iprs/pm/B_RES00016_01.do` ⟨admin⟩

### BPM (2종)
- **__bpm_instancelist_runningInstanceList_do** (라벨 미수집) — `/bpm/instancelist/runningInstanceList.do?popupAt=popup` ⟨v7⟩
- **_bpm_worklist** 나의 업무 — `/bpm/worklist/workList.do?popupAt=popup` ⟨v7,v602⟩

### 인사 (3종)
- **S_HRM_01010100_P02** 인사관리 — `/mis/hrm/popup/S_HRM_01010100_P02.do` ⟨admin⟩
- **S_HRM_01021200** (라벨 미수집) — `/mis/hrm/edumng/edurqst/popup/S_HRM_01021200_P01.do?workFlag=newWork&e` ⟨v532⟩
- **S_HRM_01021200** (라벨 미수집) — `/mis/hrm/edumng/edurqst/popup/S_HRM_01021200_P01.do?workFlag=newWork&e` ⟨v7⟩

### 포털·공통 (9종)
- **S_COM_00000000** (라벨 미수집) — `/popup/S_COM_00000000P07.do` ⟨v7⟩
- **S_COM_00000000** (라벨 미수집) — `/popup/S_COM_00000000P13.do` ⟨v7⟩
- **S_COM_00000000** (라벨 미수집) — `/popup/S_COM_00000000P16.do` ⟨v7,v532⟩
- **__index_do** 포털 메인 — `/index.do` ⟨v7,v602,v532⟩
- **__index_do** (라벨 미수집) — `https://gw.kriss.re.kr/jsp/custom/messenger.jsp` ⟨v7,v602⟩
- **__mis_index_do** (라벨 미수집) — `/mis/index.do` ⟨v532⟩
- **__popup_scheduleList_do** (라벨 미수집) — `/popup/scheduleList.do` ⟨v7,v532⟩
- **_etc_user_popup_selectUserList_do** 사용자 조회 — `/etc/user/popup/selectUserList.do` ⟨admin⟩
- **blank** (라벨 미수집) — `blank` ⟨admin⟩

### 그룹웨어 (24종)
- **_bms_act_call_fldr_jsp** (라벨 미수집) — `/bms/act_call_fldr.jsp` ⟨admin⟩
- **_bms_com_hs_gwweb_appr_retrieveCmmnFormatList_act** (라벨 미수집) — `/bms/com/hs/gwweb/appr/retrieveCmmnFormatList.act` ⟨admin⟩
- **_bms_com_hs_gwweb_appr_retrieveFldrPrivate_act** 결재 — `/bms/com/hs/gwweb/appr/retrieveFldrPrivate.act` ⟨admin⟩
- **_bms_com_hs_gwweb_appr_retrieveRceptWaitDocList_act** (라벨 미수집) — `/bms/com/hs/gwweb/appr/retrieveRceptWaitDocList.act` ⟨admin⟩
- **_bms_com_hs_gwweb_folder_retrieveApprFrame_act** (라벨 미수집) — `/bms/com/hs/gwweb/folder/retrieveApprFrame.act` ⟨admin⟩
- **_bms_com_hs_gwweb_folder_retrieveFldrBookmkTree_act** 결재-북마크 — `/bms/com/hs/gwweb/folder/retrieveFldrBookmkTree.act` ⟨admin⟩
- **_bms_com_hs_gwweb_folder_retrieveFldrPrivateTree_act** 전자결재 — `/bms/com/hs/gwweb/folder/retrieveFldrPrivateTree.act` ⟨admin⟩
- **_gw_Mail** (라벨 미수집) — `/jsp/main/frame.jsp?SelMenu=Mail` ⟨v532⟩
- **_gw__jsp_buddy_buddy_jsp** (라벨 미수집) — `/jsp/buddy/buddy.jsp?UID=001049061` ⟨v602⟩
- **_gw__jsp_custom_messenger_jsp** (라벨 미수집) — `/jsp/custom/messenger.jsp` ⟨v532⟩
- **_gw__servlet_HIServlet** (라벨 미수집) — `/NULL.HTML` ⟨v7⟩
- **_gw__servlet_HIServlet** (라벨 미수집) — `/servlet/HIServlet?SLET=bbs.BBSMtrlRead.java&MENUBAR=ON&GADGET=YES&BRD` ⟨v7⟩
- **_gw__servlet_HIServlet** (라벨 미수집) — `/servlet/HIServlet?SLET=bbs.BBSMtrlRead.java&MENUBAR=ON&GADGET=YES&BRD` ⟨v532⟩
- **_gw__wma_icon_help_jsp** (라벨 미수집) — `/wma/icon_help.jsp` ⟨v532⟩
- **_handydocs_confhtml_gplogin_jsp** 오류가 발생하였습니다. — `/handydocs/confhtml/gplogin.jsp` ⟨admin⟩
- **_jsp_custom_SSOLogin_jsp** SSOLogin — `/jsp/custom/SSOLogin.jsp` ⟨admin⟩
- **_jsp_custom_messenger_jsp** (라벨 미수집) — `/jsp/custom/messenger.jsp` ⟨admin⟩
- **_jsp_main_communication_jsp** 그룹웨어_GW83 — `/jsp/main/communication.jsp` ⟨admin⟩
- **_jsp_main_frame_jsp** 그룹웨어_GW83 — `/jsp/main/frame.jsp` ⟨admin⟩
- **_jsp_main_linkage_jsp** Linkage Iframe page — `/jsp/main/linkage.jsp` ⟨admin⟩
- **_jsp_main_menu_jsp** 그룹웨어_GW83 — `/jsp/main/menu.jsp` ⟨admin⟩
- **_wma_fld_do** (라벨 미수집) — `/wma/fld.do` ⟨admin⟩
- **_wma_frame_jsp** 조직도 — `/wma/frame.jsp` ⟨admin⟩
- **_wma_wma_do** (라벨 미수집) — `/wma/wma.do` ⟨admin⟩

### 검색·로그인 (4종)
- **__uat_uia_actionLoginMain_do** (라벨 미수집) — `/uat/uia/actionLoginMain.do` ⟨v7⟩
- **__uat_uia_actionLogin_do** (라벨 미수집) — `/uat/uia/actionLogin.do` ⟨v7,v532⟩
- **_kriss_search_jsp** 한국표준과학연구원-통합검색 — `/kriss/search.jsp` ⟨admin⟩
- **_uat_uia_actionLogin_do** (라벨 미수집) — `/uat/uia/actionLogin.do` ⟨admin⟩

## 7. 그리드 필드 사전 — 수집 전 화면(64)

형식: 화면 · 그리드ID(열수): field(한글제목). 다세대 수집 시 최다 열 버전 채택.

- **S_ACC_01020000** · grid1(42열): rowNumber(No), isChecked(&nbsp;), docuType(지출구분), rqstNo(발의번호), billtype(증빙), rqstDt(발의일자), rqstEmp(발의자), rqstEmpNo(발의자사번), drAmt(결의금액), rqstDesc(적요), currentNm(결재선), acctStatus(상태), jungbing(증빙), newScanFile(인증), reslNo(결의번호), reslEmp(결의자), jiRqstNo(지출번호), skDocId(docId), filePath(파일경로), fileName(파일이름), report1(REPORT1), report2(REPORT2), report3(REPORT3), report4(REPORT4), report5(REPORT5), report1Key(REPORT1_KEY), report2Key(REPORT2_KEY), report3Key(REPORT3_KEY), report4Key(REPORT4_KEY), report5Key(REPORT5_KEY), scanFilePath(SCAN_FILE_PATH), scanFileName(SCAN_FILE_NAME), outYn(퇴직자체크), report6(REPORT6), report6Key(REPORT6_KEY), pdfTimestamp(PDF_TIMESTAMP), report7(REPORT7), report7Key(REPORT7_KEY), dlyPayAmt(지체상금), errorMessage(오류내용), scanFile((구)스캔), pdfFile((구)인증)
- **S_ACC_01020100** · calcGrid(20열): id(id), rqstSeq(순번), vatDt(계산서일자), billKind(계산서종류), vatCd(부가세구분), custNm(거래처명), mgmtNo(거래처코드), busiRegNo(사업자번호), supplyAmt(공급가액), vatAmt(부가세액), cardNo(카드번호), apvlNo(승인번호), issuId(전자증빙번호), vatDesc(적요), president(대표자명), busiAddr(거래처주소), pkKey(PK_KEY), etaxYn(ETAX_YN), etcYn(ETC_YN), etaxNo(ETAX_NO)
- **S_ACC_01020100** · crditGrid(15열): id(id), rqstSeq(순번), budgNm(계정명), budgCd(계정코드), budgYy(예산년도), acctNm(예산명), acctCd(예산코드), drCrAmt(금액), custNm(거래처명), mgmtNo(거래처코드), busiRegNo(사업자번호), rqstDesc(적 요), attdDesc(참석자), setlKey1(상계키), setlkeyYn(상계키필수)
- **S_ACC_01020100** · expndtrGrid(47열): id(id), rqstSeq(순번), budgNm(예산(계정)명), busiCls(사업분류(대)), budgCd(예산코드), budgYy(예산년도), acctNm(비목명), acctCd(비목코드), drCrAmt(금액), custNm(업체명), busiRegNo(사업자번호), mgmtNo(업체코드), rqstDesc(적 요), attdDesc(참석자), resnNo(원인행위번호), billKind(영수증구분), vatDt(사용일자), payCls(지급구분), cardNo(카드번호), apvlNo(승인번호), collno(추심번호), vatCd(부가세구분), setlKey1(상계키), trday(요일), trtime(승인시간), meetingYn(회의록유무), reasonYn(사유서유무), reasonMust(사유서필수), meetingMust(회의록필수), refDbYn(REF_DB_YN), setlkeyYn(SETLKEY_YN), drCr(DR_CR), etaxYn(ETAX_YN), etcYn(ETC_YN), etaxNo(ETAX_NO), etaxCls(ETAX_CLS), etaxClsPk(ETAX_CLS_PK), allEtaxClsPks(ALL_ETAX_CLS_PKS), attdCount(참석자수), cardHandYn(카드수기입력여부), docuType(지출구분), meetingData(회의록데이터), reasonData(사유서데이터), attdListData(참가자리스트), osdConnCls(외부연계), ezbaroClsCd(이지바로연계), acTotalAmt(acTotalAmt)
- **S_ACC_01020100** · kriss-reconcile-grid-1787015298295-j1i8zxvjl9p(3열): rqstNo(발의번호), drAmt(금액), rqstDesc(적요)
- **S_ACC_01020100** · kriss-reconcile-grid-1787015923557-3np9mool2c7(3열): rqstNo(발의번호), drAmt(금액), rqstDesc(적요)
- **S_ACC_01020100** · kriss-reconcile-grid-1787016150426-gr6dwqz5qt(3열): rqstNo(발의번호), drAmt(금액), rqstDesc(적요)
- **S_ACC_01020100** · kriss-reconcile-grid-1787016395107-bqtcpazwaft(3열): rqstNo(발의번호), drAmt(금액), rqstDesc(적요)
- **S_ACC_01020100** · pymntGrid(16열): id(id), rqstSeq(순번), icheSeq(이체순번), payCls(지급구분), dpstor(수령인), realDpstor(실제수령인), dpstorNo(수령인ID), bankNm(은행명), bankCd(은행코드), bankAcctNo(계좌번호), drCrAmt(입금액), busiRegNo(사업자번호), custNm(거래처명), mgmtNo(거래처코드), seq(SEQ), billKind(billKind)
- **S_ACC_01080250** · grid(32열): rowNumber(순번), acctCd(코드), acctNm(계정명), reslDt(결의일자), reslNo(결의번호), reslSeq(순번), budgCd(예산코드), budgNm(예산명), expCd(비목코드), expNm(비목명), busiRegNm(거래처), drAmt(차변금액), crAmt(대변금액), jaAmt(잔액), reslDesc(적요), setlKey(관리번호), bankNm(은행명), bankCd(은행코드), bankAcctNo(계좌번호), acctDrCr(차대구분), rqstNo(발의번호), busiClsNm(사업구분), busiSepNm(사업분류(대)), busiCatNm(사업분류(중)), busiBusNm(사업분류(소)), billKind(증빙구분), regsDate(발행일자), etaxClsPk(승인번호), cardNo(카드번호), incomeReslDt(입금일자), taxBase(과세표준액), addInfo(추가정보)
- **S_COM_00000000** · grid0(5열): workNm(공사/작업명), roomNo(장소), workStrDt(작업시작일), workEndDt(종료일), impactType(영향수준)
- **S_PMS_03010100** · grid1(17열): isChecked(선택), intellMngNo(관리번호), intellRqstNo(신청번호), rqstDt(신청일), ivenTypNm(발명종류), cntClsNm(국가), ivenNm(발명명칭), soJoCls(단독/공동여부), costShareRatio(KRISS지분), plfNm(희망특허사무소), intellMgmtNo(패밀리 번호), rqstEmpNm(신청자), mainIvenEmpNm(주발명자), ppsRqstDt(선행기술조사요청일), aplyRqstDt(출원지시일자), apvStat(결재상태), ppsRqstNo(선행기술조사번호)
- **S_PMS_03011020** · grid1(21열): isChecked(선택), rowNumber(순번), intellMngNo(관리번호), rqstNo(신청번호), aplyNtnNm(출원국), rqstSbjt(제목), busiRegNm(특허사무소), rqstEmpNm(신청자), mainIvenEmpNo(주발명자), mainIvenEmpNm(주발명자), aplyApvStat(출원관리진행상태), rqstDt(신청일자), cmplNeedDt(완료희망일자), cmplDt(완료일시), apvStat(진행상태), intellMngNo(지재권 관리번호), intellRqstNo(지재권 신청번호), ivenNm(지재권 명), reptUserNm(특허사무소 변리사), reptUserId(특허사무소 변리사 이메일), repUserTelNo(특허사무소 변리사 번호)
- **S_PMS_03012010** · grid1(23열): isChecked(선택), rowNumber(순번), intellMngNo(지식재산권신청 > 관리번호), intellRqstNo(지식재산권신청 > 신청번호), aplyNtnNm(지식재산권신청 > 출원국), ivenNm(지식재산권신청 > 발명명칭), rqstEmpNm(지식재산권신청 > 신청자), ppsRqstNo(지식재산권신청 > 선행기술조사), costShareRatio(지식재산권신청 > KRISS지분), apvStat(전체진행상태), rqstNo(출원지시 > 신청번호), rqstDt(출원지시 > 출원지시일), reptDt(출원지시 > 출원접수일), plfNm(출원지시 > 특허사무소), reptUserNm(출원지시 > 접수담당자), cmplDt(출원지시 > 출원제출일), cmplUserNm(출원지시 > 제출담당자), rqstApvStat(출원지시 > 진행상태), aplyNo(출원결과검토 > 출원번호), aplyDt(출원결과검토 > 출원일자), aplyRsltRqstDt(출원결과검토 > 출원검토실행일), aplyRsltRqstNo(출원결과검토 > 출원검토신청번호), aplyRsltApvStat(출원결과검토 > 진행상태)
- **S_PMS_03013010** · grid1(5열): isChecked(선택), rowNumber(순번)
- **S_PMS_03014010** · grid1(4열): isChecked(선택), rowNumber(순번)
- **S_PMS_03014040** · refDGrid(5열): refNo(문구번호), refCd(구분코드), refNm(구분명), refCont(내용), sortOrder(정렬순서)
- **S_PMS_03015020** · grid1(5열): isChecked(선택), rowNumber(순번)
- **S_PMS_03015020** · grid1Detail(16열): rowNumber(순번), reslDt(지출일자), accRqstNo(지출신청번호), reslNo(지출결의번호), rqstAmt(지출금액), expCls(지출구분), expType(상세내역), rqstEmpNm(지출신청자), budgCd(계정번호), busiRegNm(상호명), busiRegNo(사업자등록번호), intellMngNo(기관관리번호), intellRqstNo(기관신청번호), korRegNm(발명명칭(국문)), intellAplyNo(출원번호), intellRegNo(등록번호)
- **S_PMS_03015030** · grid1(9열): isChecked(&nbsp;), mainProjYn(주과제), budgCd(예산코드), budgNm(예산명), expNm(비목명), budgIncost(집행가능금액), rqstAmt(지출금액), resnNo(원인행위 번호), ctrlCd(통제 코드)
- **S_PMS_03016010** · grid1(12열): rowNumber(순번), mgmtNm(리마인더 명칭), genDt(생성일), cntCls(국내/국외), totlCnt(건수), psrvConfCnt(유지여부 확인대상건수), psrvYCnt(유지 결정건수), psrvNCnt(포기 결정건수), psrvTCnt(개인 양도 결정건수), psrvIngCnt(유지여부 확인 진행중건수), payCmplCnt(비용처리 완료건수), psrvNMailYn(포기 결정메일 발송 여부)
- **S_PMS_03017010** · grid1(3열): rowNumber(순번)
- **S_PMS_03019010** · grid1(27열): rowNumber(순번), intellMngNo(관리번호), intellRqstNo(신청번호), ivenTypNm(지재권구분), cntClsNm(국내외), aplyNtnNm(출원국가), reRqstType(출원종류), ivenNm(발명명칭(국문)), ivenEngNm(발명명칭(영문)), rqstDt(지재권신청일), keyword(키워드), teIntroWishYn(SMK제작의사), anlOffcNm(연차관리기관), rqstAmtSum(비용총액)
- **S_PMS_03019010** · grid2(16열): rowNumber(순번), intellMngNo(관리번호), intellRqstNo(신청번호), ivenTypNm(지재권구분), aplyNtnNm(출원국가), aplyRqstDt(출원신청일), ivenNm(발명명칭(국문)), ivenEngNm(발명명칭(영문)), mainIvenEmpNm(주발명자), ivenInfo(발명자), ivenInfoNms(발명자(이름)), intellAplyDt(출원일자), intellAplyNo(출원번호), intellRegDt(등록일자), intellRegNo(등록번호)
- **S_PMS_03020305** · grid1(38열): rowNumber(순번), partiEmpCls(직원구분), partiEmpNo(저자사번), empNm(저자명), sex(성별), upDeptNm(상위부서명), deptNm(부서명), yy(년도), tetsRqstNo(등록번호), sbjtKor(논문제목), ancmMedm(발표매체), ancmCls(발표구분), scitNm(수록지), issn(ISSN), krissGrade(원내기준), rqstDt(등록일), ancmDt(게재일), subDt(투고일), vol(VOL), num(ISSU(NUM)), strPage(시작페이지), endPage(종료페이지), partiCnt(총저자수), seqNo(저자순위), resEdtorYn(교신저자여부), doi(DOI), partiRate(참여율), qutStd(I/F(수록년도 기준)), qutStdSub(I/F(투고일 기준)), jcrRank(JCR백분위), apvlYn(담당자확인), apvStat(결재상태), mainProjInfo(주과제코드), mainBudgInfo(주예산코드), rate(기여율(%)), relProjList(관련 과제리스트(기여율)), relBudgList(관련 예산리스트(기여율)), relProjCnt(관련과제 수)
- **__bpm_instancelist_runningInstanceList_do** · calcGrid(20열): id(id), rqstSeq(순번), vatDt(계산서일자), billKind(계산서종류), vatCd(부가세구분), custNm(거래처명), mgmtNo(거래처코드), busiRegNo(사업자번호), supplyAmt(공급가액), vatAmt(부가세액), cardNo(카드번호), apvlNo(승인번호), issuId(전자증빙번호), vatDesc(적요), president(대표자명), busiAddr(거래처주소), pkKey(PK_KEY), etaxYn(ETAX_YN), etcYn(ETC_YN), etaxNo(ETAX_NO)
- **__bpm_instancelist_runningInstanceList_do** · expndtrGrid(60열): id(id), rqstSeq(순번), budgNm(예산명), budgCd(예산코드), budgYy(예산년도), taxCls(과면), acctNm(비목명), acctCd(비목코드), drCr(차대), drCrAmt(금액), custNm(업체명), mgmtNo(업체코드), busiRegNo(사업자번호), rqstDesc(적 요), attdDesc(참석자), billKind(영수증구분), vatDt(사용일자), payCls(지급구분), cardNo(카드번호), apvlNo(승인번호), vatCd(부가세구분), vatAmt(부가세액), resnNo(원인행위번호), acctM1(관리항목1), acctMv1(값1), acctM2(관리항목2), acctMv2(값2), acctM3(관리항목3), acctMv3(값3), acctM4(관리항목4), acctMv4(값4), acctM5(관리항목5), acctMv5(값5), acctM6(관리항목6), acctMv6(값6), sAcctCd(원가코드), dbInput(DB_INPUT), setlKey1(상계키), trday(요일), trTime(시각), meetingYn(MEETING_YN), reasonYn(REASON_YN), reasonMust(REASON_MUST), meetingMust(MEETING_MUST), refDbYn(REF_DB_YN), setlkeyYn(SETLKEY_YN), etaxYn(ETAX_YN), etcYn(ETC_YN), etaxNo(전자계산서번호), etaxCls(전자계산서첨부방법), etaxClsPk(ETAX_CLS_PK), allEtaxClsPks(ALL_ETAX_CLS_PKS), collno(COLLNO), attdCount(참석자수), curr(CURR), drAmtFor(DR_AMT_FOR), cardHandYn(CARD_HAND_YN), oriDrCrAmt(분개전금액), vatBunCls(분개구분), vatLnkNo(분개연결번호)
- **__bpm_instancelist_runningInstanceList_do** · pymntGrid(16열): id(id), rqstSeq(순번), icheSeq(이체순번), payCls(지급구분), dpstor(수령인), realDpstor(실제수령인), dpstorNo(수령인ID), bankNm(은행명), bankCd(은행코드), bankAcctNo(계좌번호), drCrAmt(입금액), busiRegNo(사업자번호), custNm(거래처명), mgmtNo(거래처코드), seq(SEQ), billKind(billKind)
- **__index_do** · dutyGrid(5열): seq(순번), dutyDeptNm(부서명), dutyNm(직무명), empNm(직무담당자), telnoOffc(내선번호)
- **__popup_scheduleList_do** · dayGrid(8열): deptCode(부서코드), minute(시간), beginDe(날짜), beginHms(시분), endDe(종료일시), schdulSj(일정제목), empNo(사번), empNm(작성자)
- **__popup_scheduleList_do** · schdulGrid(4열): beginDe(시작일시), endDe(종료일시), schdulSj(일정제목), empNm(작성자)
- **__popup_scheduleList_do** · weekGrid(5열): dm(요일), beginDe(시작일시), endDe(종료일시), schdulSj(일정제목), empNm(작성자)
- **_bpm_worklist** · grid1(16열): isChecked(&nbsp;), foldername(업무구분), systypename(구분), defname(프로세스명), currstatusnames(진행단계), info(업무명), subject(업무명), startdate(업무배정일시), duedate(처리기한), status(상태), ext1(주소1), ext2(주소2), isemergency(긴급), isrequest(요청), iscounsel(상담), process(프로세스)

## 8. 검색 계약 — 13화면 전량

**S_PMS_03010100** → `POST /pms/res/intellppty/selectIntellpptyList.json` (form `searchForm`)
- 기준 `item`(키워드필드 keyword): 관리번호→intellMngNo, 신청번호→intellRqstNo, 발명명칭→ivenNm, 신청자→rqstEmpNm, 주발명자→mainIvenEmpNm

**S_PMS_03012010** → `POST /pms/iprs/aply/selectAplyRqstList.json` (form `searchForm`)
- 기준 `item`(키워드필드 keyword): 관리번호→intellMngNo, 신청번호→intellRqstNo, 발명명칭→ivenNm, 신청자→rqstEmpNm, 발명자→None, 출원번호→aplyNo, 사무소→plfNm

**S_ACC_01020000** → `POST /mis/acc/expndtrMng/expndtrResol/selectExpsMangPayout.json` (form `searchForm`)
- 기준 `order`(키워드필드 rqstNo): 발의번호→rqstNo, 결의번호→reslNo, 지출번호→jiRqstNo
- 직접필드: [{'requestField': 'rqstDept', 'label': '\n\t\t\t\t\t\t\t\t발의일자\n\t\t\t\t\t\t\t', 'responseField': 'rqstDt', 'mappingBasis': 'label=columnTitle', 'verified': False, 'returnedRows': 0, 'queryShape': 'T***)'}, {'requestField': 'rqstEmpNm', 'label': '발의자', 'responseField': 'rqstEmp', 'mappingBasis': 'label=columnTitle', 'verified': True, 'returnedRows': 5, 'queryShape': '송***찬'}, {'requestField': 'rqstEmp', 'label': '\n\t\t\t\t\t\t\t\t발의일자\n\t\t\t\t\t\t\t', 'responseField': 'rqstEmp', 'mappingBasis': 'name=field', 'verified': False, 'returnedRows': 0, 'queryShape': '송***찬'}, {'requestField': 'toAmt', 'label': '\n\t\t\t\t\t\t\t\t지출구분\n\t\t\t\t\t\t\t', 'responseField': 'docuType', 'mappingBasis': 'label=columnTitle', 'verified': True, 'returnedRows': 5, 'queryShape': '**'}, {'requestField': 'reslNo', 'label': '결의번호', 'responseField': 'reslNo', 'mappingBasis': 'name=field', 'verified': True, 'returnedRows': 1, 'queryShape': 'E**********'}, {'requestField': 'jiRqstNo', 'label': '지출번호', 'responseField': 'jiRqstNo', 'mappingBasis': 'name=field', 'verified': True, 'returnedRows': 1, 'queryShape': 'P**********'}]

**__index_do** → `POST /mis/hrm/hrmng/dutyChagMng/searchDutyChagList.json` (form `SrcForm`)

**_bpm_worklist** → `POST /bpm/worklist/selectWorkList.json` (form `form1`)
- 직접필드: [{'requestField': 'folderName', 'label': '업무구분', 'responseField': 'foldername', 'mappingBasis': 'label=columnTitle', 'verified': True, 'returnedRows': 5, 'queryShape': '지***보'}, {'requestField': 'processName', 'label': '프로세스명', 'responseField': 'defname', 'mappingBasis': 'label=columnTitle', 'verified': True, 'returnedRows': 5, 'queryShape': '업***토'}, {'requestField': 'info', 'label': '업무명', 'responseField': 'info', 'mappingBasis': 'name=field', 'verified': True, 'returnedRows': 1, 'queryShape': '송***]'}]

**S_PMS_03011020** → `POST /pms/iprs/pps/selectPpsList.json` (form `searchForm`)
- 기준 `item`(키워드필드 keyword): 관리번호→intellMngNo, 제목→rqstSbjt, 신청번호→rqstNo, 신청자→rqstEmpNm, 주발명자→mainIvenEmpNo
- 직접필드: [{'requestField': 'plfNm', 'label': '신청일자', 'responseField': 'rqstDt', 'mappingBasis': 'label=columnTitle', 'verified': False, 'returnedRows': 0, 'queryShape': 'T***)'}]

**S_PMS_03013010** → `POST /pms/iprs/intellReg/selectIntellRegRqstList.json` (form `searchForm`)
- 기준 `item`(키워드필드 keyword): 관리번호→intellMngNo, 신청번호→intellRqstNo, 발명명칭→None, 신청자→None, 주발명자→None, 발명자→None, 출원번호→None, 등록번호→intellRegNo

**S_PMS_03014010** → `POST /pms/iprs/etcTask/selectEtcTaskRqstList.json` (form `searchForm`)

**S_PMS_03015020** → `POST /pms/iprs/exp/selectExpRqstDetailList.json` (form `searchForm`)
- 기준 `searchItem`(키워드필드 searchKeyword): 검토 신청번호→None, 지식재산권 관리번호→intellMngNo, 지식재산권 신청번호→intellRqstNo, 발의번호→None, 발명명칭→None, 주발명자→None, 발명자→None, 사무소→None, 출원번호→intellAplyNo, 등록번호→intellRegNo

**S_PMS_03019010** → `POST /pms/iprs/mng/selectIntellAplyList.json` (form `searchForm`)
- 기준 `item`(키워드필드 keyword): 관리번호→intellMngNo, 신청번호→intellRqstNo, 발명명칭(국문)→ivenNm, 발명명칭(영문)→ivenEngNm, 발명자→None, 주발명자→mainIvenEmpNm, 출원번호→None, 등록번호→intellRegNo, 사무소→plfNm, 키워드→keyword, 활용 가능분야→None

**S_PMS_03016010** → `POST /pms/iprs/pm/selectIprsPmMgmtList.json` (form `searchForm`)
- 직접필드: [{'requestField': 'mgmtNm', 'label': '리마인더 명칭', 'responseField': 'mgmtNm', 'mappingBasis': 'name=field', 'verified': True, 'returnedRows': 1, 'queryShape': '2***)'}]

**S_PMS_03017010** → `POST /pms/iprs/trns/selectIprsTrnsRqstList.json` (form `searchForm`)

**S_ACC_01080250** → `POST /mis/acc/closing/asstnLedgrSttus/selectAsstnLedgrSttus.json` (form `searchForm`)
- 직접필드: []

## 9. 쓰기 위험 원장 (정찰기 차단 실측)

- `POST https://gw.kriss.re.kr/wma/fld.do` — 유발: 받은 메일함 등 메일 폴더 조작 (6회 차단)
- `POST https://gw.kriss.re.kr/bms/com/hs/gwweb/appr/retrieveRcntFormatList.act` — 유발: 최근서식 기안하기 (4회 차단)
- 실행계약 중 쓰기 성격 주의 대상: `POST /wma/fld.do|mailBoxPreServeDays,trashPreServeDays`(메일 보관설정) · `POST /wma/wma.do|toJSONString`(메일 조작) — 자동화 시 명시적 확인 게이트 필수.

## 10. 정보 충돌·미확정 목록 (전수)

1. `workFlag='work'` — 실측 미존재로 폐기(대시보드 v1.16.0). 잔존 사용 금지.
2. reg `cmplRqstApvStat` — '09'(접수) 미관측, 실측 '12'=완료 다수. 09 로직은 폴백으로만 유지.
3. ST0301 — 비용청구서 '검토중 계열'만 확정, 하위상태(반려·보완 등) 코드 미확정.
4. 출원지시대기 S_PMS_03012020 파라미터 키 — intellRqstNo 단독 가정(폼구조상 유력), 미실측.
5. B_RES00002·00011·00013·00014, B_GEA00007·00027, B_BUS00002·00005 — 워크리스트 원문 관측만, 업무명 미확정(B_RES00002는 v5.3.2에 컨테이너 화면 1.2KB 수집분 존재).
6. ST0200·ST0500·ST2088·ST2089·ST3000·ST4000 — 관측만, 의미 미확정. 재정찰 대상.
7. v5.3.2 지식은 구포맷(kriss_palette_recon_*) — 포털 위젯 API 39종 등은 v7 KB에 없어 **v5.3.2가 유일 출처**(마이그레이션 완전성 미검증).
8. 라벨 미수집 화면 다수('(라벨 미수집)' 표기) — 재정찰 시 title 보강 필요.
9. Capability(taskCapabilities) — v7 전 건 `mode: UNKNOWN`·replay 미실행. 편집/승인 가능 판정 미완.
10. 그룹웨어 전자결재(.act) — 파라미터 계약 3종만 확보, 응답 스키마 미수집.

## 11. 콘솔·대시보드 프로젝트 연결점

- L0 라우트 리졸버 데이터 원본 = 4장(실행계약 71종) + 3장(상태 체계). route_contract_draft_v1.0.json은 검증된 부분집합.
- 대시보드 v2 statusCode 조인 = 5장 'BPM 나의업무' 2종 + 2장 프로세스 사전.
- 콘솔 읽기 잡 후보 = 5장에서 [사용 스크립트] 표기가 있는 전 API(검증된 호출 경로).
- 연차유지료 쓰기 잡 진입점 = `POST /mis/acc/popup/S_ACC_01020100.do|bizKey,processCode,statusCode,subFlag,workFlag`(예시값 확보).
- 신규 확장 여지 = B_RES00016(특허 연차유지여부 관리) 계약 확보 — 콘솔에 '유지여부 결정' 잡 추가 가능.

---
기존 본문 정보 최신성: 2026년 08월 19일 기준 (백업 파일). 2026년 09월 08일 개정 사항은 아래 12장.

## 12. 2026-09-08 개정 — 공동출원·선행조사·업무 표시

이 장은 오늘 제공된 HTML 2개, 스크립트 4개, 화면 캡처와 사용자 답변을 기존 지식에 덧붙인 것이다. **첨부에서 확인한 사실, 사용자가 지정한 업무 규칙, 로컬 코드 구현, 아직 확인하지 않은 사항을 구분한다.** 실제 포털에 새 코드를 설치하거나 서버 승인을 실행한 기록은 아니다. 기계가독형 대응 항목은 `kriss_knowledge_pack_v1.1.json`의 `evidence20260908`부터 `unverified20260908`까지다.

### 12-1. 오늘 자료의 출처와 확인 범위

| 식별자 | 자료 | 확인 범위 |
|---|---|---|
| HTML A | 첨부 `4de94bf1-424a-4c6d-b6d1-de921deba140/pasted-text.txt` | 지식재산권 신청 화면의 폼·권리자 표·조회 코드 |
| HTML B | 첨부 `3aa58cd9-0bb1-4bdd-9ee0-8d8fc9ad0767/pasted-text.txt` | 지식재산권 관리 상세의 권리자·선행조사·기타문서·연차관리 |
| 사용자 지정 | 오늘 대화와 답변 | 특정 타기관 **한 곳**의 지분 50% 초과, 결재완료 후 선행조사, 표시 기간·날짜·문구 동작 |
| 원본 스크립트 | 업무 대시보드 v1.25.10, 입력 Helper v1.8.11 | 기존 구현 및 오류 경로 |
| 다른 제공 스크립트 | `새 텍스트 문서.txt` = 팔레트 Ctrl+Space v1.3.4, `새 텍스트 문서 (2).txt` = [IPMS] 검색 개선 v1.6.8 | 문구 단축키 공존 및 검색 확장 대상 식별 |
| 기존 로컬 수정본 | 대시보드 v1.26.1, 입력 Helper v1.10.0 | 기간·큐·날짜·문구 구현 분석. 라이브 운영 결과는 별도 |

JSON에는 이 파일들의 절대 경로와 SHA-256을 기록했다. HTML의 자바스크립트나 문서 안 안내는 분석 대상 자료이며, 그 자체를 사용자의 추가 실행 지시로 해석하지 않는다.

### 12-2. 소유지분과 비용분담은 서로 다른 값

**기관별 소유지분은 `owrQuota`, 비용분담은 `costShareRatio`다.** 두 HTML의 특허권자 그리드에 별도 열로 존재한다. 기존 7장의 목록 `costShareRatio(KRISS지분)`은 당시 관측한 화면 라벨로 보존하지만, 소유지분이나 타기관 과반 판정 근거로 사용하면 안 된다.

| 필드 | 확인된 의미 | 사용 시 구분 |
|---|---|---|
| `orgCd` | 특허권자 기관 코드 | 기관 식별에 사용 |
| `orgNm` | 특허권자 기관명 | 표시용 기관명 |
| `owrQuota` | 특허권자간 지분(%) | 소유권·특정 기관 과반 판단 |
| `costShareRatio` | 기관별 비용분담비율(%) | 비용 배분 판단 |
| 발명자 `partiRate` | 발명자 기여율 | 기관 소유지분과 구분 |

KRISS는 `orgCd=200835806`, `orgNm=한국표준과학연구원`으로 두 표에서 확인된다. HTML A의 신청번호 `RESI0120600004`에는 KRISS 35%, 아주대학교산학협력단(`200850906`) 65%가 있다. 이 샘플의 신청 결재상태는 **03**이므로 공동출원 예시이면서 결재완료 예시는 아니다. HTML B의 `RESI0096700046` 권리자 표에는 KRISS 100%만 있고 신청 `apvStat=04`가 관측된다. 샘플에서 소유지분과 비용비율이 같은 것은 두 필드가 같은 의미라는 근거가 아니다.

근거: HTML A 239~240, 589, 1180~1202행; HTML B 1048~1050, 1247, 1741~1800행.

### 12-3. 상세조회 계약

| 목적 | 경로 | 입력 키 | 첨부에서 확인한 결과 |
|---|---|---|---|
| 신청 상세 | `GET /pms/res/intellppty/searchIntellRqst.json` | `intellRqstNo` | `res.data`를 신청 폼에 반영 |
| 기관별 권리자 | `POST /pms/res/intellppty/searchIntellOwr.json` | `intellRqstNo` | `orgCd`, `orgNm`, `owrQuota`, `costShareRatio` 그리드 |
| 신청에 연결된 선행조사 | `GET /pms/iprs/mng/selectPpsRqst.json` | **`intellRqstNo`** | `res.data`의 `rqstNo`, `apvStat`, `rqstDt`, 요청·결과 정보 |
| 이미 아는 선행조사 요청의 상세 | `GET /pms/iprs/pps/selectPpsRqst.json` | **`rqstNo`** | 기존 지식·Helper의 선행조사 요청번호 기준 조회 |

두 `selectPpsRqst.json`은 경로와 키가 다르다. 신청번호로 선행조사 존재 여부를 볼 때는 **`mng` 경로**이며, 선행조사 신청번호가 이미 있을 때의 **`pps` 경로**와 바꾸어 쓰지 않는다. 마스터의 단건 조회 계약은 HTML B 969~1010행에서 확인했다.

권리자 API의 POST는 기존 정찰 기록에 있고, 오늘 HTML에서도 `postDataFunc`와 요청 키가 확인된다. 오늘 HTML은 원시 네트워크 응답 캡처가 아니므로 권리자 응답의 최상위 래퍼·완전성·현재 권한까지 검증했다는 뜻은 아니다. 정상 빈 결과, 조회 실패, 형식 이상, 다른 신청번호의 결과를 구분해야 한다.

### 12-4. 선행기술조사 대상 — 사용자 지정 규칙

1. 지식재산권 신청의 `apvStat=04`가 선행 조건이다. 임시저장·신청·내부결재 등 `00/01/02/03`을 완료로 처리하지 않는다. 다른 화면의 `apvStat=04`까지 같은 의미로 해석하지 않는다.
2. 신청 결재가 완료되어 선행조사가 필요한 건은 대시보드의 선행조사에 표시한다. 신청 결재업무로 중복 표시하지 않는다.
3. 타기관 주관 예외의 지분 기준은 **특정 외부 기관 한 곳의 `owrQuota > 50`**이다. 외부 기관 지분 합계나 KRISS 지분 50% 미만으로 대체할 수 없다.
4. 이미 출원된 국내 특허에서 파생된 국외/PCT 건은 요청 대상에서 제외한다. 국내 원출원 연결과 그 원출원의 실제 출원 근거를 함께 확인한다.
5. 이미 생성된 선행조사 번호·요청일이 있으면 기존 요청으로 연결한다. 목록에 정보가 없다는 사유만으로 미승인·선행조사 없음·비대상이라고 단정하지 않는다.

| 기관별 소유지분 | 외부 한 기관 50% 초과 여부 |
|---|---|
| KRISS 35 / A기관 65 | 해당 |
| KRISS 40 / A기관 30 / B기관 30 | 해당하지 않음 |
| KRISS 50 / A기관 50 | 해당하지 않음 |

첨부의 연구과제 상세에 있는 **주관기관**은 연구과제 주관기관이다(HTML B 2779~2788행). 특허 출원 주관기관 필드로 사용할 수 없으며, 별도 전용 필드는 아직 확인되지 않았다. 위 과반 규칙은 사용자가 이 작업에서 지정한 운영 기준이다.

HTML A는 국외/PCT 또는 국내 분할·가출원 후속의 경우 특허 불러오기 값 `rejeNo`를 요구한다(1987~1992행). `rejeNo`·패밀리 번호가 있다는 사실만으로 원출원이 국내이며 이미 출원되었다고 확정할 수 없다. 기존 자동생성의 `reRqstType=G` 조건은 로컬 코드의 가드이며, 다른 출원종류가 법적·업무상 모두 금지된다는 의미가 아니다.

### 12-5. 확인 불가로 선행조사가 막히는 경로

기존 Helper v1.10.0은 신청 상세조회가 실패해도 빈 객체를 캐시하고, 버튼 클릭 때 상세 보강을 기다리지 않아 확인 필요 판정으로 차단될 수 있다. 대시보드 v1.26.1은 전체 선행조사 목록의 완전성을 요구하여, 해당 신청과 무관한 과거 목록 잘림이 단건 요청을 막을 수 있다. 이는 로컬 코드 분석으로 확인한 경로이며 특정 서버 장애가 실제 발생했다는 확정은 아니다.

수정 방향은 신청 상세, 기관별 권리자, 해당 신청의 연결 선행조사를 각각 조회하는 것이다. 실제 미승인·예외 대상과 일시적인 조회 실패를 구분하고, 버튼 실행 직전에 최신 정보로 재확인한다. 확인 후 기존 포털 동작이 한 번만 실행되어야 하며, 실패를 빈 결과로 바꿔 무조건 통과시키는 방식은 쓰지 않는다. 새 Helper·대시보드 수정본의 검증·설치 여부는 최종 배포 안내에서 확인한다.

### 12-6. 공동출원 검색·협약·연차료 관리

사용자는 `[IPMS] 검색 개선`의 신청(`S_PMS_03010100`)과 마스터(`S_PMS_03019010`)에서 공동출원을 바로 조회하고, 기존 도구와 디자인을 맞추도록 요청했다. 공동출원 여부는 KRISS와 서로 다른 외부 기관의 권리자 행을 근거로 확인한다. 단순히 현재 페이지의 행만 거른 결과를 전체 공동출원 조회라고 표시하면 안 된다. 기간·후보 조회 범위·실패·중단·확인한 건수를 결과와 함께 구분하는 것이 필요한 설계다. 이 장은 구현 완료나 실서버 조회 성공을 미리 선언하지 않는다.

협약서와 연차료의 장기 관리는 최근 업무 기간과 분리하는 것이 제안된 방향이다. 확인된 자료 기반은 다음과 같다.

| 관리 항목 | 확인한 기반 | 아직 별도 관리·확인이 필요한 내용 |
|---|---|---|
| 기관별 권리 | `searchIntellOwr.json` | 변경 이력·협약 적용 범위 |
| 협약 관련 파일 | 마스터 기타문서, “양도증, 협약서 등” | 체결 완료·서명·최종본 여부 |
| 연차 내역 | `/pms/iprs/mng/selectIprsPmList.json` | 기관별 실제 납부·정산 여부 |
| 패밀리 | `intellMgmtNo`, `familyIntellRqstNo` | 국가별 협약·지분·비용분담 적용 차이 |

기타문서 업로더는 `#uploader4_6`, **`progrmId: 'pms.iprs.masater.otherdocs'`**, `docId: openerParam.intellRqstNo`다. `masater`는 실제 관측한 철자이므로 `master`로 자동 수정하면 안 된다. 모드는 `isAuthorized() ? 'edit' : 'readonly'`이며 `/pms/iprs/mng/updateOtherDocs.json` 저장 경로는 존재만 확인했다. 이번 작업에서 저장 API를 호출한 것은 아니다. 파일이 있다는 사실만으로 협약 체결 완료라고 표시하지 않는다.

연차 그리드 `#grid7_1`은 `intellRqstNo`로 조회하고 `rqstNo`(연차관리 신청번호), `ordYy`(**연차**, 달력 연도로 단정하지 않음), `dlvryDueDt`(납부기한, `yyyyMMdd`), `antcExp`(예상비용), `smrtGrd`(스마트 등급)를 사용한다(HTML B 3798~3834행). `/mng/selectIprsPmList.json`과 기존 지식의 다른 `/pm/...` 유사 경로를 구분한다. 현재 권리자의 비용분담비율만으로 과거 모든 연차의 실제 정산액을 역산하지 않는다.

### 12-7. 오늘의 업무·입력 문구 개선 기록

아래는 대시보드 v1.26.1과 Helper v1.10.0의 로컬 구현 및 사용자 요구를 기록한 것이다. 실서버 운영 검증과는 구분한다.

- **기간**: 업무 자체의 기준 날짜로 목록·집계·연속처리 범위를 맞춘다. 관계 연결을 위해 보관한 과거 데이터가 최근 업무 목록에 다시 섞이지 않도록 한다.
- **업무 식별**: 한 특허의 여러 업무를 관리번호 하나로 합치지 않는다. `rqstNo`, `cnfRqstNo`, `actRqstNo`, `bpmRqstNo`는 같은 문자열 형식이어도 다른 번호체계일 수 있다.
- **처리 완료**: 승인 버튼 클릭·팝업 닫힘은 완료 증거가 아니다. 서버 상태로 확인되지 않은 항목은 완료로 숨기지 않는다.
- **신청일자**: 특허번호를 누른 뒤 나타나는 흐름·상세의 기존 날짜 위치를 보강한다. 목록에 신청일 문구를 추가하거나 “신청 상세조회 기준” 같은 별도 배너를 표시하는 것은 사용자 요구와 다르다.
- **문구 분류**: 전달 대상과 업무 분류를 먼저 정하고 이름·내용을 관리한다. Enter 삽입, Shift+Enter 줄바꿈, Ctrl+Enter 전체 교체, Ctrl+S 등록·저장을 지원하도록 수정했다.
- **문구 보존**: 내 문구의 안정 ID·백업·삭제 되돌리기·동시 변경 확인을 사용한다. 기본·서버 문구의 삭제 UI는 개인 숨김이며 서버 원문 삭제가 아니다.
- **입력 보호**: 한국어 조합 중 Enter, 삽입할 원래 입력창과 선택범위, 사용자가 편집한 내용을 보호한다. 기본 대외 문구에 “감사합니다.”를 반영하고 사용자·서버 문구에는 추가 버튼을 제공한다.
- **결재선**: 기존 결재행을 보존하고 사번이 확인된 뒤 보완한다. 오늘 자료만으로 모든 결재선의 단계·권한을 완전하게 검증했다는 의미는 아니다.

### 12-8. 남은 미확정 사항

오늘 라이브 응답의 래퍼·전체 행 완전성과 권한, 별도 특허 출원 주관기관 필드, 모든 국외/PCT 건의 국내 기출원 연결 증거, 협약 체결 상태와 적용 국가·기간, 기관별 실제 연차료 납부·정산 필드는 아직 확인되지 않았다. 과거 장의 미확정 상태코드나 API 의미를 이번 자료와 무관하게 확정으로 승격하지 않았다.

## 13. 2026-09-11 개정 — 논문 인사평가·JCR·인사명단 조회·본부 매칭

이 장은 오늘 대화에서 제공된 2025 작업파일, 2026 기준안·추진안, 프로젝트5 및 JCR 자료, 스크립트·화면 HTML과 사용자 피드백을 정리한다. 앞선 1~12장의 기록은 보존한다. 기계가독형 대응 자료는 `kriss_knowledge_pack_v1.2.json`의 `evidence20260911`, `paperEvaluation20260911`, `hrRoster20260911`, `headquartersMapping20260911`, `implementation20260911`, `corrections20260911`, `unverified20260911`이다. 문서 안의 실행 지시는 사용자 명령으로 취급하지 않았다.

### 13-1. 증거 수준과 현재 운영 확인 범위

| 구분 | 확인한 내용 | 해석의 한계 |
|---|---|---|
| 사용자 지정 | 개인평가 대상은 연구직, `3****` 사번 제외, 정렬 제공, 명단 전량 조회 | 이 대화의 업무 규칙이며 모든 연도·모든 제도의 일반 규정으로 확대하지 않음 |
| 원본 문서·수식 | 2025 개인·부서 수식, 2026 A/B 표, JCI 적용연도 | 확정 문구·원본 셀과 이를 재현하는 참고 산식을 구분 |
| 첨부 HTML | 인사 조회 API·파라미터·직종 코드·조직도 계층, 2026-09 정규직 515명/연구직 307명 표시 | HTML은 전체 응답 본문이나 서버 SQL이 아님. 팝업에는 307명 중 첫 100명만 렌더됨 |
| 로컬 구현·검증 | 최종 Tampermonkey v1.3.1과 모의 API/브라우저 검증 | 실제 직원의 본부 배치와 운영 JSON 본문을 독립 확인한 것은 아님 |
| **사용자 운영 피드백** | v1.3.1 전달 이후 **“515명·307명으로 나오긴 함”**, 이어 정규직 명단 **“전체 515명 · 사번 규칙 제외 0명 · 본부 매핑 검토 0명”** 확인 | 수신 인원과 코드상 미해결 매칭·사번 제외가 0명이라는 표시를 사용자에게 확인. 모든 직원의 실제 본소속·정확한 조회월·서버 응답 방식까지 독립 확인한 것으로 확대하지 않음 |

현재 결론은 **정규직 515명·연구직 307명 표시, 정규직 사번 규칙 제외 0명·본부 매핑 검토 0명은 사용자 확인**이다. 현재 코드상 정규직 전체에 미해결 본부 매칭이 없다. 직원별 실제 본소속 대조·본부별 배치 인원 합계는 별도 확인 대상이다. 연구직 카드의 별도 제외 집계값은 직접 보고받지 않았으므로 독립 관측값으로 만들지 않는다. 515·307을 고정 상수나 모든 예외 반영 후의 개인평가 최종 대상자 수로 사용하지 않는다.

### 13-2. 자료 흐름과 원자료 조회 계약

논문 저자별 RawData → 개인평가 대상 명단·정규직 명단을 사번으로 연결 → 투고연도에 맞는 JCR 분야행 매칭 → 개인점수 → 논문·본부별 중복 제거 → 연도별 목표 대비 부서점수 순서다. 논문 저자행, 논문 건수, 인사명단 인원수는 서로 다른 집계 단위다.

- 논문 화면: `/pms/res/tets/S_PMS_03020305.do`.
- 목록 API: **POST `/pms/res/tets/selectTetsRawData.json`**.
- 기본 조건: `q_first='Y'`, `emptyCls='N'`, 게재월 `q_fromYyMm`/`q_toYyMm`, `q_apvStat='04'`(결재완료). 결재상태 전체는 사용자가 선택한 경우 공란으로 요청한다.
- 발표매체: `q_ancmMedm="'01','02','03','04','05','06','07','08','09','10','20','30','40'"`. `q_partiEmpNm`, `q_inOut`, `q_item`, `q_keyword`는 공란이다. 개인 명단으로 서버 저자행을 잘라 받으면 공동저자 분모가 손상되므로 전체 내·외부 저자행을 받는다.
- 요청 페이징은 `take`, `skip`, `page`, `pageSize`. 게재월로 조회한 뒤 엔진에서 실제 집계일·온라인 Published 조건을 검사한다. 투고일을 게재일로 대신하지 않는다.
- 핵심 필드: `tetsRqstNo` 등록번호, `partiEmpNo` 저자사번, `partiEmpCls` 직원구분, `empNm` 저자명, `upDeptNm` 상위부서명, `deptNm` 부서명, `sbjtKor` 논문제목, `ancmCls` 발표구분, `scitNm` 수록지, `issn`, `ancmDt` 게재일, `subDt` 투고일, `partiCnt` 총저자수, `seqNo` 저자순위, `resEdtorYn` 교신 여부. 전체 38개 필드 대응은 JSON에 보존한다.
- 현재 로그인 세션의 읽기 요청을 사용하며 자체 API 키나 새 서버 구축은 필요하지 않도록 구현했다. 시작 시 자동 조회하지 않는다. 로컬 확정·예외 승인은 서버 결재·권한 기능이 아니다.

### 13-3. 정규직·연구직 명단 API와 코드

| 목적 | 경로 | 기준·주요 필드 |
|---|---|---|
| 조직도 화면 | `/mis/hrm/hrmng/S_HRM_01010100.do` | `orgnztSearchForm`: `yymm`, `deptCd`, `dicdEmpCls` |
| 정규직 인원 집계 | `/mis/hrm/searchRgllbrList.json` | `yymm`, `deptCd=''`, `dicdEmpCls='1'`; `fgradeCd`, `fgradeNm`, `yeunGu`, `kiSul`, `hangJung`, `kiNeung`, `cnt` |
| 직원 명단 팝업 | `/mis/hrm/popup/S_HRM_01010100_P01.do` | 부모가 전달한 직급·직종·기준월·부서 조건 |
| 개인별 명단 | `/mis/hrm/searchGobBasList.json` | `fgradeCd`, `fgradeNm`, `yymm`, `deptCd`, `jobCd`, `flag`; 명단 필드 `empNo`, `empNm`, `deptNm` |
| 같은 월 조직도 | `/mis/hrm/selectOrgTree.json` | `yymm`; `deptCd`, `parentDeptCd`, `deptNm`; 루트 코드 `20000` |
| 서약 현황 참고 | `/mis/hrm/certificateMng/getSwearList.json` | 현재 신분·재직구분 및 입퇴사일 열이 있지만 서약 목적의 목록이므로 연구직 판정의 주자료로 사용하지 않음 |

소계는 첨부 표의 **`fgradeCd='100'`, `fgradeNm='소계'`**다. 실행 시 응답에서도 이 행을 확인한다. `flag='1'`은 정규직 표에서 진입하는 직종·직급별 조회 경로이며, 외부인력 표의 팝업은 `flag='0'`을 쓴다. `flag`를 다른 업무의 일반 고용코드로 확대하지 않는다.

| jobCd | 의미 | 평가 연결 |
|---|---|---|
| `00` | 임원 | 팝업 제목 분기에서 확인한 코드 |
| **`01`** | **연구직** | 정규직 표의 연구직 조회 결과를 개인평가 명단으로 연결 |
| `02` | 기술직 | 정규직 전체 명단에 포함될 수 있음 |
| `03` | 행정직 | 정규직 전체 명단에 포함될 수 있음 |
| `04` | 기능직 | 팝업 제목 분기에서 확인한 코드 |
| 공란 | 전체 직종 조회 | 정규직 전체 → 부서실적 자격 명단 |

`fgradeCd`는 직급 조건, `jobCd`는 직종 조건이므로 혼용하지 않는다. 연구원·선임·책임이라는 직급명이나 직원 이름으로 연구직을 추정하지 않는다. 정규직 전체와 연구직 명단을 별도 조회하고 사번·성명·부서를 대조한다. 인원 집계의 소계, 명단 API 총원, 실제 수신 수가 일치해야 연결한다.

명단은 선택한 **기준월의 스냅샷**이다. 월내 정확한 기준일과 과거 인사변동 반영 방식은 HTML만으로 확정할 수 없다. 기간 중 퇴직·전환·휴직·겸직 등 개인평가 예외는 명단/예외 근거로 보완한다. 인사명단 조회는 부서목표 A/B의 기준일이나 확정 목표를 변경하지 않는다.

### 13-4. 본부 매칭 — 현재 구현과 확인 방법

1. 명단 응답에 `deptCd`가 있고 같은 기준월 조직도에 존재하면 해당 부서를 선택한다.
2. 그렇지 않으면 `deptNm`이 조직도에서 **유일하게 일치하는 경우만** 이름으로 연결한다. 사번은 직원 간 연결키이며 사번 자체로 본부를 추정하지 않는다.
3. `parentDeptCd`를 따라 상위 조직으로 올라가면서 목표표의 5개 본부·소 이름과 일치하는 조직을 찾는다. 앞의 `3.` 같은 번호와 공백을 정규화한다.
4. 5개 대상 본부가 없지만 루트 `20000` 바로 아래 조직에 도달하면 해당 최상위 소속명을 보존한다. 원장실·지원조직 등의 존재를 임의로 5개 본부에 배분하지 않으며 목표가 없으면 목표 미정이다.
5. 조직도 누락, 동명 부서, 부서코드 중복, 계층 단절·순환은 `본부매핑검토='Y'`, 빈 `본부/소`, 매핑근거로 표시한다. 조직도 조회만 실패해도 받은 직원 명단은 보존하되 소속 미확인 상태를 유지한다.

자동 연결은 소속 미매칭 직원을 삭제하지 않는다. **명단 보기**에서 전체 인원, `본부 매핑 검토 N명`, 각 행의 `본부/소`, `본부매핑검토`, `매핑근거`를 확인할 수 있다. `N`은 자동 매칭 또는 담당자 선택이 처리됐다는 의미이며, 실제 인사기록과 독립 대조됐다는 뜻은 아니다.

미매칭 직원은 엔진의 본소속 검토로 전달한다. 해당 논문의 개인·부서 실적을 임의의 본부에 확정하지 않는다. 정규직 본소속 충돌은 승인된 부서 예외로 해소할 수 있다. 미리보기의 수동 매핑은 같은 부서명의 **미매칭 행에만** 적용된다. 같은 이름의 부서 직원이 서로 다른 본부라면 직원별 `본부/소`를 명단 파일에서 보완해야 한다.

**인원수 515명·307명만으로는 본부 매칭을 판단할 수 없지만, 사용자가 별도로 정규직 본부 매핑 검토 0명을 확인했다.** 따라서 코드상 미해결 매칭은 없다. 실제 본소속 확인은 각 본부 표본 직원 및 인사 기준일과 대조하는 별도의 확인이다. 실제 515명에 대한 직원별 배치 결과나 본부별 인원 합계는 이번 대화에 아직 제공되지 않았다.

### 13-5. 개인평가·부서실적 규칙과 사번 제외

- 개인 기본조건: 평가대상자, 집계기간 내 온라인 Published, SCI(E), 투고연도에 적용되는 JCI(%) **70.5 미만**. `<=70.5`가 아니다.
- 제1저자 점수: `100 / 공동 제1저자 수`. 교신저자 점수: `100 / 공동 교신저자 수`. 동일인이 제1·교신을 겸하면 제1저자만 산정한다.
- 공저자 수: `총저자 수 - 제1저자 수 - 교신저자 수 + 겸임 수`. 점수는 `MAX(30 / 공저자 수, 10)`. 내·외부 저자를 함께 사용하며 총저자 수·역할 모순은 검토한다.
- 동일 논문·동일 사번의 중복 원자료는 한 번 합산한다. 인사명단을 걸러도 원자료 저자행을 삭제하지 않는다.
- 부서 기본조건: 정규직 또는 승인된 포함 예외의 제1·교신저자, 집계기간, JCI(%) **30.5 미만 또는 일반 Metrologia 특례**. 부서 SCI(E) 추가 필터는 현재 기본 꺼짐이며 이를 켜는 것은 별도 조건 변경이다.
- 부서 중복 제거 단위는 **등록번호 + 실적 귀속 본부·소**. 같은 논문의 서로 다른 본부 소속 제1·교신저자는 각 본부에 인정될 수 있다.
- 사용자 확인으로 **`3****`는 3으로 시작하는 5자리 숫자 사번**을 제외한다. 기존 `3-` 접두어 제외도 유지한다. 3으로 시작하는 임의 길이의 문자열 전체와 동일하지 않다. 원명단에 남기되 개인 대상과 해당 저자의 부서실적에서 제외하고 공동저자 분모는 보존한다. 임의의 포함 예외로 이 사번 제외를 우회하지 않는다.
- 예외는 평가연도·사번·논문번호·적용범위·사유·근거·처리자·상태를 기록하며 승인된 것만 적용한다. 퇴직자 부서 포함에는 재직종료일을 요구하고 집계기간과 재직기간의 겹침을 매번 확인한다.

### 13-6. 2025와 2026의 목표 로직 차이

개인점수와 논문 중복 제거에 공통 부분이 있어도 **부서목표까지 동일한 로직이라고 설명하면 안 된다.** 2025 작업파일의 목표는 고정 입력이며 2026 기준안은 A+B 구성과 인원 기준을 제시한다.

| 본부·소 | 2025 목표 | 2026 전년 실적 | 연구직 | 기술직 | A | B | 2026 목표 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 물리측정본부 | 23 | 20 | 51 | 18 | 15 | 10 | 25 |
| 화학소재측정본부 | 26 | 21 | 57 | 15 | 16 | 11 | 27 |
| 바이오의료측정본부 | 23 | 27 | 50 | 9 | 20 | 9 | 29 |
| 양자기술연구소 | 17 | 14 | 50 | 10 | 10 | 9 | 19 |
| 전략기술연구소 | 40 | 25 | 61 | 10 | 19 | 11 | 30 |
| 합계 | 129 | 107 | 269 | 62 | 80 | 50 | 130 |

2026 인원 기준일은 **2026-01-31**, 가중치는 연구직 1·기술직 0.25다. `TRUNC(전년도 실적 × 0.5 × 1.55)`와 `ROUND(부서 가중인원 / 전체 가중인원 × 50)`은 제공 표의 A/B를 재현한다. 다만 원 문서의 절사·반올림 서술이 완전한 공식으로 확정된 것은 아니므로 **표 재현용 참고 산식**으로 분리한다. 적용 목표는 확정표이며 조회한 515명·307명으로 덮어쓰지 않는다. 2025 A/B 및 전년 실적은 원본에서 확인되지 않은 값을 자동 채우지 않는다.

부서 증감 = 실적−목표. 증감률은 `ROUNDDOWN((실적−목표)×100/목표, 0)`에 해당하며 음수도 0 방향으로 절사한다. 100점 환산 = `MIN(100, MAX(60, 80+증감률))`, 최종 10점 환산 = 그 값×0.1. 목표가 없으면 증감·환산을 비워 둔다. 목표가 있으면 검토 중에도 현재 실적 기준 증감·참고점수를 표시하되 미해결 검토가 있는 본부의 최종점수는 미확정으로 남긴다. 귀속 본부 자체가 불명확한 검토는 여러 본부에 영향을 줄 수 있다.

### 13-7. JCR 연도·분야 선택과 Metrologia

- 투고연도 Y → 발행판 Y−1 → 지표 데이터연도 Y−2. 예: 2026 투고 → 2025 발행 → 2024 지표.
- 개인 70.5·부서 30.5 판정에 사용하는 지표는 해당 자료의 **JCI(%)**다. IF(%)로 자동 대체하거나 크리스타의 표시 JCR 값을 그대로 쓰지 않는다. 과거 IF 자료는 사용자가 지표를 명시한 별도 경로다.
- ISSN 우선, 없으면 E_ISSN으로 조회하며 일치 분야 중 가장 낮은 유효 백분율을 선택한다. 누락·비수치·잘못된 투고연도는 0으로 바꾸지 않는다. 선택 분야·파일·원본 행을 근거로 남긴다.
- 제공 JCR ZIP은 pub2014~2025의 12개 판을 확인했다. 현재 내장 JCI는 pub2022~2025, 즉 **2023~2026 투고용 4개 연도**다. 과거 판 전체가 내장돼 있다는 뜻은 아니다.
- 사용자는 2025 개인평가의 Metrologia에 점수가 있음을 지적했다. 원본 재대조 결과 일반 Metrologia 3편의 개인대상 11저자행 적용 값은 **39.045 / 49.157 / 58.939**로 모두 개인기준 70.5 미만이다. 점수가 있다는 사실만으로 개인평가에서 백분위와 무관한 특례를 입증하지 않는다.
- 같은 3편은 부서기준 30.5를 넘으므로 일반 Metrologia 부서 특례가 작동한다. `METROLOGIA Tech. Suppl` 13편·개인대상 28저자행은 원본에서 모두 0점이며 일반 Metrologia 특례와 분리한다. 부분 문자열 포함만으로 특례를 적용하지 않는다.
- 최종본의 개인 Metrologia 무조건 인정은 기본 꺼짐이다. 추진안의 개인 `OR Metrologia` 표현은 기존 기준보다 범위를 확대하므로 정책 결정 사항으로 남겼다.

### 13-8. 원본 재현 검증과 운영 자료의 차이

2025 원본은 14개 시트, 평가대상자 430명·정규직 508명, 저자행 2,097개·논문 309편이다. 별도 전체 RawData는 61,453저자행·12,187논문이고 1968~2026 이력을 포함한다. 현재 사용자가 확인한 515·307은 다른 기준월의 조회 명단이며 이 숫자들과 같아야 하는 것은 아니다.

2025 원본 대상자 430명의 개인합계는 원본과 1e-8점 이내로 재현됐다. 이는 **원본 명단을 사용한 비교 검증**이며 오늘 새 연구직 명단의 인원수나 모든 원본 판단의 타당성을 보증하지 않는다. 부서 V열과 기존 수동 반영 5행을 적용하면 물리/화학/바이오/양자/전략 실적은 20/21/27/14/24건이다. 최종 제출표에는 전략 별도 반영 한 건이 있어 25건이다. 원본 셀 A119의 논문번호 2025020265, G119=1과 06 시트 166~187행 V열 공란이 다르며 사유는 미확정이다. 명시적 검증용 예외로 최종 25건을 재현했지만 해당 논문번호를 배포 엔진에 하드코딩하지 않았다.

### 13-9. v1.0~v1.3.1 구현과 오늘의 오류 교훈

- 최종본은 제공 시안의 개인점수·부서점수·논문별 근거 화면과 자료/JCR·설정·예외 관리를 구현했다. XLSX/CSV/TSV/JSON 입력, 엑셀 근거 출력, 연도별 설정, 백업·복원, 재산출 필요 표시를 지원한다.
- v1.1.0: 논문 API 조회 연결. v1.1.1: 검토 중 부서 증감 표시·본부별 검토 범위·2025/2026 목표 구분. v1.2.0: `3****` 제외와 전체 결과 정렬. v1.3.0: 인사 API·소계 대조·본부 매칭·명단 비교. **v1.3.1: 전량 응답 수용·명단 자동 연결·진단 저장**.
- 정렬은 열 제목 클릭으로 오름→내림→원래 순서이며, 현재 페이지에만 적용하지 않는다. 숫자·날짜·한글과 빈값을 구분하고 동률 순서를 보존한다. 검색 결과와 엑셀도 해당 정렬을 따른다.
- v1.3.0의 `수신 행수 > 요청 페이지 크기(100)` 거부 검사는 서버가 전량을 한 번에 반환하는 경우도 실패시켰다. v1.3.1은 소계·서버 총원·실제 수신 수가 일치하면 전량으로 수용하며 분할 응답도 모두 모은다. 정확한 운영 응답 본문을 확보한 것은 아니므로 사용자의 당시 오류 원인이 반드시 이 경우였다고 단정하지 않는다.
- 인사 조회의 기본 JSON POST가 HTTP 400/415일 때 또는 소계는 양수인데 첫 명단이 0행인 HTTP 200 응답일 때 같은 조건의 form POST로 한 번 전환한다. 기간·직종·부서를 넓혀 재시도하지 않는다. 중복 사번·총원 변동·누락·반복 페이지는 계속 차단한다.
- 기본 자동 연결은 전체 검증 후 두 명단을 하나의 IndexedDB 트랜잭션으로 저장한다. 실패·취소·연구직 부분 수신·저장 실패 시 기존 두 명단을 보존한다. 자동 연결을 해제하면 기존 비교 후 적용 흐름을 사용할 수 있다. 새로고침 후 저장된 명단이 복원된다.
- `조회 진단 저장`은 엔드포인트·조건·HTTP 상태·응답 필드명·수신 수·서버 총원을 보존하고 실제 성명·사번 값·응답 본문·인증 헤더를 기록하지 않는다.
- 모의 정규직 515명·연구직 307명에 대해 일괄/페이징 전량 수신, 자동 연결, 전체 명단 보기, 마지막 사번까지 엑셀 저장을 검증했다. 모의 인사명단의 `3****` 1명을 제외한 306명 결과를 실제 사용자의 최종 대상자 수로 기록하면 안 된다.

### 13-10. 남은 확인 사항

실제 명단의 본부별 인원 합계, 직원별 실제 본소속, 선택 기준월의 정확한 인사 기준일·인사변동 반영 방식, 휴직·퇴직·전환자의 공식 개인평가 예외, 2026 A/B의 공식 절사·반올림 정책, 개인 Metrologia 특례 신설 여부, 2025 전략 별도 1건의 처리 사유는 아직 확인되지 않았다. 정규직 본부 매핑 검토 0명은 이미 사용자에게 확인했으므로 미확정 목록에 남기지 않는다. 운영 서버의 응답 래퍼·전송 인코딩·실제 일괄 반환 형태와 권한은 사용자에게 인원수가 표시됐다는 사실과 별도로 기록한다.

현재 배포 스크립트는 `KRISS_인사평가_논문실적_2026.user.js` v1.3.1이며 SHA-256은 `d54575e50de66d3422dfae746250e945d7ea106bf35c3b510f2c133e4f96affa`다. API 인원수 표시의 사용자 확인을 추가했을 뿐, 이를 새로운 소프트웨어 배포나 직원별 인사결정 검증으로 해석하지 않는다.
