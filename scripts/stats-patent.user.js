// ==UserScript==
// @name         KRISS Patent Stats Extractor (특허 통계추출)
// @namespace    kriss-patent-stats
// @version      0.8.3
// @description  KRISS 특허 통계도구 — 지출결의·지식재산권 마스터 직접 조회, 적요 자동분류(국내/해외·단계·PCT), 연도별 보고서, 로컬 보정, 외부 엔진 API. 변경이력·유지보수 가이드는 파일 상단 주석 참조.
// @match        https://krisstar.kriss.re.kr/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* =====================================================================
 * KRISS Patent Stats Extractor v0.8.3 (patch — 논문 실측 스키마 반영·통계 정상화)
 *
 * [버전 정책] patch(0.y.Z) = 오류 수정·자잘한 개선(문서·골격·리팩터 포함) /
 *            minor(0.Y.0) = 실제 기능 추가 /
 *            major(X.0.0) = 타 스크립트와의 결합 또는 '1부' 완성 시점.
 *            어떤 수정이든 반드시 @version을 올리고 아래 이력에
 *            '무엇을·왜([원인] 표기)'를 기록한다.
 *            ※ 0.6.1에서 구버전 표기(v1.0~v2.4)를 폐지하고 0.1.0 기점으로
 *              소급 재부여함(코드 계보 동일, 번호만 재정렬).
 *
 * v0.8.3 (patch — 내부망 SheetJS CDN 타임아웃 제거 · 버전 표기 정합화)
 * 0.8.3: [원인확정] 메타데이터 @require가 cdn.sheetjs.com을 매 실행마다 먼저 요청해
 *        내부망/방화벽 환경에서 timeout 로그와 시작 지연을 유발. 이미 ensureXLSX()에
 *        localStorage 캐시 + 최초 1회 파일 선택 폴백이 구현되어 있어 @require를 제거.
 *        패널 제목·공개 API 버전·로드 로그를 0.8.3으로 통일. 기능 로직은 변경 없음.
 * v0.7.4 (patch — 엔진/논문 결과를 전용 '엔진 결과' 탭으로 분리)
 * 0.7.4: [원인] 논문·외부 엔진 실행 결과가 지재권 탭의 #i_out에 렌더링되어 지재권
 *        건수 표와 겹쳤음. '엔진 결과' 탭(#engine_out)을 신설하고 엔진 목록(#eng_list)을
 *        그리로 이동, 엔진/논문 결과는 #engine_out으로 렌더링+자동 탭 전환. 지재권
 *        #i_out에는 지재권 건수만 남김. 표 복사 버튼(e_copy) 추가.
 * v0.7.3 (patch — 논문 연도별 통계 기준을 게재일로 교정)
 * 0.7.3: [원인확정] 논문 검색 기간 필터는 '게재일(yyyy-MM)' 기준으로 정상 동작하나,
 *        연도별 통계는 '년도(yy)' 필드로 묶고 있었음. yy는 성과 등록연도라 게재연도와
 *        달라(예: 게재일 2025인데 yy=2000) 2000년대 등 이상치가 통계에 섞였음. 통계의
 *        연도 기준을 게재일 연도로 변경(게재일 없으면 yy 폴백). 검색 필터(q_fromYyMm/
 *        q_toYyMm, 게재일 yyyy-MM)는 그대로.
 * v0.7.2 (patch — 논문 직접조회 415 수정: JSON 본문 전송)
 * 0.7.2: [원인확정] 논문 목록 API도 다른 KRISS 엔드포인트처럼 application/json 본문을
 *        요구 — 0.7.1의 폼 인코딩 전송이 415(Unsupported Media Type)로 거부됨. JSON
 *        우선(+415/400 시 폼 예비) 전송으로 수정. 페이징(take/skip/page/pageSize)과
 *        검색폼 필드는 유지. (기존 실패 원인은 JSON은 맞았으나 페이징 누락으로 0건)
 * v0.7.1 (patch — 논문 직접 조회 복원: 폼 인코딩+페이징)
 * 0.7.1: (1)[원인확정] 논문 화면은 Kendo 그리드 → 목록 API는 폼 인코딩 + 페이징
 *        (take/skip/page/pageSize)로 요청해야 하는데 JSON+무페이징이라 0건이었음.
 *        직접 조회(fetchTetsDirect/importTetsDirect)를 폼 인코딩+페이지 루프로 구현 →
 *        포털 어느 화면에서든 화면 진입·[조회] 없이 추출 (2)원클릭은 직접 조회 우선,
 *        실패 시 현재 화면에 그리드가 있으면 그리드 재사용으로 자동 대체 (3)공개 API에
 *        importTetsDirect·tetsDiag(직전 요청/응답 진단) 추가
 * v0.7.0 (minor — 논문 추출 그리드 재사용 전환·실측 38필드)
 * 0.7.0: (1)[원인] 논문 화면(#grid1, Kendo)은 POST에 검색폼 #form1 직렬화 + 발표매체
 *        필터 q_ancmMedm(미선택 시 "''")를 요구하는데, API/범용 추출이 이를 누락해
 *        0건 → 추출을 '화면 grid.dataSource 재사용'으로 교체(pageSize=전체건수로 1회
 *        질의, 화면 전용 파라미터·서버페이징 자동 처리) (2)추출 헤더를 포털 '엑셀 저장'과
 *        동일한 38필드(투고일 포함)로 통일 → 인사평가 점수 엔진(KrissPaperEval) 호환
 *        (3)registerEngine 함수 안에 잘못 들어간 논문 블록·재귀호출 제거, 중복 정의된
 *        paper_stats 엔진을 실측 헤더 기준 단일 정의로 정리 (4)IPMS_SCREENS의 tets_raw
 *        삭제(그리드 추출로 대체) (5)공개 API에 importTetsFromGrid·tetsDiagnose 추가
 * v0.6.11 (patch — 논문 조회 자가 진단)
 * 0.6.11: (1)[원인확정] 실제 응답(selectTetsRawData, total 약 12만행)은 정상
 *        200/JSON인데, 논문 엔진이 찾던 컬럼명이 실제 필드(yy·tetsRqstNo·
 *        sex·partiEmpCls·resEdtorYn·ancmCls…)와 불일치해 집계가 비었음 →
 *        카탈로그 tets 헤더를 실측 38필드에 맞추고 엔진을 실측 필드 기준으로
 *        재작성 (2)논문 통계 재구성 — 논문수=등록번호 고유, 저자참여행수(공저·
 *        외부 포함), 내부저자(참여구분='내부') 논문/행수, 성별(sex 원문·외부는
 *        null→(미상)), 교신저자여부(resEdtorYn)=Y 논문수, 매체구분(ancmCls)별
 *        논문수 — 실제 응답 샘플로 end-to-end 검증 (3)[근거] 화면폼 그대로 전송은
 *        0건(매체 체크박스가 q_ancmMedm에 미조립) 확인 → 전체매체 13코드 방식이
 *        정상(12만행) (4)selfTest 논문 사례를 실측 스키마로 갱신
 * v0.6.10 (patch — 기간 스마트 입력·통계 공통)
 * 0.6.10: (1)normPeriod 공통 함수 — '2020'만 입력하면 그 해 전체
 *        (2020-01-01~2020-12-31), 시작만 입력하면 오늘까지, 2020·202001·
 *        20200101·구분자(.-/) 혼용 모두 허용. 서버 단위별(ymd/ym) 형식으로
 *        변환하며 해석 결과를 완료 메시지에 '기간 해석 …~…'로 명시(검증 가능)
 *        (2)적용 범위: 지출결의·지재권 마스터(ymd), 논문 RawData(yyyy-MM),
 *        비용보고서 연도 입력(연도 추출 관대화) (3)플레이스홀더 안내 문구
 *        일괄 갱신 (4)selfTest에 기간 해석 4사례 추가
 * v0.6.9 (patch — 논문 조회 보정: 매체 기본값·중복 핸들러)
 * 0.6.9: (1)[원인] 0.6.8 반영분 정합화 — 매체 파라미터 기본이 "''"(화면
 *        로직상 '미선택')로 들어가 0건 위험 → 화면 초기 상태(전체 선택)를
 *        재현하는 13코드 목록("'01',...,'40'")으로 교정 (2)pq_report 원클릭
 *        핸들러가 동일 내용으로 2회 정의되어 있어 두 번째 블록 제거
 *        (3)fetchCatalogRows 예비 체인 확장 — 기간(2000-01~당월) 재시도 후에도
 *        0건이고 결재상태가 04(완료)면 전체('')로 1회 추가 재시도, 적용된
 *        예비 조건은 메시지에 표기 (4)selfTest의 tets 파라미터 기대값을
 *        전체 매체 코드 기준으로 갱신
 * v0.6.8 (patch — 논문 조회 원인확정 수정·원격 진단)
 * 0.6.8: (1)[원인확정] tets(개인저작물 RawData) 화면의 검색폼 id가 searchForm이
 *        아닌 form1 — 카탈로그 파서가 searchForm만 탐색해 빈 본문을 전송한 것이
 *        무동작 원인. 실측 파라미터로 교정: q_first=Y, emptyCls=N,
 *        q_fromYyMm/q_toYyMm(yyyy-MM, 화면상 required), q_apvStat=04(결재완료
 *        기본), q_ancmMedm은 특수 직렬화(미선택 시 문자열 '')
 *        (2)논문 원클릭에 기간(yyyy-MM) 입력 추가 + 빈 기간 0건이면
 *        2000-01~당월로 자동 재시도(기간 필수 서버 대비) (3)카탈로그 조회에
 *        파라미터 덮어쓰기(JSON) 입력 추가 — 화면별 특수 조건 대응
 *        (4)postKrissJson 비JSON 응답 감지(세션 만료·오류 페이지) 및
 *        LAST_FETCH_DIAG(요청·상태·응답 앞부분) 기록 — 실패 메시지에서 안내,
 *        콘솔 [특허-통계] 진단 출력, KrissStatsTool.lastDiag()로 복사 가능
 * v0.6.7 (patch — 논문 통계 1차·코어/엔진 경계 확정)
 * 0.6.7: (1)논문(개인저작물 RawData) 원클릭 카드 — 조회→연도별 논문 통계까지
 *        한 번에 (2)논문 통계 엔진(paper_stats)을 registerEngine 경로로 내장
 *        — 전처리 함정 2종을 규칙으로 흡수: RawData는 저자-논문 참여 단위이므로
 *        논문수=등록번호(tetsRqstNo) 고유 기준으로 중복 제거, IF·참여율 등
 *        숫자형 문자열은 %·콤마 제거 후 숫자화(원본 데이터셋 불변, 파생값은
 *        백데이터에만 기록) (3)성별 등 표기 미상 값은 원문 그대로 동적 컬럼화
 *        — 표준화 규칙은 실측 값 확인 후 확정 (4)아키텍처 결론 기록 — 당분간
 *        단일 파일(코어+내장 엔진) 유지, 분리 기준 3종과 분리 절차(엔진 블록
 *        복사+KrissStatsTool 대기 등록)를 가이드 (E)에 명문화
 * v0.6.6 (patch — IPMS 화면 카탈로그·전량(total) 검증)
 * 0.6.6: (1)[근거] 제공된 화면 HTML 6종을 실측 파싱해 선언형 카탈로그
 *        IPMS_SCREENS 7항목(신청목록·선행조사·출원·업무요청·청구서 목록/지출
 *        상세·개인저작물 RawData) 내장 — 새 화면 추가는 배열 항목 1개로 완료,
 *        화면별 검색폼 기본값·한글 컬럼제목·날짜/숫자 타입까지 실측 반영
 *        (2)청구서 화면에 지출발의번호·지출결의번호 열 실재 확인 → IPMS↔MIS
 *        (지출결의) 정확 연계 키 확보(적요 파싱 불요 경로, 다음 단계 조인 예정)
 *        (3)개인저작물 RawData=논문 데이터(저자 사번·성별·부서·IF·과제코드)
 *        확인 — 기존 "성별 통계 불가" 판단을 대체할 원천 확보 (4)화면별
 *        상태코드 실측 매핑으로 '상태명' 파생열 자동 추가 (5)모든 직접 조회에
 *        응답 total 대조 '전량 ✓ / 부분 n/total' 배지(카드·메시지) (6)지출결의
 *        직접 조회를 postKrissJson으로 일원화(중복 fetch 제거) ※ 전체 기간
 *        기본 조회는 실환경 정상 동작 확인(사용자 실측)에 따라 유지
 * v0.6.5 (patch — UX 전면 재정비: 디자인·기능·편의 3축)
 * 0.6.5: (1)[원인] 기능 누적으로 데이터 탭에 9개 블록이 평면 나열되어 1차
 *        작업(원클릭)이 묻히고 인지 부하 급증 → 작업 흐름(①가져오기→②확인→
 *        ③통계→④출력) 기준 재배치: 원클릭 2종을 상단 카드로 승격, 상세
 *        조건·파일·화면수집은 '가져오기 상세', 조인·수동분류는 '고급 도구'
 *        접이식(details)으로 분리 — 모든 기능·요소 ID·안내 정보 유지(소실 0)
 *        (2)디자인 정비 — 색·간격·타이포 토큰 일원화(틴트 중립색+단일 강조색),
 *        주/보조 버튼 위계, 접이 섹션·단계 헤더, 결과표 헤더 고정 스크롤,
 *        패널 폭 430→500px (3)탭 명칭 간결화(데이터/피벗/코호트/비용보고서/
 *        지재권) (4)결과 표 TSV 복사 버튼(피벗·코호트·비용보고서·지재권) —
 *        파일 없이 표를 엑셀·한글에 바로 붙여넣기 (5)버전 정책 운용 정정 —
 *        당분간 patch로 진행, 0.7.0(minor)을 0.6.4(patch)로 재분류
 * v0.6.4 (patch — 데이터셋 UX·데이터 연계) ※ 구 0.7.0 재분류
 * 0.6.4: (1)데이터셋 카드 개선 — 행×열·출처·생성시각 표기, [미리보기](상위
 *        20행 표) / [엑셀](원본+정보 시트) / [이름] 변경 / [삭제] 액션으로
 *        가져온 데이터를 내보내기 전 화면에서 즉시 확인 (2)데이터 결합(조인)
 *        — 두 데이터셋을 키 열로 좌측 기준 병합해 새 데이터셋 생성(오른쪽
 *        열은 R_ 접두어, R_매칭수 근거 열 포함), UI + 공개 API
 *        KrissStatsTool.joinDatasets (3)향후 데이터 연계 대비 — 대표 조인 키
 *        목록과 확장 레시피(D)를 유지보수 가이드에 추가, buildDataset에
 *        생성시각(createdAt) 기록
 * v0.6.3 (patch — 특허 건수 국내외/PCT 세분)
 * 0.6.3: 연도별 건수에서 특허를 국내외 열 기준 국내/국외/PCT(그 외 표기·
 *        공란=기타)로 세분(출원·등록 각각 + 소계), 특허외는 통합 유지.
 *        백데이터 지재권분류에 특허(국내) 형식으로 세분 기록, selfTest에
 *        PCT 사례 추가
 * v0.6.2 (patch — 지재권 건수 집계 기준 개선)
 * 0.6.2: 연도별 건수를 특허/특허외 × 출원·등록으로 재구성(사용 기준 반영) —
 *        지재권구분 값에 '특허' 포함(IPRS_RULES.patentType) 시 특허, 그 외
 *        (실용신안·디자인·상표·프로그램 등)는 특허외로 일괄. 국내외 축은
 *        본 프리셋에서 제거(필요 시 피벗 탭에서 국내외 열로 산출 가능).
 *        더미 출원번호 제외 규칙 유지, 백데이터에 지재권분류·출원집계·
 *        등록집계 근거 열 기록, selfTest 사례 동기화
 * v0.6.1 (patch — AI 유지보수 골격·버전 정책 확정)
 * 0.6.1: (1)버전 정책 확정 — 기능 없는 골격·문서 작업은 patch로 분류
 *        (구 0.7.0 minor 표기 정정) (2)변경이력을 본 표준 형식으로 전환하고
 *        0.1.0 기점으로 소급 재부여 (3)[AI 유지보수 가이드] 불변 규칙·구조
 *        지도·확장 레시피를 본 주석에 내장 (4)콘솔 자가진단
 *        KrissStatsTool.selfTest() 추가 — 분류기·건수집계·유틸 회귀를
 *        브라우저 콘솔에서 즉시 검증 (5)공개 API 버전 동기화
 * v0.6.0 (minor — 지식재산권 마스터 연동)
 * 0.6.0: (1)PMS 지식재산권 마스터(S_PMS_03019010) 직접 조회 — 데이터 소스
 *        selectIntellAplyList.json(cls='detail'), 65필드 한글 매핑·코드 변환
 *        (출원종류 G→일반출원, 재직여부 Y→퇴직, 기술이전세부 0400→완료 등)
 *        (2)연도별 출원·등록 건수 프리셋 — 출원수=출원일자 연도별 건수(더미
 *        출원번호 10-0000-0000000류 제외, IPRS_RULES에서 규칙 수정), 등록수=
 *        등록일자 연도별 건수, 국내/국외/PCT 분해, 행별 포함·제외 사유를
 *        백데이터(출원집계/등록집계 열)에 기록 (3)로컬 보정 — 신청번호 키
 *        병합(시스템 원본 불변·재조회 시 자동 재적용·신규 행 자동 유입),
 *        JSON 백업/복원 (4)외부 엔진 결합점 KrissStatsTool.registerEngine
 * v0.5.1 (patch — 직접 조회 HTTP 415 해결)
 * 0.5.1: (1)[원인확정] 서버는 페이지 공통함수 kriss.ajax.post식
 *        application/json 본문을 요구하는데 폼 인코딩으로 전송 → 415 거부.
 *        JSON 우선 전송 + 415/400 시 폼 인코딩 예비 전환으로 수정
 *        (2)엔드포인트를 다운로드 페이지(S_ACC_01020000.do) 기준 절대주소로
 *        고정 (3)날짜 형식(yyyy-MM-dd/yyyyMMdd) 0건 시 자동 재시도
 *        (4)원클릭(조회→분류→연도별 보고서)·조회 직후 자동 분류로 조작 축소
 * v0.5.0 (minor — 포털 직접 조회)
 * 0.5.0: 지출결의 데이터 소스(selectExpsMangPayout.json)를 화면 진입·[조회]
 *        없이 어느 krisstar 화면에서든 직접 호출(로그인 세션 쿠키 사용).
 *        응답 envelope 구조 무관 '첫 객체 배열' 탐색 파서로 견고화
 * v0.4.0 (minor — 화면 그리드 범용 수집)
 * 0.4.0: (1)현재 창+동일 도메인 iframe(2단계)의 Kendo 그리드 자동 감지·선택
 *        가져오기 — 컬럼 title(한글)을 헤더로, 원시값(Date·number·코드) 보존
 *        (2)지출결의 화면은 전용 코드맵(AC11 27종·AC08 6종) 적용
 *        (3)[화면 구조 진단] 그리드/필드 JSON 리포트 — 신규 화면 연동 사양의
 *        표준 입수 경로
 * v0.3.0 (minor — 분류 정밀화·연도별 보고서)
 * 0.3.0: (1)[원인확정] '국내대리인비용→국내' 단순 규칙은 국내 대리인이 해외
 *        건을 대행한 126건을 오분류(반대로 해외성격∧국내번호 충돌은 0건,
 *        실데이터 4,092건 교차검증) → 적용 순서를 태그>출원·등록번호/국가표기>
 *        비용성격으로 확정, 국내외 분류율 73.8%→99.5% (2)특허_PCT 열
 *        (PCT/일반/구분불가) 추가 (3)연도별 국내/국외×출원(=출원료+중간사건)·
 *        등록·유지 보고서(백만원, 참고열로 전체지출 검증) (4)기보고 수치와
 *        대조해 정합 확인(예: 2021 합계 801=801)
 * v0.2.0 (minor — 특허비 적요 분류기)
 * 0.2.0: 적요 파서 2계열 — 끝 [태그](국내/해외·단계·국가·비용성격) 파싱 +
 *        옛 자유텍스트(국내외 혼합 인식). 단계 6종(출원/등록/연차/중간사건/
 *        선행/기타), (N건) 배치 건수 인식, 분류근거를 특허_분류방식 열에
 *        기록, 미분류 검토 내보내기
 * v0.1.0 (minor — 최초 골격)
 * 0.1.0: 데이터셋 레지스트리(드래그앤드롭·다중 시트·연도 파생열), 피벗/
 *        크로스탭·구성비, 등록률 코호트 틀, 모든 내보내기 = 결과+백데이터+
 *        산출조건 3시트 원칙 확립
 * ===================================================================== */

/* =====================================================================
 * [AI 유지보수 가이드] — 이 파일은 AI가 이어서 개발·유지보수한다.
 *
 * 0) 불변 규칙 (어떤 수정에서도 절대 준수)
 *   - 모든 통계 출력은 3시트: 결과 / 백데이터(행 단위 근거) / 산출조건(규칙).
 *   - 분류·집계에는 반드시 '근거 열'을 남긴다(특허_분류방식, 출원집계,
 *     등록집계, 로컬보정 등). 값만 내보내고 근거를 지우는 수정 금지.
 *   - 시스템 원본은 불변. 데이터 수정은 로컬 보정(신청번호 키 병합) 경로만.
 *   - 서버 호출은 postKrissJson() 재사용(JSON 우선, 415 시 폼 예비).
 *     새로운 fetch를 직접 작성하지 말 것.
 *   - 데이터셋 계약: ds = { label, columns:[{name,type}], records:[{한글헤더:값}] }
 *     엔진 계약: compute(ds, cfg) => { resultAOA, backRecords, backCols, meta }
 *   - 수정 시 @version 상향 + 상단 이력 기록([원인] 포함) 필수.
 *
 * 1) 구조 지도 (아래 문자열로 파일 내 검색하면 해당 구역으로 이동)
 *   'PATENT_RULES'          지출결의 적요 분류 규칙·detectNumRegion(번호패턴)
 *   'classifyPatentExpense' 분류기 본체(태그 > 번호·국가표기 > 비용성격)
 *   'NST_MAP'               연도별 비용 보고서 매핑·computeNST
 *   'EXP_ENDPOINT'          지출결의 직접 조회(fetchExpenseDirect)
 *   'IPRS-LOGIC-START'      지재권 마스터(IPRS_RULES/IPRS_FIELDS/조회/보정/건수)
 *   'IPMS_SCREENS'          IPMS 화면 카탈로그(선언형) — 새 화면=배열 항목 1개
 *   'PAPER-ENGINE-START'    논문 통계 엔진(전처리 내장·registerEngine 경로)
 *   'findAllGrids'          화면 Kendo 그리드 범용 수집·구조 진단
 *   'registerEngine'        외부 엔진 레지스트리·KrissStatsTool 공개 API
 *   'joinDatasets'          데이터 결합(조인) — 다중 데이터 연계 토대
 *   'exportExcel'           3시트 엑셀 출력(모든 엔진 공용)
 *   'function selfTest'     콘솔 자가진단(회귀 테스트)
 *
 * 2) 확장 레시피 (지능이 낮은 AI도 아래 순서만 따르면 안전)
 *   (A) 새 통계 추가(권장 기본 경로): registerEngine({ id, label,
 *       compute(ds, cfg) }) 하나만 작성한다. 계약 형태로 반환하면 실행 버튼·
 *       3시트 엑셀이 자동 연결된다. 기존 코드는 수정하지 않는다.
 *   (B) 새 KRISS 화면 연동(3단계 패턴 — 'IPRS-LOGIC-START' 블록을 복제):
 *       ① XXX_ENDPOINT 상수(+페이지 URL 주석)
 *       ② XXX_FIELDS = [[서버필드, 한글헤더], ...]
 *       ③ importXxxRows(raw, label): 날짜는 normYmd, 코드는 맵 변환 후
 *          buildDataset(...)에 넣는다. 조회는 postKrissJson(ENDPOINT, 검색폼
 *          객체)를 그대로 쓴다. 화면 사양(필드·제목)은 도구의 [화면 구조 진단]
 *          JSON 결과를 근거로 작성한다(추측 금지). 실측 HTML·진단이 있으면
 *          IPMS_SCREENS 배열에 항목 추가가 최우선 경로(코드 무수정).
 *   (C) 분류·집계 규칙 보정: PATENT_RULES / IPRS_RULES의 정규식만 수정한다
 *       (로직 코드는 건드리지 않는다).
 *   (D) 데이터 연계(다중 출처 통계): 서로 다른 출처는 joinDatasets(데이터 탭
 *       결합 UI 또는 KrissStatsTool.joinDatasets)로 키 열 병합 → 하나의 ds로
 *       만든 뒤 (A)엔진에 태운다. 대표 조인 키 — 지재권마스터: 신청번호·
 *       관리번호·출원번호·등록번호 / 지출결의: 적요 내 RESI·출원/등록번호
 *       (텍스트 추출 필요). 오른쪽 열은 R_ 접두어, 일치 수는 R_매칭수로 검증.
 *   (E) 스크립트 분리 기준(코어/엔진): 현재는 단일 파일이 정답 — 데이터셋
 *       레지스트리·조인·엑셀 출력을 공유하기 때문. 다음 중 하나면 해당 엔진을
 *       별도 유저스크립트로 분리한다: ①특정 엔진만 개정 주기가 크게 다름
 *       ②본 파일이 유지보수 한계(대략 150KB 초과) ③다른 시스템용 스크립트가
 *       코어 기능을 공유해야 함. 분리 절차: 엔진 블록(예: PAPER-ENGINE-START~
 *       END)을 새 스크립트로 복사한 뒤 코어 준비를 대기하며 등록 —
 *       const t=setInterval(()=>{ if(window.KrissStatsTool){ clearInterval(t);
 *       KrissStatsTool.registerEngine({...}); } }, 300);
 *
 * 3) 수정 후 검증 (필수 3단계)
 *   ① node --check <파일>  (문법)
 *   ② 브라우저 콘솔에서 KrissStatsTool.selfTest() → 전체 PASS 확인
 *   ③ 실화면 1회: 가져온 행수 = 화면의 '총 (N) 건' 표기와 대조
 * ===================================================================== */

(function () {
  'use strict';

// 상위 프레임에서만 패널 1개 생성 (iframe 중복 방지)
  if (window.top !== window.self) return;
  // 멱등 가드: 포털이 문서를 재사용해도 초기화는 한 번만 수행
  if (window.__krissStatsBooted) return;
  window.__krissStatsBooted = 1;

  /* ===== SheetJS(XLSX) 로더 — 내부망(CDN 차단) 대응 =====
     CDN을 사용하지 않는 내부망 환경에서, 다운로드해 반입한 xlsx.full.min.js를
     '최초 1회' 파일 선택으로 지정한다. 선택한 파일은 브라우저(localStorage)에
     보관되어 이후 접속에는 자동 로드된다(파일 재선택 불필요). */
  /* ===== SheetJS(XLSX) 지연 로더 — 필요할 때(패널 열기·엑셀 입출력)만 로드 =====
     기존에는 페이지 로드 시 캐시된 약 1MB 라이브러리를 즉시 eval하여 모든 화면에서
     메인스레드가 수백 ms 멈췄다(포털 메인 등에서 750ms 프리즈). 이제 ensureXLSX()로
     최초 사용 시점(패널 열기/내보내기)에만 로드한다. onReady 콜백으로 이어서 실행. */
  function ensureXLSX(onReady) {
    if (typeof XLSX !== 'undefined') { if (onReady) onReady(); return; }
    const XLSX_STORE_KEY = 'kriss_xlsx_lib_v1';
    let cachedLib = null;
    try { cachedLib = localStorage.getItem(XLSX_STORE_KEY); } catch (e) { cachedLib = null; }
    if (cachedLib) {
      try { window.eval(cachedLib); } catch (e) { console.error('[통계추출] 저장된 SheetJS 실행 실패:', e); }
    }
    if (typeof XLSX !== 'undefined') { if (onReady) onReady(); return; }
    // 캐시에 없으면: 최초 1회 파일 선택 UI 표시
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483000;background:#1f6feb;color:#f5f8ff;font:13px/1.45 "Malgun Gothic","\uB9D1\uC740 \uACE0\uB515",sans-serif;padding:11px 15px;border-radius:10px;box-shadow:0 2px 10px rgba(15,35,70,.3);cursor:pointer;max-width:340px;';
    bar.textContent = '\uD83D\uDCCA \uD1B5\uACC4\uCD94\uCD9C: SheetJS(xlsx.full.min.js) \uD30C\uC77C\uC744 \uC120\uD0DD\uD558\uC138\uC694 (\uCD5C\uCD08 1\uD68C)';
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.js,text/javascript,application/javascript';
    inp.style.display = 'none';
    bar.addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const code = String(rd.result || '');
        let ok = false;
        try { window.eval(code); ok = (typeof XLSX !== 'undefined'); } catch (e) { ok = false; }
        if (!ok) { bar.textContent = '\u26A0 \uC720\uD6A8\uD55C SheetJS \uD30C\uC77C\uC774 \uC544\uB2D9\uB2C8\uB2E4. xlsx.full.min.js\uB97C \uB2E4\uC2DC \uC120\uD0DD\uD558\uC138\uC694.'; return; }
        try { localStorage.setItem(XLSX_STORE_KEY, code); } catch (e) { /* \uC6A9\uB7C9\uCD08\uACFC: \uC774\uBC88 \uC138\uC158\uC740 \uB3D9\uC791 */ }
        bar.remove();
        if (onReady) onReady();
      };
      rd.readAsText(f, 'UTF-8');
    });
    bar.appendChild(inp);
    (document.body || document.documentElement).appendChild(bar);
  }
  window.__krissEnsureXLSX = ensureXLSX; // 논문실적 등 다른 스크립트가 재사용

  /* ===== 초기화 지연: 패널은 숨김 상태로 시작하므로 로드 임계경로에서 빼고
     idle 시점에 구성한다. 논문실적은 KrissStatsTool 을 폴링으로 연결하므로 영향 없음. */
  var __startStatsTool = function () {

  /* =========================================================
   * 1) 상태
   * =======================================================*/
  const DATASETS = []; // { id, label, source, columns:[{name,type}], records:[{...}] }
  let activeId = null;
  const state = { lastPivot: null, lastCohort: null };

  /* =========================================================
   * 2) 유틸
   * =======================================================*/
  const uid = () => 'ds_' + Math.random().toString(36).slice(2, 8);

  function toNum(v) {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    if (v instanceof Date) return v.getTime();
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[,\s₩$]/g, ''));
    return isNaN(n) ? null : n;
  }

  function getYear(v) {
    if (v instanceof Date) return v.getFullYear();
    if (typeof v === 'number' && v > 1900 && v < 2200) return Math.trunc(v);
    const m = String(v == null ? '' : v).match(/(19|20)\d{2}/);
    return m ? Number(m[0]) : null;
  }

  function fmtKey(v) {
    if (v == null || v === '') return '(빈값)';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  }

  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  // 컬럼 타입 추론 (샘플 기반)
  function inferType(values) {
    const sample = values.filter((v) => v !== null && v !== undefined && v !== '').slice(0, 50);
    if (!sample.length) return 'string';
    if (sample.every((v) => v instanceof Date)) return 'date';
    if (sample.every((v) => typeof v === 'number')) return 'number';
    if (sample.every((v) => toNum(v) !== null)) return 'number';
    return 'string';
  }

  const DATE_HINT = /일자|일|년|연도|date/i;

  // 원본행 배열에서 데이터셋 구성 + 날짜 컬럼의 (연도) 파생 컬럼 자동 생성
  function buildDataset(headers, records, source, label) {
    const columns = headers.map((name) => ({
      name,
      type: inferType(records.map((r) => r[name])),
    }));

    // (연도) 파생 컬럼 추가
    const derived = [];
    columns.forEach((c) => {
      const vals = records.map((r) => r[c.name]);
      const yearable =
        c.type === 'date' ||
        (DATE_HINT.test(c.name) &&
          vals.filter((v) => v !== null && v !== '').slice(0, 30).every((v) => getYear(v) !== null));
      if (yearable) {
        const dname = `${c.name} (연도)`;
        records.forEach((r) => {
          r[dname] = getYear(r[c.name]);
        });
        derived.push({ name: dname, type: 'year' });
      }
    });

    return { id: uid(), label, source, columns: columns.concat(derived), records, createdAt: new Date().toLocaleString('ko-KR') };
  }

  /* =========================================================
   * 2-B) 특허비 적요(rqstDesc) 분류기
   *   - KRISS MIS 지출구분 "특허 출원/등록/연차료" 다운로드 전용
   *   - 규칙을 아래 RULES에서 수정하여 미분류를 줄일 수 있음
   *   - 결과 컬럼: 특허_국내해외 / 특허_단계 / 특허_국가 / 특허_비용성격 / 특허_건수 / 특허_분류방식
   * =======================================================*/
  const PATENT_RULES = {
    // 단계 키워드(우선순위 순) : [표시값, 정규식]
    stage: [
      ['중간사건비용', /중간사건/],
      ['선행기술조사료', /선행/],
      ['연차료', /연차/],
      ['등록료', /등록/],
      ['출원료', /출원/],
      ['기타', /기타/],
    ],
  };

  // 적요 내 출원·등록번호/국가표기 기반 판별 (비용성격보다 강한 근거)
  // 실측 검증(4,092건): 해외비용성격∧국내번호 충돌 0건, 국내대리인비용∧해외번호 126건 → 번호패턴 우선
  function detectNumRegion(t) {
    if (/PCT/.test(t)) return 'PCT';
    if (/10-20\d{2}-\d{7}/.test(t) || /(^|\D)10-\d{7}(\D|$)/.test(t) || /20-20\d{2}-\d{7}/.test(t)) return 'KR';
    if (/(출원번호|등록번호)[^)\]]*?(US|CN|EP|JP|\d{2}\/\d{6}|\d{8}\.\d|\d{12}\.\d|\d{1,2},\d{3},\d{3})/.test(t)) return 'FOREIGN';
    if (/\b(US|CN|EP|JP)\s?\d/.test(t)) return 'FOREIGN';
    if (/(미국|중국|일본|유럽|독일|영국|프랑스|인도|캐나다|호주|베트남|싱가포르|대만|러시아|브라질)/.test(t)) return 'FOREIGN';
    return null;
  }

  function classifyPatentExpense(text) {
    const t = String(text == null ? '' : text);
    let region = '미분류', stage = '미분류', country = '', cost = '미분류', method = '미분류';

    const brs = t.match(/\[([^\[\]]*)\]/g);
    const tag = brs ? brs[brs.length - 1].replace(/[\[\]]/g, '') : null;

    if (tag) {
      method = '태그';
      const head = tag.split('-')[0].trim();          // 예: 해외등록료(미국)
      cost = tag.indexOf('-') >= 0 ? tag.split('-').pop().trim() : '미분류';
      const mc = head.match(/\(([^()]*)\)/);
      if (mc) country = mc[1].trim();
      const h = head.replace(/\([^()]*\)/g, '');        // 괄호 제거
      if (h.indexOf('국내') === 0) region = '국내';
      else if (h.indexOf('해외') === 0) region = '해외';
      for (const [val, re] of PATENT_RULES.stage) { if (re.test(h)) { stage = val; break; } }
    } else {
      method = '자유텍스트';
      if (t.indexOf('국내외') >= 0) region = '국내외(혼합)';
      else if (t.indexOf('해외') >= 0) region = '해외';
      else if (t.indexOf('국내') >= 0) region = '국내';
      for (const [val, re] of PATENT_RULES.stage) { if (re.test(t)) { stage = val; break; } }
    }

    // 2차: 번호·국가표기 → 3차: 비용성격 (국내/해외 미상인 경우만 보완, 태그 판정은 유지)
    const num = detectNumRegion(t);
    if (region === '미분류') {
      if (num === 'KR') { region = '국내'; method += '+번호패턴'; }
      else if (num === 'PCT' || num === 'FOREIGN') { region = '해외'; method += '+번호패턴'; }
      else if (/^국내/.test(cost)) { region = '국내'; method += '+비용성격'; }
      else if (/^해외/.test(cost)) { region = '해외'; method += '+비용성격'; }
    }

    // PCT 구분 (해외 건에 한함): PCT / 일반(국가·번호 확인) / 구분불가
    let pct = '';
    if (region === '해외') {
      if (country === 'PCT' || num === 'PCT') pct = 'PCT';
      else if (country || num === 'FOREIGN') pct = '일반';
      else pct = '구분불가';
    }

    // (N건) 배치 : 괄호 안 "(숫자건)"만 신뢰(오탐 방지). 그 외 배치는 1로 두되 별도 검토 필요.
    const mn = t.match(/\((\d+)\s*건\)/);
    const count = mn ? parseInt(mn[1], 10) : 1;

    return { region, stage, country, cost, pct, count, method };
  }

  const PATENT_COLS = ['특허_국내해외', '특허_단계', '특허_국가', '특허_비용성격', '특허_PCT', '특허_건수', '특허_분류방식'];

  // 적요 컬럼 자동 탐지(다운로드 형식은 '적요')
  function findDescColumn(ds) {
    const names = ds.columns.map((c) => c.name);
    return names.find((n) => n === '적요') || names.find((n) => /적요|rqstDesc|내역|비고/i.test(n)) || null;
  }

  // 활성 데이터셋에 분류 컬럼 추가
  function applyPatentClassification(ds) {
    const descCol = findDescColumn(ds);
    if (!descCol) { alert('적요 컬럼을 찾지 못했습니다. (다운로드 파일의 "적요" 열 필요)'); return false; }
    ds.records.forEach((r) => {
      const c = classifyPatentExpense(r[descCol]);
      r['특허_국내해외'] = c.region;
      r['특허_단계'] = c.stage;
      r['특허_국가'] = c.country;
      r['특허_비용성격'] = c.cost;
      r['특허_PCT'] = c.pct;
      r['특허_건수'] = c.count;
      r['특허_분류방식'] = c.method;
    });
    PATENT_COLS.forEach((name) => {
      if (!ds.columns.some((c) => c.name === name)) {
        ds.columns.push({ name, type: name === '특허_건수' ? 'number' : 'string' });
      }
    });
    return true;
  }

  // 파일(SheetJS) → 데이터셋들
  async function loadFile(file) {
    const buf = await file.arrayBuffer();
    let wb;
    try {
      wb = XLSX.read(buf, { type: 'array', cellDates: true });
    } catch (e) {
      // CSV 인코딩(EUC-KR 등) 대비 재시도
      wb = XLSX.read(buf, { type: 'array', cellDates: true, codepage: 949 });
    }
    wb.SheetNames.forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
      if (!aoa.length) return;
      const headers = aoa[0].map((h, i) => (h === '' ? `열${i + 1}` : String(h)));
      const records = aoa.slice(1).map((row) => {
        const o = {};
        headers.forEach((h, i) => {
          o[h] = row[i] === undefined ? '' : row[i];
        });
        return o;
      });
      const label = wb.SheetNames.length > 1 ? `${file.name} · ${sheetName}` : file.name;
      DATASETS.push(buildDataset(headers, records, 'upload', label));
    });
    activeId = DATASETS[DATASETS.length - 1].id;
    renderAll();
  }

  // 화면의 표 → 데이터셋 (가장 행이 많은 <table> 선택 : 필요 시 셀렉터 조정)
  function captureVisibleTable() {
    const tables = Array.from(document.querySelectorAll('table')).filter((t) => t.rows.length > 1);
    if (!tables.length) {
      alert('화면에서 데이터 표를 찾지 못했습니다.\n(표가 iframe 내부에 있으면 다운로드 후 드래그앤드롭을 이용하세요.)');
      return;
    }
    const best = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
    const rows = Array.from(best.rows).map((tr) => Array.from(tr.cells).map((td) => td.innerText.trim()));
    const headers = rows[0].map((h, i) => (h === '' ? `열${i + 1}` : h));
    const records = rows.slice(1).map((row) => {
      const o = {};
      headers.forEach((h, i) => {
        o[h] = row[i] === undefined ? '' : row[i];
      });
      return o;
    });
    DATASETS.push(buildDataset(headers, records, 'portal-table', `화면표 (${records.length}행)`));
    activeId = DATASETS[DATASETS.length - 1].id;
    renderAll();
  }

  function activeDataset() {
    return DATASETS.find((d) => d.id === activeId) || null;
  }

  /* =========================================================
   * 3) 필터 / 집계 / 피벗
   * =======================================================*/
  function passFilters(rec, filters) {
    return filters.every((f) => {
      const cell = rec[f.col];
      switch (f.op) {
        case '빈값':
          return cell === null || cell === undefined || cell === '';
        case '값있음':
          return !(cell === null || cell === undefined || cell === '');
        case '포함':
          return String(cell == null ? '' : cell).includes(f.value);
        case '=': {
          const a = toNum(cell), b = toNum(f.value);
          return a !== null && b !== null ? a === b : fmtKey(cell) === f.value;
        }
        case '≠': {
          const a = toNum(cell), b = toNum(f.value);
          return a !== null && b !== null ? a !== b : fmtKey(cell) !== f.value;
        }
        case '≥': {
          const a = toNum(cell), b = toNum(f.value);
          return a !== null && b !== null && a >= b;
        }
        case '≤': {
          const a = toNum(cell), b = toNum(f.value);
          return a !== null && b !== null && a <= b;
        }
        default:
          return true;
      }
    });
  }

  function aggregate(recs, measureCol, agg) {
    if (agg === '건수') return recs.length;
    if (agg === '고유건수') return new Set(recs.map((r) => fmtKey(r[measureCol]))).size;
    const nums = recs.map((r) => toNum(r[measureCol])).filter((v) => v !== null);
    if (agg === '합계') return nums.reduce((a, b) => a + b, 0);
    if (agg === '평균') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    if (agg === '최소') return nums.length ? Math.min(...nums) : '';
    if (agg === '최대') return nums.length ? Math.max(...nums) : '';
    return recs.length;
  }

  // cfg: { rowDims:[], colDim:string|'', measureCol, agg, filters:[], display }
  function computePivot(ds, cfg) {
    const filtered = ds.records.filter((r) => passFilters(r, cfg.filters));
    const cells = new Map(); // rk\u0001ck -> [records]
    const rowKeys = [], colKeys = [];
    const seenR = new Set(), seenC = new Set();

    filtered.forEach((r) => {
      const rk = cfg.rowDims.length ? cfg.rowDims.map((d) => fmtKey(r[d])).join(' / ') : '전체';
      const ck = cfg.colDim ? fmtKey(r[cfg.colDim]) : '전체';
      if (!seenR.has(rk)) { seenR.add(rk); rowKeys.push(rk); }
      if (!seenC.has(ck)) { seenC.add(ck); colKeys.push(ck); }
      const key = rk + '\u0001' + ck;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(r);
    });

    rowKeys.sort(); colKeys.sort();

    // 원시 집계 매트릭스
    const raw = {};
    rowKeys.forEach((rk) => {
      raw[rk] = {};
      colKeys.forEach((ck) => {
        const recs = cells.get(rk + '\u0001' + ck) || [];
        raw[rk][ck] = recs.length ? aggregate(recs, cfg.measureCol, cfg.agg) : 0;
      });
    });

    // 합계
    const colTotals = {}, rowTotals = {};
    let grand = 0;
    colKeys.forEach((ck) => (colTotals[ck] = 0));
    rowKeys.forEach((rk) => {
      rowTotals[rk] = 0;
      colKeys.forEach((ck) => {
        const v = typeof raw[rk][ck] === 'number' ? raw[rk][ck] : 0;
        rowTotals[rk] += v;
        colTotals[ck] += v;
        grand += v;
      });
    });

    // 표시 변환 (구성비)
    const pct = (v, base) => (base ? Math.round((v / base) * 1000) / 10 : 0);
    function disp(rk, ck) {
      const v = raw[rk][ck];
      if (cfg.display === '행구성비%') return pct(v, rowTotals[rk]);
      if (cfg.display === '열구성비%') return pct(v, colTotals[ck]);
      if (cfg.display === '총구성비%') return pct(v, grand);
      return v;
    }

    // 결과 AOA
    const head = ['행 \\ 열'].concat(colKeys, ['합계']);
    const body = rowKeys.map((rk) => {
      const rowTotalDisp =
        cfg.display && cfg.display.endsWith('%')
          ? cfg.display === '행구성비%' ? 100 : pct(rowTotals[rk], cfg.display === '열구성비%' ? rowTotals[rk] : grand)
          : rowTotals[rk];
      return [rk].concat(colKeys.map((ck) => disp(rk, ck)), [rowTotalDisp]);
    });
    const totalRow = ['합계'].concat(
      colKeys.map((ck) => (cfg.display && cfg.display.endsWith('%') ? (cfg.display === '열구성비%' ? 100 : pct(colTotals[ck], grand)) : colTotals[ck])),
      [cfg.display && cfg.display.endsWith('%') ? 100 : grand]
    );
    const resultAOA = [head].concat(body, [totalRow]);

    // 백데이터 : 기여 원본행 + 행/열 구분 태그
    const backCols = ['__행구분', '__열구분'].concat(ds.columns.map((c) => c.name));
    const backRecords = [];
    rowKeys.forEach((rk) => {
      colKeys.forEach((ck) => {
        (cells.get(rk + '\u0001' + ck) || []).forEach((r) => {
          backRecords.push(Object.assign({ __행구분: rk, __열구분: ck }, r));
        });
      });
    });

    const meta = [
      ['항목', '값'],
      ['생성시각', new Date().toLocaleString('ko-KR')],
      ['데이터셋', ds.label],
      ['원본 소스', ds.source],
      ['전체 레코드 수', ds.records.length],
      ['필터 통과 레코드 수', filtered.length],
      ['행 차원', cfg.rowDims.join(', ') || '(없음)'],
      ['열 차원', cfg.colDim || '(없음)'],
      ['측정값', cfg.agg === '건수' ? '건수' : `${cfg.agg}(${cfg.measureCol})`],
      ['표시', cfg.display || '값'],
      ['필터 조건', cfg.filters.map((f) => `${f.col} ${f.op} ${f.value ?? ''}`).join(' AND ') || '(없음)'],
    ];

    return { resultAOA, backRecords, backCols, meta };
  }

  // 코호트(등록률)
  // cfg: { yearCol, regCol, regMode:'값있음'|'값일치', regValue, uniqueCol, yFrom, yTo }
  function computeCohort(ds, cfg) {
    const isReg = (r) => {
      if (cfg.regMode === '값일치') return fmtKey(r[cfg.regCol]) === cfg.regValue;
      return !(r[cfg.regCol] === null || r[cfg.regCol] === undefined || r[cfg.regCol] === '');
    };

    // 연도 파생값
    const yearOf = (r) => {
      const v = r[cfg.yearCol];
      return typeof v === 'number' ? v : getYear(v);
    };

    let recs = ds.records.filter((r) => yearOf(r) !== null);
    if (cfg.yFrom) recs = recs.filter((r) => yearOf(r) >= Number(cfg.yFrom));
    if (cfg.yTo) recs = recs.filter((r) => yearOf(r) <= Number(cfg.yTo));

    const byYear = new Map(); // year -> {all:Set|count, reg:Set|count, recs:[]}
    recs.forEach((r) => {
      const y = yearOf(r);
      if (!byYear.has(y)) byYear.set(y, { allKeys: new Set(), regKeys: new Set(), all: 0, reg: 0, recs: [] });
      const b = byYear.get(y);
      b.recs.push(r);
      if (cfg.uniqueCol) {
        const k = fmtKey(r[cfg.uniqueCol]);
        b.allKeys.add(k);
        if (isReg(r)) b.regKeys.add(k);
      } else {
        b.all += 1;
        if (isReg(r)) b.reg += 1;
      }
    });

    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    let sumAll = 0, sumReg = 0;
    const rows = years.map((y) => {
      const b = byYear.get(y);
      const all = cfg.uniqueCol ? b.allKeys.size : b.all;
      const reg = cfg.uniqueCol ? b.regKeys.size : b.reg;
      sumAll += all; sumReg += reg;
      const rate = all ? Math.round((reg / all) * 1000) / 10 : 0;
      return [y, all, reg, rate];
    });
    const totalRate = sumAll ? Math.round((sumReg / sumAll) * 1000) / 10 : 0;

    const resultAOA = [['출원연도', '출원건수', '등록건수', '등록률(%)']]
      .concat(rows)
      .concat([['합계', sumAll, sumReg, totalRate]]);

    // 백데이터 : 출원연도 · 등록여부 파생 + 원본행
    const backCols = ['__출원연도', '__등록여부'].concat(ds.columns.map((c) => c.name));
    const backRecords = recs.map((r) =>
      Object.assign({ __출원연도: yearOf(r), __등록여부: isReg(r) ? '등록' : '미등록' }, r)
    );

    const meta = [
      ['항목', '값'],
      ['생성시각', new Date().toLocaleString('ko-KR')],
      ['데이터셋', ds.label],
      ['출원연도 판별 컬럼', cfg.yearCol],
      ['등록 판별 컬럼', cfg.regCol],
      ['등록 판별 방식', cfg.regMode === '값일치' ? `값 = "${cfg.regValue}"` : '값 있음(비어있지 않음)'],
      ['고유 기준(중복제거) 컬럼', cfg.uniqueCol || '(사용 안 함 · 행 단위 집계)'],
      ['연도 범위', `${cfg.yFrom || '전체'} ~ ${cfg.yTo || '전체'}`],
    ];

    return { resultAOA, backRecords, backCols, meta };
  }

  /* =========================================================
   * 4) 엑셀 내보내기 (3시트)
   * =======================================================*/
  function exportExcel(prefix, res) {
    if (!res) { alert('먼저 [계산]을 실행하세요.'); return; }
    if (typeof XLSX === 'undefined') { ensureXLSX(() => exportExcel(prefix, res)); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res.resultAOA), '결과');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(res.backRecords, { header: res.backCols }),
      '백데이터'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res.meta), '산출조건');
    XLSX.writeFile(wb, `${prefix}_${nowStamp()}.xlsx`);
  }

  /* =========================================================
   * 5) UI (Shadow DOM)
   * =======================================================*/
  const host = document.createElement('div');
  host.style.all = 'initial';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; }
      #tgl { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
             background:#1f6feb; color:#f5f8ff; border:none; border-radius:24px;
             padding:10px 16px; font-size:13px; cursor:pointer; box-shadow:0 2px 8px rgba(15,35,70,.28); }
      #panel { position: fixed; right: 18px; bottom: 64px; width: 500px; max-height: 86vh;
               z-index: 2147483000; background:#fbfcfe; border:1px solid #d3dae4; border-radius:12px;
               display:none; flex-direction:column; box-shadow:0 10px 30px rgba(15,35,70,.18); overflow:hidden; color:#1c2733; }
      #panel.open { display:flex; }
      header { background:#f2f5f9; padding:9px 14px; display:flex; justify-content:space-between;
               align-items:center; border-bottom:1px solid #d3dae4; }
      header b { font-size:13px; color:#1c2733; }
      header span { cursor:pointer; font-size:16px; color:#66707c; }
      .tabs { display:flex; border-bottom:1px solid #d3dae4; background:#f7f9fc; }
      .tab { flex:1; padding:9px 4px; font-size:12px; text-align:center; cursor:pointer; background:transparent; border:none; border-bottom:2px solid transparent; color:#66707c; }
      .tab:hover { color:#1c2733; }
      .tab.active { border-bottom-color:#1f6feb; color:#1f6feb; font-weight:700; background:#fbfcfe; }
      .body { padding:12px 14px 16px; overflow:auto; }
      .sec { display:none; }
      .sec.active { display:block; }
      .flow { font-size:11px; color:#66707c; background:#f2f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; margin-bottom:10px; }
      .qgrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
      .qcard { border:1px solid #d9e2ee; border-radius:10px; background:#ffffff; padding:10px; display:flex; flex-direction:column; gap:4px; }
      .qcard b { font-size:12.5px; color:#1c2733; }
      .qcard small { font-size:10.5px; color:#66707c; line-height:1.4; }
      .qcard button { margin-top:4px; }
      .grp { border:1px solid #e2e8f0; border-radius:10px; background:#ffffff; margin:10px 0; padding:0 10px 2px; }
      .grp[open] { padding-bottom:10px; }
      .grp > summary { list-style:none; cursor:pointer; font-size:12px; font-weight:700; color:#3d4854; padding:9px 0; user-select:none; }
      .grp > summary::-webkit-details-marker { display:none; }
      .grp > summary::before { content:'▸ '; color:#1f6feb; }
      .grp[open] > summary::before { content:'▾ '; }
      .step { font-size:12px; font-weight:700; color:#3d4854; margin:12px 0 5px; display:block; }
      #drop { border:2px dashed #b6c2d2; border-radius:8px; padding:14px; text-align:center;
              color:#66707c; font-size:12px; cursor:default; background:#f7f9fc; }
      #drop.hot { border-color:#1f6feb; background:#e9f1ff; }
      button.act { background:#1f6feb; color:#f5f8ff; border:none; border-radius:7px; padding:7px 12px; font-size:12px; font-weight:700; cursor:pointer; }
      button.act:hover { background:#1a5fd0; }
      button.sub { background:#eef2f7; color:#2a3440; border:1px solid #dbe3ec; border-radius:7px; padding:5px 10px; font-size:12px; cursor:pointer; }
      button.sub:hover { background:#e3eaf2; }
      button:disabled { opacity:.55; cursor:wait; }
      label { font-size:11px; color:#66707c; display:block; margin:9px 0 3px; }
      select, input { width:100%; font-size:12px; padding:5px 6px; border:1px solid #ccd6e2; border-radius:6px; background:#fff; color:#1c2733; }
      select:focus, input:focus { outline:none; border-color:#1f6feb; }
      select[multiple] { height:74px; }
      .row { display:flex; gap:6px; align-items:center; margin-bottom:6px; }
      .row select, .row input { flex:1; }
      .ds { font-size:12px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center; gap:6px; background:#fff; }
      .ds.on { border-color:#1f6feb; background:#eef4ff; }
      .ds .dsmain { cursor:pointer; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ds .rm { color:#5a6672; cursor:pointer; font-size:11px; flex:none; padding:2px 4px; border-radius:5px; }
      .ds .rm:hover { background:#eef2f7; color:#1c2733; }
      .ds .rm[data-a="del"] { color:#cf222e; }
      .cols { font-size:10px; color:#8b96a2; margin-top:6px; word-break:break-all; }
      table.res { border-collapse:collapse; font-size:11px; margin-top:8px; width:100%; background:#fff; }
      table.res th, table.res td { border:1px solid #d9e2ee; padding:3px 6px; text-align:right; white-space:nowrap; }
      table.res th { background:#f2f5f9; position:sticky; top:0; }
      table.res td:first-child, table.res th:first-child { text-align:left; }
      .hint { font-size:10px; color:#8b96a2; margin-top:5px; line-height:1.5; }
      .foot { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
    </style>

    <button id="tgl">📊 통계추출</button>
    <div id="panel">
      <header><b>특허 통계추출 v0.8.3</b><span id="close">×</span></header>
      <div class="tabs">
        <button class="tab active" data-t="data">데이터</button>
        <button class="tab" data-t="pivot">피벗</button>
        <button class="tab" data-t="cohort">코호트</button>
        <button class="tab" data-t="nst">비용보고서</button>
        <button class="tab" data-t="iprs">지재권</button>
        <button class="tab" data-t="engine">엔진 결과</button>
      </div>
      <div class="body">
        <!-- 데이터 -->
        <div class="sec active" data-s="data">
          <div class="flow">작업 흐름: ① 가져오기 → ② 데이터셋 확인 → ③ 통계(탭) → ④ 엑셀/표 복사</div>
          <div class="qgrid">
            <div class="qcard">
              <b>특허비 (지출결의)</b>
              <small>조회 → 자동분류 → 연도별 비용보고서</small>
              <button class="act" id="dq_report">원클릭 실행</button>
              <div class="hint" id="dq_msg">기본: 전체 기간 · 특허 지출구분</div>
            </div>
            <div class="qcard">
              <b>지재권 마스터</b>
              <small>조회 → 연도별 출원·등록 건수</small>
              <button class="act" id="iq_report">원클릭 실행</button>
              <div class="hint" id="iq_msg">기본: 전체 기간 · 전체 구분 · 보정 자동적용</div>
            </div>
            <div class="qcard">
              <b>논문 RawData</b>
              <small>조회 → 연도별 논문 통계(고유 논문수·성별·IF)</small>
              <div class="row" style="margin:2px 0 0">
                <input id="pq_from" placeholder="시작: 2020 · 2020-01 (비우면 전체)" style="flex:1;font-size:11px;padding:3px 5px">
                <input id="pq_to" placeholder="종료 (비우면: 시작 입력 시 오늘까지)" style="flex:1;font-size:11px;padding:3px 5px">
              </div>
              <button class="act" id="pq_report">원클릭 실행</button>
              <div class="hint" id="pq_msg">포털 어디서든 직접 조회(화면 진입·[조회] 불필요) · 결재완료(04) 기준 · 기간(yyyy-MM) 미지정 시 전체</div>
            </div>
          </div>

          <details class="grp">
            <summary>① 가져오기 상세 — 조건 지정 · 파일 · 화면 그리드</summary>
            <label>지출결의 조건 (S_ACC_01020000 데이터 소스 직접 호출)</label>
            <div class="row">
              <input id="dq_from" placeholder="시작: 2020 · 202001 · 20200101 (비우면 전체)" style="flex:1">
              <input id="dq_to" placeholder="종료 (비우면: 시작 입력 시 오늘까지)" style="flex:1">
            </div>
            <div class="row">
              <select id="dq_docu" style="flex:2"></select>
              <select id="dq_status" style="flex:1">
                <option value="">결재상태 전체</option>
                <option value="04">결재</option>
                <option value="01">신청중</option>
                <option value="02">검토중</option>
                <option value="03">승인중</option>
                <option value="05">반려</option>
              </select>
              <button class="sub" id="dq_run" style="flex:none">조회만</button>
            </div>
            <label>지재권 마스터 조건 (S_PMS_03019010 데이터 소스 직접 호출)</label>
            <div class="row">
              <select id="iq_dtCls" style="flex:1.2"><option value="03">신청일자 기준</option><option value="01">출원일자 기준</option><option value="02">등록일자 기준</option></select>
              <input id="iq_from" placeholder="시작: 2020 · 20200101 (비우면 전체)" style="flex:1">
              <input id="iq_to" placeholder="종료 (비우면: 시작 입력 시 오늘까지)" style="flex:1">
            </div>
            <div class="row">
              <select id="iq_cnt" style="flex:1"><option value="">국내외 전체</option><option value="I">국내</option><option value="O">국외</option><option value="M">PCT</option></select>
              <button class="sub" id="iq_run" style="flex:none">조회만</button>
            </div>
            <label>IPMS 화면 카탈로그 — 화면 진입 없이 목록 API 직접 조회 (신청·선행조사·출원·업무요청·청구서·논문RawData)</label>
            <div class="row">
              <select id="cat_sel" style="flex:2"></select>
              <button class="sub" id="cat_run" style="flex:none">조회</button>
            </div>
            <div class="row">
              <input id="cat_params" placeholder='파라미터 덮어쓰기(JSON, 선택) 예: {"q_apvStat":""}' style="flex:1">
            </div>
            <div class="hint" id="cat_msg">응답 total과 대조해 전량 수신 여부를 표시합니다. 화면별 실측 상태코드로 '상태명' 열이 자동 추가됩니다.</div>
            <label>파일 업로드</label>
            <div id="drop">파일을 여기로 끌어다 놓으세요 (여러 파일 · 여러 시트 인식)</div>
            <label>현재 화면에서 수집</label>
            <div class="foot" style="margin-top:4px">
              <button class="sub" id="grabGrid">이 화면 그리드 가져오기</button>
              <button class="sub" id="grab">화면 표(DOM)</button>
              <button class="sub" id="diagGrid">화면 구조 진단</button>
            </div>
            <div class="hint">그리드: [조회] 후 사용, 같은 도메인 iframe·팝업 포함 자동 감지(여러 개면 목록에서 선택). 직접 조회·원클릭은 krisstar 로그인 세션 사용. 새 화면 전용 연동이 필요하면 [화면 구조 진단] JSON을 복사해 전달해 주세요.</div>
            <div id="gridpick"></div>
          </details>
          <label class="step">② 데이터셋 — 카드 클릭 시 분석 대상 선택</label>
          <div id="dslist"></div>
          <div class="cols" id="colinfo"></div>
          <div id="dspreview"></div>
          <details class="grp">
            <summary>③ 고급 도구 — 데이터 결합(조인) · 특허비 수동 분류</summary>
            <label>데이터 결합(조인) — 두 데이터셋을 키 열로 병합해 새 데이터셋 생성</label>
            <div class="row">
              <select id="j_left" style="flex:1.4"></select>
              <select id="j_lkey" style="flex:1"></select>
            </div>
            <div class="row">
              <select id="j_right" style="flex:1.4"></select>
              <select id="j_rkey" style="flex:1"></select>
            </div>
            <div class="foot"><button class="sub" id="j_run">결합 실행 (왼쪽 기준)</button></div>
            <div class="hint" id="j_msg">왼쪽 모든 행 유지. 일치 시 오른쪽 열이 R_열이름으로 추가되고 건수는 R_매칭수에 기록(오른쪽 중복 키는 첫 행 사용).</div>
            <label>특허비 분류 — 파일 드롭 데이터 등 수동 실행용 (직접 조회는 자동 적용됨)</label>
            <div class="foot" style="margin-top:4px">
              <button class="sub" id="applyPatent">특허비 분류 적용(적요 파싱)</button>
              <button class="sub" id="exportUnclassified">미분류 검토 내보내기</button>
            </div>
            <div class="hint" id="patentStat"></div>
          </details>
        </div>

        <!-- 피벗 -->
        <div class="sec" data-s="pivot">
          <label>행 차원 (Ctrl/Shift로 다중 선택)</label>
          <select id="p_row" multiple></select>
          <label>열 차원 (크로스탭용, 없으면 단순 집계)</label>
          <select id="p_col"></select>
          <label>측정값 · 집계</label>
          <div class="row">
            <select id="p_agg">
              <option>건수</option><option>고유건수</option><option>합계</option>
              <option>평균</option><option>최소</option><option>최대</option>
            </select>
            <select id="p_meas"></select>
          </div>
          <label>표시</label>
          <select id="p_disp">
            <option value="값">값</option>
            <option value="행구성비%">행 구성비(%)</option>
            <option value="열구성비%">열 구성비(%)</option>
            <option value="총구성비%">총 구성비(%)</option>
          </select>
          <label>필터</label>
          <div id="p_filters"></div>
          <button class="sub" id="p_addf">+ 필터 추가</button>
          <div class="foot">
            <button class="act" id="p_run">계산</button>
            <button class="sub" id="p_xls">엑셀 내보내기</button>
            <button class="sub" id="p_copy">표 복사</button>
          </div>
          <div id="p_out"></div>
        </div>

        <!-- 코호트 -->
        <div class="sec" data-s="cohort">
          <div class="hint">당해연도/최근 N년 출원 건 중 등록된 비율을 산출합니다. 출원번호 등 고유 기준을 지정하면 중복 집계를 방지합니다.</div>
          <label>출원연도 판별 컬럼 (날짜 또는 (연도) 컬럼 권장)</label>
          <select id="c_year"></select>
          <label>등록 판별 컬럼 (예: 등록일 / 등록번호 / 상태)</label>
          <select id="c_reg"></select>
          <label>등록 판별 방식</label>
          <div class="row">
            <select id="c_mode">
              <option value="값있음">값 있음(비어있지 않으면 등록)</option>
              <option value="값일치">특정 값과 일치</option>
            </select>
            <input id="c_regval" placeholder="일치시킬 값 (예: 등록)" />
          </div>
          <label>고유 기준 컬럼 (선택 · 예: 출원번호)</label>
          <select id="c_uniq"></select>
          <div class="row">
            <div style="flex:1"><label>시작연도(선택)</label><input id="c_from" placeholder="예: 2020" /></div>
            <div style="flex:1"><label>종료연도(선택)</label><input id="c_to" placeholder="예: 2025" /></div>
          </div>
          <div class="foot">
            <button class="act" id="c_run">계산</button>
            <button class="sub" id="c_xls">엑셀 내보내기</button>
            <button class="sub" id="c_copy">표 복사</button>
          </div>
          <div id="c_out"></div>
        </div>

        <!-- 보고서(연도별 NST 양식) -->
        <div class="sec" data-s="nst">
          <div class="hint">연도별 국내/국외 × 출원·등록·유지 (국외출원은 PCT/일반 구분). 매핑: 출원=출원료+중간사건비용(보정료 포함) · 등록=등록료 · 유지=연차료. 먼저 데이터 탭에서 [특허비 분류 적용]을 실행하세요.</div>
          <div class="row">
            <div style="flex:1"><label>단위</label>
              <select id="n_unit"><option value="백만원">백만원(반올림)</option><option value="원">원</option></select>
            </div>
            <div style="flex:1"><label>시작연도(선택)</label><input id="n_from" placeholder="예: 2020" /></div>
            <div style="flex:1"><label>종료연도(선택)</label><input id="n_to" placeholder="예: 2026" /></div>
          </div>
          <div class="foot">
            <button class="act" id="n_run">계산</button>
            <button class="sub" id="n_xls">엑셀 내보내기</button>
            <button class="sub" id="n_copy">표 복사</button>
          </div>
          <div id="n_out" style="overflow:auto"></div>
        </div>

        <!-- 지재권(마스터) -->
        <div class="sec" data-s="iprs">
          <div class="hint">지식재산권 마스터(S_PMS_03019010) 데이터 기준. 산출 규칙: 출원수=출원일자 연도별 건수(출원번호가 10-0000-0000000류 더미면 제외) · 등록수=등록일자 연도별 건수 · 지재권구분에 '특허' 포함 시 특허로 보아 국내외 열 기준 국내/국외/PCT 세분(그 외 표기·공란=기타), 특허 외(실용신안·디자인·상표 등)는 통합. 규칙은 스크립트 상단 IPRS_RULES에서 수정할 수 있습니다.</div>
          <div class="foot">
            <button class="act" id="i_run">연도별 출원·등록 건수 계산</button>
            <button class="sub" id="i_xls">엑셀 내보내기</button>
            <button class="sub" id="i_copy">표 복사</button>
          </div>
          <div id="i_out" style="overflow:auto"></div>
          <label style="margin-top:10px">로컬 보정 — 시스템 원본은 건드리지 않고 이 도구 안에서만 값을 덮어씀. 재조회 시 신청번호 기준으로 자동 재적용되며, 새로 추가된 데이터는 그대로 유입됩니다.</label>
          <div class="row">
            <input id="p_key" placeholder="신청번호(intellRqstNo)" style="flex:1.2">
            <select id="p_field" style="flex:1.2"></select>
            <input id="p_val" placeholder="새 값" style="flex:1">
            <button class="sub" id="p_add">추가/수정</button>
          </div>
          <div id="p_list"></div>
          <div class="foot">
            <button class="sub" id="p_export">보정 JSON 내보내기</button>
            <button class="sub" id="p_import">보정 JSON 가져오기</button>
            <label style="display:inline-block;margin:0"><input type="checkbox" id="p_apply" checked> 조회 시 자동 적용</label>
          </div>
          <div class="hint" id="p_msg"></div>
        </div>

        <!-- 엔진 결과 -->
        <div class="sec" data-s="engine">
          <div class="hint">내장·외부 엔진(논문 통계 등)의 실행 결과가 여기에 표시됩니다. 각 엔진의 [실행]으로 계산하고 [엑셀]로 3시트 출력합니다. 외부 등록: KrissStatsTool.registerEngine({id, label, compute})</div>
          <label style="margin-top:6px">엔진 목록</label>
          <div id="eng_list"></div>
          <div class="foot" style="margin-top:8px">
            <button class="sub" id="e_copy">표 복사</button>
          </div>
          <div id="engine_out" style="overflow:auto;margin-top:6px"></div>
        </div>
      </div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));

  // 토글 / 탭
  $('#tgl').onclick = () => { const _p = $('#panel'); _p.classList.toggle('open'); if (_p.classList.contains('open')) ensureXLSX(); };
  $('#close').onclick = () => $('#panel').classList.remove('open');
  $$('.tab').forEach((t) => {
    t.onclick = () => {
      $$('.tab').forEach((x) => x.classList.remove('active'));
      $$('.sec').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      $(`.sec[data-s="${t.dataset.t}"]`).classList.add('active');
      populateSelectors();
    };
  });

  // 드롭존
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.add('hot'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('hot'); })
  );
  drop.addEventListener('drop', async (e) => {
    for (const f of e.dataTransfer.files) {
      try { await loadFile(f); }
      catch (err) { alert(`파일 처리 오류: ${f.name}\n${err.message}`); }
    }
  });

  $('#grab').onclick = captureVisibleTable;

  /* ===== 화면 그리드 자동 감지·추출 (v2.1) =====
     어떤 KRISS 화면이든: 현재 창 + 같은 도메인 iframe(2단계)에서 Kendo Grid를 찾아
     dataSource 원시값(날짜 Date, 금액 number, 코드값)을 그대로 가져온다.
     지출[발의,결의] 목록 화면(rqstNo/rqstDesc/drAmt 필드)은 전용 매핑(코드→명칭)을 적용. */
  const PW = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const DOCU_MAP = { '01': '결정된방침에 의한 지출결의', '02': '회의비 및 유사비목 지출결의', '04': '제세및 공공요금 지출발의', '05': '기타 지출발의(학회연회비포함)', '06': '해외출장비', '07': '소액구매지출발의', '08': '연구원 공공요금(수도,전기,전화)', '09': '국내,국외 세미나및 연구자문발의', '12': '선택적 복리후생비', '13': '연구활동 진흥비(1,2) 및 보안수당 발의', '14': '내자구매지출발의', '15': '외자구매지출발의', '16': '급여 지출발의', '17': '기술료 보상금 지출발의', '18': '장려금지출발의', '21': '학자금융자 지출발의', '22': '예수금(소급료) 지출발의', '23': '퇴직금지급(정규직)지출발의', '24': '퇴직금지급(비정규)지출발의', '26': '위탁/협동/공동 연구비', '27': '특허 출원/등록/연차료', '28': '국내출장', '30': '학회관련(참가/등록/교육비)지출발의', '32': '인공지능챗봇구독서비스 지출발의', '41': '연구비반납[연구비정산]', '44': '고용,산재보험 지출발의', '45': '국민/건강/고용/산재보험 지출발의' };
  const STATUS_MAP = { '00': '임시저장', '01': '신청중', '02': '검토중', '03': '승인중', '04': '결재', '05': '반려' };

  const fdDate = (d) => (d instanceof Date)
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : d;

  // 현재 창 + 같은 도메인 iframe/frame 수집 (교차 도메인은 접근 불가 → 무시)
  function collectWindows(win, acc, depth) {
    acc.push(win);
    if (depth <= 0) return acc;
    let frames = [];
    try { frames = win.document.querySelectorAll('iframe, frame'); } catch (e) { return acc; }
    frames.forEach((f) => {
      try {
        if (f.contentWindow && f.contentWindow.document) collectWindows(f.contentWindow, acc, depth - 1);
      } catch (e) { /* cross-origin 등 접근 불가 → 건너뜀 */ }
    });
    return acc;
  }

  // 화면의 모든 Kendo Grid 위젯 탐색
  function findAllGrids() {
    const wins = collectWindows(PW, [], 2);
    const found = [];
    const seen = new Set();
    wins.forEach((w) => {
      let jq = null;
      try { jq = w.jQuery || w.$; } catch (e) { jq = null; }
      let els = [];
      try { els = w.document.querySelectorAll('[data-role="grid"], .k-grid'); } catch (e) { return; }
      els.forEach((el) => {
        if (seen.has(el)) return;
        let gw = null;
        try { if (jq && jq.fn && jq.fn.data) gw = jq(el).data('kendoGrid'); } catch (e) { gw = null; }
        if (!gw || !gw.dataSource) return;
        let items = [];
        try { items = gw.dataSource.data(); } catch (e) { return; }
        seen.add(el);
        const cols = (gw.columns || []).filter((c) => c && c.field);
        const where = (w === PW) ? '본문' : 'iframe';
        found.push({
          win: w, el, gw, items, cols,
          label: `${el.id ? '#' + el.id : '(id없음)'} · ${where} · ${items.length}행 · ${cols.length}필드`,
        });
      });
    });
    return found;
  }

  // 지출결의 목록 전용 매핑 (코드→명칭). rqstDt는 Date 객체(그리드) 또는 'yyyyMMdd' 문자열(JSON 직접 조회) 모두 처리.
  function importExpenseRows(raw, label) {
    const normDt = (v) => {
      if (v instanceof Date) return fdDate(v);
      const s = String(v == null ? '' : v);
      const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
    };
    const headers = ['No', '지출구분', '발의번호', '증빙', '발의일자', '발의자', '결의금액', '적요', '결재선', '상태', '결의번호', '결의자', '지출번호', '지체상금', '오류내용'];
    const records = raw.map((r, i) => ({
      'No': r.rowNumber != null ? r.rowNumber : i + 1,
      '지출구분': DOCU_MAP[r.docuType] || r.docuType || '',
      '발의번호': r.rqstNo || '',
      '증빙': r.billtype || '',
      '발의일자': normDt(r.rqstDt) || '',
      '발의자': r.rqstEmp || '',
      '결의금액': typeof r.drAmt === 'number' ? r.drAmt : toNum(r.drAmt),
      '적요': r.rqstDesc || '',
      '결재선': r.currentNm || '',
      '상태': STATUS_MAP[r.acctStatus] || r.acctStatus || '',
      '결의번호': r.reslNo || '',
      '결의자': r.reslEmp || '',
      '지출번호': r.jiRqstNo || '',
      '지체상금': r.dlyPayAmt == null ? '' : r.dlyPayAmt,
      '오류내용': r.errorMessage || '',
    }));
    DATASETS.push(buildDataset(headers, records, 'kendo-grid', `${label || '그리드 지출결의'} (${records.length}행)`));
    activeId = DATASETS[DATASETS.length - 1].id;
    renderAll();
  }

  // 범용 가져오기: 그리드 컬럼 title(한글 헤더) 기준으로 데이터셋 생성
  function importGrid(g) {
    const raw = Array.prototype.map.call(g.items, (it) => (it && typeof it.toJSON === 'function') ? it.toJSON() : it);
    if (!raw.length) { alert('이 그리드에 조회된 데이터가 없습니다. [조회] 후 다시 시도하세요.'); return; }
    const f0 = raw[0] || {};
    if ('rqstNo' in f0 && 'rqstDesc' in f0 && 'drAmt' in f0) { importExpenseRows(raw); return; }
    const headers = [];
    const fields = [];
    const used = {};
    g.cols.forEach((c) => {
      let h = (c.title ? String(c.title).replace(/<[^>]*>/g, '').trim() : '') || c.field;
      if (!h || /checkbox/i.test(h)) h = c.field;
      if (used[h]) h = `${h}(${c.field})`;
      used[h] = 1;
      headers.push(h);
      fields.push(c.field);
    });
    const records = raw.map((r) => {
      const o = {};
      fields.forEach((f, i) => {
        let v = r[f];
        if (v instanceof Date) v = fdDate(v);
        o[headers[i]] = (v == null ? '' : v);
      });
      return o;
    });
    let title = '';
    try { title = (g.win.document.title || '').split('|')[0].trim(); } catch (e) { title = ''; }
    DATASETS.push(buildDataset(headers, records, 'kendo-grid', `${title || '그리드'} (${records.length}행)`));
    activeId = DATASETS[DATASETS.length - 1].id;
    renderAll();
  }

  $('#grabGrid').onclick = () => {
    const grids = findAllGrids();
    const box = $('#gridpick');
    box.innerHTML = '';
    if (!grids.length) {
      alert('이 화면에서 Kendo 그리드를 찾지 못했습니다.\n[조회]를 먼저 실행했는지 확인하거나, [화면 구조 진단] 결과를 확인하세요.');
      return;
    }
    if (grids.length === 1) { importGrid(grids[0]); return; }
    const lb = document.createElement('label');
    lb.textContent = `감지된 그리드 ${grids.length}개 — 가져올 항목을 선택하세요`;
    box.appendChild(lb);
    grids.forEach((g) => {
      const el = document.createElement('div');
      el.className = 'ds';
      el.innerHTML = `<span>${g.label}</span><span class="rm">가져오기</span>`;
      el.querySelector('.rm').onclick = () => importGrid(g);
      box.appendChild(el);
    });
  };

  // 화면 구조 진단: 그리드/필드 목록 JSON — 다른 화면 전용 연동(프리셋) 제작용
  $('#diagGrid').onclick = () => {
    const grids = findAllGrids();
    const rep = {
      url: location.href,
      title: document.title,
      grids: grids.map((g) => ({
        id: g.el.id || '',
        where: (g.win === PW) ? '본문' : 'iframe',
        rows: g.items.length,
        columns: g.cols.map((c) => ({ field: c.field, title: String(c.title || '').replace(/<[^>]*>/g, ''), hidden: !!c.hidden })),
      })),
    };
    const box = $('#gridpick');
    box.innerHTML = '<label>화면 구조 진단 결과 — 아래 내용을 복사해 전달해 주세요</label>';
    const ta = document.createElement('textarea');
    ta.style.cssText = 'width:100%;height:170px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;font-size:11px;padding:6px;box-sizing:border-box;';
    ta.value = JSON.stringify(rep, null, 2);
    box.appendChild(ta);
    const btn = document.createElement('button');
    btn.className = 'sub';
    btn.textContent = '클립보드 복사';
    btn.onclick = () => { ta.select(); try { document.execCommand('copy'); } catch (e) { /* 수동 복사 */ } };
    box.appendChild(btn);
  };

  /* ===== 포털 직접 조회 (v2.2) =====
     지출[발의,결의] 목록 페이지(S_ACC_01020000.do)가 그리드 로딩에 사용하는 것과 동일한
     데이터 소스(POST /mis/acc/expndtrMng/expndtrResol/selectExpsMangPayout.json)와
     동일한 검색폼 파라미터(billCls=1, cdCls=AC11, docuType, rqstDtFr/To, errorYn=A ...)를
     그대로 호출한다. 화면에 들어가 [조회]를 누를 필요 없이, 로그인된 krisstar 어느 화면에서든 동작. */
  /* 다운로드 페이지: https://krisstar.kriss.re.kr/mis/acc/S_ACC_01020000.do (지출[발의,결의] 목록)
     아래 JSON은 그 페이지의 [조회]·[엑셀 저장](#button11)이 사용하는 동일한 데이터 소스이다. */
  const EXP_ENDPOINT = 'https://krisstar.kriss.re.kr/mis/acc/expndtrMng/expndtrResol/selectExpsMangPayout.json';

  // 응답 구조가 달라도 견고하게: JSON 안에서 첫 번째 '객체 배열'을 찾는다
  function findFirstObjectArray(o, depth) {
    depth = depth || 0;
    if (depth > 5 || o == null) return null;
    if (Array.isArray(o)) return (o.length && typeof o[0] === 'object') ? o : null;
    if (typeof o === 'object') {
      for (const k of Object.keys(o)) {
        const r = findFirstObjectArray(o[k], depth + 1);
        if (r) return r;
      }
    }
    return null;
  }

  async function fetchExpenseDirect(cfg) {
    const base = {
      billCls: '1', cdCls: 'AC11',
      rqstDtFr: cfg.from || '', rqstDtTo: cfg.to || '',
      rqstDeptNm: '', rqstDept: '', rqstEmpNm: '', rqstEmp: '',
      reslDtFr: '', reslDtTo: '', dangYn: '', billNo: '',
      docuType: cfg.docuType == null ? '27' : cfg.docuType,
      acctStatus: cfg.status || '',
      frAmt: '', toAmt: '', rqstNo: '', reslNo: '', jiRqstNo: '',
      order: '1', busiRegNm: '', busiRegNo: '', errorYn: 'A',
    };
    return postKrissJson(EXP_ENDPOINT, base); // 공통 POST 일원화(JSON 우선, total 캡처 포함)
  }

  // 지출구분 옵션 채우기 (특허=27 기본)
  (function fillDocuOptions() {
    const sel = $('#dq_docu');
    sel.appendChild(new Option('특허 출원/등록/연차료 (27)', '27'));
    sel.appendChild(new Option('전체 지출구분', ''));
    Object.keys(DOCU_MAP).forEach((k) => { if (k !== '27') sel.appendChild(new Option(`${DOCU_MAP[k]} (${k})`, k)); });
    sel.value = '27';
  })();

  function switchTab(name) {
    $$('.tab').forEach((x) => x.classList.remove('active'));
    $$('.sec').forEach((x) => x.classList.remove('active'));
    const t = $(`.tab[data-t="${name}"]`);
    if (t) t.classList.add('active');
    const s = $(`.sec[data-s="${name}"]`);
    if (s) s.classList.add('active');
    populateSelectors();
  }

  // 조회 → 데이터셋 추가 → (적요가 있으면) 자동 분류까지
  async function runDirectFetch(msg) {
    const P = normPeriod($('#dq_from').value, $('#dq_to').value, 'ymd');
    const cfg = { from: P.from, to: P.to, docuType: $('#dq_docu').value, status: $('#dq_status').value };
    msg.textContent = '조회 중... (전체 기간은 수 초가 걸릴 수 있습니다)';
    let rows = await fetchExpenseDirect(cfg);
    // 날짜 형식 차이(yyyy-MM-dd vs yyyyMMdd) 자동 재시도
    if (!rows.length && (cfg.from.indexOf('-') >= 0 || cfg.to.indexOf('-') >= 0)) {
      rows = await fetchExpenseDirect({ ...cfg, from: cfg.from.replace(/-/g, ''), to: cfg.to.replace(/-/g, '') });
    }
    if (!rows.length) {
      msg.textContent = '조회 결과 0건 — 기간·지출구분·결재상태 조건을 확인하세요.';
      return null;
    }
    importExpenseRows(rows, '직접조회 지출결의');
    const ds = activeDataset();
    if (ds) ds.total = LAST_FETCH_TOTAL;
    let clsMsg = '';
    if (ds && findDescColumn(ds)) {
      applyPatentClassification(ds);
      renderAll();
      const n = ds.records.length;
      const rOk = ds.records.filter((r) => r['특허_국내해외'] !== '미분류').length;
      clsMsg = ` · 자동 분류 완료(국내/해외 ${(rOk / n * 100).toFixed(1)}%)`;
    }
    msg.textContent = `가져오기 완료: ${rows.length}행${clsMsg}` + totalBadge(rows.length, LAST_FETCH_TOTAL) + (P.note ? ' · ' + P.note : '');
    return ds;
  }

  $('#dq_run').onclick = async () => {
    const btn = $('#dq_run');
    const msg = $('#dq_msg');
    btn.disabled = true;
    try { await runDirectFetch(msg); }
    catch (e) { msg.textContent = '조회 실패: ' + e.message + ' — krisstar 도메인에서 로그인 상태로 실행해야 합니다.'; }
    finally { btn.disabled = false; }
  };

  // 원클릭: 조회 → 분류 → 연도별 보고서 탭 전환·계산까지
  $('#dq_report').onclick = async () => {
    const btn = $('#dq_report');
    const msg = $('#dq_msg');
    btn.disabled = true;
    try {
      const ds = await runDirectFetch(msg);
      if (ds) {
        switchTab('nst');
        if (runNSTReport()) msg.textContent += ' · 연도별 보고서 생성 완료(보고서 탭에서 [엑셀 내보내기])';
      }
    } catch (e) {
      msg.textContent = '조회 실패: ' + e.message + ' — krisstar 도메인에서 로그인 상태로 실행해야 합니다.';
    } finally {
      btn.disabled = false;
    }
  };
  /* ===== 지식재산권 마스터 연동 (v0.2.0) =====
     페이지: https://krisstar.kriss.re.kr/pms/iprs/mng/S_PMS_03019010.do (지식재산권 마스터)
     데이터 소스: POST /pms/iprs/mng/selectIntellAplyList.json  (검색폼 + cls='detail' JSON 본문)
     엑셀 저장용 숨은 grid2가 페이징 없이 전체를 수신하는 구조 → 페이지 파라미터 없이 전체 요청 */
  /* IPRS-LOGIC-START */
  const IPRS_ENDPOINT = 'https://krisstar.kriss.re.kr/pms/iprs/mng/selectIntellAplyList.json';

  const IPRS_RULES = {
    // 출원 건수 집계에서 제외할 더미 출원번호 (예: 10-0000-0000000)
    placeholderAplyNo: /^\s*\d{1,2}-0+-0+\s*$/,
    // '특허' 판정: 지재권구분 값이 아래 정규식에 매칭되면 특허, 그 외(실용신안·디자인·상표·프로그램 등)는 특허외
    patentType: /특허/,
  };

  // [서버필드, 한글헤더] — 지식재산권 마스터 detail 그리드 스키마 기준
  const IPRS_FIELDS = [
    ['intellMngNo', '관리번호'], ['intellRqstNo', '신청번호'], ['ivenTypNm', '지재권구분'],
    ['cntClsNm', '국내외'], ['aplyNtnNm', '출원국가'], ['reRqstType', '출원종류'],
    ['masterApvNm', '특허상태'], ['detailApvNm', '상태세부'], ['apvStatRemark', '상태메모'],
    ['expectExpDt', '소멸예정일'], ['ctrctApv', '기술이전상태'], ['ctrctDetailApv', '기술이전세부'],
    ['maxCtrctEndDt', '기술이전종료해지일'], ['ivenNm', '발명명칭(국문)'], ['ivenEngNm', '발명명칭(영문)'],
    ['mainIvenEmpNm', '주발명자'], ['mainIvenEmpNo', '주발명자사번'], ['holoffCls', '재직여부'],
    ['nextReEmpNo', '차상위검토자사번'], ['nextReEmpNm', '차상위검토자성명'], ['nextReRsn', '차상위검토조건'],
    ['ivenInfo', '발명자'], ['ivenInfoNms', '발명자(이름)'], ['rightCls', '단독공동'],
    ['orgInfo', '권리자'], ['orgInfos', '특허권자지분'], ['plfNm', '특허사무소'],
    ['rqstDt', '지재권신청일'], ['intellAplyYy', '출원년도'], ['intellAplyDt', '출원일자'],
    ['intellAplyNo', '출원번호'], ['intellRegYy', '등록년도'], ['intellRegDt', '등록일자'],
    ['intellRegNo', '등록번호'], ['scienceTechFldNm', '과학기술분류'], ['industTechFldNm', '산업기술분류'],
    ['keyword', '키워드'], ['mgmtCreateDt', '패밀리생성일'], ['intellMgmtNo', '패밀리번호'],
    ['techTrnsYn', '기술이전YN'], ['seaTrnsYn', '당해양도'], ['investmentYn', '출자'],
    ['lessFiveyyYn', '5년이하'], ['marketingYn', '마케팅'], ['ownStrgyYn', '전략보유'],
    ['unuseYn', '미활용'], ['teIntroWishYn', 'SMK제작의사'], ['smkYear', 'SMK연도'],
    ['videoYear', '영상연도'], ['briefYear', '기술설명회연도'], ['compYear', '수요기업연도'],
    ['etcYear', '기타연도'], ['anlOffcNm', '연차관리기관'], ['projCd1', '주과제코드'],
    ['projNm1', '주과제명'], ['projCdAll', '전체과제코드'], ['projCd2', '과제코드1'],
    ['projNm2', '과제명1'], ['projCd3', '과제코드2'], ['projNm3', '과제명2'],
    ['ctrctNos', '계약번호'], ['ctrctEndDt', '계약종료예정일'], ['ctrctNms', '계약명'],
    ['xlsxSmrtGrd', '스마트등급'], ['inqrDt', '스마트등급조회일'], ['rqstAmtSum', '비용총액'],
  ];

  const normYmd = (v) => {
    if (v instanceof Date) return fdDate(v);
    const s = String(v == null ? '' : v);
    const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
  };

  // 직전 직접 조회 응답의 total(서버 보고 총건수) — 전량 수신 검증용
  let LAST_FETCH_TOTAL = null;
  let LAST_FETCH_DIAG = null;   // 직전 요청 진단(요청·상태·응답 앞부분) — 실패 원격 분석용
  function totalBadge(n, total) {
    if (total == null) return '';
    return n === total ? ` (전량 ✓ total=${total})` : ` (부분 ${n}/${total} — 조건·권한 확인)`;
  }

  // 기간 입력 스마트 정규화(통계 공통) — '2020'→그 해 전체, 시작만 입력→오늘까지,
  // 2020 / 202001 / 20200101 / 2020-01-01 / 2020.01.01 모두 허용. gran: 'ymd'|'ym'
  function normPeriod(fromRaw, toRaw, gran, todayD) {
    const g = gran === 'ym' ? 'ym' : 'ymd';
    const td = todayD instanceof Date ? todayD : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayYmd = `${td.getFullYear()}-${pad(td.getMonth() + 1)}-${pad(td.getDate())}`;
    const todayYm = todayYmd.slice(0, 7);
    const lastDay = (y, m) => new Date(+y, +m, 0).getDate();
    const parse = (raw, isEnd) => {
      const s = String(raw == null ? '' : raw).trim().replace(/[./]/g, '-');
      if (!s) return '';
      const d = s.replace(/-/g, '');
      if (/^(19|20)\d{2}$/.test(d)) {
        if (g === 'ym') return isEnd ? `${d}-12` : `${d}-01`;
        return isEnd ? `${d}-12-31` : `${d}-01-01`;
      }
      if (/^(19|20)\d{4}$/.test(d)) {
        const y = d.slice(0, 4), m = d.slice(4, 6);
        if (g === 'ym') return `${y}-${m}`;
        return isEnd ? `${y}-${m}-${pad(lastDay(y, m))}` : `${y}-${m}-01`;
      }
      if (/^(19|20)\d{6}$/.test(d)) {
        const y = d.slice(0, 4), m = d.slice(4, 6), dd = d.slice(6, 8);
        return g === 'ym' ? `${y}-${m}` : `${y}-${m}-${dd}`;
      }
      return s; // 알 수 없는 형식은 원문 유지(서버 판단)
    };
    let from = parse(fromRaw, false);
    let to = parse(toRaw, true);
    if (from && !to) to = (g === 'ym') ? todayYm : todayYmd;
    const fr0 = String(fromRaw == null ? '' : fromRaw).trim();
    const to0 = String(toRaw == null ? '' : toRaw).trim();
    const note = ((fr0 || to0) && (from !== fr0 || to !== to0)) ? `기간 해석 ${from}~${to}` : '';
    return { from, to, note };
  }

  // kriss.ajax.post 방식(JSON 본문)의 공통 POST — 415 시 폼 인코딩 예비 전환
  async function postKrissJson(url, bodyObj) {
    const mk = (asJson) => fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: asJson
        ? { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        : { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: asJson ? JSON.stringify(bodyObj) : new URLSearchParams(Object.entries(bodyObj)).toString(),
    });
    let res = await mk(true);
    if (res.status === 415 || res.status === 400) res = await mk(false);
    const rawText = await res.text();
    let json = null;
    try { json = JSON.parse(rawText); } catch (e) { json = null; }
    LAST_FETCH_TOTAL = (json && typeof json.total === 'number') ? json.total
      : (json && json.data && typeof json.data.total === 'number' ? json.data.total : null);
    LAST_FETCH_DIAG = { url, body: bodyObj, status: res.status, snippet: rawText.slice(0, 300), total: LAST_FETCH_TOTAL, time: new Date().toLocaleString('ko-KR') };
    if (!res.ok) { console.log('[특허-통계] 진단', LAST_FETCH_DIAG); throw new Error('HTTP ' + res.status + (res.status === 401 || res.status === 403 ? ' (로그인/권한 확인)' : '')); }
    if (json == null) { console.log('[특허-통계] 진단', LAST_FETCH_DIAG); throw new Error('응답이 JSON이 아닙니다(세션 만료·오류 페이지 추정). KrissStatsTool.lastDiag()로 진단 복사 가능'); }
    const rows = findFirstObjectArray(json);
    if (rows) return rows;
    const findEmpty = (o, d) => {
      if (d > 5 || o == null) return null;
      if (Array.isArray(o)) return o;
      if (typeof o === 'object') { for (const k of Object.keys(o)) { const r = findEmpty(o[k], d + 1); if (r) return r; } }
      return null;
    };
    if (findEmpty(json, 0)) return [];
    throw new Error('응답에서 목록 배열을 찾지 못했습니다 (세션/구조 확인).');
  }

  async function fetchIprsDirect(cfg) {
    const body = {
      isAuthorized: 'Y',
      searchDtCls: cfg.dtCls || '03',
      searchStrDt: cfg.from || '', searchEndDt: cfg.to || '',
      cntCls: cfg.cnt || '', item: '', keyword: '',
      cls: 'detail',
    };
    return postKrissJson(IPRS_ENDPOINT, body);
  }

  /* ---- 로컬 보정(패치): 시스템 원본 불변, 신청번호 키로 병합 ---- */
  const IPRS_PATCH_KEY = 'kriss_iprs_patch_v1';
  function loadIprsPatch() {
    try { return JSON.parse(localStorage.getItem(IPRS_PATCH_KEY)) || { edits: {}, autoApply: true }; }
    catch (e) { return { edits: {}, autoApply: true }; }
  }
  function saveIprsPatch(p) {
    try { localStorage.setItem(IPRS_PATCH_KEY, JSON.stringify(p)); }
    catch (e) { alert('로컬 저장 실패: ' + e.message); }
  }
  // records(한글 헤더 객체)에 보정 적용. '로컬보정' 열에 수정 필드 기록(검증용). 적용 건수 반환.
  function applyIprsPatch(records) {
    const p = loadIprsPatch();
    let n = 0;
    records.forEach((r) => {
      const e = p.autoApply ? p.edits[r['신청번호']] : null;
      if (e) {
        const fs = Object.keys(e);
        fs.forEach((f) => { r[f] = e[f]; });
        r['로컬보정'] = fs.join(', ');
        n++;
      } else {
        r['로컬보정'] = '';
      }
    });
    return n;
  }

  function importIprsRows(raw, label) {
    const RE_MAP = { G: '일반출원', D: '분할출원', P: '가출원', S: '가출원의 후속출원', E: '유럽건 재등록' };
    const HOLOFF = { Y: '퇴직', N: '재직' };
    const CTD = { '0400': '기술이전 완료', '0401': '기술이전 종료', '0402': '출자' };
    const dateF = { expectExpDt: 1, maxCtrctEndDt: 1, rqstDt: 1, intellAplyDt: 1, intellRegDt: 1, mgmtCreateDt: 1, ctrctEndDt: 1, inqrDt: 1 };
    const headers = ['No'].concat(IPRS_FIELDS.map((f) => f[1])).concat(['로컬보정']);
    const records = raw.map((r, i) => {
      const o = { No: r.rowNumber != null ? r.rowNumber : i + 1 };
      IPRS_FIELDS.forEach(([f, t]) => {
        let v = r[f];
        if (dateF[f]) v = normYmd(v);
        else if (f === 'reRqstType') v = RE_MAP[v] || (v == null ? '' : v);
        else if (f === 'holoffCls') v = HOLOFF[v] || (v == null ? '' : v);
        else if (f === 'ctrctDetailApv') v = CTD[v] || (v == null ? '' : v);
        else if (f === 'rqstAmtSum') v = (typeof v === 'number') ? v : toNum(v);
        o[t] = v == null ? '' : v;
      });
      return o;
    });
    const patched = applyIprsPatch(records);
    DATASETS.push(buildDataset(headers, records, 'iprs-master', `${label || '지재권 마스터'} (${records.length}행${patched ? ' · 보정 ' + patched + '건' : ''})`));
    activeId = DATASETS[DATASETS.length - 1].id;
    renderAll();
    return { count: records.length, patched };
  }

  /* ---- 프리셋: 연도별 출원·등록 건수 (특허: 국내/국외/PCT 세분, 특허외: 통합) ----
     출원수 = 출원일자 연도별 행수 (출원번호가 IPRS_RULES.placeholderAplyNo에 걸리면 제외)
     등록수 = 등록일자 연도별 행수
     구분   = 지재권구분이 IPRS_RULES.patentType 매칭 시 특허(국내외 열로 국내/국외/PCT, 그 외·공란=기타), 그 외 특허외 */
  function computeIprsCounts(ds) {
    const need = ['출원일자', '등록일자', '출원번호', '지재권구분', '국내외'];
    if (!need.every((n2) => ds.columns.some((c) => c.name === n2))) {
      alert('지재권 마스터 데이터셋이 아닙니다 (출원일자·등록일자·출원번호·지재권구분·국내외 열 필요).');
      return null;
    }
    const yearOf = (v) => { const m = String(v || '').match(/^(19|20)\d{2}/); return m ? m[0] : ''; };
    const regionOf = (v) => (v === '국내' || v === '국외' || v === 'PCT') ? v : '기타';
    const blank = () => ({ pa: { 국내: 0, 국외: 0, PCT: 0, 기타: 0 }, pr: { 국내: 0, 국외: 0, PCT: 0, 기타: 0 }, oa: 0, or2: 0, ax: 0 });
    const Y = {};
    const backRecords = ds.records.map((r) => {
      const o = Object.assign({}, r);
      const ay = yearOf(r['출원일자']);
      const ry = yearOf(r['등록일자']);
      const isPat = IPRS_RULES.patentType.test(String(r['지재권구분'] || ''));
      const reg = regionOf(String(r['국내외'] || '').trim());
      const dummy = IPRS_RULES.placeholderAplyNo.test(String(r['출원번호'] || ''));
      o['지재권분류'] = isPat ? `특허(${reg})` : '특허외';
      o['출원집계'] = ay ? (dummy ? '제외(더미 출원번호)' : '포함') : '해당없음(출원일자 없음)';
      o['등록집계'] = ry ? '포함' : '해당없음(등록일자 없음)';
      if (ay) {
        if (!Y[ay]) Y[ay] = blank();
        if (dummy) Y[ay].ax++;
        else if (isPat) Y[ay].pa[reg]++;
        else Y[ay].oa++;
      }
      if (ry) {
        if (!Y[ry]) Y[ry] = blank();
        if (isPat) Y[ry].pr[reg]++; else Y[ry].or2++;
      }
      return o;
    });
    const head = ['연도',
      '특허_출원_국내', '특허_출원_국외', '특허_출원_PCT', '특허_출원_기타', '특허_출원계',
      '특허_등록_국내', '특허_등록_국외', '특허_등록_PCT', '특허_등록_기타', '특허_등록계',
      '특허외_출원', '특허외_등록', '전체_출원', '전체_등록', '제외_더미출원번호'];
    const years = Object.keys(Y).sort();
    const body = [];
    const tot = new Array(head.length - 1).fill(0);
    years.forEach((y) => {
      const o = Y[y];
      const paT = o.pa.국내 + o.pa.국외 + o.pa.PCT + o.pa.기타;
      const prT = o.pr.국내 + o.pr.국외 + o.pr.PCT + o.pr.기타;
      const row = [y, o.pa.국내, o.pa.국외, o.pa.PCT, o.pa.기타, paT,
        o.pr.국내, o.pr.국외, o.pr.PCT, o.pr.기타, prT,
        o.oa, o.or2, paT + o.oa, prT + o.or2, o.ax];
      body.push(row);
      row.slice(1).forEach((v, i) => { tot[i] += v; });
    });
    const meta = [
      ['항목', '값'],
      ['생성시각', new Date().toLocaleString('ko-KR')],
      ['데이터셋', ds.label],
      ['출원수 규칙', '출원일자 연도별 건수. 출원번호가 더미(예: 10-0000-0000000, 정규식 ' + String(IPRS_RULES.placeholderAplyNo) + ')이면 제외'],
      ['등록수 규칙', '등록일자 연도별 건수'],
      ['특허/특허외 구분', '지재권구분 값이 ' + String(IPRS_RULES.patentType) + ' 매칭 시 특허, 그 외(실용신안·디자인·상표·프로그램 등)는 특허외로 통합'],
      ['특허 국내외 세분', '특허는 국내외 열 값으로 국내/국외/PCT 세분(그 외 표기·공란=기타). 특허외는 국내외 미구분'],
      ['로컬 보정', '보정 적용 상태로 집계됨(백데이터 로컬보정 열 참조)'],
      ['검증', '백데이터의 지재권분류/출원집계/등록집계 열에서 행별 구분·포함·제외 사유 확인'],
    ];
    return { resultAOA: [head].concat(body, [['합계'].concat(tot)]), backRecords, backCols: ['지재권분류', '출원집계', '등록집계'].concat(ds.columns.map((c) => c.name)), meta };
  }
  /* IPRS-LOGIC-END */

  /* ===== IPMS 화면 카탈로그 (v0.6.6) =====
     제공된 화면 HTML 6종에서 실측 추출한 선언형 카탈로그.
     새 화면 연동 = 아래 배열에 항목 1개 추가(코드 수정 불필요).
     주의: 논문(개인저작물 RawData) 추출은 화면 그리드 재사용 방식(importTetsFromGrid)으로 이동함(v0.7.0). */
  /* IPMS-CATALOG-START */
  const IPMS_SCREENS = [
    {
      "id": "ipms_apply",
      "label": "지재권 신청목록(발명신고)",
      "page": "https://krisstar.kriss.re.kr/pms/res/intellppty/S_PMS_03010100.do",
      "url": "https://krisstar.kriss.re.kr/pms/res/intellppty/selectIntellpptyList.json",
      "body": {
        "rqstStrDt": "",
        "rqstEndDt": "",
        "aplyRqstYn": "",
        "cntCls": "",
        "keyword": "",
        "confirmWork1": "",
        "confirmWork2": "",
        "confirmWork3": "",
        "confirmWork4": "",
        "apvStat": "",
        "item": ""
      },
      "cols": [
        [
          "intellMngNo",
          "관리번호"
        ],
        [
          "intellRqstNo",
          "신청번호"
        ],
        [
          "ivenTypNm",
          "발명종류"
        ],
        [
          "cntClsNm",
          "국가"
        ],
        [
          "ivenNm",
          "발명명칭"
        ],
        [
          "costShareRatio",
          "KRISS지분"
        ],
        [
          "plfNm",
          "희망특허사무소"
        ],
        [
          "intellMgmtNo",
          "패밀리 번호"
        ],
        [
          "rqstEmpNm",
          "신청자"
        ],
        [
          "mainIvenEmpNm",
          "주발명자"
        ],
        [
          "ppsRqstDt",
          "선행기술조사 요청일"
        ],
        [
          "aplyRqstDt",
          "출원지시일자"
        ],
        [
          "ppsRqstNo",
          "선행기술조사번호"
        ],
        [
          "rqstDt",
          "rqstDt"
        ],
        [
          "soJoCls",
          "soJoCls"
        ],
        [
          "apvStat",
          "apvStat"
        ],
        [
          "resMemo",
          "resMemo"
        ]
      ],
      "dateF": {
        "rqstDt": 1
      },
      "numF": {},
      "statusField": "apvStat",
      "statusMap": {
        "00": "임시저장",
        "01": "신청",
        "03": "내부결재",
        "04": "완료"
      }
    },
    {
      "id": "ipms_pps",
      "label": "선행기술조사",
      "page": "https://krisstar.kriss.re.kr/pms/iprs/pps/S_PMS_03011020.do",
      "url": "https://krisstar.kriss.re.kr/pms/iprs/pps/selectPpsList.json",
      "body": {
        "rqstStrDt": "",
        "rqstEndDt": "",
        "plfNm": "",
        "plfMgmtNo": "",
        "keyword": "",
        "confirmWork1": "",
        "confirmWork2": "",
        "confirmWork3": "",
        "apvStat": "",
        "item": ""
      },
      "cols": [
        [
          "rowNumber",
          "순번"
        ],
        [
          "intellMngNo",
          "관리번호"
        ],
        [
          "rqstNo",
          "신청번호"
        ],
        [
          "aplyNtnNm",
          "출원국"
        ],
        [
          "rqstSbjt",
          "제목"
        ],
        [
          "busiRegNm",
          "특허사무소"
        ],
        [
          "rqstEmpNm",
          "신청자"
        ],
        [
          "mainIvenEmpNo",
          "주발명자"
        ],
        [
          "mainIvenEmpNm",
          "주발명자"
        ],
        [
          "cmplDt",
          "완료일시"
        ],
        [
          "intellMngNo",
          "지재권 관리번호"
        ],
        [
          "intellRqstNo",
          "지재권 신청번호"
        ],
        [
          "ivenNm",
          "지재권 명"
        ],
        [
          "reptUserNm",
          "특허사무소 변리사"
        ],
        [
          "reptUserId",
          "특허사무소 변리사 이메일"
        ],
        [
          "repUserTelNo",
          "특허사무소 변리사 번호"
        ],
        [
          "aplyApvStat",
          "aplyApvStat"
        ],
        [
          "rqstDt",
          "rqstDt"
        ],
        [
          "cmplNeedDt",
          "cmplNeedDt"
        ],
        [
          "reptDt",
          "reptDt"
        ],
        [
          "apvStat",
          "apvStat"
        ],
        [
          "resMemo",
          "resMemo"
        ]
      ],
      "dateF": {
        "rqstDt": 1,
        "cmplNeedDt": 1
      },
      "numF": {},
      "statusField": "apvStat",
      "statusMap": {
        "00": "임시저장",
        "01": "신청",
        "02": "접수",
        "03": "처리중",
        "04": "완료"
      }
    },
    {
      "id": "ipms_aply",
      "label": "출원관리",
      "page": "https://krisstar.kriss.re.kr/pms/iprs/aply/S_PMS_03012010.do",
      "url": "https://krisstar.kriss.re.kr/pms/iprs/aply/selectAplyRqstList.json",
      "body": {
        "rqstStrDt": "",
        "rqstEndDt": "",
        "keyword": "",
        "confirmWork1": "",
        "confirmWork2": "",
        "confirmWork3": "",
        "confirmWork4": "",
        "rqstCls": "03",
        "ivenTyp": "",
        "apvStat": "",
        "item": ""
      },
      "cols": [
        [
          "rowNumber",
          "순번"
        ],
        [
          "intellMngNo",
          "관리번호"
        ],
        [
          "intellRqstNo",
          "신청번호"
        ],
        [
          "aplyNtnNm",
          "출원국"
        ],
        [
          "ivenNm",
          "발명명칭"
        ],
        [
          "rqstEmpNm",
          "신청자"
        ],
        [
          "ppsRqstNo",
          "선행기술조사"
        ],
        [
          "costShareRatio",
          "KRISS지분"
        ],
        [
          "rqstNo",
          "신청번호"
        ],
        [
          "rqstDt",
          "출원지시일"
        ],
        [
          "reptDt",
          "출원접수일"
        ],
        [
          "plfNm",
          "특허사무소"
        ],
        [
          "reptUserNm",
          "접수담당자"
        ],
        [
          "cmplDt",
          "출원제출일"
        ],
        [
          "cmplUserNm",
          "제출담당자"
        ],
        [
          "aplyNo",
          "출원번호"
        ],
        [
          "aplyRsltRqstNo",
          "출원검토 신청번호"
        ],
        [
          "cntCls",
          "cntCls"
        ],
        [
          "apvStat",
          "apvStat"
        ],
        [
          "rqstApvStat",
          "rqstApvStat"
        ],
        [
          "aplyRsltRqstDt",
          "aplyRsltRqstDt"
        ],
        [
          "aplyRsltApvStat",
          "aplyRsltApvStat"
        ],
        [
          "aplyDt",
          "aplyDt"
        ],
        [
          "resMemo",
          "resMemo"
        ]
      ],
      "dateF": {
        "aplyRsltRqstDt": 1,
        "aplyDt": 1
      },
      "numF": {},
      "statusField": "apvStat",
      "statusMap": {
        "10": "출원지시전",
        "01": "출원지시",
        "02": "접수",
        "03": "처리중",
        "04": "제출",
        "05": "출원검토",
        "09": "완료"
      }
    },
    {
      "id": "ipms_task",
      "label": "업무요청(중간사건)",
      "page": "https://krisstar.kriss.re.kr/pms/iprs/etcTask/S_PMS_03014010.do",
      "url": "https://krisstar.kriss.re.kr/pms/iprs/etcTask/selectEtcTaskRqstList.json",
      "body": {
        "rqstStrDt": "",
        "rqstEndDt": "",
        "plfNm": "",
        "plfMgmtNo": "",
        "searchKeyword": "",
        "confirmWork1": "",
        "confirmWork2": "",
        "confirmWork3": "",
        "confirmWork4": "",
        "apvCls": "",
        "apvStat": "",
        "searchItem": ""
      },
      "cols": [
        [
          "rowNumber",
          "순번"
        ],
        [
          "intellMngNo",
          "관리번호"
        ],
        [
          "intellRqstNo",
          "신청번호"
        ],
        [
          "korRegNm",
          "발명의명칭"
        ],
        [
          "mainIvenEmpNm",
          "주발명자"
        ],
        [
          "apvStatNm",
          "진행상태"
        ],
        [
          "rqstSbjt",
          "제목"
        ],
        [
          "rqstTpeNm",
          "분류"
        ],
        [
          "rqstUserNm",
          "신청자"
        ],
        [
          "rqstDt",
          "신청일자"
        ],
        [
          "cmplDt",
          "완료일자"
        ],
        [
          "bpmRqstDt",
          "신청일자"
        ],
        [
          "bpmCmplUserNm",
          "검토자"
        ],
        [
          "bpmCmplDt",
          "완료일자"
        ],
        [
          "taskIoCls",
          "taskIoCls"
        ],
        [
          "cmplNeedDt",
          "cmplNeedDt"
        ],
        [
          "apvStat",
          "apvStat"
        ],
        [
          "bpmRqstNo",
          "bpmRqstNo"
        ],
        [
          "bpmApvStat",
          "bpmApvStat"
        ],
        [
          "resMemo",
          "resMemo"
        ]
      ],
      "dateF": {
        "cmplNeedDt": 1
      },
      "numF": {},
      "statusField": "apvStat",
      "statusMap": {
        "00": "임시저장",
        "01": "신청",
        "02": "접수",
        "03": "검토중",
        "04": "확인대기",
        "05": "완료"
      }
    },
    {
      "id": "ipms_exp",
      "label": "청구서관리(목록)",
      "page": "https://krisstar.kriss.re.kr/pms/iprs/exp/S_PMS_03015020.do",
      "url": "https://krisstar.kriss.re.kr/pms/iprs/exp/selectExpRqstList.json",
      "body": {
        "rqstStrDt": "",
        "rqstEndDt": "",
        "searchKeyword": "",
        "confirmWork1": "",
        "confirmWork2": "",
        "confirmWork3": "",
        "confirmWork4": "",
        "apvStat": "",
        "searchItem": ""
      },
      "cols": [
        [
          "rowNumber",
          "순번"
        ],
        [
          "intellMngNo",
          "관리번호"
        ],
        [
          "intellRqstNo",
          "신청번호"
        ],
        [
          "korRegNm",
          "발명명칭"
        ],
        [
          "mainIvenNm",
          "주발명자"
        ],
        [
          "aplyNtnNm",
          "국가"
        ],
        [
          "intellAplyNo",
          "출원번호"
        ],
        [
          "intellRegNo",
          "등록번호"
        ],
        [
          "busiRegNm",
          "사무소"
        ],
        [
          "rqstDt",
          "청구일자"
        ],
        [
          "thYyProjEndDt",
          "지출기한"
        ],
        [
          "actRqstYnNm",
          "지출발의 가능여부"
        ],
        [
          "taxbilIsuDt",
          "계산서 발행일자"
        ],
        [
          "cnfRqstNo",
          "검토 신청번호"
        ],
        [
          "cnfUserNm",
          "검토자"
        ],
        [
          "budgNm",
          "사용예산"
        ],
        [
          "actRqstNo",
          "지출발의번호"
        ],
        [
          "actReslNo",
          "지출결의번호"
        ],
        [
          "apvStat",
          "apvStat"
        ],
        [
          "rqstNo",
          "rqstNo"
        ],
        [
          "totlExp",
          "totlExp"
        ],
        [
          "taxbilIsuCls",
          "taxbilIsuCls"
        ],
        [
          "actReslDt",
          "actReslDt"
        ],
        [
          "resMemo",
          "resMemo"
        ]
      ],
      "dateF": {
        "actReslDt": 1
      },
      "numF": {
        "totlExp": 1
      },
      "statusField": "apvStat",
      "statusMap": {
        "01": "접수대기",
        "02": "접수",
        "03": "검토준비중",
        "04": "검토중",
        "09": "계산서발행대기(사무소)",
        "10": "지출발의대기",
        "11": "완료"
      }
    },
    {
      "id": "ipms_expdt",
      "label": "청구서-지출 상세(발의·결의번호)",
      "page": "https://krisstar.kriss.re.kr/pms/iprs/exp/S_PMS_03015020.do",
      "url": "https://krisstar.kriss.re.kr/pms/iprs/exp/selectExpRqstDetailList.json",
      "body": {
        "rqstStrDt": "",
        "rqstEndDt": "",
        "searchKeyword": "",
        "confirmWork1": "",
        "confirmWork2": "",
        "confirmWork3": "",
        "confirmWork4": "",
        "apvStat": "",
        "searchItem": ""
      },
      "cols": [
        [
          "rowNumber",
          "순번"
        ],
        [
          "accRqstNo",
          "지출신청번호"
        ],
        [
          "reslNo",
          "지출결의번호"
        ],
        [
          "rqstEmpNm",
          "지출신청자"
        ],
        [
          "budgCd",
          "계정번호"
        ],
        [
          "busiRegNm",
          "상호명"
        ],
        [
          "busiRegNo",
          "사업자등록번호"
        ],
        [
          "intellMngNo",
          "기관관리번호"
        ],
        [
          "intellRqstNo",
          "기관신청번호"
        ],
        [
          "korRegNm",
          "발명명칭(국문)"
        ],
        [
          "intellAplyNo",
          "출원번호"
        ],
        [
          "intellRegNo",
          "등록번호"
        ],
        [
          "reslDt",
          "reslDt"
        ],
        [
          "rqstAmt",
          "rqstAmt"
        ],
        [
          "expCls",
          "expCls"
        ],
        [
          "expType",
          "expType"
        ]
      ],
      "dateF": {
        "reslDt": 1
      },
      "numF": {
        "rqstAmt": 1
      },
      "statusField": null,
      "statusMap": {
        "01": "접수대기",
        "02": "접수",
        "03": "검토준비중",
        "04": "검토중",
        "09": "계산서발행대기(사무소)",
        "10": "지출발의대기",
        "11": "완료"
      }
    }
  ];

  function uniqHeaders(pairs) {
    const used = {};
    return pairs.map(([f, t]) => {
      let h = (t || f);
      if (used[h]) h = `${h}(${f})`;
      used[h] = 1;
      return [f, h];
    });
  }
  /* IPMS-CATALOG-LOGIC-END */

  function importCatalogRows(sc, raw) {
    const pairs = uniqHeaders(sc.cols);
    const hasStatus = !!(sc.statusField && sc.statusMap);
    const headers = ['No'].concat(pairs.map((p) => p[1])).concat(hasStatus ? ['상태명'] : []);
    const records = raw.map((r, i) => {
      const o = { No: r.rowNumber != null ? r.rowNumber : i + 1 };
      pairs.forEach(([f, h]) => {
        let v = r[f];
        if (sc.dateF[f]) v = normYmd(v);
        else if (sc.numF[f]) v = (typeof v === 'number') ? v : toNum(v);
        o[h] = v == null ? '' : v;
      });
      if (hasStatus) {
        const c = r[sc.statusField];
        o['상태명'] = (c != null && sc.statusMap[c]) ? sc.statusMap[c] : (c == null ? '' : c);
      }
      return o;
    });
    DATASETS.push(buildDataset(headers, records, 'ipms-catalog', `${sc.label} (${records.length}행)`));
    activeId = DATASETS[DATASETS.length - 1].id;
    renderAll();
  }

  (function fillCatalogOptions() {
    const sel = $('#cat_sel');
    if (!sel) return;
    IPMS_SCREENS.forEach((sc) => sel.appendChild(new Option(sc.label, sc.id)));
  })();

  // 카탈로그 공용 조회: 덮어쓰기 병합 + (기간형 화면) 빈 기간 0건 시 광역 기간 자동 재시도
  async function fetchCatalogRows(sc, extra) {
    let body = Object.assign({}, sc.body, extra || {});
    let rows = await postKrissJson(sc.url, body);
    const hasPeriod = ('q_fromYyMm' in sc.body);
    const noPeriodGiven = hasPeriod && !body.q_fromYyMm && !body.q_toYyMm;
    let note = '';
    if (!rows.length && noPeriodGiven) {
      const now = new Date();
      const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      body = Object.assign({}, body, { q_fromYyMm: '2000-01', q_toYyMm: cur });
      rows = await postKrissJson(sc.url, body);
      if (rows.length) note = '2000-01~' + cur + ' 기간';
    }
    if (!rows.length && body.q_apvStat === '04') {
      body = Object.assign({}, body, { q_apvStat: '' });
      rows = await postKrissJson(sc.url, body);
      if (rows.length) note = (note ? note + '·' : '') + '결재상태 전체';
    }
    if (rows.length && note) rows.__periodFallback = note;
    return rows;
  }

  $('#cat_run').onclick = async () => {
    const btn = $('#cat_run');
    const msg = $('#cat_msg');
    const sc = IPMS_SCREENS.find((x) => x.id === $('#cat_sel').value);
    if (!sc) { alert('화면을 선택하세요.'); return; }
    let extra = null;
    const pj = $('#cat_params').value.trim();
    if (pj) { try { extra = JSON.parse(pj); } catch (e) { alert('파라미터 JSON 해석 실패: ' + e.message); return; } }
    btn.disabled = true;
    msg.textContent = `${sc.label} 조회 중...`;
    try {
      const rows = await fetchCatalogRows(sc, extra);
      if (!rows.length) { msg.textContent = '조회 결과 0건 — 조건·권한을 확인하세요.'; return; }
      importCatalogRows(sc, rows);
      const ds = activeDataset();
      if (ds) ds.total = LAST_FETCH_TOTAL;
      msg.textContent = `가져오기 완료: ${rows.length}행` + totalBadge(rows.length, LAST_FETCH_TOTAL)
        + (rows.__periodFallback ? ` · 기간 필수로 확인되어 ${rows.__periodFallback} 재조회` : '');
    } catch (e) {
      msg.textContent = '조회 실패: ' + e.message + ' · 콘솔 [특허-통계] 진단 참조';
      console.log('[특허-통계] 진단', LAST_FETCH_DIAG);
    } finally { btn.disabled = false; }
  };
  /* IPMS-CATALOG-END */

  /* ---- 지재권 UI 연결 ---- */
  async function runIprsFetch(msg) {
    const P = normPeriod($('#iq_from').value, $('#iq_to').value, 'ymd');
    const cfg = { dtCls: $('#iq_dtCls').value, from: P.from, to: P.to, cnt: $('#iq_cnt').value };
    msg.textContent = '조회 중... (전체는 수 초가 걸릴 수 있습니다)';
    let rows = await fetchIprsDirect(cfg);
    if (!rows.length && (cfg.from.indexOf('-') >= 0 || cfg.to.indexOf('-') >= 0)) {
      rows = await fetchIprsDirect({ ...cfg, from: cfg.from.replace(/-/g, ''), to: cfg.to.replace(/-/g, '') });
    }
    if (!rows.length) { msg.textContent = '조회 결과 0건 — 기간·구분 조건을 확인하세요.'; return null; }
    const r = importIprsRows(rows, '직접조회 지재권마스터');
    const dsI = activeDataset();
    if (dsI) dsI.total = LAST_FETCH_TOTAL;
    msg.textContent = `가져오기 완료: ${r.count}행` + (r.patched ? ` · 로컬 보정 ${r.patched}건 적용` : '') + totalBadge(r.count, LAST_FETCH_TOTAL) + (P.note ? ' · ' + P.note : '');
    return activeDataset();
  }
  $('#iq_run').onclick = async () => {
    const btn = $('#iq_run'); const msg = $('#iq_msg');
    btn.disabled = true;
    try { await runIprsFetch(msg); }
    catch (e) { msg.textContent = '조회 실패: ' + e.message + ' — krisstar 로그인 상태에서 실행하세요.'; }
    finally { btn.disabled = false; }
  };
  function runIprsCounts() {
    const ds = activeDataset();
    if (!ds) { alert('데이터셋을 먼저 불러오세요.'); return false; }
    const res = computeIprsCounts(ds);
    if (!res) return false;
    state.lastIprs = res;
    renderResultTable($('#i_out'), res.resultAOA);
    return true;
  }
  $('#iq_report').onclick = async () => {
    const btn = $('#iq_report'); const msg = $('#iq_msg');
    btn.disabled = true;
    try {
      const ds = await runIprsFetch(msg);
      if (ds) {
        switchTab('iprs');
        if (runIprsCounts()) msg.textContent += ' · 연도별 건수 생성 완료(지재권 탭에서 [엑셀 내보내기])';
      }
    } catch (e) {
      msg.textContent = '조회 실패: ' + e.message + ' — krisstar 로그인 상태에서 실행하세요.';
    } finally { btn.disabled = false; }
  };
  $('#i_run').onclick = runIprsCounts;
  $('#i_xls').onclick = () => exportExcel('iprs_counts', state.lastIprs);

  /* ---- 보정 관리 UI ---- */
  (function fillPatchFieldOptions() {
    const sel = $('#p_field');
    IPRS_FIELDS.forEach(([f, t]) => sel.appendChild(new Option(`${t} (${f})`, t)));
  })();
  function renderPatchList() {
    const p = loadIprsPatch();
    const box = $('#p_list');
    box.innerHTML = '';
    const keys = Object.keys(p.edits);
    $('#p_apply').checked = !!p.autoApply;
    if (!keys.length) { box.innerHTML = '<div class="hint">등록된 보정이 없습니다.</div>'; return; }
    keys.forEach((k) => {
      const e = p.edits[k];
      const el = document.createElement('div');
      el.className = 'ds';
      el.innerHTML = `<span>${k} → ${Object.keys(e).map((f) => `${f}="${e[f]}"`).join(', ')}</span><span class="rm">삭제</span>`;
      el.querySelector('.rm').onclick = () => {
        delete p.edits[k];
        saveIprsPatch(p);
        renderPatchList();
      };
      box.appendChild(el);
    });
  }
  $('#p_add').onclick = () => {
    const k = $('#p_key').value.trim(); const f = $('#p_field').value; const v = $('#p_val').value;
    if (!k || !f) { alert('신청번호와 필드를 입력하세요.'); return; }
    const p = loadIprsPatch();
    if (!p.edits[k]) p.edits[k] = {};
    p.edits[k][f] = v;
    saveIprsPatch(p);
    renderPatchList();
    $('#p_msg').textContent = `저장됨: ${k}.${f} = "${v}" (다음 조회부터 자동 적용)`;
  };
  $('#p_apply').onchange = () => { const p = loadIprsPatch(); p.autoApply = $('#p_apply').checked; saveIprsPatch(p); };
  $('#p_export').onclick = () => {
    const txt = JSON.stringify(loadIprsPatch(), null, 2);
    const box = $('#p_msg');
    box.innerHTML = '아래 JSON을 복사해 백업하세요.<br>';
    const ta = document.createElement('textarea');
    ta.style.cssText = 'width:100%;height:120px;font-size:11px;';
    ta.value = txt;
    box.appendChild(ta);
  };
  $('#p_import').onclick = () => {
    const txt = prompt('보정 JSON을 붙여넣으세요 (기존 보정은 대체됩니다):');
    if (!txt) return;
    try {
      const p = JSON.parse(txt);
      if (!p || typeof p.edits !== 'object') throw new Error('edits 객체가 없습니다');
      saveIprsPatch({ edits: p.edits, autoApply: p.autoApply !== false });
      renderPatchList();
      $('#p_msg').textContent = '가져오기 완료.';
    } catch (e) { alert('JSON 해석 실패: ' + e.message); }
  };
  renderPatchList();

  /* ---- 외부 엔진 레지스트리: 다른 통계 엔진 결합 지점 ----
     계약: registerEngine({ id, label, compute(ds, cfg) => { resultAOA, backRecords, backCols, meta } })
     ds: { label, columns:[{name,type}], records:[{헤더:값}] } — 결과는 결과/백데이터/산출조건 3시트로 내보내기 호환 */
  const ENGINES = [];
  function renderEngines() {
    const box = $('#eng_list');
    if (!box) return;
    box.innerHTML = '';
    if (!ENGINES.length) {
      box.innerHTML = '<div class="hint">등록된 외부 엔진이 없습니다. 콘솔 또는 별도 유저스크립트에서 KrissStatsTool.registerEngine({id:"my", label:"내 통계", compute:(ds)=>({resultAOA:[["열"]], backRecords:ds.records, backCols:ds.columns.map(c=>c.name), meta:[["항목","값"]]})}) 형태로 등록하면 여기 나타납니다.</div>';
      return;
    }
    ENGINES.forEach((en) => {
      const el = document.createElement('div');
      el.className = 'ds';
      el.innerHTML = `<span>${en.label || en.id}</span><span class="rm" data-a="x">엑셀</span><span class="rm" data-a="r">실행</span>`;
      el.querySelectorAll('.rm').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.a === 'r') {
            const ds = activeDataset();
            if (!ds) { alert('데이터셋을 먼저 불러오세요.'); return; }
            const res = en.compute(ds, {});
            if (!res) return;
            state.lastEngine = res;
            state.lastEngineId = en.id;
            renderResultTable($('#engine_out'), res.resultAOA); switchTab('engine');
          } else {
            exportExcel(state.lastEngineId || en.id, state.lastEngine);
          }
        };
      });
      box.appendChild(el);
    });
  }
  function registerEngine(def) {
    if (!def || !def.id || typeof def.compute !== 'function') { alert('registerEngine: {id, label, compute(ds,cfg)} 형식이 필요합니다.'); return; }
    const i = ENGINES.findIndex((e) => e.id === def.id);
    if (i >= 0) ENGINES[i] = def; else ENGINES.push(def);
    renderEngines();
  }
  renderEngines();

  /* ===== 논문 RawData 추출 + 통계 (v0.7.0) — 그리드 재사용 방식 ===== */
  /* PAPER-MODULE-START (v0.7.0) */
  // 포털 필드 → '엑셀 저장'과 동일한 한글 헤더(38열, 투고일 포함)
  const TETS_FIELD_MAP = [
    ['rowNumber', '순번'], ['partiEmpCls', '직원구분'], ['partiEmpNo', '저자사번'], ['empNm', '저자명'],
    ['sex', '성별'], ['upDeptNm', '상위부서명'], ['deptNm', '부서명'], ['yy', '년도'],
    ['tetsRqstNo', '등록번호'], ['sbjtKor', '논문제목'], ['ancmMedm', '발표매체'], ['ancmCls', '발표구분'],
    ['scitNm', '수록지'], ['issn', 'ISSN'], ['krissGrade', '원내기준'], ['rqstDt', '등록일'],
    ['ancmDt', '게재일'], ['subDt', '투고일'], ['vol', 'VOL'], ['num', 'ISSU(NUM)'],
    ['strPage', '시작페이지'], ['endPage', '종료페이지'], ['partiCnt', '총저자수'], ['seqNo', '저자순위'],
    ['resEdtorYn', '교신저자여부'], ['doi', 'DOI'], ['partiRate', '참여율'],
    ['qutStd', 'I/F(수록년도 기준)'], ['qutStdSub', 'I/F(투고일 기준)'], ['jcrRank', 'JCR백분위'],
    ['apvlYn', '담당자확인'], ['apvStat', '결재상태'], ['mainProjInfo', '주과제코드'], ['mainBudgInfo', '주예산코드'],
    ['rate', '기여율(%)'], ['relProjList', '관련 과제리스트(기여율)'], ['relBudgList', '관련 예산리스트(기여율)'],
    ['relProjCnt', '관련과제 수'],
  ];
  const TETS_DATE_FIELDS = { rqstDt: 1, ancmDt: 1, subDt: 1 };

  // ===== 논문 API 직접 조회 (포털 어느 화면에서든 로그인 세션 사용, 화면 진입/[조회] 불필요) =====
  // 논문 화면은 Kendo 그리드 → 목록 API는 JSON 본문 + 페이징(take/skip/page/pageSize)으로 요청해야 하며,
  // 검색폼 #form1 필드 + 발표매체 q_ancmMedm(미선택 시 전체 13코드)를 함께 보낸다. (무페이징이면 0건)
  const TETS_URL = 'https://krisstar.kriss.re.kr/pms/res/tets/selectTetsRawData.json';
  const TETS_MEDM_ALL = "'01','02','03','04','05','06','07','08','09','10','20','30','40'";
  let TETS_DIAG = null; // 직전 직접조회 진단(요청·상태·응답 앞부분)

  function tetsPickArray(json) {
    const scan = (o, d) => {
      if (d > 6 || o == null) return null;
      if (Array.isArray(o)) return (o.length && typeof o[0] === 'object') ? o : null;
      if (typeof o === 'object') {
        for (const k of Object.keys(o)) { const v = o[k]; if (Array.isArray(v) && v.length && v[0] && ('tetsRqstNo' in v[0] || 'partiEmpCls' in v[0])) return v; }
        for (const k of Object.keys(o)) { const r = scan(o[k], d + 1); if (r) return r; }
      }
      return null;
    };
    return scan(json, 0) || [];
  }
  function tetsPickTotal(json) {
    if (!json || typeof json !== 'object') return null;
    for (const k of ['total', 'Total', 'totalCount', 'totalCnt', 'recordsTotal']) if (typeof json[k] === 'number') return json[k];
    if (json.data && typeof json.data === 'object') for (const k of ['total', 'Total', 'totalCount']) if (typeof json.data[k] === 'number') return json.data[k];
    return null;
  }
  async function tetsPost(body) {
    // KRISS 엔드포인트는 application/json 본문을 요구(폼 인코딩은 415). JSON 우선, 415/400 시 폼 예비 전환.
    const mk = (asJson) => fetch(TETS_URL, {
      method: 'POST', credentials: 'include',
      headers: asJson
        ? { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        : { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: asJson ? JSON.stringify(body) : new URLSearchParams(Object.entries(body).map(([k, v]) => [k, v == null ? '' : String(v)])).toString(),
    });
    let res = await mk(true);
    if (res.status === 415 || res.status === 400) res = await mk(false);
    const txt = await res.text();
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { ok: res.ok, status: res.status, json, snippet: txt.slice(0, 400) };
  }
  // 직접 조회(폼 인코딩 + 페이지 루프). opt: { fromYyMm, toYyMm, apvStat, medm }
  async function fetchTetsDirect(opt) {
    opt = opt || {};
    const base = {
      q_first: 'Y', emptyCls: 'N',
      q_fromYyMm: opt.fromYyMm || '', q_toYyMm: opt.toYyMm || '',
      q_ancmMedm: opt.medm || TETS_MEDM_ALL,
      q_partiEmpNm: '', q_inOut: '', q_item: '', q_keyword: '',
      q_apvStat: (opt.apvStat != null ? opt.apvStat : '04'),
    };
    const PAGE = 5000; let page = 1, all = [], total = null;
    for (let guard = 0; guard < 400; guard++) {
      const body = Object.assign({ take: PAGE, skip: (page - 1) * PAGE, page: page, pageSize: PAGE }, base);
      const r = await tetsPost(body);
      TETS_DIAG = { url: TETS_URL, status: r.status, page: page, sentKeys: Object.keys(body), snippet: r.snippet, time: new Date().toLocaleString('ko-KR') };
      if (!r.ok) throw new Error('HTTP ' + r.status + ((r.status === 401 || r.status === 403) ? ' (로그인/권한 확인)' : '') + ' · KrissStatsTool.tetsDiag() 참조');
      if (!r.json) throw new Error('응답이 JSON이 아님(세션 만료·오류 페이지 추정) · KrissStatsTool.tetsDiag() 참조');
      const arr = tetsPickArray(r.json);
      if (total == null) total = tetsPickTotal(r.json);
      TETS_DIAG.total = total; TETS_DIAG.pageRows = arr.length; TETS_DIAG.accum = all.length + arr.length;
      if (!arr.length) break;
      all = all.concat(arr);
      if (total != null && all.length >= total) break;
      if (arr.length < PAGE) break;
      page++;
    }
    return { rows: all, total: total };
  }
  function tetsRowsToRecords(rows) {
    return rows.map((r) => {
      const o = {};
      TETS_FIELD_MAP.forEach(([f, ko]) => { let v = r[f]; if (TETS_DATE_FIELDS[f]) v = tetsFmtDate(v); o[ko] = (v == null ? '' : v); });
      return o;
    });
  }
  // 직접 조회 → DATASETS 등록
  async function importTetsDirect(opt) {
    const out = await fetchTetsDirect(opt);
    if (!out.rows.length) throw new Error('조회 결과 0건 — 기간/권한/조건 확인 · KrissStatsTool.tetsDiag()로 응답 확인');
    const headers = TETS_FIELD_MAP.map(([, ko]) => ko);
    const records = tetsRowsToRecords(out.rows);
    DATASETS.push(buildDataset(headers, records, 'tets-direct', '개인저작물 RawData(논문) (' + records.length + '행)'));
    activeId = DATASETS[DATASETS.length - 1].id;
    const ds = activeDataset(); if (ds && out.total != null) ds.total = out.total;
    renderAll();
    return ds;
  }
  function tetsDiag() { console.log('[논문] 직접조회 진단', TETS_DIAG); return TETS_DIAG; }

  function tetsFmtDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) { const p = (n) => String(n).padStart(2, '0'); return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`; }
    const s = String(v).trim(); const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
  }
  function tetsGridsTotalText() {
    let jq = null; try { jq = PW.jQuery || PW.$; } catch (e) {}
    const t = jq && jq('#gridsTotal').text();
    const n = t ? parseInt(String(t).replace(/[^\d]/g, ''), 10) : NaN;
    return isNaN(n) ? null : n;
  }
  // 논문 그리드(kendoGrid) 위젯 찾기: tets 필드 보유 우선, 없으면 #grid1
  function tetsFindGrid() {
    let grids = []; try { grids = findAllGrids(); } catch (e) { grids = []; }
    const hit = grids.find((g) => g.cols && g.cols.some((c) => c.field === 'tetsRqstNo' || c.field === 'partiEmpCls'));
    if (hit && hit.gw) return hit.gw;
    let jq = null; try { jq = PW.jQuery || PW.$; } catch (e) {}
    if (jq) { const g = jq('#grid1').data('kendoGrid'); if (g) return g; }
    return null;
  }
  // 그리드 dataSource 재사용 → 전체 행 1회 수신(전송URL·postDataFunc·schema 자동 적용)
  function tetsFetchAll(grid) {
    return new Promise((resolve, reject) => {
      if (!grid || !grid.dataSource) return reject(new Error('논문 그리드(#grid1)를 찾지 못했습니다. 논문 조회 화면에서 [조회] 후 실행하세요.'));
      const ds = grid.dataSource;
      const total = ds.total() || tetsGridsTotalText() || 0;
      if (!total) return reject(new Error('그리드에 데이터가 없습니다. 화면에서 [조회]를 먼저 실행하세요.'));
      let done = false;
      const onChange = () => {
        if (done) return; done = true;
        try { const view = ds.data(); const arr = (view && view.toJSON) ? view.toJSON() : Array.prototype.slice.call(view || []); resolve(arr); }
        catch (e) { reject(e); }
      };
      ds.one('change', onChange);
      try { ds.query({ page: 1, pageSize: total, skip: 0, take: total }); }
      catch (e) { try { ds.unbind('change', onChange); } catch (_) {} reject(e); }
      setTimeout(() => { if (!done) { done = true; try { onChange(); } catch (e) { reject(e); } } }, 20000);
    });
  }
  // 추출 → DATASETS 등록. 반환: 생성된 데이터셋
  async function importTetsFromGrid() {
    const grid = tetsFindGrid();
    const rows = await tetsFetchAll(grid);
    const headers = TETS_FIELD_MAP.map(([, ko]) => ko);
    const records = rows.map((r) => {
      const o = {};
      TETS_FIELD_MAP.forEach(([f, ko]) => { let v = r[f]; if (TETS_DATE_FIELDS[f]) v = tetsFmtDate(v); o[ko] = (v == null ? '' : v); });
      return o;
    });
    DATASETS.push(buildDataset(headers, records, 'tets-grid', `개인저작물 RawData(논문) (${records.length}행)`));
    activeId = DATASETS[DATASETS.length - 1].id;
    const total = tetsGridsTotalText();
    const dsn = activeDataset(); if (dsn && total != null) dsn.total = total;
    renderAll();
    return activeDataset();
  }
  function tetsDiagnose() {
    let jq = null; try { jq = PW.jQuery || PW.$; } catch (e) {}
    const grid = tetsFindGrid();
    const info = { jQuery: !!jq, 그리드발견: !!grid, 전송URL: null, dataSource_total: null, 화면총건수: tetsGridsTotalText(), 현재페이지행수: null, 비고: [] };
    if (grid && grid.dataSource) {
      try { info.전송URL = grid.dataSource.transport.options.read.url; } catch (e) {}
      try { info.dataSource_total = grid.dataSource.total(); } catch (e) {}
      try { info.현재페이지행수 = grid.dataSource.data().length; } catch (e) {}
      if (info.dataSource_total === 0) info.비고.push('total=0 → 화면에서 [조회]를 먼저 실행');
    } else info.비고.push('논문 그리드 미발견 → 논문 조회 화면(S_PMS_03020305)인지 확인');
    info.비고.push('추출은 화면 grid.dataSource 재사용(화면 파라미터 #form1·q_ancmMedm 자동 포함).');
    console.log('[논문] 진단', info); return info;
  }
  /* PAPER-MODULE-END */

  /* PAPER-STATS-START (실측 헤더 기준 단일 정의) */
  const PAPER_COLS = { 년도: '년도', 게재일: '게재일', 등록번호: '등록번호', 성별: '성별', 직원구분: '직원구분', 교신: '교신저자여부', 발표구분: '발표구분' };
  function computePaperStats(ds) {
    const has = (n) => ds.columns.some((c) => c.name === n);
    if (!has(PAPER_COLS.등록번호) || (!has(PAPER_COLS.게재일) && !has(PAPER_COLS.년도))) { alert('논문 RawData 데이터셋이 아닙니다 (등록번호·게재일(또는 년도) 열 필요).\n논문 조회 화면에서 추출하세요.'); return null; }
    const hasSex = has(PAPER_COLS.성별), hasCls = has(PAPER_COLS.직원구분), hasCorr = has(PAPER_COLS.교신), hasMed = has(PAPER_COLS.발표구분);
    const Y = {}, sexVals = {}, medVals = {};
    const backRecords = ds.records.map((r) => {
      const o = Object.assign({}, r);
      const _pu = String(r[PAPER_COLS.게재일] || '').match(/(19|20)\d{2}/); const _yy = String(r[PAPER_COLS.년도] || '').match(/(19|20)\d{2}/); const yy = (_pu ? _pu[0] : (_yy ? _yy[0] : ''));
      const key = String(r[PAPER_COLS.등록번호] || '').trim();
      const isInternal = hasCls ? (String(r[PAPER_COLS.직원구분] || '').trim() === '내부') : false;
      o['집계연도'] = yy; o['논문키'] = key; o['내부저자'] = isInternal ? 'Y' : '';
      if (!yy || !key) { o['집계'] = '제외(' + (!yy ? '연도없음' : '등록번호없음') + ')'; return o; }
      o['집계'] = '포함';
      if (!Y[yy]) Y[yy] = { papers: {}, rows: 0, internalRows: 0, internalPapers: {}, sex: {}, med: {}, corrPapers: {} };
      const b = Y[yy]; b.rows++; b.papers[key] = 1;
      if (isInternal) { b.internalRows++; b.internalPapers[key] = 1; }
      if (hasSex) { const s = (String(r[PAPER_COLS.성별] || '').trim()) || '(미상)'; sexVals[s] = 1; b.sex[s] = (b.sex[s] || 0) + 1; }
      if (hasMed) { const m = (String(r[PAPER_COLS.발표구분] || '').trim()) || '(미상)'; medVals[m] = 1; if (!b.med[m]) b.med[m] = {}; b.med[m][key] = 1; }
      if (hasCorr && /^y/i.test(String(r[PAPER_COLS.교신] || '').trim())) b.corrPapers[key] = 1;
      return o;
    });
    const sv = Object.keys(sexVals).sort(), mv = Object.keys(medVals).sort();
    const head = ['연도(게재)', '논문수(고유)', '저자참여행수']
      .concat(hasCls ? ['내부저자 참여행수', '내부저자 참여논문수'] : [])
      .concat(sv.map((x) => '성별_' + x + '(행)'))
      .concat(hasCorr ? ['교신저자 논문수'] : [])
      .concat(mv.map((x) => '발표구분_' + x + '(논문)'));
    const years = Object.keys(Y).sort(); const body = []; const tot = new Array(head.length - 1).fill(0);
    years.forEach((yy) => {
      const b = Y[yy]; let row = [yy, Object.keys(b.papers).length, b.rows];
      if (hasCls) row = row.concat([b.internalRows, Object.keys(b.internalPapers).length]);
      row = row.concat(sv.map((x) => b.sex[x] || 0));
      if (hasCorr) row.push(Object.keys(b.corrPapers).length);
      row = row.concat(mv.map((x) => b.med[x] ? Object.keys(b.med[x]).length : 0));
      body.push(row); row.slice(1).forEach((v, i) => { if (typeof v === 'number') tot[i] += v; });
    });
    const meta = [['항목', '값'], ['생성시각', new Date().toLocaleString('ko-KR')], ['데이터셋', ds.label],
      ['원천', '개인저작물 RawData(직접조회/그리드) — 저자-논문 참여 단위(한 논문=저자 수만큼 행)'],
      ['연도 기준', '게재일 연도 기준(게재일 없으면 년도(yy)). ※ 년도(yy)는 성과 등록연도라 게재연도와 달라 2000년대 등 이상치가 섞일 수 있어 게재일 기준 사용'],
      ['논문수 규칙', '등록번호 고유값 기준 중복 제거'],
      ['저자참여행수', '행 단위 그대로(공저·외부 포함)'],
      ['내부저자', hasCls ? "직원구분='내부' 행/논문" : '직원구분 열 없음'],
      ['성별', hasSex ? '성별 원문 값 동적 컬럼(행 기준). 외부저자는 성별 없음→(미상)' : '성별 열 없음'],
      ['교신저자', hasCorr ? '교신저자여부=Y 있는 논문(고유) 수' : '열 없음'],
      ['발표구분', hasMed ? '발표구분(ancmCls)별 논문(고유) 수' : '열 없음'],
      ['검증', '백데이터의 집계/논문키/내부저자 열에서 행별 근거 확인']];
    return { resultAOA: [head].concat(body, [['합계'].concat(tot)]), backRecords, backCols: ['집계', '집계연도', '논문키', '내부저자'].concat(ds.columns.map((c) => c.name)), meta };
  }
  /* PAPER-STATS-END */
  registerEngine({ id: 'paper_stats', label: '논문 통계 — 연도별(고유 논문수·성별·발표구분)', compute: computePaperStats });

  // 논문 원클릭: 직접 조회(포털 어디서든 · 화면 진입/[조회] 불필요) → 통계 → 지재권 탭
  $('#pq_report').onclick = async () => {
    const btn = $('#pq_report'), msg = $('#pq_msg');
    btn.disabled = true; msg.textContent = '논문 RawData 직접 조회 중... (기간 미지정 시 전체, 수 초 소요)';
    try {
      const P = normPeriod($('#pq_from').value, $('#pq_to').value, 'ym');
      let ds;
      try {
        ds = await importTetsDirect({ fromYyMm: P.from, toYyMm: P.to });
      } catch (e1) {
        if (tetsFindGrid()) { msg.textContent = '직접 조회 실패 → 현재 화면 그리드로 대체 시도...'; ds = await importTetsFromGrid(); }
        else throw e1;
      }
      const total = ds.total;
      const okTxt = (total == null) ? '' : (ds.records.length === total ? ` · 전량✓(${total})` : ` · ${ds.records.length}/${total}`);
      const res = computePaperStats(ds);
      if (res) { state.lastEngine = res; state.lastEngineId = 'paper_stats'; switchTab('engine'); renderResultTable($('#engine_out'), res.resultAOA); }
      msg.textContent = `완료: ${ds.records.length}행${okTxt}${P.note ? ' · ' + P.note : ''} · 연도별 논문 통계 생성(지재권 탭). 인사평가 점수는 별도 엔진에서 이 데이터셋 사용.`;
    } catch (e) { msg.textContent = '실패: ' + e.message; }
    finally { btn.disabled = false; }
  };

  // 콘솔 자가진단: 분류기·건수집계·유틸 회귀 테스트. 수정 후 반드시 실행.
  function selfTest() {
    const R = [];
    const eq = (name, got, want) => R.push({ 항목: name, 결과: JSON.stringify(got) === JSON.stringify(want) ? 'PASS' : 'FAIL', got: JSON.stringify(got), 기대: JSON.stringify(want) });
    // 1) 지출결의 적요 분류기
    const C = (t) => { const c = classifyPatentExpense(t); return [c.region, c.stage, c.pct]; };
    eq('분류: 국내등록(태그)', C('[본부] RESI1(등록번호: 10-2046370) - 갑(001) [국내등록료-국내대리인비용]'), ['국내', '등록료', '']);
    eq('분류: 중간사건 해외번호가 비용성격보다 우선', C('[본부] RESI2(출원번호: CN 201880004923.0) [중간사건비용-국내대리인비용]'), ['해외', '중간사건비용', '일반']);
    eq('분류: 중간사건 국내번호', C('[본부] RESI3(등록번호: 10-2053995) [중간사건비용-국내대리인비용]'), ['국내', '중간사건비용', '']);
    eq('분류: 해외송금 구분불가', C('[본부] RESI4 [중간사건비용-해외송금수수료]'), ['해외', '중간사건비용', '구분불가']);
    eq('분류: PCT', C('[본부] RESI5(출원번호: PCT/KR2020/1) [해외출원료(PCT) -국내대리인비용]'), ['해외', '출원료', 'PCT']);
    eq('분류: 자유텍스트 국내외 혼합', C('2020년 국내외 특허 연차료'), ['국내외(혼합)', '연차료', '']);
    // 2) 지재권 연도별 건수(특허 국내/국외/PCT 세분 + 특허외 통합 + 더미 제외)
    const ds = {
      label: 'selfTest-fixture',
      columns: ['출원일자', '등록일자', '출원번호', '지재권구분', '국내외'].map((n) => ({ name: n, type: 'string' })),
      records: [
        { 출원일자: '2020-03-15', 등록일자: '2022-01-10', 출원번호: '10-2020-0031234', 지재권구분: '특허', 국내외: '국내' },
        { 출원일자: '2020-04-01', 등록일자: '', 출원번호: '40-2020-0001234', 지재권구분: '상표', 국내외: '국내' },
        { 출원일자: '2021-05-05', 등록일자: '', 출원번호: '10-0000-0000000', 지재권구분: '특허', 국내외: '국내' },
        { 출원일자: '2021-06-20', 등록일자: '', 출원번호: 'PCT/KR2021/000001', 지재권구분: '특허', 국내외: 'PCT' },
      ],
    };
    const res = computeIprsCounts(ds);
    const h = res.resultAOA[0];
    const g = (y, col) => { const r = res.resultAOA.find((x) => x[0] === y); return r ? r[h.indexOf(col)] : null; };
    eq('건수: 2020 특허(국내)1·특허외1·전체2', [g('2020', '특허_출원_국내'), g('2020', '특허외_출원'), g('2020', '전체_출원')], [1, 1, 2]);
    eq('건수: 2021 PCT1·더미제외1·전체1', [g('2021', '특허_출원_PCT'), g('2021', '제외_더미출원번호'), g('2021', '전체_출원')], [1, 1, 1]);
    eq('건수: 2022 특허_등록_국내1·등록계1', [g('2022', '특허_등록_국내'), g('2022', '특허_등록계')], [1, 1]);
    // 3) 유틸
    eq('normYmd(20200110)', normYmd('20200110'), '2020-01-10');
    // 4) 논문 통계(실측 스키마: 직원구분·성별·교신저자여부·발표구분)
    const dsp = {
      label: 'paper-fixture',
      columns: ['년도', '등록번호', '성별', '직원구분', '교신저자여부', '발표구분'].map((n) => ({ name: n, type: 'string' })),
      records: [
        { 년도: '2024', 등록번호: 'T001', 성별: '남', 직원구분: '내부', 교신저자여부: 'Y', 발표구분: 'SCI' },
        { 년도: '2024', 등록번호: 'T001', 성별: null, 직원구분: '외부', 교신저자여부: 'N', 발표구분: 'SCI' },
        { 년도: '2024', 등록번호: 'T002', 성별: '여', 직원구분: '내부', 교신저자여부: 'N', 발표구분: 'KCI' },
        { 년도: '', 등록번호: 'T003', 성별: '남', 직원구분: '내부', 교신저자여부: '', 발표구분: 'SCI' },
      ],
    };
    const rp = computePaperStats(dsp);
    const hp = rp.resultAOA[0];
    const gp = (col) => { const r = rp.resultAOA.find((x) => x[0] === '2024'); return r ? r[hp.indexOf(col)] : null; };
    eq('논문: 고유2·행3·내부논문2', [gp('논문수(고유)'), gp('저자참여행수'), gp('내부저자 참여논문수')], [2, 3, 2]);
    eq('논문: 교신1·SCI논문1·KCI논문1', [gp('교신저자 논문수'), gp('발표구분_SCI(논문)'), gp('발표구분_KCI(논문)')], [1, 1, 1]);
    // 4) IPMS 카탈로그 무결성
    eq('카탈로그: 6개 화면 등록', IPMS_SCREENS.length, 6);
    eq('카탈로그: url·label·cols 무결', IPMS_SCREENS.every((s) => s.url.indexOf('https://krisstar.kriss.re.kr/') === 0 && !!s.label && s.cols.length > 0), true);
    eq('uniqHeaders 중복 유니크화', uniqHeaders([['a', '신청일자'], ['b', '신청일자']])[1][1], '신청일자(b)');
    // 5) 기간 스마트 정규화(통계 공통)
    const fx = new Date(2026, 6, 17);
    eq('기간: 연도 2개→연 전체', (function () { const q = normPeriod('2020', '2025', 'ymd', fx); return [q.from, q.to]; })(), ['2020-01-01', '2025-12-31']);
    eq('기간: 시작만→오늘까지', (function () { const q = normPeriod('20200101', '', 'ymd', fx); return [q.from, q.to]; })(), ['2020-01-01', '2026-07-17']);
    eq('기간: ym 연도 해석', (function () { const q = normPeriod('2020', '2020', 'ym', fx); return [q.from, q.to]; })(), ['2020-01', '2020-12']);
    eq('기간: 모두 비면 전체 유지', (function () { const q = normPeriod('', '', 'ymd', fx); return [q.from, q.to]; })(), ['', '']);
    const fail = R.filter((x) => x.결과 === 'FAIL').length;
    try { console.table(R.map(({ 항목, 결과 }) => ({ 항목, 결과 }))); } catch (e) { console.log(R); }
    console.log(fail ? `selfTest: FAIL ${fail}건 — details 확인` : `selfTest: 전체 PASS (${R.length}건)`);
    return { pass: R.length - fail, fail, details: R };
  }

  // 외부(콘솔·별도 유저스크립트·기존 엔진)에서 접근하는 공개 API
  PW.KrissStatsTool = {
    version: '0.8.3',
    registerEngine,
    getDatasets: () => DATASETS,
    getActiveDataset: activeDataset,
    addDataset: (headers, records, label) => {
      DATASETS.push(buildDataset(headers, records, 'external', label || '외부 데이터'));
      activeId = DATASETS[DATASETS.length - 1].id;
      renderAll();
    },
    joinDatasets,
    classifyPatentExpense,
    exportExcel,
    selfTest,
    lastDiag: () => LAST_FETCH_DIAG,
    paperDiag: () => window.__paperDiag || null,
    importTetsFromGrid,
    tetsDiagnose,
    importTetsDirect,
    tetsDiag,
  };

  $('#applyPatent').onclick = () => {
    const ds = activeDataset();
    if (!ds) { alert('데이터셋을 먼저 불러오세요.'); return; }
    if (!applyPatentClassification(ds)) return;
    // 간단 통계 표시
    const n = ds.records.length;
    const cnt = (col, val) => ds.records.filter((r) => r[col] === val).length;
    const regionOk = ds.records.filter((r) => r['특허_국내해외'] !== '미분류').length;
    const stageOk = ds.records.filter((r) => r['특허_단계'] !== '미분류').length;
    $('#patentStat').innerHTML =
      `분류 완료 (${n}행) · 국내해외 분류 ${(regionOk / n * 100).toFixed(1)}% · 단계 분류 ${(stageOk / n * 100).toFixed(1)}%<br>` +
      `단계: 출원료 ${cnt('특허_단계', '출원료')} / 등록료 ${cnt('특허_단계', '등록료')} / 연차료 ${cnt('특허_단계', '연차료')} / 중간사건비용 ${cnt('특허_단계', '중간사건비용')} / 기타 ${cnt('특허_단계', '기타')} / 선행기술조사료 ${cnt('특허_단계', '선행기술조사료')} / 미분류 ${cnt('특허_단계', '미분류')}`;
    renderAll();
  };

  // 미분류 검토 내보내기
  $('#exportUnclassified').onclick = () => {
    const ds = activeDataset();
    if (!ds) { alert('데이터셋을 먼저 불러오세요.'); return; }
    if (!ds.columns.some((c) => c.name === '특허_단계')) { alert('먼저 [특허비 분류 적용]을 실행하세요.'); return; }
    const descCol = findDescColumn(ds);
    const rows = ds.records.filter((r) => r['특허_국내해외'] === '미분류' || r['특허_단계'] === '미분류');
    if (!rows.length) { alert('미분류 행이 없습니다.'); return; }
    const cols = ['발의번호', '발의일자', '결의금액', descCol].filter((c) => ds.columns.some((x) => x.name === c)).concat(PATENT_COLS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: cols }), '미분류검토');
    XLSX.writeFile(wb, `patent_unclassified_${nowStamp()}.xlsx`);
  };

  // 데이터셋 목록 / 컬럼 정보
  function renderDatasets() {
    const box = $('#dslist');
    box.innerHTML = '';
    if (!DATASETS.length) {
      box.innerHTML = '<div class="hint">데이터셋이 없습니다. 위의 직접 조회 또는 파일 드롭으로 불러오세요.</div>';
    }
    DATASETS.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'ds' + (d.id === activeId ? ' on' : '');
      el.innerHTML =
        `<span class="dsmain">${d.label}<small style="color:#8b949e"> · ${d.records.length}행×${d.columns.length}열 · ${d.source || ''}${d.createdAt ? ' · ' + d.createdAt : ''}${d.total != null ? (d.records.length === d.total ? ' · 전량✓' : ` · 부분 ${d.records.length}/${d.total}`) : ''}</small></span>` +
        `<span class="rm" data-a="pv">미리보기</span><span class="rm" data-a="xl">엑셀</span><span class="rm" data-a="nm">이름</span><span class="rm" data-a="del">삭제</span>`;
      el.querySelector('.dsmain').onclick = () => { activeId = d.id; renderAll(); };
      el.querySelectorAll('.rm').forEach((b) => {
        b.onclick = (ev) => {
          ev.stopPropagation();
          if (b.dataset.a === 'del') {
            const i = DATASETS.findIndex((x) => x.id === d.id);
            DATASETS.splice(i, 1);
            if (activeId === d.id) activeId = DATASETS.length ? DATASETS[0].id : null;
            renderAll();
          } else if (b.dataset.a === 'pv') previewDataset(d);
          else if (b.dataset.a === 'nm') { const nv = prompt('데이터셋 이름:', d.label); if (nv) { d.label = nv; renderAll(); } }
          else if (b.dataset.a === 'xl') exportRawDataset(d);
        };
      });
      box.appendChild(el);
    });
    const ds = activeDataset();
    $('#colinfo').textContent = ds ? '컬럼: ' + ds.columns.map((c) => `${c.name}[${c.type}]`).join(', ') : '';
    populateJoinSelectors();
  }

  // 데이터셋 미리보기(상위 20행) — 내보내기 전 화면 검증용
  function previewDataset(d) {
    const N = 20;
    const cols = d.columns.map((c) => c.name);
    const aoa = [cols].concat(d.records.slice(0, N).map((r) => cols.map((c) => (r[c] == null ? '' : r[c]))));
    const host = $('#dspreview');
    host.innerHTML = `<label>미리보기 — ${d.label} (상위 ${Math.min(N, d.records.length)}행 / 전체 ${d.records.length}행)</label>`;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'overflow:auto;max-height:240px;';
    host.appendChild(wrap);
    renderResultTable(wrap, aoa);
  }

  // 데이터셋 원본 그대로 내보내기(원본 + 정보 2시트)
  function exportRawDataset(d) {
    const cols = d.columns.map((c) => c.name);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.records, { header: cols }), '원본');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['항목', '값'], ['데이터셋', d.label], ['출처', d.source || ''], ['생성시각', d.createdAt || ''],
      ['행수', d.records.length], ['열수', cols.length],
    ]), '정보');
    XLSX.writeFile(wb, `dataset_raw_${nowStamp()}.xlsx`);
  }

  /* ---- 데이터 결합(조인): 다중 데이터 연계 토대 ----
     왼쪽 모든 행 유지(left join). 키 일치 시 오른쪽 열을 접두어(R_)로 추가.
     오른쪽 중복 키는 첫 행 사용, 일치 건수는 R_매칭수 근거 열에 기록. */
  function joinDatasets(leftId, rightId, lkey, rkey, prefix) {
    const L = DATASETS.find((d) => d.id === leftId);
    const R = DATASETS.find((d) => d.id === rightId);
    if (!L || !R || !lkey || !rkey) { alert('결합할 데이터셋과 키 열을 선택하세요.'); return null; }
    prefix = prefix || 'R_';
    const idx = {};
    R.records.forEach((r) => {
      const k = String(r[rkey] == null ? '' : r[rkey]).trim();
      if (!k) return;
      if (!idx[k]) idx[k] = { row: r, n: 0 };
      idx[k].n++;
    });
    const rcols = R.columns.map((c) => c.name);
    const headers = L.columns.map((c) => c.name).concat([prefix + '매칭수']).concat(rcols.map((n) => prefix + n));
    const records = L.records.map((lr) => {
      const o = Object.assign({}, lr);
      const k = String(lr[lkey] == null ? '' : lr[lkey]).trim();
      const hit = k ? idx[k] : null;
      o[prefix + '매칭수'] = hit ? hit.n : 0;
      rcols.forEach((n) => { o[prefix + n] = hit ? (hit.row[n] == null ? '' : hit.row[n]) : ''; });
      return o;
    });
    DATASETS.push(buildDataset(headers, records, 'join', `결합: ${L.label} ⨝ ${R.label} (${lkey}=${rkey})`));
    activeId = DATASETS[DATASETS.length - 1].id;
    renderAll();
    return DATASETS[DATASETS.length - 1];
  }

  function populateJoinSelectors() {
    const ls = $('#j_left');
    const rs = $('#j_right');
    if (!ls || !rs) return;
    const keep = { l: ls.value, r: rs.value };
    [ls, rs].forEach((s) => { s.innerHTML = ''; DATASETS.forEach((d) => s.appendChild(new Option(d.label, d.id))); });
    if (DATASETS.some((d) => d.id === keep.l)) ls.value = keep.l;
    if (DATASETS.some((d) => d.id === keep.r)) rs.value = keep.r;
    const fillKey = (sel, target) => {
      const t = $(target);
      const d = DATASETS.find((x) => x.id === sel.value);
      const keepv = t.value;
      t.innerHTML = '';
      if (!d) return;
      d.columns.forEach((c) => t.appendChild(new Option(c.name, c.name)));
      if (d.columns.some((c) => c.name === keepv)) t.value = keepv;
    };
    fillKey(ls, '#j_lkey');
    fillKey(rs, '#j_rkey');
    ls.onchange = () => fillKey(ls, '#j_lkey');
    rs.onchange = () => fillKey(rs, '#j_rkey');
  }
  $('#j_run').onclick = () => {
    const res = joinDatasets($('#j_left').value, $('#j_right').value, $('#j_lkey').value, $('#j_rkey').value, 'R_');
    if (res) $('#j_msg').textContent = `결합 완료: ${res.records.length}행 · 매칭 ${res.records.filter((r) => r['R_매칭수'] > 0).length}행 → 새 데이터셋 "${res.label}"`;
  };

  // 결과 표 TSV 복사 — 파일 없이 엑셀·한글 표에 바로 붙여넣기
  function copyResult(payload, btn) {
    if (!payload || !payload.resultAOA) { alert('먼저 [계산]을 실행하세요.'); return; }
    const tsv = payload.resultAOA.map((r) => r.map((v) => String(v == null ? '' : v).replace(/\t/g, ' ')).join('\t')).join('\n');
    const done = () => { if (btn) { const t = btn.textContent; btn.textContent = '복사됨 ✓'; setTimeout(() => { btn.textContent = t; }, 1200); } };
    try {
      navigator.clipboard.writeText(tsv).then(done, () => alert('클립보드 접근이 차단되었습니다. [엑셀 내보내기]를 사용하세요.'));
    } catch (e) { alert('클립보드 접근 불가: ' + e.message); }
  }
  $('#p_copy').onclick = (e) => copyResult(state.lastPivot, e.target);
  $('#c_copy').onclick = (e) => copyResult(state.lastCohort, e.target);
  $('#n_copy').onclick = (e) => copyResult(state.lastNST, e.target);
  $('#i_copy').onclick = (e) => copyResult(state.lastIprs, e.target);
  $('#e_copy').onclick = (e) => copyResult(state.lastEngine, e.target);

  // 셀렉트 옵션 채우기
  function fillSelect(sel, cols, { includeNone = false, multi = false } = {}) {
    const prev = multi ? Array.from(sel.selectedOptions).map((o) => o.value) : sel.value;
    sel.innerHTML = '';
    if (includeNone) sel.appendChild(new Option('(없음)', ''));
    cols.forEach((c) => sel.appendChild(new Option(c.name, c.name)));
    if (multi) Array.from(sel.options).forEach((o) => (o.selected = prev.includes(o.value)));
    else if (prev) sel.value = prev;
  }

  function populateSelectors() {
    const ds = activeDataset();
    const cols = ds ? ds.columns : [];
    fillSelect($('#p_row'), cols, { multi: true });
    fillSelect($('#p_col'), cols, { includeNone: true });
    fillSelect($('#p_meas'), cols, { includeNone: true });
    fillSelect($('#c_year'), cols);
    fillSelect($('#c_reg'), cols);
    fillSelect($('#c_uniq'), cols, { includeNone: true });
    $$('#p_filters .row select.fcol').forEach((s) => fillSelect(s, cols));
  }

  // 필터 행 추가
  function addFilterRow() {
    const ds = activeDataset();
    const cols = ds ? ds.columns : [];
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const colSel = document.createElement('select'); colSel.className = 'fcol';
    cols.forEach((c) => colSel.appendChild(new Option(c.name, c.name)));
    const opSel = document.createElement('select');
    ['=', '≠', '포함', '≥', '≤', '값있음', '빈값'].forEach((o) => opSel.appendChild(new Option(o, o)));
    const val = document.createElement('input'); val.placeholder = '값';
    const rm = document.createElement('span'); rm.textContent = '×'; rm.style.cssText = 'cursor:pointer;color:#cf222e;';
    rm.onclick = () => wrap.remove();
    wrap.append(colSel, opSel, val, rm);
    $('#p_filters').appendChild(wrap);
  }
  $('#p_addf').onclick = addFilterRow;

  function readFilters() {
    return $$('#p_filters .row').map((r) => {
      const [colSel, opSel, val] = r.querySelectorAll('select, input');
      return { col: colSel.value, op: opSel.value, value: val.value };
    });
  }

  function renderResultTable(container, aoa) {
    const t = document.createElement('table');
    t.className = 'res';
    aoa.forEach((row, i) => {
      const tr = document.createElement('tr');
      row.forEach((cell) => {
        const c = document.createElement(i === 0 ? 'th' : 'td');
        c.textContent = cell;
        tr.appendChild(c);
      });
      t.appendChild(tr);
    });
    container.innerHTML = '';
    container.appendChild(t);
  }

  // 피벗 실행
  $('#p_run').onclick = () => {
    const ds = activeDataset();
    if (!ds) { alert('데이터셋을 먼저 불러오세요.'); return; }
    const cfg = {
      rowDims: Array.from($('#p_row').selectedOptions).map((o) => o.value),
      colDim: $('#p_col').value,
      agg: $('#p_agg').value,
      measureCol: $('#p_meas').value,
      display: $('#p_disp').value,
      filters: readFilters().filter((f) => f.col),
    };
    if (cfg.agg !== '건수' && !cfg.measureCol) { alert('측정값 컬럼을 선택하세요.'); return; }
    try {
      state.lastPivot = computePivot(ds, cfg);
      renderResultTable($('#p_out'), state.lastPivot.resultAOA);
    } catch (err) { alert('계산 오류: ' + err.message); }
  };
  $('#p_xls').onclick = () => exportExcel('pivot', state.lastPivot);

  // 코호트 실행
  $('#c_run').onclick = () => {
    const ds = activeDataset();
    if (!ds) { alert('데이터셋을 먼저 불러오세요.'); return; }
    const cfg = {
      yearCol: $('#c_year').value,
      regCol: $('#c_reg').value,
      regMode: $('#c_mode').value,
      regValue: $('#c_regval').value,
      uniqueCol: $('#c_uniq').value,
      yFrom: $('#c_from').value,
      yTo: $('#c_to').value,
    };
    if (!cfg.yearCol || !cfg.regCol) { alert('출원연도·등록 판별 컬럼을 선택하세요.'); return; }
    if (cfg.regMode === '값일치' && !cfg.regValue) { alert('일치시킬 값을 입력하세요.'); return; }
    try {
      state.lastCohort = computeCohort(ds, cfg);
      renderResultTable($('#c_out'), state.lastCohort.resultAOA);
    } catch (err) { alert('계산 오류: ' + err.message); }
  };
  $('#c_xls').onclick = () => exportExcel('cohort', state.lastCohort);

  /* ===== 보고서(연도별 NST 양식) ===== */
  const NST_MAP = { '출원': ['출원료', '중간사건비용'], '등록': ['등록료'], '유지': ['연차료'] };
  function stageBucket(st) { for (const k in NST_MAP) { if (NST_MAP[k].indexOf(st) >= 0) return k; } return null; }

  function computeNST(ds, cfg) {
    if (!ds.columns.some((c) => c.name === '특허_단계')) {
      alert('먼저 데이터 탭에서 [특허비 분류 적용]을 실행하세요.');
      return null;
    }
    const yearOf = (r) => {
      const v = r['발의일자 (연도)'];
      if (v) return String(v);
      const m = String(r['발의일자'] || '').match(/(19|20)\d{2}/);
      return m ? m[0] : '';
    };
    const rows = ds.records.filter((r) => {
      const y = yearOf(r);
      if (!y) return false;
      if (cfg.yFrom && +y < +cfg.yFrom) return false;
      if (cfg.yTo && +y > +cfg.yTo) return false;
      return true;
    });
    const blank = () => ({ ki: { 출원: 0, 등록: 0, 유지: 0 }, ko: { PCT출원: 0, 일반출원: 0, 출원구분불가: 0, 등록: 0, 유지: 0 }, etc: { 지역혼합미상: 0, 단계미배정: 0 } });
    const Y = {};
    rows.forEach((r) => {
      const y = yearOf(r);
      if (!Y[y]) Y[y] = blank();
      const amt = toNum(r['결의금액']) || 0;
      const reg = r['특허_국내해외'], bucket = stageBucket(r['특허_단계']);
      const o = Y[y];
      if (!bucket) { o.etc.단계미배정 += amt; return; }
      if (reg === '국내') o.ki[bucket] += amt;
      else if (reg === '해외') {
        if (bucket === '출원') {
          const p = r['특허_PCT'];
          if (p === 'PCT') o.ko.PCT출원 += amt;
          else if (p === '일반') o.ko.일반출원 += amt;
          else o.ko.출원구분불가 += amt;
        } else o.ko[bucket] += amt;
      } else o.etc.지역혼합미상 += amt;
    });
    const conv = cfg.unit === '백만원' ? (v) => Math.round(v / 1e6) : (v) => v;
    const head = ['연도', '합계', '국내_소계', '국내_출원', '국내_등록', '국내_유지', '국외_소계', '국외_PCT출원', '국외_일반출원', '국외_출원구분불가', '국외_등록', '국외_유지', '참고_지역혼합미상', '참고_단계미배정', '전체지출(참고)'];
    const years = Object.keys(Y).sort();
    const body = [];
    const tot = new Array(head.length - 1).fill(0);
    years.forEach((y) => {
      const o = Y[y];
      const a = conv(o.ki.출원), b = conv(o.ki.등록), c = conv(o.ki.유지);
      const d = conv(o.ko.PCT출원), e = conv(o.ko.일반출원), f = conv(o.ko.출원구분불가), g = conv(o.ko.등록), h = conv(o.ko.유지);
      const ki = a + b + c, ko = d + e + f + g + h;
      const x = conv(o.etc.지역혼합미상), z = conv(o.etc.단계미배정);
      const row = [y, ki + ko, ki, a, b, c, ko, d, e, f, g, h, x, z, ki + ko + x + z];
      body.push(row);
      row.slice(1).forEach((v, i) => { tot[i] += v; });
    });
    const resultAOA = [head].concat(body, [['합계'].concat(tot)]);
    const backCols = ['__연도'].concat(ds.columns.map((c) => c.name));
    const backRecords = rows.map((r) => Object.assign({ __연도: yearOf(r) }, r));
    const meta = [
      ['항목', '값'],
      ['생성시각', new Date().toLocaleString('ko-KR')],
      ['데이터셋', ds.label],
      ['단위', cfg.unit + (cfg.unit === '백만원' ? ' (항목 단위 반올림 후 합산: 소계=반올림값의 합)' : '')],
      ['연도 기준', '발의일자 연도(당해연도)'],
      ['매핑', '출원=출원료+중간사건비용(보정료 포함 해석) / 등록=등록료 / 유지=연차료'],
      ['국외 PCT/일반', '태그 국가·적요 내 번호/국가표기 기준. 판별불가는 국외_출원구분불가(국외소계에 포함)'],
      ['참고열', '지역혼합미상=국내외(혼합)·미분류 / 단계미배정=선행·기타·단계미분류 (양식 합계 미포함, 전체지출로 검증)'],
      ['연도범위', (cfg.yFrom || '전체') + ' ~ ' + (cfg.yTo || '전체')],
    ];
    return { resultAOA, backRecords, backCols, meta };
  }

  function runNSTReport() {
    const ds = activeDataset();
    if (!ds) { alert('데이터셋을 먼저 불러오세요.'); return false; }
    const yN = (v) => { const m = String(v || '').match(/(19|20)\d{2}/); return m ? m[0] : ''; };
    const cfg = { unit: $('#n_unit').value, yFrom: yN($('#n_from').value), yTo: yN($('#n_to').value) };
    const res = computeNST(ds, cfg);
    if (!res) return false;
    state.lastNST = res;
    renderResultTable($('#n_out'), res.resultAOA);
    return true;
  }
  $('#n_run').onclick = runNSTReport;
  $('#n_xls').onclick = () => exportExcel('nst_report', state.lastNST);

  function renderAll() {
    renderDatasets();
    populateSelectors();
  }

  renderAll();
  console.log('[통계추출] v0.8.3 로드 완료(지연 초기화 · 멱등 가드 · CDN @require 제거).');
  };
  if (window.requestIdleCallback) { requestIdleCallback(__startStatsTool, { timeout: 2500 }); }
  else { setTimeout(__startStatsTool, 300); }
})();