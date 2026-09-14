// ==UserScript==
// @name         [메일] 디자인 및 기능 개선 (최신)
// @namespace    gwx.kriss.mail
// @version      1.3.16
// @description  KRISS 그룹웨어 메일 현대화: 듀얼 테마, 제목 배지, 탭 열람, 인라인 편지쓰기, 에디터 고도화(표 크기 조절), 라벨/키워드/임시저장
// @author       GWX
// @match        https://gw.kriss.re.kr/wma/*
// @match        https://gw.kriss.re.kr/jsp/main/menu.jsp*
// @match        https://gw.kriss.re.kr/jsp/main/communication.jsp*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_listValues
// @grant        unsafeWindow
// ==/UserScript==

/* =====================================================================
 * GWX Mail Redesign v1.3.16
 * - 목록 자동 분류 초기화/재연결/계정·메일함 지연 준비 복구, 갱신 중 시작 지연 방지.
 * - 원본 계정 선언과 선택 폴더 DOM 보완, 읽음 변경 없는 기존 검색 방식 유지.
 * - 진단에 실제 목록 행 수·실행 조건·누적 요청 수 표시. 실서버 검증은 별도.
 * GWX Mail Redesign v1.3.15
 * - 처음 보는 메일의 일반/분할 목록 수신·참조 분류, 읽음·안읽음 모두 검색.
 * - 메일함/메일 번호 기준 연결, 검색 2개 병렬, 도착 즉시 표시, 계정별 결과 재사용.
 * - 메일 내용 조회나 읽음 상태 변경 없이 동작. 기존 작성 기능 유지.
 * GWX Mail Redesign v1.3.14
 * - 메일 작성 기본 글꼴을 맑은 고딕으로 설정하고 저장/미리보기 HTML에도 유지.
 * GWX Mail Redesign v1.3.13
 * - 본문 열람 없이 받는이/참조인 검색 결과를 일반 목록의 수신·참조 배지에 반영.
 * - 검색 목록의 mail_box/번호/제목/보낸이/날짜 대조, 페이지 순회 및 계정/화면 전환 보호.
 * - 목록/열람 화면 Message-ID의 꺾쇠 차이로 수신구분 캐시가 누락되는 오류 수정.
 * - 상세 검색의 편지함 열을 고정해 제목 열의 여유 폭 확보.
 * GWX Mail Redesign v1.3.12
 * - 실제 Prototype 1.5.1 충돌 수정: HTMLCollection.map, Array.from/reduce,
 *   이미 제거된 Element.remove, Array.toJSON 이중 인코딩.
 * - 사이트 전역 함수를 바꾸지 않고 GWX 내부 변환/제거/저장 경로를 사용.
 * GWX Mail Redesign v1.3.11
 * - 본문 상단의 낮은 표를 도구막대가 덮는 문제 수정, 열·행 손잡이 가시화.
 * - 최종 확인·임시저장에서 실제 수신자 이름 칩을 읽고 구분을 보존.
 * - 검색창 실측 기반 탭 폭, 스크롤·전체 목록, 탭 DOM 재생성 방지.
 * - 작성 탭 전환 시 현재 문서·선택·스크롤 유지 및 저장, 닫기 보호.
 * - 날짜 열을 실제 표시 길이에 맞춰 확보.
 * GWX Mail Redesign v1.3.10
 * - 표 너비/최소·최대 너비/논리 크기와 열·셀 폭을 한 경로로 동기화.
 *   표·행 그룹·셀의 고정 높이도 함께 해제해 세로 축소가 막히지 않게 수정.
 * - 본문 폭을 채운 표도 오른쪽 손잡이를 화면 안에서 잡을 수 있게 배치.
 *   표 너비 슬라이더 추가. 사진 조절 계산·이벤트 경로는 1.3.9 그대로 유지.
 * - 확인되지 않은 수신구분 배지 제거, 답장/전달/수신/참조로 문구 축약.
 * GWX Mail Redesign v1.3.9
 * - 표/사진 선택 후 모서리 드래그, 표 내부 경계로 열/행 조절. 편집 문서 밖에
 *   고정 오버레이를 두고 native pointer capture 및 contentDom 재바인딩 적용.
 * - 병합 표의 실제 셀 경계로 열 폭 추정, 드래그 중 셀/colgroup 폭 동기화.
 * - R1A 등 상태 코드 변형의 아이콘 폴백. 원본 클릭 핸들러 보존.
 * - 답장 제목과 내 수신 역할을 별도 표시. 계정/메일주소가 일치할 때만 판정.
 *   내 원문에 대한 답장인지는 제목·상태 아이콘으로 추정하지 않는다.
 * - 임시저장 실패 재시도, 슬롯 실제 삭제, 복구 시 To/Cc/Bcc 구분 보존,
 *   발송 미리보기 실패 시 발송 중지, 숨은참조 및 원본 첨부 목록 표시.
 * GWX Mail Redesign v1.3.8 (minor — 유지보수성·성능·키보드 조작)
 * 1.3.8: [4] 셀렉터 하드코딩 해소 — DOM 셀렉터·헤더 문구·아이콘 코드·버튼 라벨을
 *        GWX_SEL 단일 테이블로 통합하고, 탐지 성공/실패를 GWX_PROBE에 집계한다.
 *        설정 허브 '셀렉터 점검'에서 어떤 항목이 안 잡히는지 즉시 확인 가능 →
 *        그룹웨어가 패치돼도 원인 파악이 수 초로 단축.
 *        [5] 순수 함수 분리 + 자체 점검 — DOM에 의존하지 않는 판정 로직
 *        (parseSubject·iconUnreadState·tableFitWidths·gwxCalmMsg·keyString·hashHue)을
 *        GWXP 네임스페이스로 모으고, 내장 단위 테스트를 추가했다. 설정 허브 또는
 *        TM 메뉴 '자체 점검'으로 언제든 회귀 검증 가능(콘솔·토스트 보고).
 *        ※ 도입 직후 자체 점검이 parseSubject의 꼬리 공백 미제거를 실제로 검출해
 *        함께 수정했다(하위 호출부가 모두 trim 중이라 표면적 증상은 없었음).
 *        [6] CSS 시트 통합 — 라우트별 14~15개 시트를 선언 순서 그대로 하나로 합쳐
 *        1회만 주입(<style> 15개 → 1개). 캐스케이드 순서는 그대로 보존한다.
 *        ※ @layer는 검토 후 미도입: 사이트 원본 CSS가 unlayered라 레이어에 넣는
 *        순간 GWX 규칙이 항상 지므로 현행 !important 구조와 충돌한다(2.0 재검토).
 *        [8] 임시저장 슬롯 관리 견고화 — @grant GM_listValues 추가. 인덱스 배열이
 *        깨져도 저장소를 직접 스캔해 고아 슬롯을 찾아내며, 메일함 부팅 시 48시간
 *        경과·손상 슬롯을 자동 정리(gwxDraftGC)한다.
 *        [9] 목록/열람 키보드 조작 — 다음·이전·열기·목록·답장·전달·쓰기·삭제·선택·
 *        검색·새로고침·도움말 12종. 전 항목 사용자 지정 가능(설정 허브 → 단축키
 *        설정에서 키 입력으로 직접 캡처, 충돌 검사·기본값 복원 포함).
 *        기존 Del 삭제 리스너는 키맵의 del 액션으로 흡수(중복 실행 방지).
 *        [10] 표 그립 폴링 제거 — 2.5초 setInterval을 MutationObserver(편집 문서)
 *        + IntersectionObserver(가시성) + ResizeObserver + visibilitychange 조합으로
 *        교체. 유휴 시 재계산이 0회가 되고 탭 전환·지연 레이아웃에도 즉시 반응.
 * GWX Mail Redesign v1.3.7 (patch — 주입 경로 복구 · 메일 전용화 · 목록 표시)
 * 1.3.7: [A. 스크립트 전면 미적용 — 주입 경로 누락]
 *        1.3.6에서 @match가 frame.jsp/menu.jsp/communication.jsp만 남아, 정작
 *        모든 기능이 동작하는 /wma/*(fld.do·msgm.do·wpop) 프레임에는 스크립트가
 *        주입되지 않았다. frame.jsp는 route 판정에서 null이라 어차피 즉시 종료
 *        되므로 매칭 대상에서 제외하고 /wma/*를 추가(@include 중복도 정리).
 *        [B. 메일 외 모듈 화면까지 스킨이 적용되던 문제]
 *        menu.jsp(상단 GNB)·communication.jsp(커뮤니케이터)는 SelMenu와 무관한
 *        그룹웨어 공통 프레임이라 전자결재(Sanc_S) 등에서도 그대로 로드된다.
 *        → 상위 프레임의 SelMenu가 Mail*일 때만 부팅. injectAll·applyTheme보다
 *        먼저 판정해야 CSS 잔여물이 남지 않으므로 모듈 게이트 직후에 배치.
 *        [C. 보낸 메일함 '받는사람↔제목' 간격 과다]
 *        tuneColumns가 '보낸이'만 인식해 '받는사람' 열이 width:auto로 남았고,
 *        table-layout:fixed에서 auto 열끼리 잔여 폭을 균등 분배하는 규칙 때문에
 *        제목과 반씩 나눠 가져 간격이 벌어졌다. → 받는이/받는사람/수신자 계열도
 *        보낸이와 동일 고정폭(84px)으로 인식 + 해당 열 말줄임(클래스명 비의존).
 *        [D. 안읽음인데 굵게 표시되지 않던 간헐 오류 — 원인 2중]
 *        (a)상태 아이콘을 'r0.gif|r1.gif' 문자열 포함으로만 판정해, 경로·쿼리
 *        스트링(?v=)·미등록 코드가 붙으면 '읽음'으로 단정했고 (b)그 결과
 *        setRowUnread가 서버가 내려준 td_list_bold 클래스를 삭제해 판정 근거
 *        자체가 사라져, 이후 모든 갱신에서 영구히 굵게 표시되지 않았다.
 *        → (1)아이콘 파일명 정규화(경로·쿼리·대소문자 제거) (2)R0/R1 계열=안읽음,
 *        R2/R5 계열=읽음, 그 외=판정 불가의 3상태로 분리 (3)판정 불가면 서버의
 *        td_list_bold를 신뢰 (4)원본 클래스는 보존하고 data-gwx-unread=0/1을
 *        단일 표시 기준으로 삼아 CSS로 덮어쓰는 비파괴 방식으로 전환.
 * GWX Mail Redesign v1.3.6 (patch — 표 크기 조절 복구 · 포털 위젯 제거)
 * 1.3.6: [A. 표 크기 조절 무동작 — 원인 3중]
 *        (a)열 폭을 colgroup "px" + 셀 "%"로 이원 지정해 두 값이 어긋나면
 *        브라우저가 열 폭을 확정하지 못했다. (b)tableResizeModel()이 null이면
 *        열 드래그뿐 아니라 표 폭 프리셋·표너비 입력까지 통째로 무동작이 되었고
 *        사유도 표시하지 않았다(붙여넣기 표 대부분이 여기 해당). (c)1.3.3에서
 *        편집영역 내부 경계 드래그를 제거한 뒤 남은 유일한 수단인 오버레이
 *        그립이 투명·7px이라 발견되지 않았다(enhanceEditor의 onDown/onMove/
 *        onDbl/onUp은 선언만 되고 바인딩되지 않는 죽은 코드였음).
 *        → (1)열 폭은 colgroup·셀 모두 "%" 단일 기준, 표 폭만 px/%로 분리
 *        (2)모델 산출 실패 시에도 표 폭 프리셋·자동 맞춤은 항상 동작 + 사유 안내
 *        (3)편집영역 내부 셀 경계 드래그 복구(커서 힌트·더블클릭 자동 맞춤)
 *        (4)그립 가시화(상시 표시·호버 강조·히트영역 9px) (5)행 높이를 tr+셀
 *        동시 적용 (6)열 추가 후 열 폭 재정규화 (7)TM 메뉴 "표 조작 진단" 추가
 *        [B. 포털(krisstar) 안읽은 메일 위젯 제거]
 *        반영 지연(별도 세션 조회·스냅숏 폴백 구조상 실시간성 확보 불가)으로
 *        기능 자체를 삭제. krisstar @match/@include, @connect, GM_xmlhttpRequest
 *        권한, CSS_PORTAL, bootPortal, 포털 메뉴·설정 항목, 딥링크 소비 경로,
 *        안읽음 스냅숏 기록을 모두 제거해 포털 페이지에서는 아무 것도 실행되지
 *        않는다. 메일함 내부의 안읽음/폴더 개수 표기는 그대로 유지.
 * v1.3.5 (patch — 표 리사이즈 재설계·작성 상태 기준선·열람 재사용 보강)
 * 1.3.5: (1)표 폭 프리셋이 기존 셀 px 폭에 막히던 문제를 열 비율 재계산으로
 *        수정, 셀 패딩까지 포함한 실제 폭 기준 최소 18px 적용, colspan 표도
 *        논리 열/colgroup 기반으로 colspan·rowspan 표도 열 드래그 지원
 *        (2)열 숫자입력·폭 자동·그립 좌표 캐시·CKEditor 명령 비활성 판정 수정
 *        (3)기본 서명/답장 인용문을 작성 변경으로 오판하던 문제를 초기 기준선
 *        비교로 교체, 복구 제안을 보지 않고 닫아도 기존 자동저장 보존
 *        (4)열람 DOM 재사용 시 제목/역할/라벨/아바타 재바인딩, 탭 제목에서
 *        GWX 배지 문구 제외 (5)첨부영역 임의 링크 클릭 제거·입력 탐색 폴링,
 *        수신그룹 버튼과 제목 입력 겹침 및 새창 전환 시 작성내용 유실 방지
 * 1.3.4: (1)발송 시도만으로 임시저장을 지우지 않고 wmasm 성공 확인 뒤 해당
 *        작성 슬롯만 삭제 (2)자동저장 이벤트 기반화·중복 쓰기 억제·대용량
 *        본문 보호·만료/손상 슬롯 정리 (3)목록 행 DOM 재사용 시 제목/날짜/
 *        역할/아바타/스레드 칩 재동기화 (4)상위 hashchange 디스패처 수명주기
 *        정리 (5)메일 본문 자손의 색·배경·글꼴 강제 초기화 제거, 다크 원문
 *        보존 기본화 (6)병합 셀 표의 위험한 열 조작 차단·그립 리스너 정리
 * 1.3.3: (1)상위 프레임 open/form 후킹을 고정 디스패처 방식으로 전환해
 *        메일 프레임 재로드 후 답장·전달이 죽는 오래된 참조 제거
 *        (2)임베드 결과는 wmasm 성공 DOM을 확인한 경우에만 탭 자동 닫기
 *        (3)자동 임시저장을 작성 탭별 슬롯으로 분리하고 수신자·첨부·이미지도
 *        변경 감지 (4)메일 탭 복원은 이벤트 유실 없는 서버 재조회로 고정
 *        (5)표 구형 드래그 경로 제거·＋핸들 표시, 이미지 원본 오류 수정
 *        (6)안읽음/폴더 개수·분할 폭·역할 칩 동기화 및 첫 화면 게이트 수정
 * 1.3.2: [원인확정] 박스모델 불일치 — 열 폭을 getBoundingClientRect(=border-box,
 *        패딩·테두리 포함)로 재서 style.width(=content-box)에 그대로 넣어, 드래그
 *        시작마다 각 열이 패딩+테두리만큼 부풀고 합계가 증가. 고정 레이아웃의
 *        '표 폭 = max(지정 폭, 열 합계)' 규칙 때문에 확대만 되고 축소는 차단됨.
 *        → 열/표 폭을 모두 content-box로 환산(cbw), col 요소의 잔여 폭·width
 *        속성 제거, 마지막 열 축소 시 최소폭 클램프를 표 폭에도 동일 적용
 * v1.3.1 (patch — 1.3.0 부작용·잔여 결함 수정)
 * 1.3.1: (1)[원인] td에 display:block을 줘 보낸이 수직정렬 붕괴 + 헤더 말줄임
 *        → td 블록화 철회(셀 정렬 복원), 헤더 말줄임 해제, 상태열 100px로 확대
 *        (2)[원인] mkBtn의 콜백 인자는 '버튼'이 아니라 '이벤트' → '고급' 팝오버
 *        앵커가 잘못 전달돼 무동작 → 버튼 참조로 수정 (3)표 확장 차단 원인 =
 *        max-width/width 속성 → 드래그 시작 시 해제 + 표 폭 프리셋(100/70/50/
 *        자동) 추가 (4)서식바 아이콘(마스크) 미표시 → 표=▦, 지우기=텍스트 등
 *        글리프로 교체(빈 박스 제거) (5)'메일쓰기' 타이틀을 목록/열람 타이틀과
 *        런타임 실측 동기화(글꼴·색·좌표)
 * v1.3.0 (minor — 표/이미지 직접 조작·목록 폭 최적화)
 *  ※ 과거 1.3.0은 1.2.2로 정정됨. 본 버전은 정정 이후 새로 부여한 minor.
 * 1.3.0: (1)[원인확정] 열 드래그 무효 = 표 폭이 고정이라 셀 폭을 키워도 표가
 *        막음(행 높이는 표 높이 auto라 동작) → 인접 열 상호 조정(표 폭 유지) +
 *        마지막 열 드래그 시 표 폭 자체 조정으로 수정 (2)이미지 모서리 드래그
 *        리사이즈(비율 유지·실시간·더블클릭 원본) + 슬라이더/버튼식 크기조절
 *        제거 (3)선택 시 대상 위에 뜨는 컨텍스트 미니툴바 — 서식바의 상시 칩
 *        나열 제거, 자간·줄간격은 '고급 ▾'로 접기 (4)폴더 개수(n/N)를 제목에서
 *        떼어 좌측 사이드바 폴더줄 우측에 배경 없이 표기 (5)목록 열폭 최적화 —
 *        상태·보낸이·날짜·크기 최소화, 제목 가변 확장(고정 레이아웃·말줄임)
 * v1.2.3 (patch — 설정 허브·표 그립·제목 카운트 확실 제거)
 * 1.2.3: (1)표 마우스 조작 재설계 — iframe 이벤트 의존 제거: 표 좌표를 읽어
 *        부모 문서에 열/행 '그립'과 ＋핸들을 그리고 포인터 캡처로 드래그
 *        (iframe 위에서도 부모가 계속 수신) → 실동작 보장, 진단 토스트 제거
 *        (2)설정 허브 — 우하단 미세 점(투명도 12%) 클릭 시 전 설정 패널(테마·
 *        컬러·밀도·탭·미리보기·포털·끄기/복구) → TM 아이콘 탐색 불필요, 빨간
 *        복구 배지 2종 제거(타인 노출 최소화) (3)제목의 (n/N)을 텍스트 노드
 *        단위로 제거 + 제목 감시 재적용
 * v1.2.2 (minor — 자가진단·라이트 컬러 프리셋·제목 카운트 필)
 * 1.2.2: (1)메일함 미작동 원격진단 대응 — 부트 비컨에 enabled/module 상태
 *        병기, 전체끔/모듈끔/부팅오류 시 좌하단 '클릭 복구' 배지, TM 메뉴
 *        '모듈 상태 초기화' 추가 → 어떤 상태든 원클릭 복구·즉시 판별
 *        (2)라이트 포인트 컬러 프리셋 — Sea Glass(기존)/Ocean Blue/Indigo,
 *        메뉴에서 순환(포털 카드 제외) (3)메일함 제목의 (안읽음/전체)를
 *        소형 필 배지로 분리 표기(토글로 숨김 가능)
 * v1.2.1 (patch)
 * 1.2.1: (2)완료 알림 문구 정정 — '요청한 작업이 성공하였습니다.' 포함 성공
 *        문구 전반 통과(실패/오류/취소 등 부정 문구는 절대 통과 금지),
 *        숨은 프레임·메일 본창까지 확장 (3)Alt+Shift+X를 **토글**로 — 꺼진
 *        상태에서도 같은 키로 즉시 복구(TM 메뉴 탐색 불필요)
 *        (1)에디터 바인딩을 드롭에서 검증된 CKE 채널(ed.document.on)로 1원화
 *        (+raw 백업) + 가시 진단 토스트 3종(활성/포인터/경계) — 콘솔 없이
 *        단계 판별 가능. 더블클릭 경계=열 너비 자동, 표 패널 '머리글 행' 추가
 * v1.2.0 (minor — 킬스위치·Del 삭제·완료팝업 자동통과·에디터 수리)
 * 1.2.0: (1)Alt+Shift+X 전역 킬스위치(모든 GWX 즉시 해제+새로고침, 복구는
 *        TM 메뉴 '전체 켜기') / Del 키로 메일 삭제(열람 중=현재 메일,
 *        목록=체크된 메일, 확인창은 유지) (2)'~되었습니다' 완료 팝업 자동
 *        통과 — 결과 팝업(wpop)의 alert만 통과시켜 확인 클릭 없이 목록 갱신
 *        후 즉시 닫힘(제공 HTML로 확인, 추가 정보 불필요) (3)에디터 표 마우스
 *        조작 미동작 수리 — CKE editable API 병행 바인딩+캡처 이중화+중복
 *        방지 플래그+진단 로그, 글자수 카운터 제거(요청)
 * v1.1.0 (minor — 에디터 대개편)
 * 1.1.0: [기능] 표 마우스 조작 — ①셀 경계 드래그로 열 너비/행 높이 조절
 *        (px 툴팁·실행취소 1스텝) ②표 hover 시 우측/하단 ＋ 핸들로 열·행
 *        원클릭 추가 ③Tab 셀 이동 + 마지막 셀 Tab=행 자동 추가(Excel식)
 *        ④클립보드 이미지 붙여넣기(스크린샷 직삽입) ⑤단축키 Ctrl+S 임시저장
 *        / Ctrl+Enter 보내기(미리보기) / Ctrl+F 편집기 내 찾기 ⑥본문 글자수
 *        카운터 ⑦표 패널 '열 균등'·'표 정리'(엑셀 붙여넣기 표준화)
 *        — CKE iframe 스타일 무주입 원칙 유지(이벤트·셀 인라인 편집만),
 *        리스너 경량·카운터 디바운스로 성능 영향 최소화
 * v1.0.2 (patch — 딥링크 체감·포털 신선도·잔여 스킨)
 * 1.0.2: (1)딥링크 — 목록 선노출 구간을 '여는 중' 오버레이로 은닉 + 1차 클릭은
 *        즉시(재시도만 변이정지 대기) (2)포털 신선도 — 열람 즉시 스냅숏 낙관
 *        갱신(포털 실시간 반영) + 최근읽음(10분) 필터로 재등장 차단, 스냅숏
 *        스로틀 15→4초 (3)상세 버튼 옆 빈 네모 = 형제 장식 요소 → 형제/부모
 *        정리 (4)인쇄(분할) — 앵커의 자식 img src를 힌트에 포함, input/button
 *        확장 (5)콘솔 점검: GWX 오류 없음(잔여 로그는 포털 자체 위젯)
 * v1.0.1 (patch — 체감 지연 해소)
 * 1.0.1: (A)포털 위젯 — ①네트워크 선발사(문서 파싱과 병렬) ②후보 URL·세션키
 *        채굴 전부 동시요청(선착 승리) ③성공 URL 학습(portal.goodUrl: 이후엔
 *        보통 1왕복) ④카드 조기 마운트(DCL 대기 제거, #con_center 감지 즉시)
 *        (B)딥링크 클릭 — 고정 대기(부팅 1s+동일행 2회) 제거, 목록 '변이 정지
 *        450ms' 감지로 대체(안전성 동일·대기 최소), 폴링 350→150ms
 * v1.0.0 (정식 릴리스)
 * 버전 정책: 이후 오류 수정 = 1.0.1, 1.0.2 … / 기능 추가 = 1.1.0 (minor) /
 *            대규모 개편 = 2.0.0 (major)
 * 1.0.0: (1)[원인] 딥링크 클릭은 성공(읽음 처리됨)하나 직후 앱 자체 초기
 *        로딩이 목록을 재렌더하며 열람 화면을 덮어씀 → 목록 안정화 대기
 *        (동일 행 2회 연속 확인 + readyState complete) 후 클릭, 클릭 후
 *        열람 전환 검증·최대 3회 재클릭, 전 과정 진단 로그
 *        (3)상세 버튼 마킹을 태그 무관(a/button/span/em[onclick])·광역으로
 *        확장 + 내부 요소 스타일 일괄 리셋 (2)정식 버전 체계 전환
 * v0.9.13 (beta — 딥링크 경합 제거·초기 노출 전면 게이트)
 * 0.9.13: (1)[원인] 0.9.12의 '기존 창' 리스너가 포털의 창 네비게이션과 경합해
 *         곧 언로드될 구 문서가 딥링크를 선소진 → 리스너 제거 + 성공 시에만
 *         삭제(비파괴 읽기) + mid 우선 탐색(행 번호 변동 무관) + 진단 로그
 *         (2)게이트를 #main_content·좌측 전체로 확대, 준비 플래그를 첫 장식
 *         '완료 후'로 이동, 상단 GNB를 menu.jsp 자체에서 첫 페인트 전 선차단
 *         (3)목록 컴팩트 밀도 기본 적용(행 34px, 메뉴 토글)
 * v0.9.12 (beta — 포털 위젯 안정화)
 * 0.9.12: (2)[원인] 딥링크 해시가 frame.jsp 재이동에서 유실 가능 → 전달 채널을
 *         GM 저장소로 교체(+이미 열린 메일 창은 리로드 없이 즉시 열림)
 *         (1)위젯 기본 위치 중앙 (3)라이브 조회 강화 — 후보 URL 순차 시도·
 *         세션키(K) 광역 채굴·로그인 페이지 감지 (4)초기 원본 노출 차단 —
 *         목록/사이드바를 장식 완료까지 불투명 게이트(실패 시 1.2초 자동 해제)
 * v0.9.11 (beta — 포털 안읽은 메일 위젯 추가)
 * 0.9.11: [신규] portal 라우트(krisstar.kriss.re.kr 메인) — '안읽은 메일' 위젯.
 *         ①GM_xmlhttpRequest로 gw의 받은 메일함(fld.do)을 조회·파싱해 안읽음만
 *         표시(세션키 K 자동 재확보) ②실패 시 메일함 열람 중 저장해 둔 스냅숏으로
 *         대체 표시(동일 스크립트 = GM 저장소 공유) ③행 클릭 시 메일 앱을 열고
 *         해당 메일 자동 오픈(#gwx-open 딥링크, mid 검증) ④포털에서는 GWX 다크
 *         테마 속성 미적용(포털 원본 테마 보존)
 * v0.9.10 (beta — 9차 피드백 반영)
 * 0.9.10: (2)[원인확정] 열람 본문 line-height 강제 리버트가 메일 자체 줄간격을
 *         무효화 → 규칙에서 제외(서명 간격 원형 복원). 발송 미리보기는 편집기
 *         기본(p/div 마진 0)으로 근사 (1)프로필 사진 기본 끔(옵션 토글)
 *         (3)프린트/상세를 JS 마킹 후 스킨(셀렉터 추정 탈피), 검색·초기화
 *         flex 수직중앙 강제 (4)미열람 참조판정 불가 사유 README 명시
 * v0.9.9 (beta — 8차 피드백 반영)
 * 0.9.9: (6.1/10)[핵심] 열람 감지를 컨테이너 무관(getViewCtx)으로 전환 —
 *        분할 모드에서 탭 정상 표시 (1)안읽음 R0.GIF 추가 매핑, R5/R5F 추정
 *        매핑 (3)받는이/참조 열람이력 기반 목록 칩 (4)답장 시 빈 팝업 자동
 *        닫기 (5)발송 미리보기 96vh·문단 간격 보정 (6.2)본문 흰 배경 기본
 *        (6.4)상세/인쇄 스킨 스코프 재확장 (7)다크 본문 밝은 글자 강제
 *        (8.2)탭 X를 pointerdown 즉시 처리 (9)'메일쓰기' 라벨 크기 통일
 *        (11)드롭 점선 잔류 제거·상단 압축·편집영역 자동 확장
 * v0.9.8 (beta — 7차 피드백 반영)
 * 0.9.8: (8)[중대] 0.9.7 분할 가드가 일반 모드 '목록→메일탭'에서 화면 전환을
 *        생략하던 회귀 수정 (2)답장/전달 3중망 — 폼 제출(target 새창) 재타깃
 *        +target 앵커 가로채기 추가 (1)탭 스트립 호스트를 '보이는 제목줄'
 *        자동 선택(분할 선진입 대응) (4)다크 목록 선택행 배경/글자 정상화
 *        (5)분할 비율 1:1 초기화 (3)발송 미리보기 렌더 충실도·가독 확대
 *        (6)상세 버튼/초기화/날짜입력/인쇄 아이콘 재스킨 강화 (7)임베드
 *        '메일쓰기' 라벨을 탭 좌측 헤더로 이동 (9)탭 음영 강조
 *        (10)본문 배경 소프트 톤·글꼴 통일 옵션
 * v0.9.7 (beta — 6차 피드백 반영)
 * 0.9.7: (5)답장/전달이 top 프레임 경유로 창을 열어 훅 우회 → top/parent
 *        open까지 후킹 (4,9)발송결과(wmasm)가 임베드 iframe에선 self.close
 *        무효 → 전용 처리로 탭 자동 닫기+목록 복귀, 결과 화면 리디자인
 *        (2)분할(미리보기) 모드 탭 지원 (3)보내기 전 최종 확인 미리보기
 *        (1)상세검색 버튼 푸터 이동(JS)·입력 수직중앙 강제 (6)작성 타이틀
 *        복원·수직정렬 (7)'수신 그룹' 제목행 우측 고정 (8)편집기 아이콘
 *        모노톤 (10)안읽음 상태를 도트 배지로 교체(마스크 비의존)
 * v0.9.6 (beta — 5차 피드백 반영)
 * 0.9.6: (8)[중대] 목록 복귀 후 열람영역 잔존 DOM을 '열람 중'으로 오판해
 *        활성 탭 탈취·표시상태 오염 → 가시성 게이트로 수정 (1)답장/전달/재발송
 *        팝업도 인라인 탭으로(인쇄 제외) (2)다크 열람: 반투명 다크 패널+색반전
 *        근사 렌더링, 첨부 링크 가독성 (3)상세 버튼·프린트 아이콘 재스킨
 *        (4)상세검색 열폭 해제·이중 박스 제거·초기화/검색 우하단 고정
 *        (5)미리보기 안내(preview_notice) 리디자인 (6)CI 확대·중앙 정렬
 *        (7)쪽 전환 깜빡임 완화(원본 상태아이콘 선차단+목록 데코 16ms)
 * v0.9.5 (beta — 4차 피드백: 상세검색·필터팝업 DOM 실측 반영)
 * 0.9.5: (1)사이드바 아이콘/정렬 최종 — 원인 재특정: span 자체의 배경 스프라이트
 *        와 패딩 → 자손 전체 배경 제거·span 리셋 (2)퀵필터 라벨 2중 표기 —
 *        span 원본 라벨 숨김 (3)작성 레이어 중 좌측 폴더 클릭 시 목록으로 전환
 *        (4)상세검색 패널 현대화(+용어 개칭) / 필터 추가 팝업 등 /wma/ 팝업
 *        전용 라우트(wpop) 신설·스킨 / 개인메일함 트리 현대화 / 공용
 *        basic_inp·btn_sqr 스킨(메일설정 1차 반영)
 * v0.9.4 (beta — 실사이트 3차 피드백 + 안읽음 DOM 실측 반영)
 * 0.9.4: (1)퀵필터 기본 표시 복원 (2)사이드바 실측 반영 — li 배경 스프라이트
 *        제거(이중 아이콘 원인), 앵커 flex 수직 중앙(텍스트 상단 치우침 해결),
 *        '편지함→메일함' 전면 개칭 (3)툴바 flex 정렬·반응형 미디어쿼리
 *        (4)드롭 첨부 미반영 시 파일선택창 자동 오픈 폴백 (5)표 크기 도구
 *        — 열너비/행높이/표너비 (6)'그룹' 버튼을 내게쓰기 셀로 재배치
 *        (7)안읽음 상태 R1.GIF 매핑(실측 확정)+R2AF 매핑 (8)작성 중 탭 활성
 *        탈취 방지 (9)사이드바 상단 KRISS 로고(krisstar 링크) (10)slt_solo
 *        'select' 토글을 결합형 ▾ 버튼으로 재스킨 (11)(구)메일함 기본 숨김
 * v0.9.3 (beta — 실사이트 2차 피드백 반영)
 * 0.9.3: (2)탭 클릭을 pointerdown 기반으로 전환+z-index 상향 (3)역할 배지
 *        컨테이너 가드 결함 수정(첫 메일에만 적용되던 버그), 프라이머리
 *        버튼 특이도 패배 수정, 서식 칩 CSS 재발행, '그룹' 버튼 줄바꿈 수정,
 *        퀵필터 행 기본 숨김, 첨부영역 드래그 시 자동 펼침+높이 압축,
 *        임베드 작성창 상단 타이틀 제거 (4)상단 GNB 프레임 기본 숨김(토글)
 * v0.9.2 (beta — 실사이트 1차 피드백 반영)
 * 0.9.2: (1)탭 '목록' 복귀·삭제 연동을 텍스트 매칭으로 보강 (2)레이아웃 보정
 *        — 폴더 이중 아이콘 제거·[비우기] 겹침 수정 (3)'메일 쓰기' 명칭 변경 및
 *        인라인 열기 훅 정규식 수정(상대 URL 대응) (5)목록 복귀 3단 폴백
 *        (6.1)원본 에디터 콤보(스타일/본문/글꼴/크기/색) 숨김 + 서식바 셀렉트
 *        하이재킹 수정 (7)GNB 아이콘 모노톤 정돈 (8)스레드 칩 키 산정 수정
 * 0.9.1: 미주입 진단 강화 — 매칭 이중화, 주입 beacon, 치명오류 캐치.
 * 근거: gw_mail_redesign_spec_v2.0.md + 추가 요구(인라인 편지쓰기 탭 연동,
 *       에디터 고도화, Sea Glass 라이트/Ember 다크, 라벨·키워드·임시저장 등)
 * 절대 규칙 요약(G):
 *  G1  #mail_view_area 자손 불가침(컨테이너 padding/배경만 허용)
 *  G1b CKEditor 편집 iframe 내부에 CSS/DOM 주입 금지(내용 편집 API 호출만 허용)
 *  G2  구조 치수(218px 체계·JS 인라인 높이) 불변, 세로 공간 점유 요소 금지
 *  G5  원본 노드 삭제·이동·핸들러 교체 금지(추가만; GWX 생성물은 자유)
 *      예외: F1/키워드는 제목 "텍스트 노드"의 부분 수정 허용,
 *            F10 인라인 편지쓰기는 window.open 훅(사용자 명시 요구, 토글 제공)
 *  G6  멱등(data-gwx* 표식) / G7 옵저버 디바운스 / G8 try-catch 격리
 *  G11 페이지 기능은 요소 click() 시뮬 우선(browse/viewList 호출만 예외)
 *  G13 색은 토큰 변수만, 인디고·바이올렛 금지
 * ===================================================================== */

(function () {
  'use strict';
  var GWX_VER = '1.3.16';
  try { /* 전역 치명오류 캐치 — 어떤 예외도 조용히 죽지 않게 */

  /* ---------- 0. 라우팅 & 가드 ---------- */
  var W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  var P = location.pathname;
  var HOST = location.hostname;
  var route =
    P.indexOf('/wma/fld.do') === 0 ? 'mail' :
    P.indexOf('/wma/msgm.do') === 0 ? 'compose' :
    P.indexOf('/jsp/main/menu.jsp') === 0 ? 'gnb' :
    P.indexOf('/jsp/main/communication.jsp') === 0 ? 'comz' :
    (P.indexOf('/wma/') === 0 ? 'wpop' : null);
  // 주입 확인용 beacon — 디버그 설정과 무관하게 항상 출력 (+ 1.3.0: 상태 병기)
  try {
    var _en = true, _md = true;
    try { _en = GM_getValue('gwx.enabled', true); } catch (e0) {}
    try { _md = route ? GM_getValue('gwx.module.' + route, true) : true; } catch (e1) {}
    console.info('[GWX] v' + GWX_VER + ' 주입됨:', P + location.search.slice(0, 40),
      '→ 라우트:', route || '(대상 화면 아님 — 종료)',
      '| enabled=' + _en + ' | module=' + _md);
  } catch (e) {}
  if (!route) return;
  // 1.3.3: 숨은 프레임도 전체/모듈 끔과 ?gwx=off를 먼저 존중한다.
  // 함수 선언은 호이스팅되므로 아래 gmGet을 이 지점에서도 안전하게 사용할 수 있다.
  var _gwxEarlyOff = gmGet('gwx.enabled', true) === false ||
    gmGet('gwx.module.' + route, true) === false;
  try {
    if (new URLSearchParams(location.search).get('gwx') === 'off') _gwxEarlyOff = true;
  } catch (e) {}

  // T2: 편지쓰기는 top 창 또는 GWX 임베드 iframe에서만 (CKEditor iframe 차단)
  var EMBED_ID = 0;
  if (route === 'compose' && window.self !== window.top) {
    var fe = null; try { fe = window.frameElement; } catch (e) {}
    var m = fe && /^gwx-compose-(\d+)$/.exec(fe.id || '');
    if (!m) {
      try { console.info('[GWX] compose 하위 프레임(에디터/hidden) — 종료(정상)'); } catch (e) {}
      return;
    }
    EMBED_ID = +m[1];
  }
  if (route === 'wpop' && window.self !== window.top) {
    var fe2 = null; try { fe2 = window.frameElement; } catch (e) {}
    var m2 = fe2 && /^gwx-compose-(\d+)$/.exec(fe2.id || '');
    if (!m2) {
      if (_gwxEarlyOff) return;
      try { // 1.2.1: 숨은 프레임에서 뜨는 결과 알림도 자동 통과
        var _fa = W.alert ? W.alert.bind(W) : null;
        W.alert = function (m) {
          if (gwxCalmMsg(m)) {
            try { console.info('[GWX] 결과 알림 자동 통과(frame):', String(m).trim()); } catch (e2) {}
            return;
          }
          if (_fa) _fa(m);
        };
      } catch (e) {}
      try { console.info('[GWX] wma 하위 프레임 — 스킨 없음, 알림 쉼만 설치'); } catch (e) {}
      return;
    }
    EMBED_ID = +m2[1]; // 임베드 작성창이 발송결과(wmasm) 등으로 이동한 경우
  }
  if (route === 'wpop' && !_gwxEarlyOff) {
    // 1.2.0: 처리 결과 팝업의 완료 알림('~되었습니다' 등)만 자동 통과.
    //  alert 차단 → onload에서 opener.getMessages() 갱신 → self.close() 즉시 실행.
    //  확인/취소를 요구하는 confirm 류는 건드리지 않음.
    try {
      var _gwxAl = W.alert ? W.alert.bind(W) : null;
      W.alert = function (m) {
        if (gwxCalmMsg(m)) {
          try { console.info('[GWX] 결과 알림 자동 통과:', String(m).trim()); } catch (e) {}
          return;
        }
        if (_gwxAl) _gwxAl(m);
      };
    } catch (e) {}
  }
  if (document.contentType && document.contentType !== 'text/html') return;

  function gmGet(k, d) { try { return GM_getValue(k, d); } catch (e) { return d; } }
  function gmSet(k, v) { try { GM_setValue(k, v); return true; } catch (e) { return false; } }
  function gmDelete(k) {
    try { if (typeof GM_deleteValue === 'function') { GM_deleteValue(k); return true; } }
    catch (e) { return false; }
    return gmSet(k, '');
  }
  /* Tampermonkey 스크립트 메뉴 노출 제어 — 기본 '숨김'.
   *  모든 설정·진단은 우하단 미세 점(설정 허브)에서 처리하므로 TM 메뉴는 중복이며,
   *  목록이 길어져 다른 스크립트를 찾기 어려워진다.
   *  다시 보이게 하려면: 설정 허브 > 'TM 메뉴 표시' → 표시 (또는 gwx.opt.tmMenu=true)
   *  ※ 복구용 명령(전체 켜기 / 모듈 켜기)은 GWX가 꺼진 상태에서만 뜨는 최후 수단이라
   *    이 게이트를 적용하지 않는다. */
  function regMenu(label, fn) {
    try {
      if (gmGet('gwx.opt.tmMenu', false) !== true) return;
      GM_registerMenuCommand(label, fn);
    } catch (e) {}
  }
  // Prototype 1.5.1 replaces Array.from/map/reduce and Element.remove at runtime.
  // Keep GWX helpers independent without modifying the host framework.
  function gwxArray(items, map) {
    var out = [], i = 0;
    if (items == null) return out;
    if (typeof items.length === 'number') {
      for (; i < items.length; i++) out.push(map ? map(items[i], i) : items[i]);
    } else if (typeof Symbol !== 'undefined' && items[Symbol.iterator]) {
      var iterator = items[Symbol.iterator](), step;
      while (!(step = iterator.next()).done) { out.push(map ? map(step.value, i) : step.value); i++; }
    }
    return out;
  }
  function gwxRemove(node) {
    if (!node) return;
    var cleanup = node._gwxDispose;
    if (cleanup) { node._gwxDispose = null; cleanup(); }
    if (node.parentNode) node.parentNode.removeChild(node);
  }
  function gwxReduce(items, fn, value) {
    for (var i = 0; i < items.length; i++) if (i in items) value = fn(value, items[i], i, items);
    return value;
  }
  function gwxStringify(value) {
    var visiting = new WeakSet();
    function copy(v) {
      if (!v || typeof v !== 'object') return v;
      if (visiting.has(v)) throw new TypeError('Cannot serialize circular GWX data');
      visiting.add(v);
      var out;
      if (Array.isArray(v)) {
        out = [];
        // Own non-enumerable shadow prevents inherited Prototype.toJSON from encoding twice.
        Object.defineProperty(out, 'toJSON', { value: undefined, enumerable: false });
        for (var i = 0; i < v.length; i++) out.push(copy(v[i]));
      } else {
        out = Object.create(null);
        for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = copy(v[k]);
      }
      visiting.delete(v); return out;
    }
    return JSON.stringify(copy(value));
  }

  function storedJson(v, fallback) {
    if (v == null || v === '') return fallback;
    if (typeof v === 'object') return v;
    try {
      // Only container stores call this helper; decode legacy double-encoded roots.
      for (var i = 0; i < 3 && typeof v === 'string'; i++) v = JSON.parse(v);
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) { return fallback; }
  }
  function gwxCurrentDraftKey() {
    var token = '';
    try {
      var ff = window.frameElement;
      token = ff && ff.dataset ? String(ff.dataset.gwxDraftKey || '') : '';
    } catch (e) {}
    if (!token) { try { token = sessionStorage.getItem('gwx.composeDraftKey') || ''; } catch (e) {} }
    token = String(token || '').replace(/[^a-z0-9._-]/gi, '').slice(0, 96);
    return token ? 'gwx.draft.' + token : '';
  }
  // 1.3.3: 작성 탭별 임시저장 슬롯 인덱스. GM_listValues 권한 없이도 일괄 정리한다.
  // 1.3.8: GM_listValues가 있으면 저장소를 직접 스캔해 인덱스가 깨져도 고아 슬롯을 찾는다.
  function gmList() {
    try { if (typeof GM_listValues === 'function') return GM_listValues() || []; } catch (e) {}
    return null;
  }
  function isDraftKey(k) {
    return typeof k === 'string' && /^gwx\.draft\./.test(k) && k !== 'gwx.draft.index';
  }
  function gwxDraftIndex() {
    var a = gmGet('gwx.draft.index', []);
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = []; } }
    a = Array.isArray(a) ? a.filter(function (k) { return isDraftKey(k) && !!gmGet(k, ''); }) : [];
    var all = gmList();
    if (all) {
      probe('GM_listValues', true);
      all.forEach(function (k) { if (isDraftKey(k) && gmGet(k, '') && a.indexOf(k) < 0) a.push(k); });
    } else probe('GM_listValues', false);
    return a;
  }
  /* 1.3.8: 만료(48h)·손상·빈 슬롯 정리. 인덱스도 실제 존재하는 키로 재작성한다. */
  function gwxDraftGC() {
    var now = Date.now(), keep = [], gone = 0;
    var keys = gwxDraftIndex().concat((gmList() || []).filter(isDraftKey));
    keys.filter(function (k, i) { return keys.indexOf(k) === i; }).forEach(function (k) {
      var raw = '';
      try { raw = gmGet(k, ''); } catch (e) {}
      var d = null;
      if (raw) { try { d = JSON.parse(String(raw)); } catch (e) { d = null; } }
      if (!d || !d.t || (now - d.t) > 48 * 3600 * 1000) {
        try { gmDelete(k); } catch (e) {}
        gone++; return;
      }
      keep.push(k);
    });
    gmSet('gwx.draft.index', keep.slice(-40));
    if (gone) { try { console.info('[GWX] 임시저장 정리 — 만료·손상 슬롯 ' + gone + '건 삭제, 유효 ' + keep.length + '건'); } catch (e) {} }
    return { kept: keep.length, removed: gone };
  }
  function gwxDraftRegister(k) {
    var a = gwxDraftIndex().filter(function (key) { return key !== k; }); a.push(k);
    if (a.length > 40) { a.slice(0, a.length - 40).forEach(gmDelete); a = a.slice(-40); }
    gmSet('gwx.draft.index', a);
  }
  function gwxDraftClearSlot(k) {
    try { gmDelete(k); } catch (e) {}
    var a = gwxDraftIndex().filter(function (x) { return x !== k; });
    gmSet('gwx.draft.index', a);
  }
  function gwxDraftClearAll() {
    gwxDraftIndex().forEach(function (k) { try { gmDelete(k); } catch (e) {} });
    gmSet('gwx.draft.index', []);
    gmDelete('gwx.draft'); // 1.3.2 이하 단일 슬롯도 함께 제거
  }
  // top 프레임은 메일 프레임보다 오래 살아 있으므로 끄기/모듈 중지 시 최신 처리기를 비운다.
  function gwxDeactivatePersistentHooks() {
    try {
      var seen = [];
      [W.top, W.parent].forEach(function (TW) {
        if (!TW || seen.indexOf(TW) > -1) return;
        seen.push(TW);
        try {
          TW.__gwxOpenHandler = null; TW.__gwxAfterOpen = null; TW.__gwxSubmitHandler = null;
          TW.__gwxHashHandler = null; TW.__gwxHashOwner = ''; TW.__gwxHookOwner = '';
        } catch (e) {}
      });
    } catch (e) {}
  }
  // 1.2.3: 눈에 띄지 않는 복구 점(빨간 배지 대체)
  function gwxQuietDot(onClick) {
    function go() {
      try {
        if (!document.body || document.getElementById('gwx-dot')) return;
        var b = document.createElement('div');
        b.id = 'gwx-dot';
        b.style.cssText = 'position:fixed;right:5px;bottom:5px;width:11px;height:11px;border-radius:50%;' +
          'background:#8a8a8a;opacity:.12;z-index:2147483000;cursor:pointer;transition:opacity .15s';
        b.onmouseenter = function () { b.style.opacity = '.55'; };
        b.onmouseleave = function () { b.style.opacity = '.12'; };
        b.onclick = onClick;
        document.body.appendChild(b);
      } catch (e) {}
    }
    try {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
      else go();
    } catch (e) {}
  }
  // 1.2.1: 결과 알림 자동 통과 판별 — 성공 문구만, 부정 문구는 절대 통과 금지
  function gwxCalmMsg(m) {
    var s = String(m == null ? '' : m).replace(/\s+/g, ' ').trim();
    if (!s) return false;
    // 일반적인 "~되었습니다"는 세션 만료·차단·보류에도 쓰이므로 통과시키지 않는다.
    if (/실패|오류|에러|없습|없는|불가|취소|초과|다시|잘못|권한|만료|보류|차단|로그아웃|세션|중단|거부|제한/.test(s)) return false;
    return /(성공하였습니다|(?:삭제|이동|복사|저장|발송|전송|등록|수정|변경|해제|설정|복구|예약|처리|완료)(?:되었습니다|하였습니다))\.?$/.test(s);
  }
  if (gmGet('gwx.enabled', true) === false) {
    gwxDeactivatePersistentHooks();
    try { console.info('[GWX] 전체 끔 상태 — Alt+Shift+X로 즉시 다시 켤 수 있습니다 (또는 TM 메뉴 "전체 켜기")'); } catch (e) {}
    gwxQuietDot(function () {
      gmSet('gwx.enabled', true);
      try { (window.top || window).location.reload(); } catch (e) { location.reload(); }
    });
    try { // 1.2.1: 토글 복구 — 꺼진 상태에서도 같은 단축키로 재활성
      document.addEventListener('keydown', function (e) {
        if (e.altKey && e.shiftKey && (e.code === 'KeyX' || (e.key || '').toLowerCase() === 'x')) {
          e.preventDefault(); e.stopPropagation();
          gmSet('gwx.enabled', true);
          try { console.info('[GWX] Alt+Shift+X — 다시 켬'); } catch (e2) {}
          try { (window.top || window).location.reload(); } catch (e3) { location.reload(); }
        }
      }, true);
      GM_registerMenuCommand('GWX: 전체 켜기 (새로고침)', function () {
        gmSet('gwx.enabled', true); location.reload();
      });
    } catch (e) {}
    return;
  }
  try {
    if (new URLSearchParams(location.search).get('gwx') === 'off') {
      if (route === 'mail') gwxDeactivatePersistentHooks();
      console.info('[GWX] ?gwx=off — 종료'); return;
    }
  } catch (e) {}
  if (gmGet('gwx.module.' + route, true) === false) {
    if (route === 'mail') gwxDeactivatePersistentHooks();
    try { console.info('[GWX] 모듈 끔(gwx.module.' + route + '=false) — 종료'); } catch (e) {}
    gwxQuietDot(function () {
      gmSet('gwx.module.' + route, true);
      try { (window.top || window).location.reload(); } catch (e) { location.reload(); }
    });
    try {
      GM_registerMenuCommand('GWX: ' + route + ' 모듈 켜기 (새로고침)', function () {
        gmSet('gwx.module.' + route, true); location.reload();
      });
    } catch (e) {}
    return;
  }
  /* 1.3.7: 메일 전용 게이트.
   *  menu.jsp(상단 GNB)와 communication.jsp(커뮤니케이터)는 SelMenu와 무관한
   *  그룹웨어 공통 프레임이므로, 전자결재(Sanc_S) 등 다른 모듈 화면에서도 로드된다.
   *  상위 프레임의 SelMenu가 Mail 계열일 때만 계속 진행한다.
   *  ※ injectAll()/applyTheme()보다 반드시 앞서야 CSS가 남지 않는다.
   *  ※ /wma/* 경로(mail·compose·wpop)는 메일 전용이라 게이트 대상이 아니다. */
  function gwxSelMenu() {
    var out = '';
    [W.top, W.parent, W].forEach(function (TW) {
      if (out || !TW) return;
      try {
        var v = new URLSearchParams(TW.location.search).get('SelMenu');
        if (v) out = String(v);
      } catch (e) {}
    });
    return out;
  }
  if (route === 'gnb' || route === 'comz') {
    var _selMenu = gwxSelMenu();
    if (!/^Mail/i.test(_selMenu)) {
      try {
        console.info('[GWX] 메일 외 화면(SelMenu=' + (_selMenu || '판정 불가') +
          ') — 공통 프레임 스킨 미적용, 원본 유지');
      } catch (e) {}
      return;
    }
  }
  try { document.documentElement.setAttribute('data-gwx', GWX_VER); } catch (e) {}

  /* ---------- 1. 유틸 ---------- */
  var S = {
    get: function (k, d) { return gmGet('gwx.' + k, d); },
    set: function (k, v) { gmSet('gwx.' + k, v); }
  };
  function log() {
    if (!S.get('debug', false)) return;
    try { console.log.apply(console, ['[GWX]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function info() { try { console.info.apply(console, ['[GWX]'].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, ['[GWX]'].concat([].slice.call(arguments))); } catch (e) {} }
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }
  function el(tag, cls) { var d = document.createElement(tag); if (cls) d.className = cls; return d; }
  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ---------- 1b. GWX_SEL — 사이트 결합 지점 단일 테이블 (1.3.8) ----------
   * 그룹웨어가 패치되면 여기 값만 바꾸면 된다. 코드 곳곳에 흩어져 있던
   * 셀렉터·헤더 문구·아이콘 파일명·버튼 라벨을 한곳으로 모았다. */
  var GWX_SEL = {
    list: '#list_content',
    view: '#normal_message_content',
    viewBody: '#mail_view_area',
    folder: '#folder_content',
    rowsAll: '.content_lst_body table tbody tr',
    rowMail: '.content_lst_body table tbody tr[id^="mail_list-"]',
    subjLink: 'td.subj a.tit',
    peerCell: 'td.recTD',
    dateCell: 'td.date',
    statusImg: 'img[id^="wma-icon-"]',
    midInput: 'input[id^="mid-"]',
    checkbox: '.content_lst_body input.inchk',
    searchInput: '.srch_area input[type="text"]',
    composeBtn: '.btn_large_half a.btn_l',
    boldClass: 'td_list_bold',
    hdPeer: /보낸이|보낸사람|발신자|받는이|받는사람|수신자|수신인/,
    hdSubj: /제목/,
    hdDate: /날짜/,
    hdSize: /크기/,
    hdState: /상태/,
    icoUnread: /^r[01][a-z]*\.gif$/,
    icoRead: /^r(?:2|5)[a-z]*\.gif$/,
    btnBack: ['목록'], btnDel: ['삭제'], btnDelHard: ['완전삭제'],
    btnReply: ['답장'], btnFwd: ['전달'], btnDraft: ['임시저장'], btnSend: ['보내기']
  };
  /* 탐지 성공/실패 집계 — 어떤 결합 지점이 끊겼는지 즉시 판별하기 위한 계기판 */
  var GWX_PROBE = {};
  function probe(key, ok) {
    try {
      var p = GWX_PROBE[key] || (GWX_PROBE[key] = { hit: 0, miss: 0, t: 0 });
      if (ok) { p.hit++; p.t = Date.now(); } else p.miss++;
    } catch (e) {}
    return ok;
  }
  function probeReport() {
    var rows = Object.keys(GWX_PROBE).sort().map(function (k) {
      var p = GWX_PROBE[k];
      return { 항목: k, 성공: p.hit, 실패: p.miss,
        상태: p.hit ? (p.miss ? '부분' : '정상') : '탐지 실패' };
    });
    var bad = rows.filter(function (r) { return !GWX_PROBE[r.항목].hit; });
    try {
      console.info('[GWX] 셀렉터 점검 — v' + GWX_VER + ' / route=' + route);
      if (console.table) console.table(rows); else console.info(rows);
    } catch (e) {}
    return { rows: rows, bad: bad.map(function (r) { return r.항목; }) };
  }

  /* ---------- 1c. GWXP — 순수 함수(DOM 비의존) + 자체 점검 (1.3.8) ----------
   * DOM/전역 상태에 의존하지 않아 단독 검증이 가능한 판정 로직만 모은다.
   * 회귀는 대부분 여기서 났으므로, 내장 단위 테스트로 상시 확인한다. */
  var GWXP = (function () {
    var PREFIX_RULES = [
      { re: /^\s*\[\s*(답장|회신)\s*\]\s*/i, t: 're' },
      { re: /^\s*\[\s*전달\s*\]\s*/i, t: 'fw' },
      { re: /^\s*(re|reply|회신)\s*:\s*/i, t: 're' },
      { re: /^\s*(fw|fwd|forward|전달)\s*:\s*/i, t: 'fw' },
      { re: /^\s*\[\s*re\s*\]\s*/i, t: 're' },
      { re: /^\s*\[\s*(fw|fwd)\s*\]\s*/i, t: 'fw' }
    ];
    function parseSubject(raw) {
      var s0 = String(raw || ''), seq = [], g = 0, hit = true, i, m;
      while (hit && g++ < 12) {
        hit = false;
        for (i = 0; i < PREFIX_RULES.length; i++) {
          m = s0.match(PREFIX_RULES[i].re);
          if (m) { seq.push(PREFIX_RULES[i].t); s0 = s0.slice(m[0].length); hit = true; break; }
        }
      }
      // 1.3.8: 자체 점검에서 발견 — 앞쪽 공백만 제거해 꼬리 공백이 남던 문제 수정
      return { clean: s0.replace(/^\s+|\s+$/g, ''), seq: seq };
    }
    // 아이콘 파일명 정규화(경로·쿼리스트링·해시·대소문자 제거)
    function iconFile(src) {
      return String(src || '').split(/[?#]/)[0].split('/').pop().toLowerCase();
    }
    // true=안읽음 / false=읽음 / null=판정 불가(서버 표시를 따름)
    function iconUnreadState(src) {
      var f = iconFile(src);
      if (!f) return null;
      if (GWX_SEL.icoUnread.test(f)) return true;
      if (GWX_SEL.icoRead.test(f)) return false;
      probe('아이콘 코드 미등록:' + f, false);
      return null;
    }
    // 열 폭 배열을 total에 맞춰 재분배하되 각 열 최소 minW 보장
    function tableFitWidths(base, total, minW) {
      var n = base.length;
      if (!n) return [];
      var out = base.map(function (x) { return Math.max(.1, +x || 0); });
      total = Math.max(n * minW, +total || 0);
      var free = total, open = out.map(function (_, i) { return i; }), fixed = {};
      while (open.length) {
        var wsum = gwxReduce(open, function (a, i) { return a + out[i]; }, 0) || open.length;
        var hit = [];
        open.forEach(function (i) {
          var v = free * out[i] / wsum;
          if (v < minW) { fixed[i] = minW; free -= minW; hit.push(i); }
        });
        if (!hit.length) {
          open.forEach(function (i) { fixed[i] = free * out[i] / wsum; });
          break;
        }
        open = open.filter(function (i) { return hit.indexOf(i) < 0; });
        if (free <= 0) { open.forEach(function (i) { fixed[i] = minW; }); break; }
      }
      var arr = out.map(function (_, i) { return Math.max(minW, fixed[i] || minW); });
      var diff = total - gwxReduce(arr, function (a, b) { return a + b; }, 0);
      arr[n - 1] = Math.max(minW, arr[n - 1] + diff);
      return arr;
    }
    function hashHue(x) {
      var h = 0, i; x = String(x || 'x');
      for (i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0;
      return h % 360;
    }
    /* 키 이벤트 → 정규화 문자열. 문자 키는 shift가 이미 문자에 반영되므로
     * (예: Shift+/ → '?') shift 접두어를 붙이지 않는다. */
    function keyString(e) {
      if (!e) return '';
      var k = e.key;
      if (!k || /^(Control|Shift|Alt|Meta|CapsLock|Dead|Process|Unidentified)$/.test(k)) return '';
      if (k === ' ') k = 'Space';
      var single = k.length === 1;
      if (single) k = k.toLowerCase();
      var p = [];
      if (e.ctrlKey) p.push('ctrl');
      if (e.altKey) p.push('alt');
      if (e.shiftKey && !single) p.push('shift');
      if (e.metaKey) p.push('meta');
      p.push(k);
      return p.join('+');
    }
    return {
      parseSubject: parseSubject, iconFile: iconFile, iconUnreadState: iconUnreadState,
      tableFitWidths: tableFitWidths, hashHue: hashHue, keyString: keyString
    };
  })();
  var parseSubject = GWXP.parseSubject;
  var iconFile = GWXP.iconFile;
  var iconUnreadState = GWXP.iconUnreadState;
  var hashHue = GWXP.hashHue;
  var keyString = GWXP.keyString;

  /* 내장 단위 테스트 — 순수 함수 회귀 검증 (설정 허브 / TM 메뉴에서 실행) */
  function gwxSelfTest() {
    var out = [], fail = 0;
    function eq(name, got, want) {
      var ok = gwxStringify(got) === gwxStringify(want);
      if (!ok) fail++;
      out.push((ok ? '  PASS  ' : '  FAIL  ') + name +
        ' → ' + gwxStringify(got) + (ok ? '' : '   (기대: ' + gwxStringify(want) + ')'));
    }
    var U = GWXP.iconUnreadState;
    eq('icon R0.GIF', U('/img/R0.GIF'), true);
    eq('icon R1A.GIF', U('/img/wma/status/R1A.GIF'), true);
    eq('icon R1.gif?v=2', U('/a/b/R1.gif?v=2'), true);
    eq('icon r1.gif#x', U('r1.gif#x'), true);
    eq('icon r2.gif', U('../mail/r2.gif'), false);
    eq('icon r2af.gif', U('r2af.gif'), false);
    eq('icon r5f.gif', U('r5f.gif'), false);
    eq('icon 미등록 r7x.gif', U('r7x.gif'), null);
    eq('icon 빈 값', U(''), null);
    var P = GWXP.parseSubject;
    eq('subject RE:', P('RE: 회의록').seq, ['re']);
    eq('subject 중첩', P('[전달] RE: 회의록').seq, ['fw', 're']);
    eq('subject clean', P('  Fwd: [답장] 보고서 ').clean, '보고서');
    eq('subject 접두어 없음', P('일반 제목'), { clean: '일반 제목', seq: [] });
    var T = GWXP.tableFitWidths;
    eq('table 균등 확대', T([100, 100], 240, 20), [120, 120]);
    eq('table 최소폭 보장', T([5, 200], 100, 20), [20, 80]);
    eq('table 빈 배열', T([], 100, 20), []);
    eq('calm 저장 성공', gwxCalmMsg('저장되었습니다.'), true);
    eq('calm 작업 성공', gwxCalmMsg('요청한 작업이 성공하였습니다.'), true);
    eq('calm 세션 만료', gwxCalmMsg('세션이 만료되었습니다.'), false);
    eq('calm 권한 없음', gwxCalmMsg('권한이 없어 삭제되었습니다.'), false);
    eq('calm 빈 문자열', gwxCalmMsg(''), false);
    var K = GWXP.keyString;
    eq('key j', K({ key: 'j' }), 'j');
    eq('key J(대문자 정규화)', K({ key: 'J' }), 'j');
    eq('key ?', K({ key: '?', shiftKey: true }), '?');
    eq('key Delete', K({ key: 'Delete' }), 'Delete');
    eq('key shift+Enter', K({ key: 'Enter', shiftKey: true }), 'shift+Enter');
    eq('key ctrl+k', K({ key: 'k', ctrlKey: true }), 'ctrl+k');
    eq('key 수정자 단독', K({ key: 'Shift', shiftKey: true }), '');
    var head = '[GWX] 자체 점검 v' + GWX_VER + ' — ' + (out.length - fail) + '/' + out.length +
      ' 통과' + (fail ? ' · 실패 ' + fail + '건' : '');
    try { console.info(head + '\n' + out.join('\n')); } catch (e) {}
    return { total: out.length, fail: fail, lines: out, head: head };
  }
  var _tt;
  function toast(msg) {
    try {
      var t = qs('.gwx-toast');
      if (!t) { t = el('div', 'gwx-toast'); (document.body || document.documentElement).appendChild(t); }
      t.textContent = msg; t.classList.add('on');
      clearTimeout(_tt); _tt = setTimeout(function () { t.classList.remove('on'); }, 2800);
    } catch (e) {}
  }

  /* ---------- 2. 테마 (Sea Glass 라이트 / Ember 다크 / 자동) ---------- */
  function resolvedTheme() {
    var t = S.get('theme', 'auto');
    if (t === 'light' || t === 'dark') return t;
    try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function applyTheme() {
    try {
      document.documentElement.setAttribute('data-gwx-theme', resolvedTheme());
      if (S.get('opt.darkTreeFilter', false)) document.documentElement.setAttribute('data-gwx-treefix', '1');
      else document.documentElement.removeAttribute('data-gwx-treefix');
    } catch (e) {}
  }
  applyTheme();
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (S.get('theme', 'auto') === 'auto') applyTheme();
    });
  } catch (e) {}
  try { GM_addValueChangeListener('gwx.theme', function () { applyTheme(); }); } catch (e) {}

  /* ---------- 3. 아이콘 (data-URI SVG mask, Lucide(MIT) 형태 참고 자체 제작) ---------- */
  function sv(inner, filled) {
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='" +
      (filled ? 'black' : 'none') + "' stroke='" + (filled ? 'none' : 'black') +
      "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + inner + "</svg>";
  }
  var ICONS = {
    compose: sv("<path d='M12 20h9'/><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'/>"),
    reply: sv("<polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/>"),
    forward: sv("<polyline points='15 17 20 12 15 7'/><path d='M4 18v-2a4 4 0 0 1 4-4h12'/>"),
    trash: sv("<polyline points='3 6 5 6 21 6'/><path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'/><path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/>"),
    search: sv("<circle cx='11' cy='11' r='7'/><line x1='21' y1='21' x2='16.2' y2='16.2'/>"),
    refresh: sv("<path d='M21 12a9 9 0 1 1-2.64-6.36'/><polyline points='21 3 21 9 15 9'/>"),
    sliders: sv("<line x1='4' y1='21' x2='4' y2='14'/><line x1='4' y1='10' x2='4' y2='3'/><line x1='12' y1='21' x2='12' y2='12'/><line x1='12' y1='8' x2='12' y2='3'/><line x1='20' y1='21' x2='20' y2='16'/><line x1='20' y1='12' x2='20' y2='3'/><line x1='1' y1='14' x2='7' y2='14'/><line x1='9' y1='8' x2='15' y2='8'/><line x1='17' y1='16' x2='23' y2='16'/>"),
    folder: sv("<path d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'/>"),
    inbox: sv("<polyline points='22 12 16 12 14 15 10 15 8 12 2 12'/><path d='M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'/>"),
    send: sv("<line x1='22' y1='2' x2='11' y2='13'/><path d='M22 2 15 22l-4-9-9-4Z'/>"),
    file: sv("<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/>"),
    clock: sv("<circle cx='12' cy='12' r='9'/><polyline points='12 7 12 12 15.5 14'/>"),
    star: sv("<polygon points='12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26'/>"),
    starfill: sv("<polygon points='12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26'/>", true),
    mail: sv("<rect x='2' y='4' width='20' height='16' rx='2'/><polyline points='22 6 12 13 2 6'/>"),
    mailopen: sv("<path d='M22 10.5V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9.5l10-7 10 7z'/><polyline points='2 10.5 12 17 22 10.5'/>"),
    chevdown: sv("<polyline points='6 9 12 15 18 9'/>"),
    chevleft: sv("<polyline points='15 18 9 12 15 6'/>"),
    chevright: sv("<polyline points='9 18 15 12 9 6'/>"),
    chevsleft: sv("<polyline points='11 17 6 12 11 7'/><polyline points='18 17 13 12 18 7'/>"),
    chevsright: sv("<polyline points='13 17 18 12 13 7'/><polyline points='6 17 11 12 6 7'/>"),
    external: sv("<path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/><polyline points='15 3 21 3 21 9'/><line x1='10' y1='14' x2='21' y2='3'/>"),
    arrowdown: sv("<line x1='12' y1='5' x2='12' y2='19'/><polyline points='19 12 12 19 5 12'/>"),
    arrowup: sv("<line x1='12' y1='19' x2='12' y2='5'/><polyline points='5 12 12 5 19 12'/>"),
    x: sv("<line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>"),
    list: sv("<line x1='8' y1='6' x2='21' y2='6'/><line x1='8' y1='12' x2='21' y2='12'/><line x1='8' y1='18' x2='21' y2='18'/><line x1='3' y1='6' x2='3.01' y2='6'/><line x1='3' y1='12' x2='3.01' y2='12'/><line x1='3' y1='18' x2='3.01' y2='18'/>"),
    columns: sv("<rect x='3' y='3' width='18' height='18' rx='2'/><line x1='12' y1='3' x2='12' y2='21'/>"),
    sun: sv("<circle cx='12' cy='12' r='4'/><line x1='12' y1='2' x2='12' y2='4'/><line x1='12' y1='20' x2='12' y2='22'/><line x1='4.9' y1='4.9' x2='6.3' y2='6.3'/><line x1='17.7' y1='17.7' x2='19.1' y2='19.1'/><line x1='2' y1='12' x2='4' y2='12'/><line x1='20' y1='12' x2='22' y2='12'/><line x1='4.9' y1='19.1' x2='6.3' y2='17.7'/><line x1='17.7' y1='6.3' x2='19.1' y2='4.9'/>"),
    moon: sv("<path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'/>"),
    contrast: sv("<circle cx='12' cy='12' r='9'/><path d='M12 3a9 9 0 0 1 0 18z' fill='black' stroke='none'/>"),
    alert: sv("<circle cx='12' cy='12' r='9'/><line x1='12' y1='7.5' x2='12' y2='12.5'/><line x1='12' y1='16' x2='12.01' y2='16'/>"),
    lock: sv("<rect x='3' y='11' width='18' height='10' rx='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/>"),
    user: sv("<path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/>"),
    image: sv("<rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/>"),
    table: sv("<rect x='3' y='3' width='18' height='18' rx='2'/><line x1='3' y1='9' x2='21' y2='9'/><line x1='3' y1='15' x2='21' y2='15'/><line x1='12' y1='3' x2='12' y2='21'/>"),
    eraser: sv("<path d='M20 20H8L3 15a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l6 6a2 2 0 0 1 0 2.8L14 19'/><line x1='7' y1='10' x2='14' y2='17'/>"),
    tag: sv("<path d='M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z'/><line x1='7' y1='7' x2='7.01' y2='7'/>"),
    snippet: sv("<path d='M4 4h16v12H9l-5 4z'/><line x1='8' y1='9' x2='16' y2='9'/>"),
    group: sv("<circle cx='9' cy='8' r='3.5'/><path d='M2.5 20a6.5 6.5 0 0 1 13 0'/><circle cx='17.5' cy='9.5' r='2.6'/><path d='M15.4 14.6a5.4 5.4 0 0 1 6.1 5.4'/>"),
    plus: sv("<line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/>"),
    printer: sv("<polyline points='6 9 6 3 18 3 18 9'/><path d='M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'/><rect x='6' y='14' width='12' height='7'/>")
  };
  function icon(n) { return '<i class="gwx-i gi-' + n + '"></i>'; }
  function du(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  function chev(color) {
    return du("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='" + color +
      "' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  }
  var iconVars = ':root{';
  for (var ik in ICONS) iconVars += '--gi-' + ik + ':' + du(ICONS[ik]) + ';';
  iconVars += '}';
  var iconCls = '.gwx-i{display:inline-block;width:16px;height:16px;background-color:currentColor;' +
    '-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat;vertical-align:-3px;flex:none}';
  for (var ck in ICONS) iconCls += '.gi-' + ck + '{-webkit-mask-image:var(--gi-' + ck + ');mask-image:var(--gi-' + ck + ')}';

  /* ---------- 4. 디자인 토큰 (라이트 "Sea Glass" / 다크 "Ember") ---------- */
  var TOKENS =
'@media screen{' +
':root{' +
'--gwx-font:"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;' +
'--gwx-mono:"JetBrains Mono","D2Coding",Consolas,monospace;' +
'--gwx-bg:#f4f7f6;--gwx-surface:#fdfefe;--gwx-surface-2:#ecf1f0;' +
'--gwx-border:#e0e7e5;--gwx-border-2:#c8d4d1;--gwx-line-row:#eef2f1;' +
'--gwx-t1:#202826;--gwx-t2:#57655f;--gwx-t3:#93a19b;' +
'--gwx-p:#0e8a7d;--gwx-p-strong:#0b6e64;--gwx-p-weak:#a9d6cf;' +
'--gwx-p-tint:rgba(14,138,125,.11);--gwx-p-tint2:rgba(14,138,125,.055);--gwx-on-p:#ffffff;' +
'--gwx-focus:0 0 0 3px rgba(14,138,125,.20);' +
'--gwx-danger:#c23a4d;--gwx-danger-tint:rgba(194,58,77,.09);--gwx-warn:#dd6b20;' +
'--gwx-flag:#dfa32e;--gwx-glass:rgba(252,254,253,.78);' +
'--gwx-sh-1:0 1px 2px rgba(32,40,38,.06);--gwx-sh-2:0 8px 22px rgba(32,40,38,.12);' +
'--b-re-fg:#0369a1;--b-re-bg:#e7f3fa;--b-fw-fg:#b6246f;--b-fw-bg:#fceaf3;' +
'--b-to-fg:#178043;--b-to-bg:#eaf7ef;--b-cc-fg:#a16207;--b-cc-bg:#fbf3df;' +
'--b-etc-fg:#5b6772;--b-etc-bg:#eef1f3;--b-urg-fg:#d92f2f;--b-urg-bg:#fdecec;' +
'--gwx-chev:' + chev('#7b8188') + ';' +
'}' +
'html[data-gwx-theme="dark"]{' +
'--gwx-bg:#161514;--gwx-surface:#1e1d1b;--gwx-surface-2:#262421;' +
'--gwx-border:#35322b;--gwx-border-2:#4a463c;--gwx-line-row:#2a2822;' +
'--gwx-t1:#eae7df;--gwx-t2:#b3aea1;--gwx-t3:#7d796d;' +
'--gwx-p:#f2b23e;--gwx-p-strong:#f6c765;--gwx-p-weak:rgba(242,178,62,.45);' +
'--gwx-p-tint:rgba(242,178,62,.16);--gwx-p-tint2:rgba(242,178,62,.08);--gwx-on-p:#241b07;' +
'--gwx-focus:0 0 0 3px rgba(242,178,62,.28);' +
'--gwx-danger:#ff6f66;--gwx-danger-tint:rgba(255,111,102,.13);--gwx-warn:#ff9558;' +
'--gwx-flag:#f2b23e;--gwx-glass:rgba(30,29,27,.74);' +
'--gwx-sh-1:0 1px 2px rgba(0,0,0,.45);--gwx-sh-2:0 10px 26px rgba(0,0,0,.55);' +
'--b-re-fg:#79c0f2;--b-re-bg:rgba(56,139,253,.16);--b-fw-fg:#f18ac0;--b-fw-bg:rgba(236,72,153,.17);' +
'--b-to-fg:#74dfa2;--b-to-bg:rgba(34,197,94,.15);--b-cc-fg:#e2c069;--b-cc-bg:rgba(202,138,4,.17);' +
'--b-etc-fg:#a9b2ba;--b-etc-bg:rgba(148,163,184,.15);--b-urg-fg:#ff8177;--b-urg-bg:rgba(248,81,73,.17);' +
'--gwx-chev:' + chev('#948e7d') + ';' +
'}' +
'html[data-gwx-theme="dark"]{color-scheme:dark}' +
'html[data-gwx-theme="light"]{color-scheme:light}' +
'}';

  /* ---------- 5. 공통 컴포넌트 CSS ---------- */
  var BASE_CSS =
'@media screen{' +
iconCls +
'.gwx-badge{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 8px;border-radius:999px;' +
'font:500 11px/18px var(--gwx-font);white-space:nowrap;vertical-align:2px;color:var(--b-fg,var(--b-etc-fg));background:var(--b-bg,var(--b-etc-bg))}' +
'.gwx-badge .gwx-i{width:11px;height:11px;vertical-align:-1px}' +
'.gwx-badge.b-re{--b-fg:var(--b-re-fg);--b-bg:var(--b-re-bg)}' +
'.gwx-badge.b-fw{--b-fg:var(--b-fw-fg);--b-bg:var(--b-fw-bg)}' +
'.gwx-badge.b-to{--b-fg:var(--b-to-fg);--b-bg:var(--b-to-bg)}' +
'.gwx-badge.b-cc{--b-fg:var(--b-cc-fg);--b-bg:var(--b-cc-bg)}' +
'.gwx-badge.b-etc,.gwx-badge.b-sent{--b-fg:var(--b-etc-fg);--b-bg:var(--b-etc-bg)}' +
'.gwx-badge.b-urgent{--b-fg:var(--b-urg-fg);--b-bg:var(--b-urg-bg)}' +
'.gwx-rc{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;' +
'font:700 10px/1 var(--gwx-font);margin-right:6px;vertical-align:1px}' +
'.gwx-rc.rc-to{color:var(--b-to-fg);background:var(--b-to-bg)}' +
'.gwx-rc.rc-cc{color:var(--b-cc-fg);background:var(--b-cc-bg)}' +
'.gwx-me{background:var(--gwx-p-tint)!important;color:var(--gwx-p-strong)!important;border-radius:999px;' +
'padding:1px 8px!important;font-weight:600!important;text-decoration:none!important}' +
'mark.gwx-kw{background:var(--b-cc-bg);color:var(--b-cc-fg);border-radius:3px;padding:0 2px;font-weight:600}' +
'.gwx-ldots{display:inline-flex;gap:3px;margin-right:6px;vertical-align:1px}' +
'.gwx-ldots i{width:8px;height:8px;border-radius:50%;background:var(--lc,#999);flex:none}' +
'.gwx-th{display:inline-flex;align-items:center;height:16px;padding:0 6px;margin-left:6px;border-radius:999px;' +
'font:600 10px/16px var(--gwx-font);color:var(--gwx-t3);background:var(--gwx-surface-2);cursor:default}' +
'tr.gwx-th-hl td{background:var(--gwx-p-tint2)!important}' +
'.gwx-avatar{position:relative;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;' +
'overflow:hidden;vertical-align:middle;margin-right:9px;flex:none;color:#fff;font:600 12px/1 var(--gwx-font)}' +
'.gwx-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
'.gwx-st{position:relative;display:inline-block;width:16px;height:16px;vertical-align:middle}' +
'.gwx-st>img{opacity:0;width:16px!important;height:16px!important;cursor:pointer;display:block}' +
'.gwx-st::after{content:"";position:absolute;inset:1px;pointer-events:none;background:var(--st-c,var(--gwx-t3));' +
'-webkit-mask:var(--st-i,var(--gi-mail)) center/contain no-repeat;mask:var(--st-i,var(--gi-mail)) center/contain no-repeat}' +
'.gwx-st.raw>img{opacity:1}.gwx-st.raw::after{display:none}' +
'.gwx-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--gwx-border);' +
'border-radius:6px;background:var(--gwx-surface);color:var(--gwx-t2);font:500 13px var(--gwx-font);cursor:pointer;' +
'transition:background-color .12s ease,border-color .12s ease,color .12s ease}' +
'.gwx-btn:hover{background:var(--gwx-surface-2);border-color:var(--gwx-border-2);color:var(--gwx-t1)}' +
'.gwx-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,8px);opacity:0;background:var(--gwx-t1);' +
'color:var(--gwx-surface);padding:9px 16px;border-radius:8px;font:500 13px var(--gwx-font);z-index:9990;' +
'transition:opacity .18s,transform .18s;pointer-events:none;max-width:70%}' +
'.gwx-toast.on{opacity:.96;transform:translate(-50%,0)}' +
'.gwx-pop{position:fixed;z-index:10050;background:var(--gwx-surface);border:1px solid var(--gwx-border);' +
'border-radius:10px;box-shadow:var(--gwx-sh-2);padding:10px;font-family:var(--gwx-font)}' +
'.gwx-pop .gwx-pt{font:600 12px var(--gwx-font);color:var(--gwx-t3);margin:0 0 7px}' +
'.gwx-swatches{display:grid;grid-template-columns:repeat(8,18px);gap:5px}' +
'.gwx-sw{width:18px;height:18px;border-radius:4px;border:1px solid rgba(0,0,0,.18);cursor:pointer;display:block}' +
'.gwx-sw:hover{outline:2px solid var(--gwx-p)}' +
'.gwx-sw.none{background:linear-gradient(135deg,#fff 44%,#e5484d 47%,#e5484d 53%,#fff 56%)}' +
'.gwx-cinp{margin-top:7px;width:100%;height:24px;border:0;background:none;cursor:pointer;padding:0}' +
'.gwx-grid{display:grid;grid-template-columns:repeat(8,16px);gap:3px}' +
'.gwx-gc{width:16px;height:16px;border:1px solid var(--gwx-border-2);border-radius:3px;background:var(--gwx-surface);cursor:pointer}' +
'.gwx-gc.on{background:var(--gwx-p-tint);border-color:var(--gwx-p)}' +
'.gwx-grid-lab{margin-top:6px;font:500 12px var(--gwx-font);color:var(--gwx-t2);text-align:center}' +
'.gwx-plist{min-width:190px;max-width:280px}' +
'.gwx-plist .row{display:flex;align-items:center;gap:7px;padding:5px 4px;border-radius:6px;cursor:pointer;font:500 13px var(--gwx-font);color:var(--gwx-t2)}' +
'.gwx-plist .row:hover{background:var(--gwx-surface-2);color:var(--gwx-t1)}' +
'.gwx-plist .row i.dot{width:10px;height:10px;border-radius:50%;flex:none}' +
'.gwx-plist .row .del{margin-left:auto;color:var(--gwx-t3);width:18px;text-align:center;border-radius:4px}' +
'.gwx-plist .row .del:hover{color:var(--gwx-danger);background:var(--gwx-danger-tint)}' +
'.gwx-plist .add{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--gwx-border)}' +
'.gwx-plist .add input[type=text]{flex:1;height:26px;border:1px solid var(--gwx-border-2);border-radius:6px;' +
'padding:0 8px;font:12px var(--gwx-font);background:var(--gwx-surface);color:var(--gwx-t1)}' +
'@media (prefers-reduced-motion:reduce){[class*="gwx-"]{transition:none!important}}' +
'}' +
'@media print{.gwx-tabs,.gwx-clayer,.gwx-themerow,.gwx-toast,.gwx-pop,.gwx-fmtbar,.gwx-ldots,.gwx-th{display:none!important}}';

  function addStyle(css) {
    try { GM_addStyle(css); }
    catch (e) {
      try { var s = el('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); } catch (e2) {}
    }
  }
  function injectFont() {
    if (S.get('opt.webfont', true) === false) return;
    try {
      var l = el('link'); l.rel = 'stylesheet';
      l.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
      (document.head || document.documentElement).appendChild(l);
    } catch (e) {}
  }

  /* ---------- 6. 라우트별 CSS ---------- */
  var CSS_MAIL =
'@media screen{' +
/* 서체 스코프 (G1: 본문 제외) */
'#folder_content,#folder_content *,#list_content,#list_content *,' +
'#normal_message_content .title_area,#normal_message_content .title_area *,' +
'#normal_message_content .btn_area,#normal_message_content .btn_area *,' +
'#normal_message_content .view_subj_box,#normal_message_content .view_subj_box *,' +
'.gwx-tabs,.gwx-tabs *,.gwx-clayer,.gwx-clayer *{font-family:var(--gwx-font)!important}' +
/* G1: 메일 본문 자손의 원문 CSS는 건드리지 않는다. 컨테이너만 여백/표면 처리한다. */
'#mail_view_area{font-family:revert!important;font-size:revert!important}' +
'html,body{background:var(--gwx-bg)!important}' +
'#list_content,#normal_message_content{background:var(--gwx-surface)!important}' +
'#main_content input[type=checkbox]{accent-color:var(--gwx-p);width:15px;height:15px}' +
'#main_content ::-webkit-scrollbar{width:10px;height:10px}' +
'#main_content ::-webkit-scrollbar-thumb{background:var(--gwx-border-2);border-radius:8px;border:2px solid transparent;background-clip:content-box}' +
'#main_content ::-webkit-scrollbar-track{background:transparent}' +

/* ── S1 사이드바 ── */
'.left_menu{background:var(--gwx-bg)!important;border-right:1px solid var(--gwx-border)!important;padding-top:16px!important}' +
'.btn_large_half a.btn_l,.btn_large_half a.btn_r{background-image:none!important;display:inline-flex;' +
'align-items:center;justify-content:center;gap:7px;height:38px;font:600 13px var(--gwx-font)!important;' +
'transition:background-color .12s ease}' +
'.btn_large_half a.btn_l{background-color:var(--gwx-p)!important;color:var(--gwx-on-p)!important;border-radius:9px 0 0 9px}' +
'.btn_large_half a.btn_l:hover{background-color:var(--gwx-p-strong)!important;color:var(--gwx-on-p)!important;text-decoration:none!important}' +
'.btn_large_half a.btn_l::before{content:"";width:15px;height:15px;background:currentColor;' +
'-webkit-mask:var(--gi-compose) center/contain no-repeat;mask:var(--gi-compose) center/contain no-repeat}' +
'.btn_large_half a.btn_r{background-color:var(--gwx-p-tint)!important;color:var(--gwx-p-strong)!important;' +
'border:1px solid var(--gwx-p-weak);border-left:0;border-radius:0 9px 9px 0;box-sizing:border-box}' +
'.btn_large_half a.btn_r:hover{background-color:var(--gwx-p-tint)!important;filter:brightness(.97);text-decoration:none!important}' +
'ul.quickbtn_area{background:none!important;width:auto!important;height:auto!important;' +
'display:flex!important;gap:6px;justify-content:center;padding:10px 10px 8px!important;margin:0!important}' +
'ul.quickbtn_area li{float:none!important;width:auto!important;height:auto!important;background:none!important}' +
'ul.quickbtn_area li a{display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:4px;' +
'width:44px;height:46px;background:none!important;border-radius:8px;font-size:0!important;color:var(--gwx-t3);text-indent:0!important}' +
'ul.quickbtn_area li a:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1);text-decoration:none!important}' +
'ul.quickbtn_area li a::before{content:"";width:18px;height:18px;background:currentColor;' +
'-webkit-mask:var(--qi,var(--gi-mail)) center/contain no-repeat;mask:var(--qi,var(--gi-mail)) center/contain no-repeat}' +
'ul.quickbtn_area li a::after{font:500 10px/1 var(--gwx-font);content:var(--ql,"")}' +
'ul.quickbtn_area li.btn_noread a{--qi:var(--gi-mail);--ql:"안읽음"}' +
'ul.quickbtn_area li.btn_imprt a{--qi:var(--gi-star);--ql:"중요"}' +
'ul.quickbtn_area li.btn_emgcy a{--qi:var(--gi-alert);--ql:"긴급"}' +
'ul.quickbtn_area li.btn_scrty a{--qi:var(--gi-lock);--ql:"보안"}' +
'.snb_lst{padding:4px 0!important}' +
'.snb_lst li{height:auto!important}' +
'.snb_lst li a{width:auto!important;box-sizing:border-box;display:block;margin:1px 8px;height:34px!important;' +
'line-height:34px!important;padding:0 12px 0 36px!important;border-radius:7px;font:500 13px var(--gwx-font)!important;' +
'color:var(--gwx-t2)!important;position:relative;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
'.snb_lst li a:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1)!important;text-decoration:none!important}' +
'.snb_lst li a.slct,.snb_lst li a.slct:hover{background:var(--gwx-p-tint)!important;color:var(--gwx-p-strong)!important;font-weight:600!important}' +
'.snb_lst li a::before{content:"";position:absolute;left:12px;top:50%;width:16px;height:16px;margin-top:-8px;' +
'background:currentColor;opacity:.72;-webkit-mask:var(--fi,var(--gi-folder)) center/contain no-repeat;' +
'mask:var(--fi,var(--gi-folder)) center/contain no-repeat}' +
'li.snb_rcv a{--fi:var(--gi-inbox)}li.snb_slf a{--fi:var(--gi-user)}li.snb_snd a{--fi:var(--gi-send)}' +
'li.snb_tmp a{--fi:var(--gi-file)}li.snb_rsrv a{--fi:var(--gi-clock)}li.snb_trsh a{--fi:var(--gi-trash)}' +
'li.snb_oldMail a{--fi:var(--gi-mail)}' +
'a.btn_trshbx_dl{font:500 11px var(--gwx-font)!important;color:var(--gwx-t3)!important;border:1px solid var(--gwx-border);' +
'border-radius:5px;padding:1px 7px;background:var(--gwx-surface)!important}' +
'a.btn_trshbx_dl:hover{color:var(--gwx-danger)!important;border-color:var(--gwx-danger);background:var(--gwx-danger-tint)!important;text-decoration:none!important}' +
'.tree_area .tree_ttl{font:600 12px var(--gwx-font)!important;color:var(--gwx-t3)!important}' +
'#tree_contents_area,#tree_contents_area *{font-size:13px!important;color:var(--gwx-t2)}' +
'html[data-gwx-theme="dark"][data-gwx-treefix] .tree_area img,' +
'html[data-gwx-theme="dark"][data-gwx-treefix] #tree_contents_area img{filter:invert(.86) hue-rotate(180deg) saturate(.35)}' +
'.info_area{background:var(--gwx-surface-2)!important;border-top:1px solid var(--gwx-border)!important}' +
'.info_area li.config{border-right:1px solid var(--gwx-border)!important}' +
'.info_area li.config a span{background-color:var(--gwx-t2)!important;background-image:none!important;' +
'-webkit-mask:var(--gi-sliders) center/contain no-repeat;mask:var(--gi-sliders) center/contain no-repeat}' +
'.info_area li.config a:hover{background-color:var(--gwx-surface)!important}' +
'.info_area li.cpcty_area .cpcty_grp span:first-child{color:var(--gwx-p-strong)!important}' +
'.info_area li.cpcty_area .cpcty_grp span{color:var(--gwx-t2)!important}' +
'li#quotatable[data-gwx] img{display:none!important}' +
'.gwx-quota{width:156px;height:6px;border-radius:999px;background:var(--gwx-p-tint);overflow:hidden;margin-bottom:5px}' +
'.gwx-quota i{display:block;height:100%;border-radius:999px;background:var(--gwx-p)}' +
'.gwx-quota.warn i{background:var(--gwx-warn)}.gwx-quota.crit i{background:var(--gwx-danger)}' +
'.gwx-themerow{margin:12px 12px 64px;display:flex}' +
'.gwx-themerow .gwx-btn{width:100%;justify-content:center;background:var(--gwx-surface)}' +

/* ── S2 목록 상단 ── */
'#main_content .title_area{background:var(--gwx-surface-2)!important;border-bottom:1px solid var(--gwx-border)!important;position:relative}' +
'#main_content .title_area .title,#main_content .title_area .title font{font:700 16px/1.3 var(--gwx-font)!important;color:var(--gwx-t1)!important}' +
'#main_content .title_area .title span{font-size:11px!important;color:var(--gwx-t3)!important}' +
'.btn_flip_left,.btn_flip_right{background:none!important}' +
'.btn_flip_left a,.btn_flip_right a{background:none!important;display:block;width:24px;height:24px;border-radius:6px;position:relative}' +
'.btn_flip_left a:hover,.btn_flip_right a:hover{background:var(--gwx-surface)!important}' +
'.btn_flip_left a::after,.btn_flip_right a::after{content:"";position:absolute;inset:4px;background:var(--gwx-t3);' +
'-webkit-mask:var(--fl) center/contain no-repeat;mask:var(--fl) center/contain no-repeat}' +
'.btn_flip_left a::after{--fl:var(--gi-chevleft)}.btn_flip_right a::after{--fl:var(--gi-chevright)}' +
'.srch_area fieldset.search{position:relative}' +
'.srch_area fieldset.search::before{content:"";position:absolute;left:9px;top:50%;margin-top:-8px;width:16px;height:16px;' +
'background:var(--gwx-t3);-webkit-mask:var(--gi-search) center/contain no-repeat;mask:var(--gi-search) center/contain no-repeat;z-index:1}' +
'.srch_area input[type="text"]{height:30px!important;line-height:28px!important;border:1px solid var(--gwx-border-2)!important;' +
'border-radius:7px!important;background:var(--gwx-surface)!important;color:var(--gwx-t1)!important;padding:0 8px 0 32px!important}' +
'.srch_area input[type="text"]:focus{border-color:var(--gwx-p)!important;box-shadow:var(--gwx-focus);outline:none}' +
'.srch_area .srch_btn{width:30px!important;height:30px!important;border:1px solid var(--gwx-border)!important;' +
'border-radius:7px!important;background:var(--gwx-surface)!important;margin-left:6px!important;position:relative;text-indent:-9999px!important}' +
'.srch_area .srch_btn:hover{background:var(--gwx-surface-2)!important}' +
'.srch_area .srch_btn::after{content:"";position:absolute;inset:6px;background:var(--gwx-t2);' +
'-webkit-mask:var(--gi-search) center/contain no-repeat;mask:var(--gi-search) center/contain no-repeat}' +
'.detail_srch_wrap{background:var(--gwx-surface)!important;border:1px solid var(--gwx-border)!important;' +
'box-shadow:var(--gwx-sh-2);border-radius:0 0 12px 12px}' +
'.detail_srch,.detail_srch th,.detail_srch td{color:var(--gwx-t2)!important;font-size:12.5px!important}' +
'.detail_srch input[type="text"]{height:26px!important;border:1px solid var(--gwx-border-2)!important;border-radius:5px!important;' +
'background:var(--gwx-surface)!important;color:var(--gwx-t1)!important;padding:0 8px!important}' +
'#main_content .btn_area{background:var(--gwx-surface)!important;border-bottom:1px solid var(--gwx-border)!important;padding:10px 18px!important}' +
'#main_content .btn_area .btns li{margin-left:6px!important}' +
'#main_content .btn_area .btns li:first-child{margin-left:0!important}' +
'#main_content .btn_area .btns span{background:none!important;padding:0!important;height:auto!important}' +
'#main_content .btn_area .btns span a{background:none!important;height:30px!important;line-height:28px!important;' +
'box-sizing:border-box;padding:0 12px!important;border:1px solid var(--gwx-border);border-radius:7px;' +
'color:var(--gwx-t2)!important;font:500 13px/28px var(--gwx-font)!important;display:inline-block;' +
'transition:background-color .12s ease,border-color .12s ease,color .12s ease}' +
'#main_content .btn_area .btns span a:hover{background:var(--gwx-surface-2)!important;border-color:var(--gwx-border-2);' +
'color:var(--gwx-t1)!important;text-decoration:none!important}' +
'#main_content .btn_area a[title="삭제"]:hover,#main_content .btn_area a[title="완전삭제"]:hover{' +
'color:var(--gwx-danger)!important;border-color:var(--gwx-danger)!important;background:var(--gwx-danger-tint)!important}' +
'#main_content .btn_area a.gwx-primary{background:var(--gwx-p)!important;border-color:var(--gwx-p)!important;' +
'color:var(--gwx-on-p)!important;font-weight:600!important}' +
'#main_content .btn_area a.gwx-primary:hover{background:var(--gwx-p-strong)!important;border-color:var(--gwx-p-strong)!important;color:var(--gwx-on-p)!important}' +
'#main_content select{appearance:none;-webkit-appearance:none;height:30px!important;padding:0 26px 0 10px!important;' +
'border:1px solid var(--gwx-border-2)!important;border-radius:7px!important;color:var(--gwx-t2)!important;' +
'font:500 12.5px var(--gwx-font)!important;background:var(--gwx-surface) var(--gwx-chev) no-repeat right 8px center/12px!important}' +
'p.btn_rfrsh,p.btn_lst_cmmn,p.btn_lst_hrz{width:30px!important;height:30px!important;background:none!important;' +
'border:1px solid var(--gwx-border);border-radius:7px;position:relative;margin-left:6px!important;box-sizing:border-box}' +
'p.btn_rfrsh a,p.btn_lst_cmmn a,p.btn_lst_hrz a{display:block;width:100%;height:100%;background:none!important;text-indent:-9999px!important}' +
'p.btn_rfrsh::after,p.btn_lst_cmmn::after,p.btn_lst_hrz::after{content:"";position:absolute;inset:6px;background:var(--gwx-t2);' +
'pointer-events:none;-webkit-mask:var(--bi) center/contain no-repeat;mask:var(--bi) center/contain no-repeat}' +
'p.btn_rfrsh{--bi:var(--gi-refresh)}p.btn_lst_cmmn{--bi:var(--gi-list)}p.btn_lst_hrz{--bi:var(--gi-columns)}' +
'p.btn_rfrsh:hover,p.btn_lst_cmmn:hover,p.btn_lst_hrz:hover{background:var(--gwx-surface-2)!important}' +
'p.btn_lst_cmmn.on,p.btn_lst_hrz.on{border-color:var(--gwx-p);background:var(--gwx-p-tint)!important}' +
'p.btn_lst_cmmn.on::after,p.btn_lst_hrz.on::after{background:var(--gwx-p)}' +
'#main_content .layer_pop{background:var(--gwx-glass)!important;-webkit-backdrop-filter:blur(12px) saturate(1.25);' +
'backdrop-filter:blur(12px) saturate(1.25);border:1px solid var(--gwx-border)!important;border-radius:10px!important;' +
'box-shadow:var(--gwx-sh-2)!important;overflow:hidden;padding:4px 0}' +
'#main_content .layer_pop li a{display:block;padding:7px 14px!important;font:500 13px var(--gwx-font)!important;color:var(--gwx-t2)!important}' +
'#main_content .layer_pop li a:hover{background:var(--gwx-p-tint)!important;color:var(--gwx-p-strong)!important;text-decoration:none!important}' +

/* ── S3 목록 ── */
'.content_lst_head table thead th{height:30px!important;background:var(--gwx-surface)!important;border-left:0!important;' +
'border-bottom:1px solid var(--gwx-border)!important;font:600 12px var(--gwx-font)!important;color:var(--gwx-t3)!important}' +
'.content_lst_head table thead th a{color:var(--gwx-t3)!important}' +
'.content_lst_head table thead th a:hover{color:var(--gwx-t1)!important;text-decoration:none!important}' +
'.content_lst_body table tbody td{height:44px!important;border-bottom:1px solid var(--gwx-line-row)!important;color:var(--gwx-t2)!important}' +
'.content_lst table tbody tr:hover{background:var(--gwx-surface-2)!important}' +
'.content_lst.content_lst_body table tbody tr.email_chk_on td{background:var(--gwx-p-tint)!important}' +
'.content_lst_body td.recTD,.content_lst_body td.recTD a{color:var(--gwx-t1)!important;font-size:13px!important}' +
'.content_lst table tbody .subj a.tit{color:var(--gwx-t1)!important;font-size:13.5px!important}' +
'.content_lst table tbody .subj a.tit:hover{text-decoration:none!important;color:var(--gwx-p-strong)!important}' +
'.content_lst_body table tbody tr .date{color:var(--gwx-t3)!important;font-size:12px!important}' +
'.content_lst_body table tbody tr .hit{color:var(--gwx-t3)!important;font:12px var(--gwx-mono)!important}' +
'td.subj a.pop,.view_subj a.pop{background:none!important;width:14px!important;height:14px!important;' +
'position:relative;opacity:0;transition:opacity .12s;vertical-align:middle}' +
'tr:hover td.subj a.pop,.view_subj:hover a.pop{opacity:.55}' +
'td.subj a.pop:hover,.view_subj a.pop:hover{opacity:1}' +
'td.subj a.pop::after,.view_subj a.pop::after{content:"";position:absolute;inset:0;background:var(--gwx-t2);' +
'-webkit-mask:var(--gi-external) center/contain no-repeat;mask:var(--gi-external) center/contain no-repeat}' +
'tr.td_list_bold td:first-child,td.td_list_bold:first-child,tr[data-gwx-unread="1"] td:first-child{' +
'box-shadow:inset 3px 0 0 var(--gwx-p)}' +
'tr[data-gwx-unread="1"] .subj a.tit,tr.td_list_bold .subj a.tit{font-weight:600!important;color:var(--gwx-t1)!important}' +
'tr[data-gwx-unread="1"] td.recTD a{font-weight:600!important}' +
'.paginate_box{border-top:1px solid var(--gwx-border)!important}' +
'.paginate_box .paginate a{border-radius:6px;color:var(--gwx-t2)!important}' +
'.paginate_box .paginate a:hover{background:var(--gwx-surface-2);text-decoration:none!important}' +
'.paginate_box .paginate a.on:not(.first):not(.prev):not(.next):not(.last){background:var(--gwx-p)!important;' +
'color:var(--gwx-on-p)!important;border:none!important;font-weight:600}' +
'.paginate_box .paginate a.first,.paginate_box .paginate a.prev,.paginate_box .paginate a.next,.paginate_box .paginate a.last{' +
'background-image:none!important;position:relative;text-indent:-9999px!important}' +
'.paginate_box .paginate a.first::after,.paginate_box .paginate a.prev::after,' +
'.paginate_box .paginate a.next::after,.paginate_box .paginate a.last::after{content:"";position:absolute;inset:5px;' +
'background:var(--gwx-t3);opacity:.4;-webkit-mask:var(--pgi) center/contain no-repeat;mask:var(--pgi) center/contain no-repeat}' +
'.paginate_box .paginate a.first{--pgi:var(--gi-chevsleft)}.paginate_box .paginate a.prev{--pgi:var(--gi-chevleft)}' +
'.paginate_box .paginate a.next{--pgi:var(--gi-chevright)}.paginate_box .paginate a.last{--pgi:var(--gi-chevsright)}' +
'.paginate_box .paginate a.first.on::after,.paginate_box .paginate a.prev.on::after,' +
'.paginate_box .paginate a.next.on::after,.paginate_box .paginate a.last.on::after{opacity:1;background:var(--gwx-t2)}' +
'.paginate_box .pagi_num input[type="text"]{border:1px solid var(--gwx-border-2)!important;border-radius:5px!important;' +
'background:var(--gwx-surface)!important;color:var(--gwx-t1)!important}' +

/* ── S4 읽기 ── */
'.mail_view_box .view_body_contents .view_subj_box,.view_body_contents .view_subj_box{' +
'background:var(--gwx-surface)!important;background-image:none!important;border-bottom:1px solid var(--gwx-border);padding:22px 28px 18px!important}' +
'.view_body_contents .view_subj{background:none!important;text-indent:0!important;font:700 20px/1.35 var(--gwx-font)!important;' +
'color:var(--gwx-t1)!important;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-right:24px!important;margin-bottom:12px!important}' +
'.view_body_contents .mail_sender{color:var(--gwx-t2)!important}' +
'.view_body_contents .mail_sender dt{width:58px;color:var(--gwx-t3)!important;font:500 12px/1.9 var(--gwx-font)!important}' +
'.view_body_contents .mail_sender dd{font:400 13px/1.85 var(--gwx-font)!important;color:var(--gwx-t2)!important}' +
'.view_body_contents .mail_sender .sender dd a{font-weight:600;color:var(--gwx-t1)!important}' +
'.view_body_contents .mail_sender dd.date{color:var(--gwx-t3)!important;font-size:12px!important}' +
'.view_body_contents .mail_sender dd a[href*="addSenderContact"],' +
'.view_body_contents .mail_sender dd a[href*="Filter"],.view_body_contents .mail_sender dd a[onclick*="Filter"]{' +
'border:1px solid var(--gwx-border);border-radius:999px;padding:1px 9px;font:500 11px var(--gwx-font)!important;' +
'color:var(--gwx-t3)!important;margin-left:6px}' +
'.view_body_contents .mail_sender dd a[href*="addSenderContact"]:hover{color:var(--gwx-p-strong)!important;' +
'border-color:var(--gwx-p);text-decoration:none!important;background:var(--gwx-p-tint)}' +
'.array_sort span{background:none!important}' +
'.array_sort span a{display:block;width:28px;height:28px;border:1px solid var(--gwx-border);border-radius:7px;' +
'background:var(--gwx-surface)!important;text-indent:-9999px!important;position:relative}' +
'.array_sort span a:hover{background:var(--gwx-surface-2)!important}' +
'.array_sort span a::after{content:"";position:absolute;inset:6px;background:var(--gwx-t2);' +
'-webkit-mask:var(--ai,var(--gi-arrowdown)) center/contain no-repeat;mask:var(--ai,var(--gi-arrowdown)) center/contain no-repeat}' +
'.array_sort span.array_up a::after{--ai:var(--gi-arrowup)}' +
'#mail_view_area{padding:30px 40px 26px!important}' +
'html[data-gwx-theme="dark"] #mail_view_area{background:rgba(255,255,255,.05)!important;border-radius:10px;' +
'margin:16px 22px 26px;filter:invert(.92) hue-rotate(180deg)}' +
'html[data-gwx-theme="dark"] #mail_view_area img{filter:invert(1.087) hue-rotate(180deg)}' +
'html[data-gwx-theme="dark"] #normal_message_content .view_body_contents{color:#c8c3b7}' +
'html[data-gwx-theme="dark"] #normal_message_content a[href*="ownload" i],' +
'html[data-gwx-theme="dark"] #normal_message_content a[onclick*="ownload" i],' +
'html[data-gwx-theme="dark"] #normal_message_content a[onclick*="ttach" i]{color:var(--gwx-p-strong)!important}' +
'html[data-gwx-theme="dark"] .view_cont,html[data-gwx-theme="dark"] .inner_box,' +
'html[data-gwx-theme="dark"] .view_body_contents{background:var(--gwx-surface)!important}' +

/* ── F9 탭 스트립 ── */
'.gwx-tabs{position:absolute;left:190px;right:300px;bottom:0;height:35px;display:flex;align-items:flex-end;gap:3px;' +
'overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;z-index:3}' +
'#normal_message_content .gwx-tabs{left:150px;right:96px}' +
'.gwx-tabs::-webkit-scrollbar{height:5px}' +
'.gwx-tab{display:inline-flex;align-items:center;gap:6px;height:33px;max-width:190px;min-width:86px;flex:0 1 auto;' +
'padding:0 8px 0 11px;border:1px solid transparent;border-bottom:none;border-radius:9px 9px 0 0;' +
'font:500 12.5px/1 var(--gwx-font);color:var(--gwx-t2);cursor:pointer;background:transparent;white-space:nowrap;user-select:none}' +
'.gwx-tab:hover{background:var(--gwx-p-tint2);color:var(--gwx-t1)}' +
'.gwx-tab.on{background:var(--gwx-surface);border-color:var(--gwx-border);color:var(--gwx-p-strong);' +
'font-weight:600;box-shadow:inset 0 2px 0 var(--gwx-p)}' +
'.gwx-tab>span{overflow:hidden;text-overflow:ellipsis;min-width:0}' +
'.gwx-tab .gwx-i{width:13px;height:13px;opacity:.78}' +
'.gwx-tclose{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:5px;margin-left:1px}' +
'.gwx-tclose .gwx-i{width:9px;height:9px}' +
'.gwx-tclose:hover{background:var(--gwx-danger-tint);color:var(--gwx-danger)}' +

/* ── F10 인라인 편지쓰기 레이어 ── */
'.gwx-clayer{position:fixed;left:218px;top:0;right:0;bottom:0;z-index:6;display:none;flex-direction:column;background:var(--gwx-bg)}' +
'.gwx-clayer.on{display:flex}' +
'.gwx-clayer-head{position:relative;height:52px;flex:none;display:flex;align-items:center;gap:12px;' +
'padding:0 14px 0 18px;background:var(--gwx-surface-2);border-bottom:1px solid var(--gwx-border)}' +
'.gwx-tabs-slot{flex:1;position:relative;height:35px;align-self:flex-end;min-width:0}' +
'.gwx-tabs-slot .gwx-tabs{position:absolute;left:0;right:0;bottom:0}' +
'.gwx-ch-right{margin-left:auto;display:flex;gap:8px;align-items:center;padding-bottom:2px}' +
'.gwx-clayer-body{flex:1;position:relative}' +
'.gwx-cframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:none;background:#fff}' +
'.gwx-cframe.on{display:block}' +
'}';

  var CSS_COMPOSE =
'@media screen{' +
'body{background:var(--gwx-bg)!important;font-family:var(--gwx-font)}' +
'#sending_page,#sending_page .view_content_box,#sending_page .inner_box,#sending_page .view_body_contents,' +
'#sending_page .pop_container,#sending_page .write_box{background:var(--gwx-bg)!important}' +
'#sending_page .title_area{background:var(--gwx-surface-2)!important;border-bottom:1px solid var(--gwx-border)!important}' +
'#sending_page .title_area h1{font:700 16px var(--gwx-font)!important;color:var(--gwx-t1)!important}' +
'div.btn_area[id="main"]{background:var(--gwx-surface)!important;border-bottom:1px solid var(--gwx-border)!important;padding:10px 16px!important}' +
'#sending_page .btn_area .btns li{margin-left:6px!important}' +
'#sending_page .btn_area .btns li:first-child{margin-left:0!important}' +
'#sending_page .btn_area .btns span{background:none!important;padding:0!important;height:auto!important}' +
'#sending_page .btn_area .btns span a{background:none!important;height:30px!important;line-height:28px!important;' +
'box-sizing:border-box;padding:0 12px!important;border:1px solid var(--gwx-border);border-radius:7px;' +
'color:var(--gwx-t2)!important;font:500 13px/28px var(--gwx-font)!important;display:inline-block;text-decoration:none!important}' +
'#sending_page .btn_area .btns span a:hover{background:var(--gwx-surface-2)!important;border-color:var(--gwx-border-2);color:var(--gwx-t1)!important}' +
'a#menu-send{background:var(--gwx-p)!important;border:1px solid var(--gwx-p)!important;color:var(--gwx-on-p)!important;' +
'font:600 13px/28px var(--gwx-font)!important;border-radius:7px!important;padding:0 16px!important;height:30px!important;' +
'display:inline-block;text-decoration:none!important}' +
'a#menu-send:hover{background:var(--gwx-p-strong)!important;border-color:var(--gwx-p-strong)!important}' +
'#layout_chk_box label{font:500 12.5px var(--gwx-font)!important;color:var(--gwx-t2)!important}' +
'#sending_page input[type=checkbox],#sending_page input[type=radio]{accent-color:var(--gwx-p)}' +
'table#sendtable th{font:600 12px var(--gwx-font)!important;color:var(--gwx-t3)!important;vertical-align:middle}' +
'table#sendtable td{padding:5px 0!important}' +
'#subject{height:34px!important;box-sizing:border-box;border:1px solid var(--gwx-border-2)!important;border-radius:7px!important;' +
'padding:0 10px!important;font:400 14px var(--gwx-font)!important;background:var(--gwx-surface)!important;color:var(--gwx-t1)!important}' +
'#subject:focus{border-color:var(--gwx-p)!important;box-shadow:var(--gwx-focus);outline:none}' +
'ul.token-input-list-facebook{border:1px solid var(--gwx-border-2)!important;border-radius:7px!important;' +
'background:var(--gwx-surface)!important;min-height:32px;padding:3px 6px!important;font-family:var(--gwx-font)!important}' +
'ul.token-input-list-facebook:focus-within{border-color:var(--gwx-p)!important;box-shadow:var(--gwx-focus)}' +
'li.token-input-token-facebook{background:var(--gwx-p-tint)!important;border:1px solid var(--gwx-p-weak)!important;' +
'border-radius:999px!important;height:22px!important;line-height:20px!important;padding:0 9px!important;margin:2px 5px 2px 0!important}' +
'li.token-input-token-facebook p{color:var(--gwx-p-strong)!important;font:500 12px/20px var(--gwx-font)!important;display:inline!important}' +
'li.token-input-token-facebook span{color:var(--gwx-p-strong)!important;margin-left:6px!important;cursor:pointer}' +
'li.token-input-selected-token-facebook{background:var(--gwx-p)!important;border-color:var(--gwx-p)!important}' +
'li.token-input-selected-token-facebook p{color:var(--gwx-on-p)!important}' +
'li.token-input-input-token-facebook input{font:13px var(--gwx-font)!important;background:transparent!important;color:var(--gwx-t1)!important}' +
'div.token-input-dropdown-facebook{border:1px solid var(--gwx-border)!important;border-radius:9px!important;overflow:hidden;' +
'box-shadow:var(--gwx-sh-2)!important;background:var(--gwx-surface)!important;font-family:var(--gwx-font)!important}' +
'div.token-input-dropdown-facebook ul li{color:var(--gwx-t2)!important;font-size:13px!important}' +
'div.token-input-dropdown-facebook ul li.token-input-selected-dropdown-item-facebook{background:var(--gwx-p-tint)!important;color:var(--gwx-p-strong)!important}' +
'#select_signature select,#sending_page select:not(.gwx-fsel){appearance:none;-webkit-appearance:none;height:28px!important;' +
'padding:0 26px 0 10px!important;border:1px solid var(--gwx-border-2)!important;border-radius:7px!important;' +
'color:var(--gwx-t2)!important;font:500 12.5px var(--gwx-font)!important;' +
'background:var(--gwx-surface) var(--gwx-chev) no-repeat right 8px center/12px!important}' +
'.write_file_list,.write_file_list *{font-family:var(--gwx-font)!important;color:var(--gwx-t2)}' +
'#cke_DataFCKeditor.cke_chrome,.cke_chrome{border:1px solid var(--gwx-border)!important;border-radius:10px!important;' +
'overflow:hidden;box-shadow:none!important}' +
'.cke_top{background:#f6f6f4!important;border-bottom:1px solid #e6e6e2!important;padding:5px 6px 3px!important}' +
'html[data-gwx-theme="dark"] .cke_chrome{border-color:#403c31!important}' +
/* GWX 서식바 (CKEditor 크롬 내부·iframe 밖 — 항상 라이트 고정) */
'.gwx-fmtbar{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:5px 3px 3px;width:100%;box-sizing:border-box}' +
'.gwx-fbtn{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border:1px solid #ddddd8;' +
'border-radius:6px;background:#fff;color:#4a4a45;font:500 12px var(--gwx-font);cursor:pointer;box-sizing:border-box}' +
'.gwx-fbtn:hover{background:#f0f0ec;border-color:#c9c9c2;color:#232320}' +
'.gwx-fsel{height:26px;border:1px solid #ddddd8;border-radius:6px;background:#fff;color:#4a4a45;' +
'font:500 12px var(--gwx-font);padding:0 5px;max-width:120px}' +
'.gwx-glyph{font:700 13px/1 var(--gwx-font)}' +
'.gwx-glyph.hl{background:linear-gradient(transparent 55%,#ffe066 55%)}' +
'.gwx-fdiv{width:1px;height:18px;background:#e2e2dc;margin:0 3px;flex:none}' +
'.gwx-ctx{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;min-height:26px}' +
'.gwx-clab{font:600 12px var(--gwx-font);color:#8b8b83;display:inline-flex;align-items:center;gap:4px;margin:0 2px 0 4px}' +
'.gwx-chip{height:24px;padding:0 9px;border:1px solid #ddddd8;border-radius:999px;background:#fff;' +
'font:500 12px var(--gwx-font);color:#4a4a45;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-sizing:border-box}' +
'.gwx-chip:hover{border-color:var(--gwx-p);color:var(--gwx-p-strong)}' +
'.gwx-num{width:62px;height:24px;border:1px solid #ddddd8;border-radius:6px;padding:0 6px;font:12px var(--gwx-font);box-sizing:border-box}' +
'.gwx-rng{width:104px;accent-color:var(--gwx-p);vertical-align:middle}' +
'.gwx-drophint{outline:2px dashed var(--gwx-p);outline-offset:-4px}' +
'.gwx-restore{position:fixed;right:18px;bottom:18px;z-index:9980;background:var(--gwx-surface);border:1px solid var(--gwx-border);' +
'border-radius:12px;box-shadow:var(--gwx-sh-2);padding:12px 14px;max-width:340px;font:13px var(--gwx-font);color:var(--gwx-t2)}' +
'.gwx-restore b{color:var(--gwx-t1)}' +
'.gwx-restore .btns{display:flex;gap:6px;margin-top:9px}' +
'}';

  var CSS_GNB =
'@media screen{' +
'body,#wrap_menu{background:var(--gwx-surface)!important;font-family:var(--gwx-font)}' +
'#header{background:var(--gwx-surface)!important;border-bottom:1px solid var(--gwx-border)}' +
'#normal_menu li a{font:500 13px var(--gwx-font)!important;color:var(--gwx-t2)!important}' +
'#normal_menu li a:hover{color:var(--gwx-t1)!important;text-decoration:none!important}' +
'#normal_menu li.gwx-active{box-shadow:inset 0 -2px 0 var(--gwx-p)}' +
'#normal_menu li.gwx-active a{color:var(--gwx-p-strong)!important;font-weight:700!important}' +
'.menu_more a{color:var(--gwx-t3)!important}' +
'.user_inform p{color:var(--gwx-t2)!important;font-family:var(--gwx-font)!important}' +
'.user_inform p.user_name{color:var(--gwx-t1)!important;font-weight:600}' +
'#img_user_pic{border-radius:50%!important;border:1px solid var(--gwx-border)}' +
'.user_config ul.gnb li a{color:var(--gwx-t3)!important;font-family:var(--gwx-font)!important}' +
'.user_config ul.gnb li a:hover{color:var(--gwx-t1)!important}' +
'}';

  var CSS_COMZ =
'@media screen{' +
'body,#wrap_organ{background:var(--gwx-bg)!important;font-family:var(--gwx-font)}' +
'#communicator{background:var(--gwx-bg)!important}' +
'#search_value{height:28px!important;box-sizing:border-box;border:1px solid var(--gwx-border-2)!important;' +
'border-radius:7px!important;background:var(--gwx-surface)!important;color:var(--gwx-t1)!important;padding:0 9px!important;' +
'font:13px var(--gwx-font)!important}' +
'#search_value:focus{border-color:var(--gwx-p)!important;box-shadow:var(--gwx-focus);outline:none}' +
'#communicator a,#mainOrgTree a{color:var(--gwx-t2)!important;font-family:var(--gwx-font)!important}' +
'#communicator a:hover{color:var(--gwx-t1)!important;text-decoration:none!important}' +
'}';

  /* ---------- 6b. 0.9.2 보정 CSS ---------- */
  var CSS_MAIL_092 =
'@media screen{' +
/* (2) 좌측 폴더 레거시 이미지 아이콘 숨김 — GWX 아이콘과 이중 표기 제거 */
'.snb_lst li a img{display:none!important}' +
/* (2) 지운 편지함 [비우기] 겹침 수정: 행 우측 소형 배치 */
'.snb_lst li{position:relative}' +
'.snb_lst li a.btn_trshbx_dl{display:inline-flex!important;align-items:center;width:auto!important;' +
'height:22px!important;line-height:20px!important;margin:0!important;padding:0 8px!important;' +
'position:absolute;right:12px;top:50%;transform:translateY(-50%);z-index:1;border-radius:5px}' +
'.snb_lst li a.btn_trshbx_dl::before{display:none!important}' +
'li.snb_trsh>a:not(.btn_trshbx_dl){padding-right:72px!important}' +
'#main_content .title_area{min-height:52px}' +
'}';
  var CSS_COMPOSE_092 =
'@media screen{' +
/* (6) 서식바 셀렉트/버튼 라이트 강제 — #sending_page select 일반 규칙보다 우선 */
'select.gwx-fsel{appearance:auto!important;-webkit-appearance:menulist-button!important;' +
'background:#ffffff!important;color:#4a4a45!important;border:1px solid #ddddd8!important;' +
'height:26px!important;padding:0 5px!important;border-radius:6px!important;' +
'font:500 12px var(--gwx-font)!important;max-width:120px}' +
'button.gwx-fbtn{background:#ffffff!important;color:#4a4a45!important;border-color:#ddddd8!important}' +
/* (6.1) GWX가 대체하는 원본 콤보·색상 버튼 숨김 */
'.cke_combo__styles,.cke_combo__format,.cke_combo__font,.cke_combo__fontsize,' +
'.cke_button__textcolor,.cke_button__bgcolor{display:none!important}' +
/* 보내기 프라이머리: id 불일치 대비 텍스트 매칭 클래스 */
'#sending_page .btn_area a.gwx-send,.btn_area a.gwx-send{background:var(--gwx-p)!important;' +
'border-color:var(--gwx-p)!important;color:var(--gwx-on-p)!important;font-weight:600!important}' +
'#sending_page .btn_area a.gwx-send:hover,.btn_area a.gwx-send:hover{background:var(--gwx-p-strong)!important;' +
'border-color:var(--gwx-p-strong)!important}' +
'}';
  var CSS_MAIL_093 =
'@media screen{' +
/* (2) 탭 클릭 보장 */
'.gwx-tabs{z-index:30!important}.gwx-tabs,.gwx-tab,.gwx-tab *,.gwx-tclose{pointer-events:auto!important}' +
/* (3) 프라이머리 버튼: 고스트 규칙(#id .c .c span a) 특이도 상회 */
'#main_content .btn_area .btns span a.gwx-primary,#up_button.btn_area .btns span a.gwx-primary{' +
'background:var(--gwx-p)!important;border-color:var(--gwx-p)!important;color:var(--gwx-on-p)!important;font-weight:600!important}' +
'#main_content .btn_area .btns span a.gwx-primary:hover{background:var(--gwx-p-strong)!important;' +
'border-color:var(--gwx-p-strong)!important;color:var(--gwx-on-p)!important}' +
/* (3) 퀵필터 행 기본 숨김(중복 체감 해소) — 메뉴에서 표시 전환 가능 */
(S.get('opt.quickRow', true) ? '' : 'ul.quickbtn_area{display:none!important}') +
(S.get('opt.oldMail', false) ? '' : 'li.snb_oldMail{display:none!important}') +
'}';
  var CSS_COMPOSE_093 =
'@media screen{' +
/* (3/6) 서식바·칩 CSS 재발행(!important) — 일부 환경에서 원 시트 미적용 증상 대응 */
'.gwx-fmtbar{display:flex!important;flex-wrap:wrap;align-items:center;gap:5px;padding:5px 3px 3px;width:100%;box-sizing:border-box}' +
'.gwx-fbtn{display:inline-flex!important;align-items:center;gap:4px;height:26px!important;padding:0 9px!important;' +
'border:1px solid #ddddd8!important;border-radius:6px!important;background:#fff!important;color:#4a4a45!important;' +
'font:500 12px var(--gwx-font)!important;cursor:pointer;box-sizing:border-box;vertical-align:middle}' +
'.gwx-fbtn:hover{background:#f0f0ec!important;border-color:#c9c9c2!important;color:#232320!important}' +
'.gwx-fdiv{display:inline-block;width:1px;height:18px;background:#e2e2dc;margin:0 3px;flex:none}' +
'.gwx-ctx{display:inline-flex!important;align-items:center;gap:5px;flex-wrap:wrap;min-height:26px}' +
'.gwx-clab{display:inline-flex!important;align-items:center;gap:4px;margin:0 2px 0 4px;' +
'font:600 12px var(--gwx-font)!important;color:#8b8b83!important}' +
'.gwx-chip{display:inline-flex!important;align-items:center;gap:4px;height:24px!important;padding:0 9px!important;' +
'border:1px solid #ddddd8!important;border-radius:999px!important;background:#fff!important;color:#4a4a45!important;' +
'font:500 12px var(--gwx-font)!important;cursor:pointer;box-sizing:border-box;white-space:nowrap}' +
'.gwx-chip:hover{border-color:var(--gwx-p)!important;color:var(--gwx-p-strong)!important}' +
'.gwx-num{width:62px!important;height:24px!important;border:1px solid #ddddd8!important;border-radius:6px!important;' +
'padding:0 6px!important;font:12px var(--gwx-font)!important;background:#fff!important;color:#333!important;box-sizing:border-box}' +
'.gwx-rng{width:104px;accent-color:var(--gwx-p);vertical-align:middle}' +
'.gwx-rgbtn{white-space:nowrap!important;height:24px!important;margin-left:6px!important;vertical-align:middle}' +
/* 보내기 프라이머리 특이도 상회 */
'#sending_page .btn_area .btns span a.gwx-send,.btn_area .btns span a.gwx-send{background:var(--gwx-p)!important;' +
'border-color:var(--gwx-p)!important;color:var(--gwx-on-p)!important;font-weight:600!important}' +
'#sending_page .btn_area .btns span a.gwx-send:hover,.btn_area .btns span a.gwx-send:hover{' +
'background:var(--gwx-p-strong)!important;border-color:var(--gwx-p-strong)!important;color:var(--gwx-on-p)!important}' +
/* 임베드 작성창: 중복 상단 타이틀 제거(탭이 대신함) */
'html.gwx-embedded #sending_page>.title_area{display:none!important}' +
/* 첨부영역 서체 정돈 */
'#attr_tr,#attr_tr td,#attr_tr th,#attr_tr a,#attr_tr span,#attr_tr div{font:500 12px var(--gwx-font)!important}' +
'}';
  var CSS_MAIL_094 =
'@media screen{' +
/* (2) 실측: li 배경 스프라이트가 원본 아이콘 → 제거(이중 아이콘 해소) */
'.snb_lst li,.snb_lst li a{background-image:none!important}' +
/* (2) 실측: 텍스트가 <span id=INBOX> 내부 → flex 수직 중앙 정렬 */
'.snb_lst li a{display:flex!important;align-items:center!important;line-height:normal!important}' +
'.snb_lst li a>span{line-height:1.2!important;display:inline-block;overflow:hidden;text-overflow:ellipsis}' +
/* (9) KRISS 로고 */
'.gwx-logo{padding:2px 14px 10px}' +
'.gwx-logo a{display:inline-flex;align-items:center;gap:8px;text-decoration:none!important}' +
'.gwx-logo img{height:26px;width:auto;display:block}' +
'.gwx-logo b{font:800 17px/1 var(--gwx-font);letter-spacing:.5px;color:var(--gwx-t1)}' +
'.gwx-logo small{font:500 10px/1.2 var(--gwx-font);color:var(--gwx-t3)}' +
/* (10) 실측: span.slt_solo>a("select") = 드롭다운 토글 → 결합형 ▾ 버튼 */
'#main_content .btn_area .btns .slt_btn a{border-top-right-radius:0!important;border-bottom-right-radius:0!important}' +
'#main_content .btn_area .btns .slt_solo a{width:24px!important;min-width:0!important;padding:0!important;' +
'border-top-left-radius:0!important;border-bottom-left-radius:0!important;border-left:0!important;' +
'position:relative;font-size:0!important;color:transparent!important;overflow:hidden}' +
'#main_content .btn_area .btns .slt_solo a::after{content:"";position:absolute;left:5px;right:5px;top:8px;bottom:8px;' +
'background:var(--gwx-t3);-webkit-mask:var(--gi-chevdown) center/contain no-repeat;mask:var(--gi-chevdown) center/contain no-repeat}' +
'#main_content .btn_area .btns .slt_solo a:hover::after{background:var(--gwx-t1)}' +
/* (3) 툴바 flex 정렬 — 줄바꿈 시에도 박스 정합 */
'#main_content .btn_area .btns{display:flex!important;flex-wrap:wrap;gap:6px;align-items:center;row-gap:6px}' +
'#main_content .btn_area .btns li{margin:0!important;float:none!important;display:flex;align-items:center}' +
'#main_content .btn_area .btns li span{display:flex;align-items:center}' +
'#main_content .btn_area select{vertical-align:middle;max-width:140px}' +
'}' +
'@media screen and (max-width:1500px){.gwx-tabs{right:272px}}' +
'@media screen and (max-width:1280px){.gwx-tabs{left:172px;right:240px}.gwx-tab{min-width:70px}}';
  var CSS_COMPOSE_094 =
'@media screen{' +
/* (3/6) 첨부영역 압축·정돈 */
'#attr_tr th,#attr_tr thead td{background:var(--gwx-surface-2)!important;color:var(--gwx-t3)!important;' +
'height:24px!important;font-weight:600!important}' +
'#attr_tr td{padding:2px 6px!important}' +
'#attr_tr a{color:var(--gwx-t2)!important;text-decoration:none!important}' +
'#attr_tr a:hover{color:var(--gwx-p-strong)!important}' +
'}';
  var CSS_MAIL_095 =
'@media screen{' +
/* (1) 사이드바 최종: 실측 재특정 — span 배경 스프라이트/패딩이 원인 */
'.snb_lst li *{background-image:none!important}' +
'.snb_lst li a>span{background:none!important;padding:0!important;margin:0!important;height:auto!important;' +
'line-height:1.25!important;display:inline-block!important;font-size:13px!important;vertical-align:baseline!important}' +
/* (2) 퀵필터: 원본 span 라벨 숨김(GWX 라벨과 2중 표기 해소) */
'ul.quickbtn_area li a>span{display:none!important}' +
/* 개인메일함(트리) 현대화 */
'.tree_ttl_area{display:flex!important;align-items:center;gap:6px;background:none!important;border:0!important;' +
'padding:10px 14px 4px!important;height:auto!important}' +
'.tree_ttl_area .tree_ttl{flex:1;background:none!important;padding:0!important;cursor:pointer}' +
'.tree_ttl_area a.btn_tree_add,.tree_ttl_area a.btn_tree_cnfg{width:22px;height:22px;background:none!important;' +
'border:1px solid var(--gwx-border);border-radius:6px;position:relative;flex:none}' +
'.tree_ttl_area a.btn_tree_add:hover,.tree_ttl_area a.btn_tree_cnfg:hover{background:var(--gwx-surface-2)!important}' +
'.tree_ttl_area a.btn_tree_add::after,.tree_ttl_area a.btn_tree_cnfg::after{content:"";position:absolute;inset:4px;' +
'background:var(--gwx-t3);-webkit-mask:var(--ti) center/contain no-repeat;mask:var(--ti) center/contain no-repeat}' +
'.tree_ttl_area a.btn_tree_add{--ti:var(--gi-plus)}.tree_ttl_area a.btn_tree_cnfg{--ti:var(--gi-sliders)}' +
'.tree_area img,#tree_contents_area img{filter:grayscale(1) opacity(.55)}' +
'#tree_contents_area a{display:inline-block;padding:3px 8px!important;border-radius:6px;' +
'color:var(--gwx-t2)!important;text-decoration:none!important}' +
'#tree_contents_area a:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1)!important}' +
/* (4) 상세검색 현대화 + 공용 입력/버튼(메일설정 1차) */
'.detail_srch_wrap{padding:8px 8px 12px}' +
'.detail_srch th{font:600 12px var(--gwx-font)!important;color:var(--gwx-t3)!important;text-align:left;padding:6px 4px!important;background:none!important}' +
'.detail_srch td{padding:5px 4px!important}' +
'#main_content .basic_inp{height:30px!important;box-sizing:border-box;border:1px solid var(--gwx-border-2)!important;' +
'border-radius:7px!important;background:var(--gwx-surface)!important;color:var(--gwx-t1)!important;' +
'padding:0 10px!important;font:13px var(--gwx-font)!important}' +
'#main_content .basic_inp:focus{border-color:var(--gwx-p)!important;box-shadow:var(--gwx-focus);outline:none}' +
'.detail_srch label{margin-right:10px;color:var(--gwx-t2);font-size:12.5px}' +
'.detail_srch .btn_reset{display:inline-block;height:28px;line-height:26px;box-sizing:border-box;padding:0 12px;' +
'border:1px solid var(--gwx-border);border-radius:7px;background:var(--gwx-surface)!important;' +
'color:var(--gwx-t3)!important;font:500 12px var(--gwx-font)!important;text-decoration:none!important}' +
'.detail_srch .btn_reset:hover{color:var(--gwx-t1)!important;background:var(--gwx-surface-2)!important}' +
'span.btn_sqr{background:none!important;padding:0!important;display:inline-block}' +
'span.btn_sqr a{display:inline-block;background:var(--gwx-p)!important;color:var(--gwx-on-p)!important;' +
'height:32px;line-height:32px;padding:0 18px;border-radius:8px;font:600 13px var(--gwx-font)!important;text-decoration:none!important}' +
'span.btn_sqr a:hover,span.btn_sqr:hover a{background:var(--gwx-p-strong)!important}' +
'.detail_srch .btn_human{display:inline-block;width:28px;height:28px;background:none!important;' +
'border:1px solid var(--gwx-border);border-radius:7px;position:relative;vertical-align:middle;margin-right:4px}' +
'.detail_srch .btn_human::after{content:"";position:absolute;inset:5px;background:var(--gwx-t2);' +
'-webkit-mask:var(--gi-user) center/contain no-repeat;mask:var(--gi-user) center/contain no-repeat}' +
'.detail_srch img.btn_date,.detail_srch .ico_doc img{width:24px;height:24px;padding:3px;box-sizing:border-box;' +
'border:1px solid var(--gwx-border);border-radius:6px;background:var(--gwx-surface)!important;' +
'filter:grayscale(1) opacity(.7);vertical-align:middle}' +
'.detail_srch .datepic_box{display:inline-flex;align-items:center;gap:4px;vertical-align:middle}' +
'.detail_srch .inp_box{display:flex;align-items:center;gap:4px}' +
'}';
  var CSS_WPOP =
'@media screen{' +
'html,body{background:var(--gwx-bg)!important}' +
'body,body *{font-family:var(--gwx-font)!important}' +
'.common_layer_pop .inner_box{background:var(--gwx-surface)!important;border:1px solid var(--gwx-border);' +
'border-radius:12px;box-shadow:var(--gwx-sh-2);overflow:hidden}' +
'.common_layer_pop .tit{display:flex;align-items:center;background:var(--gwx-surface-2)!important;' +
'border-bottom:1px solid var(--gwx-border)!important;padding:12px 16px!important;height:auto!important}' +
'.common_layer_pop .tit b{font:700 15px var(--gwx-font)!important;color:var(--gwx-t1)!important;flex:1}' +
'.common_layer_pop .tit span a{display:inline-flex;width:26px;height:26px;border-radius:7px;position:relative}' +
'.common_layer_pop .tit span a:hover{background:var(--gwx-danger-tint)}' +
'.common_layer_pop .tit span a img{display:none!important}' +
'.common_layer_pop .tit span a::after{content:"";position:absolute;inset:6px;background:var(--gwx-t2);' +
'-webkit-mask:var(--gi-x) center/contain no-repeat;mask:var(--gi-x) center/contain no-repeat}' +
'.common_layer_pop .tit span a:hover::after{background:var(--gwx-danger)}' +
'.cont_pop{padding:14px 16px!important}' +
'.pop_ttl{display:flex;align-items:center;margin:12px 0 8px;background:none!important}' +
'.pop_ttl h2{font:600 13px var(--gwx-font)!important;color:var(--gwx-t3)!important;background:none!important;' +
'padding:0!important;margin:0!important;flex:1}' +
'.pop_ttl .ttl_r label{margin-left:12px;color:var(--gwx-t2);font-size:12.5px}' +
'.cont_pop dl{display:flex;align-items:center;margin:7px 0;background:none!important;border:0!important;padding:0!important}' +
'.cont_pop dt,.cont_pop dt strong{font:500 12px var(--gwx-font)!important;color:var(--gwx-t3)!important;background:none!important}' +
'.cont_pop dd{flex:1}' +
'.basic_inp{height:30px!important;box-sizing:border-box;border:1px solid var(--gwx-border-2)!important;' +
'border-radius:7px!important;background:var(--gwx-surface)!important;color:var(--gwx-t1)!important;' +
'padding:0 10px!important;font:13px var(--gwx-font)!important}' +
'.basic_inp:focus{border-color:var(--gwx-p)!important;box-shadow:var(--gwx-focus);outline:none}' +
'select{appearance:none;-webkit-appearance:none;height:28px!important;padding:0 24px 0 9px!important;' +
'border:1px solid var(--gwx-border-2)!important;border-radius:7px!important;color:var(--gwx-t2)!important;' +
'font:500 12.5px var(--gwx-font)!important;background:var(--gwx-surface) var(--gwx-chev) no-repeat right 7px center/11px!important}' +
'input[type=radio],input[type=checkbox]{accent-color:var(--gwx-p)}' +
'.pop_sclt label{display:inline-flex;align-items:center;gap:6px;margin:4px 14px 4px 0;color:var(--gwx-t2);font-size:13px}' +
'.btn_area{background:var(--gwx-surface)!important;border-top:1px solid var(--gwx-border)!important;' +
'padding:12px 16px!important;text-align:right}' +
'.btn_area .btns{display:inline-flex;gap:8px}' +
'.btn_area .btns li{list-style:none;margin:0!important}' +
'.btn_area .btns span{background:none!important;padding:0!important}' +
'.btn_area .btns a{display:inline-block;background:var(--gwx-surface)!important;border:1px solid var(--gwx-border);' +
'height:30px;line-height:28px;box-sizing:border-box;padding:0 16px!important;border-radius:7px;' +
'color:var(--gwx-t2)!important;font:500 13px/28px var(--gwx-font)!important;text-decoration:none!important}' +
'.btn_area .btns a:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1)!important}' +
'.btn_area .btns li:first-child a{background:var(--gwx-p)!important;border-color:var(--gwx-p)!important;' +
'color:var(--gwx-on-p)!important;font-weight:600!important}' +
'.btn_area .btns li:first-child a:hover{background:var(--gwx-p-strong)!important;border-color:var(--gwx-p-strong)!important}' +
/* (요구4) 발송 결과(wmasm) 리디자인 */
'.svrMsg{display:flex;align-items:center;justify-content:center;min-height:70vh;padding:20px}' +
'.svrMsg .popup{background:var(--gwx-surface)!important;border:1px solid var(--gwx-border)!important;' +
'border-radius:16px!important;box-shadow:var(--gwx-sh-2);padding:38px 56px!important}' +
'.svrMsg .info{display:flex;flex-direction:column;align-items:center;gap:14px;background:none!important}' +
'.svrMsg .info img{display:none!important}' +
'.svrMsg .info::before{content:"";width:54px;height:54px;background:var(--gwx-p);' +
'-webkit-mask:var(--gi-send) center/contain no-repeat;mask:var(--gi-send) center/contain no-repeat}' +
'.svrMsg .info span,.svrMsg .info strong{font:600 15px var(--gwx-font)!important;color:var(--gwx-t1)!important;background:none!important}' +
'}';
  var CSS_MAIL_096 =
'@media screen{' +
/* (7) 쪽 전환 깜빡임 완화: 미가공 상태 GIF 선차단(래핑되면 span>img라 제외됨) */
'.content_lst_body td.input_chk>img{opacity:0}' +
'.content_lst_head a>img[id^="flag-icon"]{opacity:0}' +
/* (6) CI 확대·중앙 정렬 */
'.gwx-logo{display:flex;justify-content:center;padding:8px 0 10px}' +
'.gwx-logo img{height:32px}.gwx-logo b{font-size:19px}' +
/* (3) 상세 버튼 재스킨 */
'.srch_area a.btn_detail_srch{display:inline-flex!important;align-items:center;gap:5px;height:30px!important;' +
'box-sizing:border-box;padding:0 10px!important;margin-left:6px!important;border:1px solid var(--gwx-border)!important;' +
'border-radius:7px!important;background:var(--gwx-surface)!important;color:var(--gwx-t2)!important;' +
'font:500 12.5px var(--gwx-font)!important;text-decoration:none!important;width:auto!important}' +
'.srch_area a.btn_detail_srch:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1)!important}' +
'.srch_area a.btn_detail_srch img,.srch_area a.btn_detail_srch em{display:none!important}' +
'.srch_area a.btn_detail_srch::after{content:"";width:12px;height:12px;background:currentColor;' +
'-webkit-mask:var(--gi-chevdown) center/contain no-repeat;mask:var(--gi-chevdown) center/contain no-repeat}' +
/* (3) 프린트 등 레거시 아이콘 이미지 정돈 */
'#main_content img[src*="print" i]{width:28px!important;height:28px!important;padding:5px;box-sizing:border-box;' +
'border:1px solid var(--gwx-border);border-radius:7px;background:var(--gwx-surface)!important;' +
'filter:grayscale(1) opacity(.75);vertical-align:middle;cursor:pointer}' +
'#main_content img[src*="print" i]:hover{filter:grayscale(1) opacity(1)}' +
'html[data-gwx-theme="dark"] #main_content img[src*="print" i]{filter:grayscale(1) invert(.85) opacity(.85)}' +
/* (4) 상세검색 정밀 보정 */
'.detail_srch_wrap{position:relative;padding-bottom:56px!important;max-width:100%;overflow-x:auto}' +
'.detail_srch_form table{width:auto!important;min-width:620px;max-width:100%}' +
'.detail_srch col{width:auto!important}' +
'.detail_srch th{vertical-align:middle!important;white-space:nowrap;min-width:56px}' +
'.detail_srch td{vertical-align:middle!important}' +
'#main_content .basic_inp{line-height:normal!important}' +
'.detail_srch .input_box{border:0!important;background:none!important;padding:0!important;margin:0!important;' +
'width:auto!important;flex:1;min-width:120px}' +
'.detail_srch .input_box input{width:100%!important}' +
'.detail_srch .inp_box{flex-wrap:wrap;row-gap:4px}' +
'.detail_srch .reset_td{width:0!important;padding:0!important}' +
'.detail_srch .btn_reset{position:absolute;right:104px;bottom:14px;z-index:2}' +
'.detail_srch span.btn_sqr{position:absolute;right:14px;bottom:11px;z-index:2}' +
/* (5) 미리보기 안내 리디자인 */
'.preview_notice{display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:6px;' +
'height:100%;min-height:240px;background:none!important;border:0!important;padding:40px 20px!important;text-align:center}' +
'.preview_notice::before{content:"";width:52px;height:52px;background:var(--gwx-t3);opacity:.5;margin-bottom:6px;' +
'-webkit-mask:var(--gi-mailopen) center/contain no-repeat;mask:var(--gi-mailopen) center/contain no-repeat}' +
'.preview_notice dt{font:600 15px var(--gwx-font)!important;color:var(--gwx-t2)!important;background:none!important}' +
'.preview_notice dt strong{color:var(--gwx-p-strong)!important}' +
'.preview_notice dd{font:13px var(--gwx-font)!important;color:var(--gwx-t3)!important;margin:0!important}' +
'html[data-gwx-theme="dark"] .view_area{background:var(--gwx-surface)!important}' +
'}';
  var CSS_MAIL_097 =
'@media screen{' +
'.gwx-st[data-st="unread"]::after{-webkit-mask:none!important;mask:none!important;inset:4px!important;' +
'background:var(--gwx-p)!important;border-radius:50%;box-shadow:0 0 0 3px var(--gwx-p-tint)}' +
'.gwx-dsr-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 4px 2px}' +
'.detail_srch .btn_reset,.detail_srch span.btn_sqr{position:static!important}' +
'.detail_srch_wrap{padding-bottom:12px!important}' +
'#main_content input.basic_inp{height:30px!important;line-height:28px!important;' +
'padding-top:0!important;padding-bottom:0!important;box-sizing:border-box!important;vertical-align:middle}' +
'}';
  var CSS_COMPOSE_097 =
'@media screen{' +
'#sending_page>.title_area{display:flex!important;align-items:center;min-height:46px;' +
'padding:0 16px!important;background:var(--gwx-surface-2)!important;border-bottom:1px solid var(--gwx-border)!important}' +
'#sending_page>.title_area h1{margin:0!important;line-height:1.2!important;font-size:15px!important}' +
'html.gwx-embedded #sending_page>.title_area{display:flex!important}' +
'.cke_button_icon{filter:grayscale(1) opacity(.6)}' +
'.cke_button:hover .cke_button_icon,a.cke_button_on .cke_button_icon{filter:grayscale(1) opacity(1)}' +
'a.cke_button_on{background:#e9e9e4!important;border-radius:5px}' +
'.cke_combo_arrow{opacity:.55}' +
'.gwx-preview{position:fixed;inset:0;z-index:10060;background:rgba(15,20,18,.45);' +
'display:flex;align-items:center;justify-content:center;padding:24px}' +
'.gwx-pv-box{width:min(860px,94vw);max-height:90vh;display:flex;flex-direction:column;' +
'background:var(--gwx-surface);border:1px solid var(--gwx-border);border-radius:14px;box-shadow:var(--gwx-sh-2);overflow:hidden}' +
'.gwx-pv-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;background:var(--gwx-surface-2);' +
'border-bottom:1px solid var(--gwx-border);font:700 14px var(--gwx-font);color:var(--gwx-t1)}' +
'.gwx-pv-hd .gwx-i{color:var(--gwx-p)}' +
'.gwx-pv-meta{padding:10px 16px;border-bottom:1px solid var(--gwx-border)}' +
'.gwx-pv-meta .r{display:flex;gap:10px;margin:3px 0;font:13px var(--gwx-font)}' +
'.gwx-pv-meta .r b{flex:none;width:52px;color:var(--gwx-t3);font-weight:600}' +
'.gwx-pv-meta .r span{color:var(--gwx-t1);word-break:break-all}' +
'.gwx-pv-body{flex:1;min-height:220px;border:0;background:#fff}' +
'.gwx-pv-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 14px;background:var(--gwx-surface-2);' +
'border-top:1px solid var(--gwx-border)}' +
'.gwx-pv-send{background:var(--gwx-p)!important;border-color:var(--gwx-p)!important;color:var(--gwx-on-p)!important;font-weight:600}' +
'.gwx-pv-send:hover{background:var(--gwx-p-strong)!important;border-color:var(--gwx-p-strong)!important}' +
'}';
  var CSS_MAIL_098 =
'@media screen{' +
/* (9) 탭 강조 음영 */
'.gwx-tab{background:var(--gwx-surface-2);border:1px solid var(--gwx-border);border-bottom:none}' +
'.gwx-tab:hover{background:var(--gwx-p-tint)}' +
'.gwx-tab.on{background:var(--gwx-surface);box-shadow:inset 0 2px 0 var(--gwx-p),0 -1px 5px rgba(0,0,0,.07)}' +
'.gwx-ch-tl{font:700 15px var(--gwx-font);color:var(--gwx-t1);align-self:center;white-space:nowrap;padding-right:2px}' +
/* (4) 다크: 목록 행 배경 원천 리셋 후 GWX 상태색만 적용 */
'html[data-gwx-theme="dark"] .content_lst_body table tbody tr td{background-color:transparent!important}' +
'html[data-gwx-theme="dark"] .content_lst_body tr.email_chk_on td,' +
'html[data-gwx-theme="dark"] .content_lst_body tr.on td,' +
'html[data-gwx-theme="dark"] .content_lst_body tr[class*="select" i] td{background-color:var(--gwx-p-tint)!important}' +
'html[data-gwx-theme="dark"] .content_lst_body td,html[data-gwx-theme="dark"] .content_lst_body td a{color:var(--gwx-t2)!important}' +
'html[data-gwx-theme="dark"] .content_lst_body .subj a.tit,' +
'html[data-gwx-theme="dark"] .content_lst_body tr.email_chk_on .subj a.tit{color:var(--gwx-t1)!important}' +
/* (6) 상세 버튼 — 스코프 확장 재스킨 */
'#main_content a.btn_detail_srch{display:inline-flex!important;align-items:center;gap:5px;height:30px!important;' +
'box-sizing:border-box;padding:0 10px!important;border:1px solid var(--gwx-border)!important;border-radius:7px!important;' +
'background:var(--gwx-surface)!important;background-image:none!important;color:var(--gwx-t2)!important;' +
'font:500 12.5px/1 var(--gwx-font)!important;text-decoration:none!important;width:auto!important;text-indent:0!important}' +
'#main_content a.btn_detail_srch:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1)!important}' +
'#main_content a.btn_detail_srch img,#main_content a.btn_detail_srch em{display:none!important}' +
'#main_content a.btn_detail_srch::after{content:"";width:12px;height:12px;background:currentColor;' +
'-webkit-mask:var(--gi-chevdown) center/contain no-repeat;mask:var(--gi-chevdown) center/contain no-repeat}' +
/* (6) 상세검색: 이동 후 푸터 버튼·모든 텍스트 입력 수직중앙 */
'.detail_srch_wrap .btn_reset{display:inline-flex!important;align-items:center;height:30px!important;' +
'box-sizing:border-box;padding:0 14px!important;border:1px solid var(--gwx-border)!important;border-radius:7px!important;' +
'background:var(--gwx-surface)!important;color:var(--gwx-t3)!important;font:500 12.5px/1 var(--gwx-font)!important;text-decoration:none!important}' +
'.detail_srch_wrap .btn_reset:hover{color:var(--gwx-t1)!important;background:var(--gwx-surface-2)!important}' +
'.detail_srch_wrap input[type="text"]{height:30px!important;line-height:28px!important;' +
'padding-top:0!important;padding-bottom:0!important;box-sizing:border-box!important;vertical-align:middle}' +
/* (6) 인쇄: 앵커/이미지 양쪽 대응 */
'#normal_message_content a[onclick*="rint"]{display:inline-flex!important;width:30px;height:30px;' +
'align-items:center;justify-content:center;background:none!important;border:1px solid var(--gwx-border)!important;' +
'border-radius:7px!important;position:relative;vertical-align:middle;text-indent:0!important}' +
'#normal_message_content a[onclick*="rint"]:hover{background:var(--gwx-surface-2)!important}' +
'#normal_message_content a[onclick*="rint"] img{display:none!important}' +
'#normal_message_content a[onclick*="rint"]::after{content:"";position:absolute;inset:6px;background:var(--gwx-t2);' +
'-webkit-mask:var(--gi-printer) center/contain no-repeat;mask:var(--gi-printer) center/contain no-repeat}' +
/* (10) 본문 소프트 톤(라이트) */
(S.get('opt.softBody', false) ? 'html:not([data-gwx-theme="dark"]) #mail_view_area{background:#f8f7f3!important}' : '') +
(S.get('opt.unifyBodyFont', false) ? '#mail_view_area,#mail_view_area *{font-family:var(--gwx-font)!important}' : '') +
'}';
  var CSS_COMPOSE_098 =
'@media screen{' +
'html.gwx-embedded #sending_page>.title_area{display:none!important}' + /* 라벨은 탭 헤더 좌측으로 이동 */
'.gwx-pv-box{max-height:92vh}' +
'.gwx-pv-meta{padding:8px 14px}' +
'.gwx-pv-meta .r{margin:2px 0;font-size:12.5px}' +
'}';
  var CSS_MAIL_099 =
'@media screen{' +
/* (7) 다크: 원문 HTML의 색·배경을 보존하고 바깥 캔버스만 밝게 제공 */
'html[data-gwx-theme="dark"] #mail_view_area{filter:none!important;background:#fff!important;color:#111!important}' +
'html[data-gwx-theme="dark"] #mail_view_area img{filter:none!important}' +
(S.get('opt.darkBodyBoost', false) ?
  'html[data-gwx-theme="dark"] #mail_view_area,html[data-gwx-theme="dark"] #mail_view_area *{' +
  'color:#dcd7ca!important;background-color:transparent!important}' +
  'html[data-gwx-theme="dark"] #mail_view_area a{color:var(--gwx-p-strong)!important}'
  : '') +
/* (8.1) 탭 형태 고정(간헐 붕괴 방지) */
'.gwx-tab{border-radius:9px 9px 0 0!important}' +
'.gwx-tab.on{background:var(--gwx-surface)!important;box-shadow:inset 0 2px 0 var(--gwx-p),0 -1px 5px rgba(0,0,0,.07)!important}' +
'.gwx-tabs{scrollbar-width:none}.gwx-tabs::-webkit-scrollbar{display:none}' +
/* (9) 작성 라벨을 타이틀과 동일 규격으로 */
'.gwx-ch-tl{font:700 16px/1.3 var(--gwx-font)!important;color:var(--gwx-t1)!important;padding:0 6px}' +
/* (6.4) 상세/인쇄 스코프 재확장 */
'#main_content a[class*="detail" i]{display:inline-flex!important;align-items:center;gap:5px;height:30px!important;' +
'box-sizing:border-box;padding:0 10px!important;border:1px solid var(--gwx-border)!important;border-radius:7px!important;' +
'background:var(--gwx-surface)!important;background-image:none!important;color:var(--gwx-t2)!important;' +
'font:500 12.5px/1 var(--gwx-font)!important;text-decoration:none!important;width:auto!important;text-indent:0!important}' +
'#main_content a[class*="detail" i]:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1)!important}' +
'#main_content a[class*="detail" i] img,#main_content a[class*="detail" i] em{display:none!important}' +
'#main_content a[onclick*="rint"]{display:inline-flex!important;width:30px;height:30px;align-items:center;' +
'justify-content:center;background:none!important;border:1px solid var(--gwx-border)!important;border-radius:7px!important;' +
'position:relative;vertical-align:middle;text-indent:0!important}' +
'#main_content a[onclick*="rint"]:hover{background:var(--gwx-surface-2)!important}' +
'#main_content a[onclick*="rint"] img{display:none!important}' +
'#main_content a[onclick*="rint"]::after{content:"";position:absolute;inset:6px;background:var(--gwx-t2);' +
'-webkit-mask:var(--gi-printer) center/contain no-repeat;mask:var(--gi-printer) center/contain no-repeat}' +
'}';
  var CSS_COMPOSE_099 =
'@media screen{' +
/* (5) 미리보기 최대화 */
'.gwx-pv-box{height:96vh;max-height:96vh;width:min(980px,96vw)}' +
/* (11.2) 상단 압축 */
'#sendtable th,#sendtable td{padding:4px 8px!important}' +
'#sendtable ul[class*="token-input-list"]{min-height:32px!important;padding:2px 6px!important}' +
'#attr_tr{--gwx-compact:1}' +
'}';
  var CSS_MAIL_100 =
'@media screen{' +
(S.get('opt.avatar', false) ? '' : '.gwx-avatar{display:none!important}') +
/* (3) 프린트: JS 마킹 대상 공통 스킨 (앵커/이미지 래퍼) */
'.gwx-printbtn,.gwx-printbox{display:inline-flex!important;width:30px!important;height:30px!important;' +
'align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;' +
'background:var(--gwx-surface)!important;background-image:none!important;border:1px solid var(--gwx-border)!important;' +
'border-radius:7px!important;position:relative;vertical-align:middle;text-indent:0!important;cursor:pointer;' +
'font-size:0!important;color:transparent!important;padding:0!important}' +
'.gwx-printbtn:hover,.gwx-printbox:hover{background:var(--gwx-surface-2)!important}' +
'.gwx-printbtn img,.gwx-printbox img,.gwx-printbox input{opacity:0!important;position:absolute;inset:0;width:100%!important;height:100%!important;display:block}' +
'.gwx-printbtn::after,.gwx-printbox::after{content:"";position:absolute;inset:6px;background:var(--gwx-t2);pointer-events:none;' +
'-webkit-mask:var(--gi-printer) center/contain no-repeat;mask:var(--gi-printer) center/contain no-repeat}' +
/* (3) 상세: JS 마킹 대상 스킨 */
'.gwx-detailbtn{display:inline-flex!important;align-items:center;gap:5px;height:30px!important;box-sizing:border-box;' +
'padding:0 10px!important;border:1px solid var(--gwx-border)!important;border-radius:7px!important;' +
'background:var(--gwx-surface)!important;background-image:none!important;color:var(--gwx-t2)!important;' +
'font:500 12.5px/1 var(--gwx-font)!important;text-decoration:none!important;width:auto!important;text-indent:0!important}' +
'.gwx-detailbtn:hover{background:var(--gwx-surface-2)!important;color:var(--gwx-t1)!important}' +
'.gwx-detailbtn img,.gwx-detailbtn em{display:none!important}' +
'.gwx-detailbtn::after{content:"";width:12px;height:12px;background:currentColor;' +
'-webkit-mask:var(--gi-chevdown) center/contain no-repeat;mask:var(--gi-chevdown) center/contain no-repeat}' +
'.gwx-detailbtn>*{background:none!important;background-image:none!important;text-indent:0!important;' +
'line-height:1!important;height:auto!important;width:auto!important;padding:0!important;margin:0!important;' +
'font:inherit!important;color:inherit!important;display:inline!important;position:static!important}' +
/* (3) 검색·초기화: flex 수직중앙 강제 */
'span.btn_sqr a{display:inline-flex!important;align-items:center;justify-content:center;line-height:1!important;height:32px!important}' +
'span.btn_sqr a *{line-height:1!important;padding:0!important;margin:0!important;background:none!important}' +
'.detail_srch_wrap .btn_reset{display:inline-flex!important;align-items:center;justify-content:center;line-height:1!important;height:30px!important;padding:0 14px!important}' +
'.detail_srch_wrap .btn_reset *{line-height:1!important;background:none!important}' +
'}';
  var CSS_MAIL_101 =
'@media screen{' +
'html:not([data-gwx-ready]) #main_content,' +
'html:not([data-gwx-ready]) .left_menu{opacity:0}' +
'#main_content,.left_menu{transition:opacity .14s ease}' +
'}';
  var CSS_MAIL_102 =
'@media screen{' +
(S.get('opt.dense', true) ?
  '.content_lst_body table tbody td{height:34px!important}' +
  '.content_lst table tbody .subj a.tit{font-size:12.5px!important}' +
  '.content_lst_body table tbody tr .date{font-size:11.5px!important}' +
  '.content_lst_body td.recTD,.content_lst_body td.recTD a{font-size:12.5px!important}' +
  '.gwx-badge{height:16px;font-size:10.5px;line-height:16px;padding:0 7px}' +
  '.gwx-th{height:15px;font-size:9.5px}'
  : '') +
'}';
  var CSS_MAIL_103 =
'@media screen{' +
'html[data-gwx-dlopen] #main_content{opacity:0!important}' +
'#gwx-dl-ov{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;' +
'background:var(--gwx-bg)}' +
'#gwx-dl-ov .bx{display:flex;gap:10px;align-items:center;padding:18px 26px;border:1px solid var(--gwx-border);' +
'border-radius:12px;background:var(--gwx-surface);color:var(--gwx-t2);font:600 14px var(--gwx-font);box-shadow:var(--gwx-sh-2)}' +
'#gwx-dl-ov .bx .gwx-i{color:var(--gwx-p);width:20px;height:20px;animation:gwxPulse 1s ease-in-out infinite}' +
'@keyframes gwxPulse{50%{opacity:.35}}' +
'.gwx-detailbtn+img,.gwx-detailbtn+em{display:none!important}' +
'}';
  var CSS_COMPOSE_110 =
'@media screen{' +
'.gwx-tblov{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:visible}' +
'.gwx-tbl-add{pointer-events:auto;position:absolute;display:none;align-items:center;justify-content:center;' +
'width:18px;height:18px;border-radius:50%;border:1px solid var(--gwx-p);background:var(--gwx-surface);' +
'color:var(--gwx-p-strong);font:700 13px/1 var(--gwx-font);cursor:pointer;box-shadow:var(--gwx-sh-1);padding:0;z-index:6}' +
'.gwx-tbl-add:hover{background:var(--gwx-p)!important;color:var(--gwx-on-p)!important}' +
'.gwx-drag-tip{position:absolute;display:none;pointer-events:none;background:var(--gwx-t1);color:var(--gwx-surface);' +
'font:600 11px var(--gwx-font);padding:2px 7px;border-radius:5px;z-index:7;white-space:nowrap}' +
'}';
  var CSS_MAIL_130 =
'@media screen{' +
(S.get('opt.titleCount', true)
  ? '.gwx-cnt{display:inline-flex;align-items:center;height:17px;margin-left:9px;padding:0 8px;' +
    'border-radius:999px;background:var(--gwx-surface);border:1px solid var(--gwx-border);' +
    'font:600 10.5px/1 var(--gwx-font)!important;color:var(--gwx-t3)!important;vertical-align:3px;letter-spacing:0}'
  : '.gwx-cnt{display:none!important}') +
'}';
  var CSS_HUB =
'@media screen{' +
'#gwx-dot{position:fixed;right:5px;bottom:5px;width:11px;height:11px;border-radius:50%;' +
'background:#8a8a8a;opacity:.12;z-index:2147483000;cursor:pointer;transition:opacity .15s}' +
'#gwx-dot:hover{opacity:.55}' +
'.gwx-hub{position:fixed;right:14px;bottom:24px;width:330px;max-height:78vh;overflow:auto;z-index:2147483001;' +
'background:var(--gwx-surface);border:1px solid var(--gwx-border);border-radius:12px;box-shadow:var(--gwx-sh-2);' +
'font-family:var(--gwx-font)}' +
'.gwx-hub-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;' +
'border-bottom:1px solid var(--gwx-border);background:var(--gwx-surface-2)}' +
'.gwx-hub-hd b{font:700 13px var(--gwx-font);color:var(--gwx-t1)}' +
'.gwx-hub-hd span{font:500 11px var(--gwx-font);color:var(--gwx-t3)}' +
'.gwx-hub-bd{padding:6px 10px}' +
'.gwx-hub-row{display:flex;align-items:center;gap:8px;padding:5px 0}' +
'.gwx-hub-row .lb{flex:1;font:500 12px var(--gwx-font);color:var(--gwx-t2)}' +
'.gwx-hub-row .seg{display:flex;border:1px solid var(--gwx-border);border-radius:7px;overflow:hidden}' +
'.gwx-hub-row .sg{height:22px;padding:0 8px;border:0;background:var(--gwx-surface);color:var(--gwx-t3);' +
'font:500 11px var(--gwx-font);cursor:pointer;border-left:1px solid var(--gwx-border)}' +
'.gwx-hub-row .sg:first-child{border-left:0}' +
'.gwx-hub-row .sg.on{background:var(--gwx-p);color:var(--gwx-on-p);font-weight:700}' +
'.gwx-hub-ft{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;border-top:1px solid var(--gwx-border);' +
'background:var(--gwx-surface-2)}' +
'.gwx-hub-ft .gwx-btn{height:26px;font-size:11.5px;padding:0 10px}' +
'.gwx-tgl{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:6}' +
'.gwx-grip{position:absolute;pointer-events:auto;z-index:7}' +
'.gwx-grip.col{width:7px;cursor:col-resize}' +
'.gwx-grip.row{height:7px;cursor:row-resize}' +
'.gwx-grip:hover,.gwx-grip.on{background:var(--gwx-p);opacity:.55;border-radius:3px}' +
'}';
  var CSS_MAIL_131 =
'@media screen{' +
/* 폴더 개수 — 배경/테두리 없이 우측 정렬 */
'.gwx-fcnt{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none!important;' +
'border:0!important;box-shadow:none!important;font:600 11px/1 var(--gwx-font)!important;' +
'color:var(--gwx-t3)!important;letter-spacing:0;pointer-events:none}' +
'.snb_lst li a.slct .gwx-fcnt{color:var(--gwx-p-strong)!important}' +
'li.snb_trsh .gwx-fcnt{right:76px}' +
'.gwx-cnt{display:none!important}' +
/* 목록 열폭 — 고정 레이아웃 + 말줄임(제목 최대 확보) */
'#list_content .content_lst table{table-layout:fixed!important;width:100%!important}' +
'#list_content:not(.mail_list_vertical) .content_lst_body td.recTD{overflow:hidden;text-overflow:ellipsis;' +
'white-space:nowrap;vertical-align:middle!important}' +
'#list_content:not(.mail_list_vertical) .content_lst_body td.recTD a{display:inline!important}' +
'#list_content .content_lst_head thead th{vertical-align:middle!important;white-space:nowrap}' +
'#list_content .content_lst_body table tbody td{vertical-align:middle!important}' +
'#list_content .content_lst_body td.date,#list_content .content_lst_body td.hit{white-space:nowrap;' +
'overflow:hidden;text-overflow:ellipsis;padding-right:6px!important}' +
'#list_content .content_lst_body td.subj{overflow:hidden}' +
'#list_content .content_lst_body td.subj a.tit{display:inline-block;max-width:100%;overflow:hidden;' +
'text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}' +
/* 편집기: 이미지 핸들·미니툴바 */
'.gwx-imgbox{position:absolute;pointer-events:none;outline:1px dashed var(--gwx-p-weak);z-index:6}' +
'.gwx-ih{position:absolute;width:10px;height:10px;border-radius:2px;background:var(--gwx-surface);' +
'border:1.5px solid var(--gwx-p);pointer-events:auto;z-index:8}' +
'.gwx-ih.se,.gwx-ih.nw{cursor:nwse-resize}.gwx-ih.sw,.gwx-ih.ne{cursor:nesw-resize}' +
'.gwx-ih.on{background:var(--gwx-p)}' +
'.gwx-ctxfloat{position:absolute;display:none;align-items:center;gap:5px;z-index:9;padding:4px 6px;' +
'background:var(--gwx-surface);border:1px solid var(--gwx-border);border-radius:9px;box-shadow:var(--gwx-sh-2)}' +
'.gwx-ctxfloat .gwx-ctx{display:inline-flex!important;flex-wrap:nowrap}' +
'.gwx-plist .row{gap:8px;justify-content:space-between}' +
'}';
  var CSS_COMPOSE_136 =
'@media screen{' +
/* 1.3.6: 열/행 그립을 보이게 — 발견 가능성 확보 + 히트영역 확대 */
'.gwx-grip{background:transparent!important;opacity:1!important}' +
'.gwx-grip.col{width:9px}' +
'.gwx-grip.row{height:9px}' +
'.gwx-grip::after{content:"";position:absolute;background:var(--gwx-p);opacity:.20;border-radius:2px;' +
'transition:opacity .12s ease}' +
'.gwx-grip.col::after{left:3px;right:3px;top:0;bottom:0}' +
'.gwx-grip.row::after{top:3px;bottom:3px;left:0;right:0}' +
'.gwx-grip:hover::after,.gwx-grip.on::after{opacity:.9}' +
'.gwx-tbl-add{z-index:8}' +
'.gwx-drag-tip{z-index:9}' +
'}';
  /* 1.3.7: 안읽음 표시 기준을 data-gwx-unread(0/1)로 단일화.
   *  원본 td_list_bold는 판정 근거이므로 보존하고, 표시 여부만 여기서 덮어쓴다.
   *  (GWX가 아직 판정하지 않은 행은 속성이 없으므로 서버 기본 표시가 그대로 유지) */
  var CSS_MAIL_137 =
'@media screen{' +
'.content_lst_body tr[data-gwx-unread="1"] .subj a.tit{font-weight:700!important;color:var(--gwx-t1)!important}' +
'.content_lst_body tr[data-gwx-unread="1"] td.recTD,' +
'.content_lst_body tr[data-gwx-unread="1"] td.recTD a,' +
'.content_lst_body tr[data-gwx-unread="1"] td[data-gwx-peer="1"],' +
'.content_lst_body tr[data-gwx-unread="1"] td[data-gwx-peer="1"] a{font-weight:700!important}' +
'.content_lst_body tr[data-gwx-unread="1"] td:first-child{box-shadow:inset 3px 0 0 var(--gwx-p)!important}' +
'.content_lst_body tr[data-gwx-unread="0"] .subj a.tit{font-weight:400!important}' +
'.content_lst_body tr[data-gwx-unread="0"] td.recTD,' +
'.content_lst_body tr[data-gwx-unread="0"] td.recTD a,' +
'.content_lst_body tr[data-gwx-unread="0"] td[data-gwx-peer="1"],' +
'.content_lst_body tr[data-gwx-unread="0"] td[data-gwx-peer="1"] a{font-weight:400!important}' +
'.content_lst_body tr[data-gwx-unread="0"] td:first-child{box-shadow:none!important}' +
'.content_lst_body tr[data-gwx-unread="0"] .td_list_bold{font-weight:400!important}' +
/* 보낸 메일함 '받는사람' 열 — 받은 메일함 '보낸이' 열과 동일 규격(클래스명 비의존) */
'#list_content:not(.mail_list_vertical) .content_lst_body td[data-gwx-peer="1"]{' +
'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle!important}' +
'#list_content:not(.mail_list_vertical) .content_lst_body td[data-gwx-peer="1"] a{display:inline!important}' +
'}';
  /* 1.3.8: 목록 키보드 커서 */
  var CSS_MAIL_138 =
'@media screen{' +
'.content_lst_body tr[data-gwx-cursor="1"] td{background:var(--gwx-p-tint)!important;' +
'border-top:1px solid var(--gwx-p)!important;border-bottom:1px solid var(--gwx-p)!important}' +
'}';
  /* 1.3.8: 단축키 설정 패널 (라우트 공통) */
  var CSS_KEYS =
'@media screen{' +
'.gwx-keypanel{position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;' +
'justify-content:center;padding:20px;background:rgba(15,20,18,.42);font-family:var(--gwx-font)}' +
'.gwx-kp-box{width:min(460px,94vw);max-height:88vh;display:flex;flex-direction:column;' +
'background:var(--gwx-surface);border:1px solid var(--gwx-border);border-radius:13px;box-shadow:var(--gwx-sh-2)}' +
'.gwx-kp-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;background:var(--gwx-surface-2);' +
'border-bottom:1px solid var(--gwx-border);border-radius:13px 13px 0 0}' +
'.gwx-kp-hd b{font:700 14px var(--gwx-font);color:var(--gwx-t1)}' +
'.gwx-kp-bd{flex:1;overflow:auto;padding:6px 12px}' +
'.gwx-kp-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--gwx-line-row)}' +
'.gwx-kp-row .lb{flex:1;font:500 12.5px var(--gwx-font);color:var(--gwx-t2)}' +
'.gwx-kp-key{min-width:104px;height:26px;padding:0 10px;border:1px solid var(--gwx-border-2);' +
'border-radius:6px;background:var(--gwx-surface);color:var(--gwx-t1);cursor:pointer;' +
'font:600 12px var(--gwx-mono);text-align:center}' +
'.gwx-kp-key:hover{border-color:var(--gwx-p);color:var(--gwx-p-strong)}' +
'.gwx-kp-key.cap{background:var(--gwx-p-tint);border-color:var(--gwx-p);color:var(--gwx-p-strong)}' +
'.gwx-kp-key.dup{border-color:var(--gwx-danger);color:var(--gwx-danger);background:var(--gwx-danger-tint)}' +
'.gwx-kp-rs{height:26px;padding:0 9px;border:1px solid var(--gwx-border);border-radius:6px;' +
'background:var(--gwx-surface);color:var(--gwx-t3);font:500 11.5px var(--gwx-font);cursor:pointer}' +
'.gwx-kp-rs:hover{color:var(--gwx-t1);background:var(--gwx-surface-2)}' +
'.gwx-kp-ft{display:flex;gap:6px;align-items:center;padding:10px 14px;background:var(--gwx-surface-2);' +
'border-top:1px solid var(--gwx-border);border-radius:0 0 13px 13px}' +
'.gwx-kp-ft .msg{flex:1;font:500 11.5px var(--gwx-font);color:var(--gwx-t3)}' +
'.gwx-kp-ft .gwx-btn{height:26px;font-size:11.5px;padding:0 10px}' +
'}';
  var CSS_GNB_092 =
'@media screen{' +
/* (7) GNB 아이콘 모노톤 정돈 — 원본 컬러 스프라이트를 테마에 맞게 중화 */
'#header img:not(#img_user_pic),#normal_menu img,.menu_more img{' +
'filter:grayscale(1) opacity(.5);transition:filter .15s ease,opacity .15s ease}' +
'html[data-gwx-theme="dark"] #header img:not(#img_user_pic),' +
'html[data-gwx-theme="dark"] #normal_menu img,html[data-gwx-theme="dark"] .menu_more img{' +
'filter:grayscale(1) invert(.82) opacity(.72)}' +
'#normal_menu li:hover img,#normal_menu li.gwx-active img{filter:none!important;opacity:1!important}' +
'}';

  var GWX_ACCENTS = {
    teal: null, // 기본(Sea Glass) — 토큰 원본 사용
    blue: { name: 'Ocean Blue', p: '#1d6fb8', ps: '#155a97', pw: '#a9c9e8',
            pt: 'rgba(29,111,184,.12)', pt2: 'rgba(29,111,184,.06)',
            fc: '0 0 0 3px rgba(29,111,184,.22)' },
    indigo: { name: 'Indigo', p: '#4655c4', ps: '#3a47a8', pw: '#b7bdee',
              pt: 'rgba(70,85,196,.12)', pt2: 'rgba(70,85,196,.06)',
              fc: '0 0 0 3px rgba(70,85,196,.22)' }
  };
  function accentCss() {
    var k = S.get('opt.accent', 'teal');
    var a = GWX_ACCENTS[k];
    if (!a) return '';
    return '@media screen{html:not([data-gwx-theme="dark"]){' +
      '--gwx-p:' + a.p + ';--gwx-p-strong:' + a.ps + ';--gwx-p-weak:' + a.pw + ';' +
      '--gwx-p-tint:' + a.pt + ';--gwx-p-tint2:' + a.pt2 + ';--gwx-focus:' + a.fc + '}}';
  }
  /* 1.3.8: 시트 목록을 '선언 순서 = 캐스케이드 순서'로 명시하고 하나로 합쳐 1회 주입.
   *  <style> 15개 → 1개. 뒤 시트가 앞 시트를 덮는 기존 구조는 그대로 보존한다.
   *  ※ CSS Cascade Layers(@layer)는 도입하지 않는다 — 사이트 원본 CSS가 레이어
   *    밖(unlayered)에 있어, GWX 규칙을 레이어에 넣는 순간 특이도와 무관하게 항상
   *    지게 되므로 현행 !important 기반 구조가 전부 무력화된다. 2.0에서 규칙을
   *    다시 쓸 때 함께 재검토한다. */
  var CSS_139 = "@media screen {\n  .gwx-resize-layer { position:fixed; z-index:100040; pointer-events:none; overflow:hidden; font:12px/1.4 var(--gwx-font); color:var(--gwx-t1); }\n  .gwx-resize-outline { position:absolute; border:1px solid var(--gwx-p); box-sizing:border-box; pointer-events:none; }\n  .gwx-resize-handle { position:absolute; pointer-events:auto; box-sizing:border-box; touch-action:none; user-select:none; z-index:2; }\n  .gwx-resize-handle.col { cursor:col-resize; }\n  .gwx-resize-handle.row { cursor:row-resize; }\n  .gwx-resize-handle.col::after { content:''; position:absolute; left:4px; width:2px; top:0; bottom:0; background:var(--gwx-p); opacity:.35; }\n  .gwx-resize-handle.row::after { content:''; position:absolute; top:4px; height:2px; left:0; right:0; background:var(--gwx-p); opacity:.3; }\n  .gwx-resize-handle:hover::after { opacity:1; }\n  .gwx-resize-handle[class*='image-'], .gwx-resize-handle.table-width, .gwx-resize-handle.table-size { background:var(--gwx-surface); border:2px solid var(--gwx-p); border-radius:2px; z-index:3; }\n  .gwx-resize-handle.table-width { cursor:ew-resize; }\n  .gwx-resize-handle.table-size, .gwx-resize-handle.image-se, .gwx-resize-handle.image-nw { cursor:nwse-resize; }\n  .gwx-resize-handle.image-ne, .gwx-resize-handle.image-sw { cursor:nesw-resize; }\n  .gwx-resize-handle:hover { background:var(--gwx-p-tint); }\n  .gwx-resize-bar { position:absolute; display:flex; align-items:center; flex-wrap:wrap; gap:4px; max-width:calc(100% - 8px); box-sizing:border-box; padding:4px 6px; background:var(--gwx-surface); border:1px solid var(--gwx-border); border-radius:7px; box-shadow:var(--gwx-sh-2); pointer-events:auto; z-index:4; }\n  .gwx-resize-size { white-space:nowrap; padding:0 4px; font-variant-numeric:tabular-nums; color:var(--gwx-t2); }\n  .gwx-resize-bar button { font:inherit; padding:3px 6px; border:1px solid var(--gwx-border); border-radius:4px; background:var(--gwx-surface); color:var(--gwx-t1); cursor:pointer; white-space:nowrap; }\n  .gwx-resize-bar button:hover { color:var(--gwx-p); background:var(--gwx-p-tint); }\n  .gwx-resize-tip { display:none; position:absolute; z-index:5; padding:4px 8px; border-radius:5px; white-space:nowrap; background:var(--gwx-p); color:var(--gwx-on-p); }\n  .gwx-direct-selected .gwx-ctxfloat { display:none!important; }\n  .gwx-rc { width:auto!important; min-width:0; height:19px!important; padding:0 6px!important; border-radius:5px!important; font:600 11px/19px var(--gwx-font)!important; margin-right:5px; vertical-align:middle; white-space:nowrap; }\n  .gwx-rc.rc-unknown, .gwx-badge.b-unknown { color:var(--gwx-t3); background:var(--gwx-surface-2); font-weight:400!important; }\n  .gwx-rc.rc-sent { color:var(--gwx-t2); background:var(--gwx-surface-2); }\n  .gwx-st { min-width:16px!important; flex-shrink:0; }\n}\n@media print { .gwx-resize-layer { display:none!important; } }\n";
  var CSS_1310 = "@media screen {\n .gwx-table-width-slider{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;color:var(--gwx-t2)}\n .gwx-table-width-slider input[type=range]{appearance:auto!important;-webkit-appearance:auto!important;width:100px!important;height:18px!important;min-height:0!important;padding:0!important;margin:0 5px!important;accent-color:var(--gwx-p);cursor:ew-resize}\n}";
  var CSS_1311 = "@media screen {\n.gwx-tabs{gap:3px!important;overflow:hidden!important;align-items:stretch!important;height:36px!important;box-sizing:border-box}\n.gwx-tab-rail{display:flex;gap:3px;flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;position:relative;align-items:flex-end}\n.gwx-tab-rail::-webkit-scrollbar{display:none}\n.gwx-tab-rail .gwx-tab{flex:0 0 auto!important;max-width:190px;box-sizing:border-box}\n.gwx-tab-nav,.gwx-tab-picker{flex:none;align-self:center;width:25px!important;min-width:0!important;height:27px!important;padding:0!important;margin:0!important;border:1px solid var(--gwx-border)!important;border-radius:5px!important;background:var(--gwx-surface)!important;color:var(--gwx-t2)!important;text-align:center;font:16px var(--gwx-font)!important;cursor:pointer}\n.gwx-tab-nav:disabled{opacity:.35;cursor:default}.gwx-tab-picker{width:30px!important;appearance:auto!important}\n.gwx-tab:focus-visible,.gwx-tclose:focus-visible{outline:2px solid var(--gwx-p);outline-offset:-2px}\n.gwx-date-cell,.gwx-date-cell span,.gwx-date-cell a{white-space:nowrap!important;text-overflow:clip!important;max-width:none!important;font-variant-numeric:tabular-nums}\n.gwx-date-cell span,.gwx-date-cell a{width:auto!important}\n.gwx-pv-meta .r span{white-space:normal;overflow-wrap:anywhere}\n.gwx-preview{z-index:100100!important}\n.gwx-resize-handle.col::before{content:'';position:absolute;width:8px;height:10px;left:1px;top:2px;border:1px solid var(--gwx-p);border-radius:2px;background:var(--gwx-surface);box-sizing:border-box}\n.gwx-resize-handle.row::before{content:'';position:absolute;width:10px;height:8px;left:2px;top:1px;border:1px solid var(--gwx-p);border-radius:2px;background:var(--gwx-surface);box-sizing:border-box}\n}";
  var CSS_1313 = '@media screen{.gwx-folder-cell{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}.gwx-rc.rc-both{color:var(--gwx-p)!important;background:var(--gwx-p-tint)!important}}';
  function cssSheets() {
    var byRoute = {
      mail: [CSS_MAIL, CSS_MAIL_092, CSS_MAIL_093, CSS_MAIL_094, CSS_MAIL_095,
             CSS_MAIL_096, CSS_MAIL_097, CSS_MAIL_098, CSS_MAIL_099, CSS_MAIL_100,
             CSS_MAIL_101, CSS_MAIL_102, CSS_MAIL_103, CSS_MAIL_130, CSS_MAIL_131,
             CSS_MAIL_137, CSS_MAIL_138, CSS_139, CSS_1310, CSS_1311, CSS_1313],
      compose: [CSS_COMPOSE, CSS_COMPOSE_092, CSS_COMPOSE_093, CSS_COMPOSE_094,
                CSS_COMPOSE_097, CSS_COMPOSE_098, CSS_COMPOSE_099, CSS_COMPOSE_110,
                CSS_MAIL_131, CSS_COMPOSE_136, CSS_139, CSS_1310, CSS_1311],
      gnb: [CSS_GNB, CSS_GNB_092],
      comz: [CSS_COMZ],
      wpop: [CSS_WPOP]
    };
    return [iconVars, TOKENS, accentCss(), BASE_CSS, CSS_HUB, CSS_KEYS]
      .concat(byRoute[route] || [])
      .filter(function (x) { return !!x; });
  }
  var GWX_CSS_INFO = { sheets: 0, bytes: 0 };
  function injectAll() {
    var sheets = cssSheets();
    var css = sheets.join('\n');
    GWX_CSS_INFO = { sheets: sheets.length, bytes: css.length };
    addStyle('/* GWX v' + GWX_VER + ' · route=' + route + ' · 통합 시트 ' +
      sheets.length + '개 / ' + css.length + 'B */\n' + css);
    injectFont();
  }
  injectAll();

  /* ---------- 7. 공용 팝오버 ---------- */
  function popover(anchor, fill) {
    qsa('.gwx-pop').forEach(function (x) { gwxRemove(x); });
    var p = el('div', 'gwx-pop');
    fill(p);
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect();
    var left = Math.max(6, Math.min(r.left, (window.innerWidth || 1200) - p.offsetWidth - 8));
    p.style.left = left + 'px';
    p.style.top = Math.min(r.bottom + 5, (window.innerHeight || 800) - p.offsetHeight - 8) + 'px';
    function off(ev) {
      if (!p.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) {
        gwxRemove(p); document.removeEventListener('mousedown', off, true);
      }
    }
    var timer = setTimeout(function () {
      if (p.parentNode) document.addEventListener('mousedown', off, true);
    }, 0);
    p._gwxDispose = function () { clearTimeout(timer); document.removeEventListener('mousedown', off, true); };
    return p;
  }

  /* =====================================================================
   * 8. MAIL 모듈 (fld.do)
   * ===================================================================== */
  function bootMail() {
    var _gwxHookOwner = 'mail-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    try { // 1.2.1: 본창에서 뜨는 성공 알림도 자동 통과(부정 문구 원형 유지)
      var _ma = W.alert ? W.alert.bind(W) : null;
      W.alert = function (m) {
        if (gwxCalmMsg(m)) {
          try { console.info('[GWX] 결과 알림 자동 통과(main):', String(m).trim()); } catch (e2) {}
          return;
        }
        if (_ma) _ma(m);
      };
    } catch (e) {}
    var LIST = function () { return document.getElementById('list_content'); };
    var NMC = function () { return document.getElementById('normal_message_content'); };
    function isListVisible() { var l = LIST(); return !!(l && l.offsetParent !== null); }
    function isViewVisible() {
      var v = NMC();
      return !!(v && v.offsetParent !== null && qs('.view_body_contents', v));
    }
    var natDisp = null; // V1: 원본 토글이 남긴 인라인 display 실측값
    function showView() {
      var l = LIST(), v = NMC(); if (!l || !v) return;
      l.style.display = (natDisp && natDisp.list) ? natDisp.list : 'none';
      if (natDisp && natDisp.view !== undefined) v.style.display = natDisp.view;
      if (getComputedStyle(v).display === 'none') v.style.display = 'block';
    }
    // 0.9.9: 컨테이너 무관 열람 컨텍스트 — 분할/일반 공용
    function getViewCtx() {
      try {
        var cands = qsa('.view_body_contents');
        for (var i = 0; i < cands.length; i++) {
          var vb = cands[i];
          if (vb.offsetParent === null) continue;
          if (!qs('.view_subj', vb)) continue; // 미리보기 안내 패널 제외
          var root = vb.closest('#normal_message_content') ||
                     vb.closest('.mail_view_box') || vb.parentElement || vb;
          var numEl = qs('#view_message_number', root) || qs('#view_message_number');
          if (!numEl) continue;
          return { root: root, num: numEl.value, visible: true, nmc: root === NMC() };
        }
        var v0 = NMC();
        if (v0 && qs('.view_body_contents', v0)) {
          var n0 = qs('#view_message_number', v0);
          return { root: v0, num: n0 && n0.value, visible: false, nmc: true };
        }
        return null;
      } catch (e) { return null; }
    }
    var _lastListMut = Date.now(); // 1.0.1: 목록 재렌더 정지 감지용
    var _splitApplied = false, _splitNat = null;
    function applySplitRatio() {
      if (_splitApplied) return;
      try {
        var l = LIST(), v = NMC(); if (!l || !v || !l.parentElement) return;
        var pw = l.parentElement.offsetWidth || 0;
        if (!(pw && l.offsetWidth < pw * 0.46)) return;
        _splitNat = { lw: l.style.width, vw: v.style.width, vl: v.style.left };
        l.style.width = '50%';
        v.style.width = '50%';
        var cs = getComputedStyle(v);
        if (cs.position === 'absolute') v.style.left = '50%';
        _splitApplied = true;
      } catch (e) { _splitApplied = false; _splitNat = null; }
    }
    function restoreSplitRatio() {
      try {
        if (!_splitApplied || !_splitNat) { _splitApplied = false; _splitNat = null; return; }
        var l = LIST(), v = NMC();
        if (l) l.style.width = _splitNat.lw || '';
        if (v) { v.style.width = _splitNat.vw || ''; v.style.left = _splitNat.vl || ''; }
      } catch (e) {}
      _splitApplied = false; _splitNat = null;
    }
    /* 0.9.11: 포털 위젯용 안읽음 스냅숏(받은 메일함 한정) */
    var _snapAt = 0;
    function saveUnreadSnapshot(l) {
      return; // 1.3.6: 포털 위젯 제거 — 스냅숏 기록 불필요
      try {
        if (Date.now() - _snapAt < 4000) return;
        var t = qs('#list_content .title_area .title');
        var ttl = t ? String(t.textContent || '') : '';
        if (ttl.indexOf('받은') < 0) return; // 받은 메일함일 때만 기록
        _snapAt = Date.now();
        var items = [];
        qsa('tr[id^="mail_list-"]', l).forEach(function (tr) {
          var num = (tr.id.split('-')[1] || '');
          if (!num) return;
          var img = qs('img[id^="wma-icon-"]', tr);
          var src = String((img && img.getAttribute('src')) || '').toLowerCase();
          var unread = /td_list_bold/.test(tr.className || '') ||
                       tr.getAttribute('data-gwx-unread') === '1' ||
                       /r0\.gif|r1\.gif/.test(src);
          if (!unread) return;
          var mv = document.getElementById('mid-' + num);
          var tv = document.getElementById('title-' + num);
          var rec = qs('td.recTD', tr);
          var dt = qs('td.date', tr);
          items.push({
            num: num,
            mid: mv ? String(mv.value || '') : '',
            subj: tv ? String(tv.value || '') : String((mailSubjectAnchor(tr) || {}).title || ''),
            from: rec ? String(rec.getAttribute('title') || rec.textContent || '').split('<')[0].trim() : '',
            date: dt ? String(dt.textContent || '').trim() : ''
          });
        });
        var m = /\((\d+)\s*\/\s*(\d+)\)/.exec(ttl);
        var du = t && t.dataset ? t.dataset.gwxUnreadCount : '';
        var dtc = t && t.dataset ? t.dataset.gwxTotalCount : '';
        var unreadCount = m ? +m[1] : (du !== '' ? +du : items.length);
        var totalCount = m ? +m[2] : (dtc !== '' ? +dtc : 0);
        S.set('unread.snap', {
          t: Date.now(), src: 'mail',
          unread: isFinite(unreadCount) ? Math.max(items.length, unreadCount) : items.length,
          total: isFinite(totalCount) ? totalCount : 0,
          items: items.slice(0, 20)
        });
      } catch (e) { log('snapshot', e); }
    }
    /* 1.3.4: 목록/폴더/포털의 안읽음 상태를 한 경로로 동기화 */
    function adjustVisibleUnread(delta) {
      try {
        var t = qs('#list_content .title_area .title');
        if (!t || !t.dataset) return;
        var u = parseInt(t.dataset.gwxUnreadCount, 10);
        var total = parseInt(t.dataset.gwxTotalCount, 10);
        if (!isFinite(u)) return;
        u = Math.max(0, u + delta);
        t.dataset.gwxUnreadCount = String(u);
        paintFolderCount(u, isFinite(total) ? total : 0);
      } catch (e) {}
    }
    /* 1.3.7: 서버가 내려준 td_list_bold는 '안읽음 판정의 근거'이므로 삭제하지 않는다.
     *  (삭제하면 아이콘 코드가 미등록일 때 이후 갱신에서 안읽음 상태를 영구히 잃는다)
     *  표시 여부는 data-gwx-unread=0/1 을 CSS_MAIL_137이 덮어쓰는 방식으로 처리. */
    function serverBoldRow(tr) {
      if (!tr) return false;
      return tr.classList.contains('td_list_bold') || !!qs('.td_list_bold', tr);
    }
    function setRowUnread(tr, unread) {
      if (!tr) return false;
      var prev = tr.getAttribute('data-gwx-unread');
      var was = (prev === null) ? serverBoldRow(tr) : (prev === '1');
      tr.setAttribute('data-gwx-unread', unread ? '1' : '0');
      return was !== unread;
    }
    function removeFromUnreadSnapshot(num, mid) {
      return; // 1.3.6: 포털 위젯 제거
      try {
        var sn = S.get('unread.snap', null);
        if (!sn || !sn.items || !sn.items.length) return;
        var b = sn.items.length;
        sn.items = sn.items.filter(function (x) {
          return !((mid && x.mid === mid) || String(x.num) === String(num));
        });
        if (sn.items.length !== b) {
          sn.unread = Math.max(sn.items.length, (sn.unread || b) - (b - sn.items.length));
          sn.t = Date.now(); S.set('unread.snap', sn);
        }
      } catch (e) {}
    }
    /* 1.0.2: 열람 즉시 포털 스냅숏 낙관 갱신 + 최근읽음 기록(재등장 차단용) */
    function noteRead(num, mid, rowAlreadySynced) {
      try {
        if (!mid && num) {
          var mv0 = document.getElementById('mid-' + num);
          mid = mv0 ? String(mv0.value || '') : '';
        }
        var row0 = findRowByMid(mid) || (num ? document.getElementById('mail_list-' + num) : null);
        if (!rowAlreadySynced && setRowUnread(row0, false)) adjustVisibleUnread(-1);
        var rr = S.get('readRecent', []) || [];
        if (!Array.isArray(rr)) rr = [];
        var now0 = Date.now(), prev0 = null;
        rr = rr.filter(function (x) {
          if (!x || now0 - (x.t || 0) >= 600000) return false;
          if (x.mid === mid) { if (!prev0 || (x.t || 0) > (prev0.t || 0)) prev0 = x; return false; }
          return true;
        });
        if (mid) rr.push({ mid: mid, t: prev0 && now0 - prev0.t < 30000 ? prev0.t : now0 });
        if (rr.length > 30) rr = rr.slice(-30);
        if (!prev0 || now0 - prev0.t >= 30000) S.set('readRecent', rr);
        removeFromUnreadSnapshot(num, mid);
      } catch (e) {}
    }
    function noteUnread(num, mid) {
      try {
        var rr = S.get('readRecent', []) || [];
        if (Array.isArray(rr) && mid) S.set('readRecent', rr.filter(function (x) { return !x || x.mid !== mid; }));
        _snapAt = 0;
        setTimeout(function () { try { saveUnreadSnapshot(LIST()); } catch (e) {} }, 0);
      } catch (e) {}
    }
    /* 0.9.13: 포털 딥링크 — 비파괴 읽기, 성공/확정 시에만 삭제, mid 우선 탐색 */
    function dlClear(d) {
      try {
        var cur = S.get('deeplink', null);
        if (!cur || !d || cur.id === d.id || String(cur.num) === String(d.num)) S.set('deeplink', null);
      } catch (e) {}
    }
    function findRowByMid(mid) {
      if (!mid) return null;
      var inputs = qsa('input[id^="mid-"]');
      for (var i = 0; i < inputs.length; i++) {
        if (String(inputs[i].value || inputs[i].getAttribute('value') || '') === mid) {
          return inputs[i].closest('tr');
        }
      }
      return null;
    }
    function openByLink(d) {
      if (!d || !d.num) return;
      var num = String(d.num), mid = d.mid || '';
      var clicks = 0, polls = 0;
      info('포털 딥링크 수신 — num=' + num + (mid ? ' (mid 대조)' : ''));
      function dlOverlay(on) {
        try {
          var h = document.documentElement;
          var ov = document.getElementById('gwx-dl-ov');
          if (on) {
            h.setAttribute('data-gwx-dlopen', '1');
            if (!ov && document.body) {
              ov = el('div'); ov.id = 'gwx-dl-ov';
              ov.innerHTML = '<div class="bx"><i class="gwx-i gi-mail"></i><b>요청한 메일을 여는 중…</b></div>';
              document.body.appendChild(ov);
            }
          } else {
            h.removeAttribute('data-gwx-dlopen');
            if (ov) gwxRemove(ov);
          }
        } catch (e) {}
      }
      if (verify()) { dlClear(d); return; }
      dlOverlay(true); // 목록 선노출 구간 은닉 → 체감상 곧바로 메일
      function locate() { return findRowByMid(mid) || document.getElementById('mail_list-' + num); }
      function verify() { // 열람 화면이 실제 해당 메일로 전환되었는지
        try {
          var c = getViewCtx();
          if (!c || !c.visible) return false;
          if (String(c.num) === String(num)) return true;
          if (mid) {
            var mv = qs('#view_message_mid', c.root);
            if (mv && String(mv.value || '') === mid) return true;
          }
        } catch (e) {}
        return false;
      }
      (function poll() {
        polls++;
        if (verify()) {
          dlClear(d); dlOverlay(false);
          info('딥링크: 열람 전환 확인 완료 (' + polls + '틱)'); return;
        }
        var row = locate();
        // 1.0.2: 1차 클릭은 즉시, 재시도만 '목록 변이 정지 450ms' 대기
        var quiet = document.readyState !== 'loading' && (Date.now() - _lastListMut > 450);
        var settled = clicks === 0 ? true : quiet;
        if (row && settled && clicks < 3) {
          var a = qs('td.subj a.tit', row);
          if (a) {
            if (mid && !findRowByMid(mid)) {
              var mv2 = document.getElementById('mid-' + num);
              if (mv2 && String(mv2.value || '') !== mid) {
                dlClear(d); dlOverlay(false);
                toast('메일 위치가 바뀌어 목록만 표시합니다'); return;
              }
            }
            clicks++;
            info('딥링크: 행 클릭 ' + clicks + '/3 (' + (findRowByMid(mid) ? 'mid' : 'num') + ' 매칭)');
            try { a.click(); } catch (e) {}
          }
        }
        if (polls < 120) setTimeout(poll, 150); // 최대 약 18초: 클릭 후 전환 검증·재시도 포함
        else {
          dlClear(d); dlOverlay(false);
          if (!verify()) toast('포털 딥링크: 열람 화면 전환이 확인되지 않았습니다');
        }
      })();
    }
    function readDeep() {
      var h = '';
      try { h = (W.top && W.top.location && W.top.location.hash) || ''; } catch (e) { h = location.hash || ''; }
      var m = /gwx-open=(\d+)(?:\|([^&#]*))?/.exec(h || '');
      if (m) {
        try { if (W.top && W.top.location) W.top.location.hash = ''; } catch (e) {}
        info('딥링크: 해시 채널 수신');
        return { num: m[1], mid: m[2] ? decodeURIComponent(m[2]) : '', t: Date.now() };
      }
      var d = S.get('deeplink', null);
      if (d && d.num && Date.now() - (d.t || 0) < 90000) {
        info('딥링크: GM 채널 수신 (경과 ' + Math.round((Date.now() - (d.t || 0)) / 1000) + 's)');
        return d; // 비파괴 — 성공/확정 시 dlClear
      }
      if (d && d.num) { S.set('deeplink', null); log('딥링크: 만료분 폐기'); }
      return null;
    }
    function consumeDeepLink() { var d = readDeep(); if (d) openByLink(d); }
    function refreshList() {
      try {
        var a = qs('.btn_rfrsh a', LIST());
        if (a) a.click();
        else if (typeof W.refreshMessages === 'function') W.refreshMessages();
      } catch (e) { log('refresh', e); }
    }
    // 0.9.2: 실사이트 버튼에 title 속성이 없어 텍스트로 탐색
    function btnByText(root, texts) {
      if (!root) return null;
      var list = qsa('#up_button a, .btn_area .btns a', root), i, j, t;
      for (i = 0; i < list.length; i++) {
        t = (list[i].textContent || '').replace(/\s+/g, '');
        for (j = 0; j < texts.length; j++) {
          if (t === texts[j]) return probe('버튼:' + texts[0], true) && list[i];
        }
      }
      probe('버튼:' + texts[0], false);
      return null;
    }

    /* ----- 신원 ----- */
    // Native account declarations are present in the supplied main_web HTML head.
    // Read literals only when the page global bridge is unavailable; never eval scripts
    // or collect addresses from a message's sender/recipient/body.
    var nativeAccountCache = null, nativeAccountScripts = -1;
    function nativeAccountLiteral() {
      var scripts = qsa('head script:not([src])');
      if (nativeAccountCache && nativeAccountScripts === scripts.length) return nativeAccountCache;
      nativeAccountScripts = scripts.length;
      for (var i = 0; i < scripts.length; i++) {
        var text = scripts[i].textContent || '';
        if (!/\bvar\s+popupOnRead\s*=/.test(text)) continue;
        var uid = /(?:^|\n)\s*var\s+userId\s*=\s*(['"])([a-zA-Z0-9_-]+)\1\s*;/.exec(text);
        var email = /(?:^|\n)\s*var\s+email\s*=\s*(['"])([^'"\\\r\n]+)\1\s*;/.exec(text);
        if (uid && email) return (nativeAccountCache = { uid: uid[2], email: email[2].trim().toLowerCase() });
      }
      return { uid: '', email: '' };
    }
    function getMe() {
      function valid(v) { v = typeof v === 'string' ? v.trim().toLowerCase() : ''; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ''; }
      var uid = String(W.userId || (qs('#preferece_form #UID') || {}).value || '').trim();
      var configured = valid(S.get('identity.email', ''));
      var email = configured || valid(W.email) || valid((qs('#user_email') || {}).value);
      var source = configured ? 'setting' : email ? 'native' : '';
      if (!email || !uid) {
        var literal = nativeAccountLiteral();
        if (!uid || uid === literal.uid) {
          uid = uid || literal.uid;
          if (!email && valid(literal.email)) { email = valid(literal.email); source = 'native-head'; }
        }
      }
      return { uid: uid, email: email, source: source,
        name: String((qs('#preferece_form #displayName') || {}).value || '').trim() };
    }

    hubAction('내 수신자 판정 설정', function () {
      var value = W.prompt('본인의 정확한 메일주소를 입력하세요. 비워 두면 그룹웨어 계정 정보를 사용합니다.', S.get('identity.email', '') || getMe().email);
      if (value === null) return;
      value = String(value).trim().toLowerCase();
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { toast('메일주소 형식을 확인해 주세요'); return; }
      S.set('identity.email', value); _rc = null;
      qsa('[data-gwx-role-sig]').forEach(function (n) { delete n.dataset.gwxRoleSig; });
      decorateView(); decorateList(); toast('내 수신자 판정 설정을 저장했습니다');
    });
    /* ----- F1: 제목 접두어 → 배지 (마지막 동작 1개 + 체인 툴팁) ----- */
    // 1.3.8: PREFIX_RULES·parseSubject는 GWXP(순수 함수)로 이관 — 여기서는 그대로 사용
    var LBL = { re: '답장', fw: '전달' };
    function makeSubjBadge(seq) {
      var b = el('span', 'gwx-badge b-' + seq[0]);
      b.innerHTML = icon(seq[0] === 're' ? 'reply' : 'forward');
      var sp = el('span'); sp.textContent = LBL[seq[0]]; b.appendChild(sp);
      if (seq.length > 1) {
        b.title = '이력(최신→과거): ' + seq.map(function (t) { return LBL[t]; }).join(' ← ') + ' ← 원본';
      } else b.title = LBL[seq[0]];
      b.title += '\n제목 접두어 기준입니다. 누구의 메일에 대한 답장인지는 확인되지 않습니다.';
      return b;
    }
    function highlightKeywords(root) {
      var raw = S.get('opt.keywords', '');
      if (!raw) return;
      var kws = String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!kws.length) return;
      var re = new RegExp('(' + kws.map(escapeReg).join('|') + ')', 'gi');
      (function walk(n) {
        [].slice.call(n.childNodes).forEach(function (c) {
          if (c.nodeType === 3) {
            var t = c.textContent; re.lastIndex = 0;
            if (!re.test(t)) return;
            re.lastIndex = 0;
            var frag = document.createDocumentFragment(), last = 0, mm;
            while ((mm = re.exec(t))) {
              if (mm.index > last) frag.appendChild(document.createTextNode(t.slice(last, mm.index)));
              var mk = el('mark', 'gwx-kw'); mk.textContent = mm[0]; frag.appendChild(mk);
              last = mm.index + mm[0].length;
            }
            frag.appendChild(document.createTextNode(t.slice(last)));
            c.parentNode.replaceChild(frag, c);
          } else if (c.nodeType === 1 && c.tagName !== 'MARK' &&
                     !/gwx-badge|gwx-rc|gwx-ldots|gwx-th/.test(c.className || '')) walk(c);
        });
      })(root);
    }
    function decorateSubjectNode(node) {
      if (!node || node.dataset.gwxSubj) return;
      node.dataset.gwxSubj = '1';
      try {
        var tn = null, i, cn = node.childNodes;
        for (i = 0; i < cn.length; i++) {
          if (cn[i].nodeType === 3 && cn[i].textContent.replace(/\s+/g, '')) { tn = cn[i]; break; }
        }
        if (tn) {
          var r = parseSubject(tn.textContent);
          var clean0 = (r.clean || tn.textContent).replace(/\s+/g, ' ').trim();
          node.dataset.gwxCleanSubject = clean0;
          node.dataset.gwxTkey = clean0.toLowerCase();
          if (r.seq.length) {
            if (r.clean.replace(/\s+/g, '')) tn.textContent = ' ' + r.clean;
            node.insertBefore(makeSubjBadge(r.seq), tn);
          }
        }
        highlightKeywords(node);
      } catch (e) { log('subj', e); }
    }

    /* ----- 역할 캐시 / 라벨 저장 ----- */
    // Native list rows wrap Message-ID in <>, while view_message_mid omits them.
    // Preserve case and internal characters: only remove the optional outer pair.
    function roleMid(value) {
      var mid = String(value || '').trim();
      return mid.charAt(0) === '<' && mid.charAt(mid.length - 1) === '>' ? mid.slice(1, -1).trim() : mid;
    }
    var _rc = null, _rcKey = '';
    function rcAll() {
      var me = getMe(), key = 'gwx.roleCache.v139.' + encodeURIComponent(me.uid + '|' + me.email);
      if (!_rc || _rcKey !== key) {
        _rcKey = key;
        var old = storedJson(gmGet(key, '{}'), {}) || {}, normalized = Object.create(null);
        Object.keys(old).forEach(function (k) {
          var mid = roleMid(k), entry = old[k];
          if (!mid || !entry || !entry.t || !/^(to|cc|sent|unknown)$/.test(entry.r || '')) return;
          if (!normalized[mid] || Number(entry.t) > Number(normalized[mid].t)) normalized[mid] = entry;
        });
        _rc = normalized;
      }
      return _rc;
    }
    function roleGet(mid) {
      var r = rcAll()[roleMid(mid)]; return r && r.t && Date.now() - r.t < 30 * 86400000 ? r.r : null;
    }
    function roleSet(mid, role) {
      mid = roleMid(mid); if (!mid) return;
      var m = rcAll();
      if (m[mid] && m[mid].r === role && Date.now() - m[mid].t < 86400000) return;
      m[mid] = { r: role, t: Date.now() };
      var keys = Object.keys(m);
      if (keys.length > 2000) keys.sort(function (a, b) { return m[a].t - m[b].t; }).slice(0, keys.length - 2000).forEach(function (k) { delete m[k]; });
      gmSet(_rcKey, gwxStringify(m));
    }
    /* 1.3.16: native recipient searches classify unopened normal/split lists.
     * One account/folder/message-number key, optional envelope checks, two workers,
     * progressive display, bounded persistent positive cache. No message-opening calls.
     */
    function mailSubjectAnchor(tr) { return qs('td.subj a.tit, td.writer p.subj a.tit, p.subj a.tit', tr); }
    var RoleList = (function () {
      var account = '', entries = Object.create(null), serial = 0, active = null;
      var timer = 0, saveTimer = 0, retryTimer = 0, observer = null, observedRoot = null;
      var rootObserver = null, pulseTimer = 0, stopped = false, pulseKey = '', nativeXhr = null;
      var recentFailures = Object.create(null), nativeParams = null, lastSignature = '', nativePending = false, nativeEpoch = 0;
      var TTL = 7 * 86400000, NEG_TTL = 5 * 60000, MAX_PAGES = 40, MAX_ENTRIES = 4000;
      var CACHE_PREFIX = 'gwx.roleSearch.v1315.';
      var state = { status: 'idle', requests: 0, lifetimeRequests: 0, matched: 0, total: 0,
        eligible: 0, ticks: 0, reason: '', scopeSource: '', identitySource: '' };
      function val(root, selector) { return String((qs(selector, root) || {}).value || '').trim(); }
      function compact(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
      function identity() { var me = getMe(); return me.email ? me.uid + '|' + me.email : ''; }
      function cacheKey() { return CACHE_PREFIX + encodeURIComponent(account); }
      function hash(text) {
        var value = 2166136261;
        for (var i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); }
        return (value >>> 0).toString(36);
      }
      function dayString(d) {
        function pad(n) { return n < 10 ? '0' + n : String(n); }
        return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
      }
      function rowInfo(tr, fallbackPath) {
        var num = val(tr, 'input[name="numbers"]') || String(tr.id || '').replace(/^mail_list-/, '');
        var path = val(tr, 'input[id^="mail_box-"]') || val(tr, 'input[id^="folder-"]') || String(fallbackPath || '');
        if (!/^\d+$/.test(num) || !path) return null;
        var title = qs('input[id^="title-"]', tr), a = mailSubjectAnchor(tr), dateNode = qs('td.date', tr);
        var raw = title ? String(title.value || '') : a ? String(a.getAttribute('data-gwx-raw-subject') || a.getAttribute('title') || '') : '';
        var rawDate = dateNode ? compact(dateNode.getAttribute('data-gwx-date-raw') || dateNode.textContent) : '';
        var dt = /(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s|$)/.exec(rawDate), day = '';
        if (dt) {
          var d = new Date(+dt[1], +dt[2] - 1, +dt[3]);
          if (d.getFullYear() === +dt[1] && d.getMonth() === +dt[2] - 1 && d.getDate() === +dt[3]) day = dayString(d);
        }
        return { path: path, num: num, key: gwxStringify([path, num]),
          mid: roleMid(val(tr, 'input[id^="mid-"]')), guard: raw ? hash(compact(raw)) : '', day: day };
      }
      function compatible(e, info) {
        return e && !(e.mid && info.mid && e.mid !== info.mid) && !(e.guard && info.guard && e.guard !== info.guard);
      }
      function evidence(e, role) {
        if (!e || (e[role] !== 1 && e[role] !== -1)) return 0;
        return Date.now() - Number(e[role + 'At'] || 0) < (e[role] === 1 ? TTL : NEG_TTL) ? e[role] : 0;
      }
      function prune() {
        var keys = Object.keys(entries), now = Date.now();
        keys.forEach(function (key) {
          var e = entries[key];
          if (!e || typeof e !== 'object' || Math.max(Number(e.toAt) || 0, Number(e.ccAt) || 0) > now + 60000 || (!evidence(e, 'to') && !evidence(e, 'cc'))) delete entries[key];
        });
        keys = Object.keys(entries);
        if (keys.length > MAX_ENTRIES) keys.sort(function (a, b) {
          var x = entries[a], y = entries[b]; return Math.max(x.toAt || 0, x.ccAt || 0) - Math.max(y.toAt || 0, y.ccAt || 0);
        }).slice(0, keys.length - MAX_ENTRIES).forEach(function (key) { delete entries[key]; });
      }
      function flush() {
        clearTimeout(saveTimer); saveTimer = 0;
        if (!account) return;
        prune(); gmSet(cacheKey(), gwxStringify(entries));
      }
      function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 350); }
      function cancel() {
        serial++; var previous = active; active = null;
        if (previous) previous.xhrs.forEach(function (xhr) { try { xhr.abort(); } catch (e) {} });
      }
      function resetAccount() {
        var next = identity();
        if (next !== account) {
          if (saveTimer) flush(); cancel(); account = next; entries = Object.create(null); recentFailures = Object.create(null);
          if (account) {
            var stored = storedJson(gmGet(cacheKey(), '{}'), {}) || {};
            if (stored && typeof stored === 'object' && !Array.isArray(stored)) Object.keys(stored).forEach(function (key) {
              var pair = storedJson(key, null), e = stored[key];
              if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && /^\d+$/.test(pair[1]) && e && typeof e === 'object') entries[key] = e;
            });
            prune();
          }
        }
        return account;
      }
      function context() {
        var lp = W.list_param || {}, captured = nativeParams || {};
        var path = String(lp.path || captured.path || ''), action = String(lp.acton || captured.acton || '');
        var source = lp.path ? 'native-global' : captured.path ? 'native-request' : '';
        // The supplied HTML marks the selected native folder with a.slct.
        // Do not use the editable detail-search form as the current folder.
        var rowAction = val(LIST(), '#actonType');
        if (!path && /^(|normalmessages|filtermessages)$/.test(rowAction || action)) {
          var selected = qsa('#folder_content a.slct[href]'), paths = [];
          selected.forEach(function (a) {
            var m = /^javascript:\s*getMessages\(\s*(['"])([^'"\\\r\n]+)\1\s*,\s*true\s*\)/.exec(a.getAttribute('href') || '');
            if (m && paths.indexOf(m[2]) < 0) paths.push(m[2]);
          });
          if (paths.length === 1) { path = paths[0]; source = 'selected-folder'; }
        }
        return { path: path, acton: action, source: source };
      }
      function lookup(tr) {
        if (!S.get('opt.roleAuto', true) || !resetAccount()) return null;
        var info = rowInfo(tr, context().path), e = info && entries[info.key];
        if (!info || !compatible(e, info)) return null;
        var to = evidence(e, 'to') === 1, cc = evidence(e, 'cc') === 1;
        return to && cc ? 'both' : to ? 'to' : cc ? 'cc' : null;
      }
      function note(info, role, value) {
        var e = entries[info.key];
        if (!compatible(e, info)) e = entries[info.key] = {};
        if (info.mid) e.mid = info.mid;
        if (info.guard) e.guard = info.guard;
        e[role] = value; e[role + 'At'] = Date.now();
      }
      function mark(status, reason) {
        state.status = status; state.reason = reason || '';
        if (document.documentElement && document.documentElement.getAttribute('data-gwx-role-state') !== status) document.documentElement.setAttribute('data-gwx-role-state', status);
      }
      function apply() { roleChips(LIST()); state.matched = qsa('tr[data-gwx-rc]', LIST()).length; }
      function listVisible(l) {
        if (!l || !l.isConnected || document.hidden) return false;
        var css = getComputedStyle(l);
        if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse') return false;
        // offsetParent is null for a visible fixed-position element too.
        return l.getClientRects().length > 0 || qsa('tr[id^="mail_list-"]', l).some(function (tr) { return tr.getClientRects().length > 0; });
      }
      function snapshot(force) {
        var l = LIST(), c = context(), action = val(l, '#actonType') || c.acton;
        var rows = l ? qsa('tr[id^="mail_list-"]', l) : [], me = getMe();
        state.total = rows.length; state.eligible = 0; state.scopeSource = c.source; state.identitySource = me.source || '';
        state.matched = l ? qsa('tr[data-gwx-rc]', l).length : 0;
        if (!l) { mark('waiting', '메일 목록 요소가 아직 없습니다'); return null; }
        if (!listVisible(l)) { mark('hidden', document.hidden ? '브라우저 탭이 비활성 상태입니다' : '메일 목록이 숨겨져 있습니다'); return null; }
        if (!rows.length) { mark('waiting', '목록 요소는 있지만 메일 행이 아직 없습니다'); return null; }
        if (!resetAccount()) { mark('identity', '본인 메일주소를 확인하지 못했습니다. 내 수신자 판정 설정에서 입력할 수 있습니다'); return null; }
        if (action && !/^(normalmessages|filtermessages|simplemessages|detailmessages)$/.test(action)) { mark('scope', '현재 화면은 지원하는 메일 목록 종류가 아닙니다'); return null; }
        var all = [], keys = [], groups = Object.create(null), skipped = 0;
        rows.forEach(function (tr) {
          var info = rowInfo(tr, c.path);
          if (!info) { skipped++; return; }
          if (info.path === W.draft_folder_path || info.path === W.reserved_mail_path || info.path === 'FORMBOX') return;
          all.push(info); keys.push(info.key + ':' + info.mid + ':' + info.guard);
          var e = entries[info.key];
          if (force || !compatible(e, info) || (!evidence(e, 'to') && !evidence(e, 'cc')) ||
              (evidence(e, 'to') !== 1 && evidence(e, 'cc') !== 1 && !(evidence(e, 'to') === -1 && evidence(e, 'cc') === -1))) {
            if (!groups[info.path]) groups[info.path] = { path: info.path, targets: Object.create(null), days: [], allDates: true };
            var group = groups[info.path]; group.targets[info.key] = info;
            if (info.day) group.days.push(info.day); else group.allDates = false;
          }
        });
        state.eligible = all.length;
        if (!all.length) { mark('scope', skipped ? '행은 있으나 메일함·메일 번호를 연결하지 못했습니다' : '임시보관·예약 등 자동 분류 제외 목록입니다'); return null; }
        var plans = Object.keys(groups).sort().map(function (path) {
          var g = groups[path], days = g.days.sort();
          function shifted(day, amount) { var a = day.split('.'); return dayString(new Date(+a[0], +a[1] - 1, +a[2] + amount)); }
          g.from = g.allDates && days.length ? shifted(days[0], -1) : '1900.01.01';
          g.to = g.allDates && days.length ? shifted(days[days.length - 1], 1) : dayString(new Date());
          return g;
        });
        return { account: account, email: getMe().email, all: all, plans: plans, total: all.length, skipped: skipped,
          signature: account + '|' + keys.sort().join('|'), xhrs: new Set(), errors: [] };
      }
      function params(plan, role, page, email) {
        // Explicit native contract: no live search form edits and no read/unread mutation requests.
        var p = { acton: 'detailmessages', path: plan.path, page: page, filter: '', term: '', criteria: '',
          pagename: 'messages', subjectterm: '', senderterm: '', filenameterm: '', torecterm: '', ccrecterm: '',
          flagunread: true, flagseen: true, flagreply: false, flagforward: false, flaghasatt: false, flagnoatt: false,
          fromdateterm: plan.from, todateterm: plan.to, issentterm: false, asc: false, ordername: 'OrderDateMessages',
          allmailbox: false, sendertermmail: '', torectermmail: '', ccrectermmail: '', pagingFlag: false, submailbox: false };
        p[role === 'cc' ? 'ccrecterm' : 'torecterm'] = email; return p;
      }
      function parse(html, plan, requestedPage) {
        var t = document.createElement('template'); t.innerHTML = html;
        var root = t.content, type = val(root, '#actonType'), currentPage = val(root, '#currentPage');
        var last = val(root, '#lastpage'), total = val(root, '#msgTotalCount');
        if (type !== 'detailmessages' || !/^\d+$/.test(currentPage) || +currentPage !== requestedPage ||
            !/^-?\d+$/.test(last) || !/^\d+$/.test(total) || (+total > 0 && +last < requestedPage)) throw new Error('검색 응답의 페이지 정보를 확인하지 못했습니다');
        var rows = qsa('tr[id^="mail_list-"]', root), infos = [];
        rows.forEach(function (tr) { var info = rowInfo(tr, plan.path); if (info && info.path === plan.path) infos.push(info); });
        if ((+total > 0 && (!rows.length || infos.length !== rows.length)) || (+total === 0 && rows.length)) throw new Error('검색 결과의 메일함·메일 번호를 확인하지 못했습니다');
        return { infos: infos, last: Math.max(0, +last), total: +total };
      }
      function current(job) { return active === job && job.serial === serial && identity() === job.account && S.get('opt.roleAuto', true); }
      function request(job, data) {
        return new Promise(function (resolve, reject) {
          if (!current(job)) { reject(new Error('cancelled')); return; }
          var xhr = new W.XMLHttpRequest(); xhr.__gwxRecipientLookup = true; job.xhrs.add(xhr); state.requests++; state.lifetimeRequests++;
          function finish() { job.xhrs.delete(xhr); }
          xhr.open('POST', '/wma/fld.do', true); xhr.timeout = 15000;
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
          xhr.onload = function () {
            finish(); if (!current(job)) { reject(new Error('cancelled')); return; }
            if (xhr.status < 200 || xhr.status >= 300 || xhr.responseText.length > 5000000) { reject(new Error('검색 요청에 실패했습니다')); return; }
            resolve(xhr.responseText);
          };
          xhr.onerror = xhr.ontimeout = function () { finish(); reject(new Error('검색 연결을 확인해 주세요')); };
          xhr.onabort = function () { finish(); reject(new Error('cancelled')); };
          xhr.send(Object.keys(data).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(data[k])); }).join('&'));
        });
      }
      async function stream(job, plan, role) {
        var last = 0, previous = '', expectedTotal = null, seen = Object.create(null), exhausted = false;
        var targetKeys = Object.keys(plan.targets);
        for (var page = 0; page <= last; page++) {
          if (!current(job)) return;
          if (page >= MAX_PAGES) throw new Error('검색 결과가 많아 일부만 확인했습니다');
          var result = parse(await request(job, params(plan, role, page, job.email)), plan, page);
          if (!current(job)) return;
          if (expectedTotal !== null && result.total !== expectedTotal) throw new Error('조회 중 검색 결과 수가 변경되어 일부만 확인했습니다');
          expectedTotal = result.total; last = result.last;
          var pageKey = result.infos.map(function (info) { return info.key; }).join('|');
          if (page > 0 && pageKey && pageKey === previous) throw new Error('서버가 같은 검색 페이지를 반복 반환했습니다');
          previous = pageKey;
          result.infos.forEach(function (info) {
            // Cache positive results outside the current screen too, for the next page.
            if (plan.targets[info.key] && !compatible(info, plan.targets[info.key])) throw new Error('같은 메일 번호의 제목·식별 정보가 달라 연결하지 않았습니다');
            note(info, role, 1); seen[info.key] = info;
          });
          saveSoon(); apply();
          if (page === last) { exhausted = true; break; }
          if (targetKeys.every(function (key) { return seen[key] && compatible(seen[key], plan.targets[key]); })) break;
          // Two requests at most; a small yield lets native UI/input work between pages.
          await new Promise(function (resolve) { setTimeout(resolve, 40); });
        }
        if (!current(job)) return;
        if (exhausted) targetKeys.forEach(function (key) {
          if (!seen[key]) note(plan.targets[key], role, -1);
        });
        saveSoon(); apply();
      }
      async function run(job) {
        var tasks = [], cursor = 0;
        job.plans.forEach(function (plan) { tasks.push({ plan: plan, role: 'cc' }, { plan: plan, role: 'to' }); });
        async function worker() {
          while (current(job) && cursor < tasks.length) {
            var task = tasks[cursor++];
            try { await stream(job, task.plan, task.role); }
            catch (e) { if (current(job)) job.errors.push(e.message || '검색 결과를 확인하지 못했습니다'); }
          }
        }
        await Promise.all([worker(), worker()]);
        if (!current(job)) return;
        active = null; flush();
        if (job.errors.length || job.skipped) {
          recentFailures[job.signature] = Date.now();
          mark('partial', job.errors[0] || '메일함 정보가 없는 행은 확인하지 않았습니다');
        } else mark('ready');
        apply();
        clearTimeout(retryTimer); retryTimer = setTimeout(schedule, NEG_TTL + 1000);
      }
      function tick(force) {
        clearTimeout(timer); timer = 0;
        state.ticks++;
        if (!S.get('opt.roleAuto', true)) { cancel(); mark('off'); apply(); return; }
        if (nativePending && nativeXhr && (nativeXhr.readyState === 4 || nativeXhr.readyState === 0)) {
          nativePending = false; nativeXhr = null;
        }
        if (nativePending) { mark('loading', '메일 목록을 불러오는 중'); return; }
        var snap = snapshot(force);
        if (!snap) {
          if (active) cancel();
          return;
        }
        state.eligible = snap.total;
        if (active && active.signature === snap.signature && !force) { apply(); return; }
        if (active) cancel();
        if (!force && Date.now() - (recentFailures[snap.signature] || 0) < 60000) { mark('partial', state.reason); apply(); return; }
        if (!snap.plans.length) { if (lastSignature !== snap.signature) state.requests = 0; lastSignature = snap.signature; mark(snap.skipped ? 'partial' : 'ready', snap.skipped ? '일부 행의 메일함 정보를 확인하지 못했습니다' : '저장된 확인 결과 사용'); apply(); return; }
        if (force) snap.all.forEach(function (info) { delete entries[info.key]; });
        state.requests = 0; lastSignature = snap.signature; mark('loading'); active = snap; snap.serial = ++serial;
        apply(); run(snap).catch(function (e) {
          if (current(snap)) { cancel(); recentFailures[snap.signature] = Date.now(); mark('error', '자동 조회 처리 중 오류가 발생했습니다'); log('recipient run', e); }
        });
      }
      function safeTick(force) {
        if (stopped) return;
        try { tick(force); }
        catch (e) { cancel(); mark('error', '목록 판정 준비 중 오류가 발생했습니다'); log('recipient tick', e); }
      }
      function observeList() {
        var root = LIST();
        if (root === observedRoot) return;
        if (observer) observer.disconnect(); observedRoot = root;
        if (!root) return;
        // Does not depend on opening a message or on decorateList succeeding first.
        observer = new MutationObserver(function (changes) {
          if (changes.some(function (change) { return change.type === 'childList' || change.target === observedRoot; })) schedule();
        });
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      }
      function schedule() {
        if (stopped) return;
        observeList();
        // Leading scheduling: repeated redraws cannot postpone the first query forever.
        if (!timer) timer = setTimeout(function () { safeTick(false); }, 120);
      }
      function clearCache() { cancel(); clearTimeout(saveTimer); saveTimer = 0; resetAccount(); entries = Object.create(null); recentFailures = Object.create(null); if (account) gmDelete(cacheKey()); safeTick(true); }
      function pulse() {
        if (stopped) return;
        try {
          var l = LIST(), c = context();
          var key = identity() + '|' + c.path + '|' + c.acton + '|' + listVisible(l) + '|' +
            (l ? qsa('tr[id^="mail_list-"]', l).map(function (tr) { return tr.id; }).join(',') : '');
          if (l !== observedRoot || key !== pulseKey || /^(idle|waiting|identity|scope|error)$/.test(state.status) || nativePending) schedule();
          pulseKey = key;
        } catch (e) { mark('error', '목록 준비 상태 확인 중 오류가 발생했습니다'); log('recipient pulse', e); }
      }
      function startLifecycle() {
        stopped = false;
        if (!rootObserver && document.documentElement) {
          rootObserver = new MutationObserver(function () { if (LIST() !== observedRoot) schedule(); });
          rootObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
        if (!pulseTimer) pulseTimer = setInterval(pulse, 1500);
        schedule();
      }
      // Track only list scope, never session keys or request bodies unrelated to mail lists.
      // The site's list_param is authoritative when available; this covers late initialization.
      try {
        var XP = W.XMLHttpRequest.prototype;
        if (!XP.__gwxRecipientScope) {
          var originalOpen = XP.open, originalSend = XP.send;
          XP.__gwxRecipientScope = true;
          XP.open = function (method, url) {
            this.__gwxListScope = null;
            try { var u = new URL(String(url), location.href); if (String(method).toUpperCase() === 'POST' && u.origin === location.origin && u.pathname === '/wma/fld.do') this.__gwxListScope = true; } catch (e) {}
            return originalOpen.apply(this, arguments);
          };
          XP.send = function (body) {
            if (this.__gwxListScope && !this.__gwxRecipientLookup && typeof body === 'string') try {
              var p = new URLSearchParams(body), a = p.get('acton') || '';
              if (/^(normalmessages|filtermessages|simplemessages|detailmessages)$/.test(a)) {
                var data = { acton: a, path: p.get('path') || '' };
                if (W.__gwxRecipientNativeRequest) W.__gwxRecipientNativeRequest(this, data);
              }
            } catch (e) {}
            try { return originalSend.apply(this, arguments); }
            catch (e) { if (nativeXhr === this) { nativePending = false; nativeXhr = null; schedule(); } throw e; }
          };
        }
        W.__gwxRecipientNativeRequest = function (xhr, data) {
          cancel(); clearTimeout(timer); timer = 0; nativePending = true; nativeXhr = xhr; var epoch = ++nativeEpoch;
          xhr.addEventListener('loadend', function () {
            if (epoch !== nativeEpoch) return;
            nativePending = false; nativeXhr = null;
            if (xhr.status >= 200 && xhr.status < 300) nativeParams = data;
            schedule();
          }, { once: true });
        };
      } catch (e) { log('recipient list scope', e); }
      hubAction('목록 수신·참조 다시 확인', function () { safeTick(true); toast('현재 목록의 수신·참조를 다시 확인합니다'); });
      hubAction('목록 수신·참조 캐시 비우기', function () { clearCache(); toast('저장된 목록 분류를 비우고 다시 확인합니다'); });
      hubAction('목록 수신·참조 확인 상태', function () {
        toast('목록 분류: ' + ({ idle: '대기', waiting: '목록 준비 대기', hidden: '화면 표시 대기', scope: '메일함 확인 필요', error: '처리 오류', identity: '본인 주소 확인 필요', off: '꺼짐', loading: '확인 중', ready: '완료', partial: '일부 확인' }[state.status] || state.status) +
          ' · 목록 ' + state.total + '건 · 대상 ' + state.eligible + '건 · 표시 ' + state.matched + '건 · 누적 조회 ' + state.lifetimeRequests + '회' + (state.reason ? ' · ' + state.reason : ''));
      });
      function diagnostics() {
        var l = LIST(), c = context(), me = getMe();
        return { version: GWX_VER, status: state.status, reason: state.reason,
          enabled: !!S.get('opt.roleAuto', true), listFound: !!l, listVisible: listVisible(l), documentHidden: document.hidden,
          domRows: l ? qsa('tr[id^="mail_list-"]', l).length : 0, eligible: state.eligible, matched: state.matched,
          lifetimeRequests: state.lifetimeRequests, currentRequests: state.requests, ticks: state.ticks,
          hasOwnEmail: !!me.email, identitySource: me.source || '', hasFolder: !!c.path, folderSource: c.source,
          action: /^(normalmessages|filtermessages|simplemessages|detailmessages)$/.test(val(l, '#actonType') || c.acton) ? (val(l, '#actonType') || c.acton) : 'unavailable',
          nativePending: nativePending, activeSearch: !!active, rootObserved: !!l && observedRoot === l };
      }
      hubAction('목록 수신·참조 진단 복사', function () { W.prompt('아래 진단값을 복사해 주세요. 메일 제목·본문·주소·세션값은 포함하지 않습니다.', gwxStringify(diagnostics())); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) cancel(); else schedule(); });
      W.addEventListener('pagehide', function () {
        stopped = true; cancel(); clearTimeout(timer); timer = 0; clearTimeout(retryTimer); clearInterval(pulseTimer); pulseTimer = 0;
        if (observer) observer.disconnect(); observedRoot = null;
        if (rootObserver) rootObserver.disconnect(); rootObserver = null; flush();
      });
      W.addEventListener('pageshow', startLifecycle);
      onReady(startLifecycle);
      startLifecycle();
      return { lookup: lookup, schedule: schedule, refresh: function () { safeTick(true); }, clear: clearCache,
        rowInfo: rowInfo, parse: parse, params: params, state: state, diagnostics: diagnostics };
    })();


    var LB_COLORS = ['#e5484d', '#dd6b20', '#dfa32e', '#178043', '#0e8a7d', '#0369a1', '#b6246f', '#5b6772'];
    var _lb = null;
    function lbAll() {
      if (_lb) return _lb;
      try { _lb = storedJson(gmGet('gwx.labels', '{"defs":[],"map":{}}'), { defs: [], map: {} }) || { defs: [], map: {} }; }
      catch (e) { _lb = { defs: [], map: {} }; }
      _lb.defs = storedJson(_lb.defs, []); _lb.map = storedJson(_lb.map, {});
      if (!Array.isArray(_lb.defs)) _lb.defs = [];
      Object.keys(_lb.map).forEach(function (mid) {
        var ids = storedJson(_lb.map[mid], []); _lb.map[mid] = Array.isArray(ids) ? ids : [];
      });
      return _lb;
    }
    function lbSave() { gmSet('gwx.labels', gwxStringify(lbAll())); }
    function lbOf(mid) {
      var L = lbAll(), ids = L.map[mid] || [];
      return L.defs.filter(function (d) { return ids.indexOf(d.id) > -1; });
    }
    function lbDots(mid) {
      var ds = lbOf(mid);
      if (!ds.length) return null;
      var w = el('span', 'gwx-ldots');
      w.dataset.sig = ds.map(function (d) { return d.id; }).join(',');
      ds.forEach(function (d) {
        var i = el('i'); i.style.setProperty('--lc', d.c); i.title = d.n; w.appendChild(i);
      });
      return w;
    }
    function refreshLabelDots() {
      var l = LIST(); if (!l) return;
      qsa('.content_lst_body table tbody tr', l).forEach(function (tr) {
        try {
          var midEl = qs('input[id^="mid-"]', tr); if (!midEl) return;
          var mid = midEl.getAttribute('value') || midEl.value;
          var host = mailSubjectAnchor(tr); if (!host) return;
          var cur = qs('.gwx-ldots', host);
          var neu = lbDots(mid);
          var sig = neu ? neu.dataset.sig : '';
          if (cur && cur.dataset.sig === sig) return;
          if (cur) gwxRemove(cur);
          if (neu) host.insertBefore(neu, host.firstChild);
        } catch (e) {}
      });
    }

    /* ----- F3 아바타 / F4 날짜 / F5 상태 ----- */
    function makeAvatar(uid, name, size) {
      var w = el('span', 'gwx-avatar');
      w.style.width = w.style.height = size + 'px';
      var dark = document.documentElement.getAttribute('data-gwx-theme') === 'dark';
      w.style.background = 'hsl(' + hashHue(name || uid) + ',36%,' + (dark ? '42%' : '50%') + ')';
      var b = el('b'); b.textContent = (String(name || '?').trim().charAt(0)) || '?';
      w.appendChild(b);
      if (uid) {
        var img = el('img'); img.loading = 'lazy'; img.alt = '';
        img.src = '/jsp/org/view/ViewPicture.jsp?user_id=' + encodeURIComponent(uid);
        img.onerror = function () { gwxRemove(img); };
        w.appendChild(img);
      }
      return w;
    }
    function humanizeDateEl(node) {
      if (!node) return;
      var shown = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      var nowKey0 = new Date().toDateString();
      var raw = shown;
      if (node.dataset.gwxDate === '1' && shown === String(node.dataset.gwxDateRendered || '')) {
        if (node.dataset.gwxDateDay === nowKey0) return;
        raw = String(node.dataset.gwxDateRaw || shown);
      }
      var m = raw.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
      if (!m) return;
      node.dataset.gwxDate = '1'; node.dataset.gwxDateRaw = raw; node.title = raw;
      var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), now = new Date();
      function key(x) { return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate(); }
      var yd = new Date(now); yd.setDate(now.getDate() - 1);
      var out;
      if (key(d) === key(now)) out = m[4] + ':' + m[5];
      else if (key(d) === key(yd)) out = '어제 ' + m[4] + ':' + m[5];
      else if (d.getFullYear() === now.getFullYear()) out = (+m[2]) + '월 ' + (+m[3]) + '일';
      else out = m[1] + '.' + m[2] + '.' + m[3];
      node.dataset.gwxDateRendered = out; node.dataset.gwxDateDay = nowKey0;
      node.textContent = out;
    }
    /* 1.3.8: iconFile·iconUnreadState 판정은 GWXP로 이관(GWX_SEL.icoUnread/icoRead 기준).
     *  3상태(true=안읽음 / false=읽음 / null=판정 불가)는 그대로 유지한다. */
    var STATUS_MAP = {
      'r0.gif': { i: 'mail', c: 'var(--gwx-p)', t: '안읽음 (클릭: 읽음 처리)' },
      'r1.gif': { i: 'mail', c: 'var(--gwx-p)', t: '안읽음 (클릭: 읽음 처리)' },
      'r2.gif': { i: 'mailopen', c: 'var(--gwx-t3)', t: '읽음' },
      'r2af.gif': { i: 'reply', c: 'var(--b-re-fg)', t: '답장·전달함(추정)' },
      'r5.gif': { i: 'mailopen', c: 'var(--gwx-t3)', t: '읽음(상태 R5, 추정)' },
      'r5f.gif': { i: 'forward', c: 'var(--b-fw-fg)', t: '전달함(상태 R5F, 추정)' },
      'r2a.gif': { i: 'reply', c: 'var(--b-re-fg)', t: '이 메일에 답장함(서버 상태 기준, 추정)' },
      'r2r.gif': { i: 'forward', c: 'var(--b-fw-fg)', t: '전달함(추정)' },
      'ico_flag_on.gif': { i: 'starfill', c: 'var(--gwx-flag)', t: '플래그 해제' },
      'ico_flag_off.gif': { i: 'star', c: 'var(--gwx-t3)', t: '플래그 지정' }
    };
    function syncStatus(w, img) {
      var s = iconFile(img.getAttribute('src'));   // 1.3.7: 쿼리스트링·대소문자 정규화
      var m = STATUS_MAP[s];
      if (/^wma-icon-/.test(img.id || '')) {
        var unread = iconUnreadState(s), row = img.closest('tr');
        if (unread !== null) {
          m = { i: unread ? 'mail' : (m ? m.i : 'mailopen'), c: unread ? 'var(--gwx-p)' : (m ? m.c : 'var(--gwx-t3)'),
            t: (unread ? '안읽음 · 클릭하면 읽음 처리' : '읽음') + ' (서버 ' + s.replace(/\.gif$/i, '').toUpperCase() + ')' };
        } else {
          m = { i: row && serverBoldRow(row) ? 'mail' : 'mailopen', c: 'var(--gwx-t3)', t: '서버 상태 미등록: ' + s };
        }
        m.t += '\n상태 아이콘은 내가 받는이·참조인지 또는 내 원문에 대한 답장인지를 나타내지 않습니다.';
      }
      var st = iconUnreadState(s);                 // true / false / null(판정 불가)
      if (m) {
        w.classList.remove('raw');
        if (st === true) w.setAttribute('data-st', 'unread');
        else w.removeAttribute('data-st');
        w.style.setProperty('--st-i', 'var(--gi-' + m.i + ')');
        w.style.setProperty('--st-c', m.c);
        w.title = m.t;
      } else { w.classList.add('raw'); w.removeAttribute('data-st'); w.removeAttribute('title'); }
      // 상태 GIF가 바뀌면 행·폴더 개수까지 함께 갱신한다.
      // 1.3.7: 판정 불가 코드에서는 행 상태를 건드리지 않는다(서버 표시 유지).
      if (st !== null && /^wma-icon-/.test(img.id || '')) {
        var tr = img.closest && img.closest('tr');
        if (tr) {
          var changed = setRowUnread(tr, st);
          if (changed) {
            var num0 = String((tr.id || '').split('-')[1] || '');
            var mv0 = qs('input[id^="mid-"]', tr);
            var mid0 = mv0 ? String(mv0.value || mv0.getAttribute('value') || '') : '';
            if (st) noteUnread(num0, mid0);
            else noteRead(num0, mid0, true);
          }
        }
      }
    }
    function wrapStatusIcons(root) {
      if (!root) return;
      qsa('img[id^="wma-icon-"],img[id^="flag-icon-"],img[id^="message-flag-"]', root).forEach(function (img) {
        var w = img.parentElement;
        if (!w || !w.classList || !w.classList.contains('gwx-st')) {
          w = el('span', 'gwx-st');
          img.parentNode.insertBefore(w, img);
          w.appendChild(img);
        }
        syncStatus(w, img);
      });
    }
    var attrObs = new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        if (mu.attributeName === 'src' && mu.target.tagName === 'IMG') {
          var w = mu.target.parentElement;
          if (w && w.classList && w.classList.contains('gwx-st')) syncStatus(w, mu.target);
        }
      });
    });

    /* ----- F8 용량 게이지 ----- */
    function parseSize(t) {
      if (!t) return null;
      var m = String(t).replace(/,/g, '').match(/([\d.]+)\s*(B|KB|MB|GB)?/i);
      if (!m) return null;
      var u = (m[2] || 'MB').toUpperCase();
      return parseFloat(m[1]) * ({ B: 1, KB: 1024, MB: 1048576, GB: 1073741824 }[u] || 1);
    }
    function buildQuota() {
      try {
        var li = document.getElementById('quotatable');
        if (!li || li.getAttribute('data-gwx')) return;
        var use = parseSize((document.getElementById('usequota') || {}).textContent);
        var lim = parseSize((document.getElementById('limitquota') || {}).textContent);
        var pct = null;
        if (use != null && lim > 0) pct = Math.min(100, use / lim * 100);
        else {
          var g = document.getElementById('gagequota'), bg = document.getElementById('gagequotabg');
          if (g && bg && (g.width + bg.width) > 0) pct = Math.min(100, g.width / (g.width + bg.width) * 100);
        }
        if (pct == null) return;
        li.setAttribute('data-gwx', '1');
        var bar = el('div', 'gwx-quota'), fill = el('i');
        fill.style.width = pct.toFixed(1) + '%';
        bar.appendChild(fill);
        if (pct >= 95) bar.classList.add('crit'); else if (pct >= 80) bar.classList.add('warn');
        li.insertBefore(bar, li.firstChild);
      } catch (e) { log('quota', e); }
    }

    /* ----- (0.9.2) 명칭 변경: 편지쓰기 → 메일 쓰기 ----- */
    function renameLabels() {
      try {
        [['.btn_large_half a.btn_l', '메일 쓰기'], ['.btn_large_half a.btn_r', '내게 쓰기']]
          .forEach(function (mp) {
            var a = qs(mp[0]);
            if (!a || a.getAttribute('data-gwx-rn')) return;
            for (var i = 0; i < a.childNodes.length; i++) {
              var c = a.childNodes[i];
              if (c.nodeType === 3 && c.textContent.replace(/\s+/g, '')) {
                c.textContent = mp[1];
                a.setAttribute('data-gwx-rn', '1');
                break;
              }
            }
          });
      } catch (e) { log('rename', e); }
    }
    function renameViewTitle() {
      try {
        var t = qs('#normal_message_content .title_area .title');
        if (!t) return;
        var w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, null), n;
        while ((n = w.nextNode())) {
          if (/편지\s*읽기/.test(n.textContent)) {
            n.textContent = n.textContent.replace(/편지(\s*)읽기/, '메일$1읽기');
            break;
          }
        }
      } catch (e) {}
    }
    /* ----- (0.9.4) 편지함→메일함 개칭 / KRISS 로고 ----- */
    function renameFolders() {
      try {
        var fc = document.getElementById('folder_content');
        if (!fc) return;
        var w = document.createTreeWalker(fc, NodeFilter.SHOW_TEXT, null), n;
        while ((n = w.nextNode())) {
          var pe = n.parentElement;
          if (pe && /^(SCRIPT|STYLE)$/.test(pe.tagName)) continue;
          if (n.textContent.indexOf('편지함') > -1) {
            n.textContent = n.textContent.replace(/편지함/g, '메일함');
          }
        }
      } catch (e) { log('renameFolders', e); }
    }
    /* 1.2.3: 제목의 (n/N)을 텍스트 노드 단위로 제거하고 소형 필로 재표기 */
    function stripTitleCount(ta) {
      try {
        ta = ta || qs('#list_content .title_area .title');
        if (!ta) return;
        var re = /\(\s*(\d+)\s*\/\s*(\d+)\s*\)/;
        var got = null, nodes = [], n;
        var w = document.createTreeWalker(ta, NodeFilter.SHOW_TEXT, null);
        while ((n = w.nextNode())) nodes.push(n);
        nodes.forEach(function (tn) {
          if (tn.parentElement && tn.parentElement.classList &&
              tn.parentElement.classList.contains('gwx-cnt')) return;
          var t0 = String(tn.textContent || '').replace(/\u00a0/g, ' ');
          var m = re.exec(t0);
          if (!m) return;
          got = m;
          tn.textContent = t0.replace(re, '').replace(/\s+$/, '');
        });
        if (got) {
          ta.dataset.gwxUnreadCount = got[1];
          ta.dataset.gwxTotalCount = got[2];
          paintFolderCount(got[1], got[2]);
        }
      } catch (e) {}
    }
    /* 1.3.0: 개수를 좌측 사이드바 현재 폴더 줄에 배경 없이 표기 */
    function paintFolderCount(unread, total) {
      try {
        qsa('#folder_content .gwx-fcnt').forEach(function (x) { gwxRemove(x); });
        if (S.get('opt.titleCount', true) === false) return;
        var a = qs('#folder_content .snb_lst a.slct') || qs('#folder_content a.slct');
        if (!a) return;
        var sp = el('span', 'gwx-fcnt');
        sp.textContent = unread + ' / ' + total;
        sp.title = '안읽음 ' + unread + '건 · 전체 ' + total + '건';
        a.appendChild(sp);
      } catch (e) {}
    }
    function watchTitle() {
      try {
        var ta = qs('#list_content .title_area');
        if (!ta || ta._gwxTw) return;
        ta._gwxTw = 1;
        new MutationObserver(debounce(function () {
          stripTitleCount(); renameListTitle();
        }, 60)).observe(ta, { childList: true, subtree: true, characterData: true });
      } catch (e) {}
    }
    function renameListTitle() {
      try {
        var t = qs('#list_content .title_area .title');
        if (!t) return;
        var w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, null), n;
        while ((n = w.nextNode())) {
          if (n.textContent.indexOf('편지함') > -1) {
            n.textContent = n.textContent.replace(/편지함/g, '메일함');
          }
        }
        stripTitleCount(t);
      } catch (e) {}
    }
    function renameDetail() {
      try {
        var wrap = qs('.detail_srch_wrap');
        if (!wrap || wrap.getAttribute('data-gwx-rn')) return;
        wrap.setAttribute('data-gwx-rn', '1');
        var w = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT, null), n;
        while ((n = w.nextNode())) {
          var t = n.textContent;
          if (t.indexOf('편지') > -1) {
            n.textContent = t.replace(/편지함/g, '메일함').replace(/편지/g, '메일');
          }
        }
        // 0.9.7(요구1): 초기화/검색 버튼을 패널 하단 푸터로 이동(핸들러 유지)
        if (!qs('.gwx-dsr-foot', wrap)) {
          var foot = el('div', 'gwx-dsr-foot');
          var rst = qs('.btn_reset', wrap);
          var sq = qs('span.btn_sqr', wrap);
          if (rst) foot.appendChild(rst);
          if (sq) foot.appendChild(sq);
          if (foot.children.length) wrap.appendChild(foot);
        }
      } catch (e) {}
    }
    function addLogo() {
      try {
        var fc = document.getElementById('folder_content');
        if (!fc || qs('.gwx-logo', fc)) return;
        var wrap = el('div', 'gwx-logo');
        var a = el('a');
        a.href = 'https://krisstar.kriss.re.kr/'; a.target = '_blank'; a.rel = 'noopener';
        a.title = 'KRISS 인트라넷(krisstar)을 새 창으로 엽니다';
        var src = '';
        try {
          for (var i = 0; i < W.top.frames.length; i++) {
            var fw = W.top.frames[i], fu = '';
            try { fu = fw.location.pathname || ''; } catch (e2) { continue; }
            if (fu.indexOf('menu.jsp') > -1) {
              var im = fw.document.querySelector('img[src*="logo" i], h1 img, .logo img');
              if (im && im.src) src = im.src;
              break;
            }
          }
        } catch (e) {}
        if (src) {
          var img = el('img'); img.src = src; img.alt = 'KRISS';
          img.onerror = function () { gwxRemove(img); mkText(); };
          a.appendChild(img);
        } else mkText();
        function mkText() {
          if (qs('b', a)) return;
          var b = el('b'); b.textContent = 'KRISS';
          var sm = el('small'); sm.textContent = '한국표준과학연구원';
          a.appendChild(b); a.appendChild(sm);
        }
        wrap.appendChild(a);
        fc.insertBefore(wrap, fc.firstChild);
      } catch (e) { log('logo', e); }
    }

    /* ----- (0.9.3 / 요구4) 상단 GNB 프레임 숨김·복원 ----- */
    function applyTopMenu() {
      try {
        var hide = S.get('opt.hideGnb', true);
        var td = W.top.document;
        var fsets = td.querySelectorAll('frameset');
        for (var i = 0; i < fsets.length; i++) {
          var fr = fsets[i].querySelector(':scope>frame[src*="menu.jsp"]');
          if (!fr) continue;
          if (!fsets[i].getAttribute('data-gwx-rows')) {
            fsets[i].setAttribute('data-gwx-rows', fsets[i].rows || '');
          }
          fsets[i].rows = hide ? '0,*' : (fsets[i].getAttribute('data-gwx-rows') || '90,*');
          try {
            fsets[i].setAttribute('frameborder', '0');
            fsets[i].setAttribute('border', '0');
            fr.setAttribute('frameborder', '0');
          } catch (e) {}
          info(hide ? '상단 메뉴 프레임 숨김 — Tampermonkey 메뉴에서 언제든 표시 가능' : '상단 메뉴 프레임 표시');
          return;
        }
      } catch (e) { warn('top menu', e); }
    }

    /* ----- 사이드바 테마 토글 ----- */
    function themeRow() {
      try {
        var fc = document.getElementById('folder_content');
        if (!fc || qs('.gwx-themerow', fc)) return;
        var row = el('div', 'gwx-themerow');
        var btn = el('button', 'gwx-btn'); btn.type = 'button';
        function paint() {
          var t = S.get('theme', 'auto');
          var ic = t === 'dark' ? 'moon' : (t === 'light' ? 'sun' : 'contrast');
          var lb = { light: '라이트', dark: '다크', auto: '자동' }[t];
          btn.innerHTML = icon(ic) + '<span>테마: ' + lb + '</span>';
        }
        btn.onclick = function () {
          var nxt = { light: 'dark', dark: 'auto', auto: 'light' }[S.get('theme', 'auto')];
          gmSet('gwx.theme', nxt); applyTheme(); paint();
        };
        paint();
        row.appendChild(btn);
        fc.insertBefore(row, qs('.info_area', fc) || null);
      } catch (e) { log('themeRow', e); }
    }

    /* ----- F2-a 역할 판정(읽기) + 라벨 칩 ----- */
    function roleDecorate(v) {
      var me = getMe(), mid = String((qs('#view_message_mid', v) || {}).value || '');
      var fromId = String((qs('#view_message_from_id', v) || {}).value || '').trim();
      var toDD = qs('.mail_sender .recive dd', v), ccDD = qs('.mail_sender .refer dd', v);
      // IDs and full email addresses are evidence; matching a display name is not.
      function hit(dd) {
        if (!dd) return null;
        var nodes = qsa('a,span', dd);
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i], onclick = n.getAttribute('onclick') || '';
          var id = /showUserProperty\(\s*['"]([^'"]+)['"]/.exec(onclick);
          if (me.uid && id && id[1] === me.uid) return n;
        }
        if (me.email) {
          var candidates = nodes.concat([dd]);
          for (var j = 0; j < candidates.length; j++) {
            var c = candidates[j], text = [c.textContent, c.getAttribute('title'), c.getAttribute('href')].join(' ');
            var addresses = text.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
            if (addresses.indexOf(me.email) !== -1) return c;
          }
        }
        return null;
      }
      var toHit = hit(toDD), ccHit = hit(ccDD);
      var role = fromId && me.uid && fromId === me.uid ? 'sent' : toHit ? 'to' : ccHit ? 'cc' : 'unknown';
      var sig = [mid, role, me.uid, me.email, toDD && toDD.textContent, ccDD && ccDD.textContent].join('|');
      if (v.dataset.gwxRoleSig === sig && (role === 'unknown' || qs('.gwx-badge.b-role', v))) return role;
      v.dataset.gwxRoleSig = sig;
      qsa('.gwx-me', v).forEach(function (x) { x.classList.remove('gwx-me'); });
      var found = toHit || ccHit;
      if (found && found !== toDD && found !== ccDD) found.classList.add('gwx-me');
      var p = qs('p.view_subj', v);
      if (p) {
        qsa('.gwx-badge.b-role', p).forEach(function (x) { gwxRemove(x); });
        if (role !== 'unknown') {
          var bd = el('span', 'gwx-badge b-role b-' + role);
          bd.textContent = { to: '수신', cc: '참조', sent: '발신' }[role];
          bd.title = '메일 수신자 정보에서 확인한 내 수신구분';
          p.insertBefore(bd, qs('a.pop', p) || null);
        }
      }
      if (mid && (me.uid || me.email)) { roleSet(mid, role); roleChips(LIST()); }
      return role;
    }
    function labelChip(v) {
      var p = qs('p.view_subj', v);
      var mid = (qs('#view_message_mid', v) || {}).value;
      if (!p || !mid) return;
      var oldChip = qs('.gwx-lchip', p);
      if (oldChip && oldChip.dataset.gwxMid === String(mid)) return;
      if (oldChip) gwxRemove(oldChip);
      var chip = el('span', 'gwx-badge gwx-lchip'); chip.dataset.gwxMid = String(mid);
      chip.style.cursor = 'pointer';
      function paint() {
        var ds = lbOf(mid);
        chip.innerHTML = icon('tag');
        var sp = el('span');
        sp.textContent = ds.length ? ds.map(function (d) { return d.n; }).join(', ') : '라벨';
        chip.appendChild(sp);
      }
      paint();
      chip.onclick = function (e) {
        e.stopPropagation();
        popover(chip, function (pop) {
          pop.classList.add('gwx-plist');
          var tt = el('p', 'gwx-pt'); tt.textContent = '라벨 (이 브라우저에만 저장)';
          pop.appendChild(tt);
          var L = lbAll();
          var cur = L.map[mid] || [];
          L.defs.forEach(function (d) {
            var row = el('div', 'row');
            var dot = el('i', 'dot'); dot.style.background = d.c;
            var nm = el('span'); nm.textContent = d.n;
            var on = el('span'); on.textContent = cur.indexOf(d.id) > -1 ? '✓' : '';
            on.style.width = '14px'; on.style.color = 'var(--gwx-p-strong)';
            var delx = el('span', 'del'); delx.textContent = '×'; delx.title = '라벨 삭제';
            delx.onclick = function (ev) {
              ev.stopPropagation();
              if (!confirm('라벨 "' + d.n + '" 을(를) 전체에서 삭제할까요?')) return;
              L.defs = L.defs.filter(function (x) { return x.id !== d.id; });
              Object.keys(L.map).forEach(function (k) {
                L.map[k] = (L.map[k] || []).filter(function (x) { return x !== d.id; });
                if (!L.map[k].length) delete L.map[k];
              });
              lbSave(); gwxRemove(pop); paint(); refreshLabelDots();
            };
            row.appendChild(dot); row.appendChild(nm); row.appendChild(on); row.appendChild(delx);
            row.onclick = function () {
              var arr = L.map[mid] || [];
              var ix = arr.indexOf(d.id);
              if (ix > -1) arr.splice(ix, 1); else arr.push(d.id);
              if (arr.length) L.map[mid] = arr; else delete L.map[mid];
              lbSave(); on.textContent = ix > -1 ? '' : '✓';
              paint(); refreshLabelDots();
            };
            pop.appendChild(row);
          });
          var add = el('div', 'add');
          var inp = el('input'); inp.type = 'text'; inp.placeholder = '새 라벨 이름';
          var pick = el('i', 'dot'); pick.style.cssText = 'width:16px;height:16px;border-radius:50%;cursor:pointer;flex:none;align-self:center;background:' + LB_COLORS[0];
          var ci = 0;
          pick.onclick = function () { ci = (ci + 1) % LB_COLORS.length; pick.style.background = LB_COLORS[ci]; };
          pick.title = '클릭해서 색 변경';
          var ok = el('button', 'gwx-btn'); ok.type = 'button'; ok.textContent = '추가';
          ok.style.height = '26px';
          ok.onclick = function () {
            var n = inp.value.trim(); if (!n) return;
            L.defs.push({ id: 'l' + Date.now(), n: n, c: LB_COLORS[ci] });
            lbSave(); gwxRemove(pop); chip.click();
          };
          add.appendChild(pick); add.appendChild(inp); add.appendChild(ok);
          pop.appendChild(add);
        });
      };
      p.appendChild(chip);
    }

    /* ----- F9 탭 ----- */
    var Tabs = {
      list: [], active: 'list', strip: null, MAX: 8, pendingVerify: null,
      elStrip: function () {
        if (this.strip) return this.strip;
        var self = this, s = this.strip = el('div', 'gwx-tabs');
        var rail = this.rail = el('div', 'gwx-tab-rail'); rail.setAttribute('role', 'tablist');
        rail.setAttribute('aria-label', '열린 메일 및 작성 탭'); s.appendChild(rail);
        function scrollButton(text, label, dx) {
          var b = el('button', 'gwx-tab-nav'); b.type = 'button'; b.textContent = text; b.title = label;
          b.setAttribute('aria-label', label); b.onclick = function () { rail.scrollBy({ left: dx }); };
          s.appendChild(b); return b;
        }
        this.prev = scrollButton('‹', '앞쪽 탭 보기', -220);
        this.next = scrollButton('›', '뒤쪽 탭 보기', 220);
        var picker = this.picker = el('select', 'gwx-tab-picker');
        picker.title = '열린 탭 목록'; picker.setAttribute('aria-label', '열린 탭 목록');
        picker.onchange = function () { if (picker.value) self.go(picker.value); };
        s.appendChild(picker);
        rail.addEventListener('wheel', function (e) {
          if (e.ctrlKey || rail.scrollWidth <= rail.clientWidth + 1) return;
          var dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (!dx) return;
          e.preventDefault(); rail.scrollLeft += dx;
        }, { passive: false });
        rail.addEventListener('scroll', function () { self.navState(); }, { passive: true });
        rail.addEventListener('keydown', function (e) {
          if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return;
          var tabs = qsa('.gwx-tab', rail), at = tabs.indexOf(e.target.closest('.gwx-tab'));
          if (at < 0) return;
          e.preventDefault();
          var i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 :
            (at + (e.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
          tabs[i].focus(); self.go(tabs[i].dataset.key);
        });
        this.fitLater = debounce(function () { self.fit(); }, 20);
        window.addEventListener('resize', this.fitLater);
        if (typeof ResizeObserver !== 'undefined') this.resizeObs = new ResizeObserver(this.fitLater);
        return s;
      },
      navState: function () {
        if (!this.rail) return;
        this.prev.disabled = this.rail.scrollLeft <= 1;
        this.next.disabled = this.rail.scrollLeft + this.rail.clientWidth >= this.rail.scrollWidth - 1;
      },
      fit: function () {
        var s = this.strip, host = s && s.parentElement;
        if (!host || !host.getClientRects().length) return;
        var hr = host.getBoundingClientRect(), sx = hr.width / (host.offsetWidth || hr.width || 1);
        var left = 0, end = hr.right - 8 * sx;
        if (!host.classList.contains('gwx-tabs-slot')) {
          var heading = qs('h1,h2,.title', host);
          if (heading) {
            var range = document.createRange(); range.selectNodeContents(heading);
            var headingRight = range.getBoundingClientRect().right;
            left = Math.max(0, (headingRight - hr.left) / sx + 12);
          }
          var root = host.closest('#list_content,#normal_message_content,#main_content') || host;
          qsa('.srch_area,.btn_flip_right,.btn_flip_left', root).forEach(function (n) {
            if (!n.getClientRects().length) return;
            var r = n.getBoundingClientRect();
            if (r.width > 0 && r.bottom > hr.top && r.top < hr.bottom && r.left > hr.left + left * sx) end = Math.min(end, r.left - 10 * sx);
          });
        }
        var width = Math.max(0, (end - hr.left) / sx - left);
        s.style.setProperty('left', left + 'px', 'important');
        s.style.setProperty('right', 'auto', 'important');
        s.style.setProperty('width', width + 'px', 'important');
        this.navState();
      },
      host: function () {
        if (Cmp.layer && Cmp.layer.classList.contains('on')) return qs('.gwx-tabs-slot', Cmp.head);
        var cands = qsa('#list_content > .title_area, #normal_message_content > .title_area, #main_content .title_area');
        for (var i = 0; i < cands.length; i++) if (cands[i].offsetParent !== null) return cands[i];
        return cands[0] || null;
      },
      render: function () {
        var self = this, s = this.elStrip(), rail = this.rail;
        var host = this.host(), total = this.list.length + Cmp.items.size;
        if (!host || !total || !S.get('opt.tabs', true)) { if (s.parentNode) gwxRemove(s); return; }
        if (s.parentNode !== host) {
          host.appendChild(s);
          if (this.resizeObs) {
            this.resizeObs.disconnect(); this.resizeObs.observe(host);
            var search = qs('.srch_area', host.parentElement);
            if (search) this.resizeObs.observe(search);
          }
        }
        var cr = getViewCtx(), split = isListVisible() && ((cr && cr.visible) || isViewVisible()), items = [];
        if (!split) items.push({ key: 'list', ic: 'list', text: '목록', close: false });
        this.list.forEach(function (t) { items.push({ key: 'm:' + t.num, ic: 'mail', text: t.subj || '(제목 없음)', close: true }); });
        Cmp.items.forEach(function (it) { items.push({ key: 'c:' + it.id, ic: 'compose', text: it.title || '메일쓰기', close: true }); });
        var sig = gwxStringify([this.active, items]);
        if (sig !== this.renderSig) {
          this.renderSig = sig;
          var kept = new Map(); qsa('.gwx-tab', rail).forEach(function (d) { kept.set(d.dataset.key, d); });
          items.forEach(function (it, i) {
            var d = kept.get(it.key);
            if (!d) d = self.mkTab(it.key, it.ic, it.text, it.key === self.active, it.close);
            kept.delete(it.key); d.dataset.key = it.key;
            if (d.title !== it.text) { d.title = it.text; qs('span', d).textContent = it.text; }
            d.classList.toggle('on', it.key === self.active);
            d.setAttribute('aria-selected', String(it.key === self.active));
            if (rail.children[i] !== d) rail.insertBefore(d, rail.children[i] || null);
          });
          kept.forEach(function (d) { gwxRemove(d); });
          this.picker.textContent = '';
          var placeholder = el('option'); placeholder.value = ''; placeholder.textContent = '▾'; this.picker.appendChild(placeholder);
          items.forEach(function (it) { var op = el('option'); op.value = it.key; op.textContent = (it.key === self.active ? '✓ ' : '') + it.text; self.picker.appendChild(op); });
          this.picker.value = '';
          var on = qs('.gwx-tab.on', rail);
          if (on) {
            if (on.offsetLeft < rail.scrollLeft) rail.scrollLeft = on.offsetLeft;
            else if (on.offsetLeft + on.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = on.offsetLeft + on.offsetWidth - rail.clientWidth;
          }
        }
        this.fitLater();
      },
      mkTab: function (key, ic, text, on, closable) {
        var self = this;
        var d = el('div', 'gwx-tab' + (on ? ' on' : ''));
        d.innerHTML = icon(ic);
        var sp = el('span'); sp.textContent = text; d.appendChild(sp);
        d.title = text; d.dataset.key = key; d.tabIndex = 0; d.setAttribute('role', 'tab');
        d.addEventListener('keydown', function (e) {
          if (e.target !== d) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.go(key); }
          if (e.key === 'Delete' && closable) { e.preventDefault(); self.closeKey(key); }
        });
        // 0.9.3: 페이지 전역 click 캡처의 간섭 가능성 차단 — pointerdown 우선
        d.addEventListener('pointerdown', function (e) {
          if (e.button !== 0) return;
          if (e.target.closest && e.target.closest('.gwx-tclose')) return;
          d._gwxPd = Date.now();
          self.go(key);
        });
        d.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('.gwx-tclose')) return;
          if (d._gwxPd && Date.now() - d._gwxPd < 800) return;
          self.go(key);
        });
        if (closable) {
          d.addEventListener('auxclick', function (e) {
            if (e.button === 1) { e.preventDefault(); self.closeKey(key); }
          });
          var x = el('i', 'gwx-tclose'); x.innerHTML = icon('x'); x.title = '닫기';
          x.tabIndex = 0; x.setAttribute('role', 'button'); x.setAttribute('aria-label', text + ' 탭 닫기');
          x.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); self.closeKey(key); }
          });
          x.addEventListener('pointerdown', function (e) {
            e.stopPropagation(); e.preventDefault();
            x._gwxC = 1; self.closeKey(key);
          });
          x.addEventListener('click', function (e) {
            e.stopPropagation();
            if (x._gwxC) { x._gwxC = 0; return; }
            self.closeKey(key);
          });
          d.appendChild(x);
        }
        return d;
      },
      snapActive: function () {
        if (this.active.indexOf('m:') !== 0) return;
        var num = this.active.slice(2);
        var t = this.list.filter(function (x) { return String(x.num) === String(num); })[0];
        var cs = getViewCtx();
        if (!t || !cs || !cs.visible) return;
        var body = qs('.view_body_contents', cs.root);
        t.scroll = body ? body.scrollTop : 0;
      },
      go: function (key) {
        var self = this;
        try {
          if (key === this.active) {
            if (key.indexOf('c:') === 0) Cmp.show(+key.slice(2));
            return;
          }
          this.snapActive();
          if (key.indexOf('c:') === 0) {
            this.active = key; Cmp.show(+key.slice(2)); this.render(); return;
          }
          Cmp.hide();
          if (key === 'list') {
            this.active = 'list';
            var cl = getViewCtx();
            if (isListVisible() && ((cl && cl.visible) || isViewVisible())) { this.render(); return; } // 분할
            if (isViewVisible()) {
              var back = qs('#up_button a[title="목록"]', NMC()) || btnByText(NMC(), ['목록']);
              var done = false;
              if (back) { back.click(); done = true; }
              if (!done) {
                try { if (typeof W.viewList === 'function') { W.viewList(); done = true; } }
                catch (e) { log('viewList', e); }
              }
              if (!done) { // 최후 폴백: 원본 토글 재현(표시만 전환) + 목록 새로고침
                try {
                  var l = LIST(), vv = NMC();
                  if (vv) vv.style.display = 'none';
                  if (l) {
                    l.style.display = '';
                    if (getComputedStyle(l).display === 'none') l.style.display = 'block';
                  }
                  refreshList();
                } catch (e2) { warn('list fallback', e2); }
              }
            }
            this.render(); return;
          }
          var num = key.slice(2);
          var t = this.list.filter(function (x) { return String(x.num) === String(num); })[0];
          if (!t) return;
          this.active = key;
          var cgo = getViewCtx();
          if (isListVisible() && ((cgo && cgo.visible) || isViewVisible())) {
            // 분할 모드: 우측 패널을 원본 브라우즈로 로드
            this.pendingVerify = { num: t.num, mid: t.mid, scroll: t.scroll || 0 };
            try { W.browse(t.num); } catch (e) { warn('browse(split)', e); }
            this.render(); return;
          }
          // 1.3.3: innerHTML 스냅숏은 원본/GWX 이벤트 리스너를 잃으므로 사용하지 않는다.
          if (S.get('opt.tabRestore', 'refetch') !== 'refetch') S.set('opt.tabRestore', 'refetch');
          this.pendingVerify = { num: t.num, mid: t.mid, scroll: t.scroll || 0 };
          try { W.browse(t.num); } catch (e) { warn('browse', e); toast('재조회 실패'); }
          this.render();
        } catch (e) { warn('tab go', e); }
      },
      closeKey: function (key) {
        if (key.indexOf('c:') === 0) { Cmp.close(+key.slice(2), false); return; }
        if (key.indexOf('m:') === 0) {
          var num = key.slice(2);
          this.list = this.list.filter(function (x) { return String(x.num) !== String(num); });
          if (this.active === key) this.go('list'); else this.render();
        }
      },
      closeAll: function () {
        var ids = [], dirty = false;
        Cmp.items.forEach(function (it) { ids.push(it.id); if (!dirty && Cmp.dirty(it)) dirty = true; });
        if (dirty && !confirm('작성 중인 메일이 있습니다. 모든 탭을 닫을까요?')) return;
        this.list = [];
        ids.forEach(function (id) { Cmp.close(id, true); });
        this.go('list');
      },
      upsertFromView: function () {
        var self = this;
        if (!S.get('opt.tabs', true)) return;
        // 0.9.7: 분할(미리보기) 모드에서도 탭 동작
        var composing = !!(Cmp.layer && Cmp.layer.classList.contains('on'));
        var ctx = getViewCtx();
        var v = (ctx && ctx.root) || NMC();
        if (!v) return;
        var num = ctx && ctx.num;
        var viewOn = !!(ctx && ctx.visible);
        // 0.9.6/0.9.9: '실제로 보이는' 열람 영역만 열람 상태로 인정(컨테이너 무관)
        if (!num || num === '-1' || !viewOn || !qs('.view_body_contents', v)) {
          this.list = this.list.filter(function (x) { return !x.closeOnReturn; });
          if (!composing && this.active.indexOf('c:') !== 0) this.active = 'list';
          this.render(); return;
        }
        this._root = v;
        if (ctx.nmc) natDisp = { list: (LIST() || {}).style ? LIST().style.display : '', view: v.style.display };
        var mid = (qs('#view_message_mid', v) || {}).value || '';
        var se = qs('.view_subj', v);
        var subj = se ? String(se.dataset.gwxCleanSubject || se.textContent || '').replace(/\s+/g, ' ').trim() : '';
        var pr = parseSubject(subj);
        subj = pr.clean || subj || '(제목 없음)';
        noteRead(num, mid); // 1.0.2: 포털 배지/목록 즉시 동기화
        if (this.pendingVerify) {
          var pv = this.pendingVerify; this.pendingVerify = null;
          if (String(pv.num) === String(num) && pv.mid && mid && pv.mid !== mid) {
            toast('메일 위치가 변경되어 탭을 닫았습니다');
            this.list = this.list.filter(function (x) { return String(x.num) !== String(num); });
            this.active = 'list';
            try { var back = qs('#up_button a[title="목록"]', v) || btnByText(v, ['목록']); back && back.click(); } catch (e) {}
            this.render(); return;
          }
          if (String(pv.num) === String(num) && pv.scroll) {
            setTimeout(function () {
              try { var vb0 = qs('.view_body_contents', v); if (vb0) vb0.scrollTop = pv.scroll; } catch (e) {}
            }, 0);
          }
        }
        var t = this.list.filter(function (x) { return String(x.num) === String(num); })[0];
        if (!t) {
          t = { num: num, mid: mid, subj: subj, scroll: 0, closeOnReturn: false };
          this.list.push(t);
          if (this.list.length > this.MAX) {
            for (var i = 0; i < this.list.length; i++) {
              if ('m:' + this.list[i].num !== 'm:' + num) { this.list.splice(i, 1); break; }
            }
          }
        } else { t.subj = subj; if (mid) t.mid = mid; t.closeOnReturn = false; }
        if (!composing) this.active = 'm:' + num; // 작성 중엔 활성 탭 유지(요구 8)
        this.list = this.list.filter(function (x) {
          return !(x.closeOnReturn && String(x.num) !== String(num));
        });
        // 삭제 버튼 → 탭 닫힘 예약
        var delBtns = qsa('#up_button a[title="삭제"],#up_button a[title="완전삭제"]', v);
        ['삭제', '완전삭제'].forEach(function (tx) {
          var b = btnByText(v, [tx]);
          if (b && delBtns.indexOf(b) === -1) delBtns.push(b);
        });
        delBtns.forEach(function (a) {
          if (a._gwxDel) return; a._gwxDel = 1;
          a.addEventListener('click', function () { t.closeOnReturn = true; }, true);
        });
        this.render();
      }
    };

    /* ----- F10 인라인 편지쓰기 매니저 ----- */
    var nativeOpen = null;
    try { nativeOpen = W.open ? W.open.bind(W) : null; } catch (e) {}
    var Cmp = {
      seq: 0, items: new Map(), layer: null, head: null, body: null,
      ensure: function () {
        if (this.layer) return;
        this.layer = el('div', 'gwx-clayer');
        this.head = el('div', 'gwx-clayer-head');
        var tl = el('b', 'gwx-ch-tl'); tl.textContent = '메일쓰기';
        this.syncTitle = function () {
          try {
            var src2 = qs('#list_content .title_area .title') ||
                       qs('.title_area .title', getViewCtx() ? getViewCtx().root : null);
            if (!src2) return;
            var cs = getComputedStyle(src2);
            tl.style.fontFamily = cs.fontFamily;
            tl.style.fontSize = cs.fontSize;
            tl.style.fontWeight = cs.fontWeight;
            tl.style.lineHeight = cs.lineHeight;
            tl.style.color = cs.color;
            var hr = Cmp.head.getBoundingClientRect();
            var sr = src2.getBoundingClientRect();
            var pad = Math.round(sr.left - hr.left);
            if (pad >= 0 && pad < 200) tl.style.paddingLeft = pad + 'px';
            var ta = src2.closest('.title_area');
            if (ta) {
              var th = Math.round(ta.getBoundingClientRect().height);
              if (th > 30 && th < 90) Cmp.head.style.height = th + 'px';
            }
          } catch (e) {}
        };
        this.head.appendChild(tl);
        this.head.appendChild(el('div', 'gwx-tabs-slot'));
        var right = el('div', 'gwx-ch-right');
        var pop = el('button', 'gwx-btn'); pop.type = 'button';
        pop.innerHTML = icon('external') + '<span>새 창</span>';
        pop.title = '현재 작성 화면을 원래 방식(새 창)으로 엽니다. 작성 중 내용은 옮겨지지 않습니다.';
        var self = this;
        pop.onclick = function () {
          var act = self.activeId(); var it = act != null && self.items.get(act);
          if (!it) return;
          var u = it.url;
          try { u = it.iframe.contentWindow.location.href; } catch (e) {}
          if (nativeOpen) nativeOpen(u, 'gwxpop' + Date.now(), 'width=1020,height=780,scrollbars=yes,resizable=yes');
          if (self.dirty(it)) toast('작성 중 내용은 현재 탭에 그대로 유지했습니다');
        };
        right.appendChild(pop);
        this.head.appendChild(right);
        this.body = el('div', 'gwx-clayer-body');
        this.layer.appendChild(this.head);
        this.layer.appendChild(this.body);
        (document.body || document.documentElement).appendChild(this.layer);
      },
      activeId: function () {
        var on = this.body && qs('.gwx-cframe.on', this.body);
        if (!on) return null;
        var m = /gwx-compose-(\d+)/.exec(on.id || '');
        return m ? +m[1] : null;
      },
      open: function (url) {
        this.ensure();
        var id = ++this.seq;
        var ifr = el('iframe', 'gwx-cframe');
        ifr.id = ifr.name = 'gwx-compose-' + id;
        var draftKey = 'embed-' + Date.now().toString(36) + '-' + id + '-' + Math.random().toString(36).slice(2, 8);
        ifr.dataset.gwxDraftKey = draftKey;
        ifr.src = url;
        this.body.appendChild(ifr);
        this.items.set(id, { id: id, url: url, iframe: ifr, title: '메일쓰기', draftKey: draftKey });
        Tabs.active = 'c:' + id;
        this.show(id);
        Tabs.render();
        var self = this;
        setTimeout(function () {
          var ok = false;
          try {
            var d = ifr.contentDocument;
            ok = !!(d && d.body && (d.body.children.length || d.readyState !== 'complete'));
          } catch (e) { ok = false; }
          if (!ok && self.items.has(id)) {
            if (String(url || '') === 'about:blank') {
              // 폼 target용 빈 프레임은 서버 제출이 늦을 수 있으므로 닫거나 빈 새창으로 보내지 않는다.
              toast('작성 화면 응답이 지연됩니다 — 현재 탭을 유지합니다');
              return;
            }
            toast('임베드에 실패해 새 창으로 엽니다');
            if (nativeOpen) nativeOpen(url, 'gwxpop' + Date.now(), 'width=1020,height=780,scrollbars=yes,resizable=yes');
            self.close(id, true);
          }
        }, 4500);
        return ifr.contentWindow;
      },
      suspendActive: function () {
        var id = this.activeId(), it = id != null && this.items.get(id);
        if (it) try { var cw = it.iframe.contentWindow; if (cw.__gwxComposeSuspend) cw.__gwxComposeSuspend(); } catch (e) {}
      },
      show: function (id) {
        if (!this.items.has(id)) return;
        var previous = this.activeId();
        var changed = previous !== id || !this.layer || !this.layer.classList.contains('on');
        if (previous !== id) this.suspendActive();
        try { if (this.syncTitle) setTimeout(this.syncTitle, 30); } catch (e) {}
        this.ensure();
        this.layer.classList.add('on');
        this.items.forEach(function (it) {
          it.iframe.classList.toggle('on', it.id === id);
        });
        if (changed) try { var cw = this.items.get(id).iframe.contentWindow; if (cw.__gwxComposeResume) cw.__gwxComposeResume(); } catch (e) {}
        Tabs.render();
      },
      hide: function () {
        if (this.layer && this.layer.classList.contains('on')) { this.suspendActive(); this.layer.classList.remove('on'); }
        Tabs.render();
      },
      dirty: function (it) {
        try {
          var cw = it.iframe.contentWindow;
          if (cw && typeof cw.__gwxComposeIsDirty === 'function') return !!cw.__gwxComposeIsDirty();
          var d = it.iframe.contentDocument;
          var s = d && d.getElementById('subject');
          if (s && s.value && s.value.trim()) return true;
          if (d && d.querySelector('li.token-input-token-facebook,li.token-input-token')) return true;
          var addr = ['asto', 'ascc', 'asbcc'].some(function (id0) {
            var n0 = d && d.getElementById(id0); return !!(n0 && String(n0.value || '').trim());
          });
          if (addr) return true;
          var at = d && d.getElementById('attr_tr');
          var fi = at && at.querySelector('input[type=file]');
          if (fi && fi.files && fi.files.length) return true;
          var CK = it.iframe.contentWindow.CKEDITOR;
          var ed = CK && CK.instances && (CK.instances.DataFCKeditor || CK.instances[Object.keys(CK.instances)[0]]);
          if (ed && ed.getData) {
            var html = String(ed.getData() || '');
            var t = html.replace(/<[^>]+>|&nbsp;|\s/g, '');
            if (t.length > 0 || /<(img|table|hr|object|embed|iframe)\b/i.test(html)) return true;
          }
        } catch (e) {}
        return false;
      },
      close: function (id, silent) {
        var it = this.items.get(id); if (!it) return;
        if (!silent && this.dirty(it) && !confirm('작성 중인 메일이 있습니다. 이 탭을 닫을까요?')) return;
        try { var cw = it.iframe.contentWindow; if (cw.__gwxComposeSuspend) cw.__gwxComposeSuspend(); } catch (e) {}
        try { gwxRemove(it.iframe); } catch (e) {}
        this.items.delete(id);
        if (Tabs.active === 'c:' + id) {
          var remaining = gwxArray(this.items.keys());
          if (remaining.length) { Tabs.active = 'c:' + remaining[remaining.length - 1]; this.show(remaining[remaining.length - 1]); }
          else { this.hide(); Tabs.go('list'); }
        }
        else Tabs.render();
        if (!this.items.size && this.layer) this.layer.classList.remove('on');
      },
      onChildClosed: function (id) { this.close(id, true); refreshList(); },
      onChildTitle: function (id, t) {
        var it = this.items.get(id);
        var title = (t && t.trim()) || '메일쓰기';
        if (it && it.title !== title) { it.title = title; Tabs.render(); }
      }
    };
    window.addEventListener('beforeunload', function (e) {
      var dirty = false;
      Cmp.items.forEach(function (it) { if (Cmp.dirty(it)) dirty = true; });
      Cmp.suspendActive();
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    // 자식(임베드 compose) → 부모 브리지
    try {
      W.__gwxComposeClosed = function (id) { try { Cmp.onChildClosed(id); } catch (e) { warn(e); } };
      W.__gwxComposeTitle = function (id, t) { try { Cmp.onChildTitle(id, t); } catch (e) {} };
    } catch (e) {}
    // window.open 훅 (F10 — 사용자 명시 요구에 따른 G5 예외, 토글: gwx.opt.inlineCompose)
    try {
      W.open = function (url, name, feats) {
        try {
          var isMsgm = typeof url === 'string' && /(^|\/)msgm\.do(\?|#|$)/i.test(url);
          var isPrint = typeof url === 'string' && /acton=(print|preview)/i.test(url);
          var isOurPop = typeof name === 'string' && /^gwxpop/.test(name);
          if (S.get('opt.inlineCompose', true) && isMsgm && !isPrint && !isOurPop) {
            var abs = url;
            try { abs = new URL(url, location.href).href; } catch (e) {}
            info('편지쓰기 요청을 인라인 탭으로 전환:', abs);
            var w = Cmp.open(abs);
            if (w) return w;
          }
        } catch (e) { warn('open hook', e); }
        var res0 = nativeOpen ? nativeOpen(url, name, feats) : null;
        try {
          if (S.get('opt.inlineCompose', true) && name && !/^gwx/.test(String(name)) &&
              (!url || url === '' || url === 'about:blank')) {
            W._gwxBlank = { n: String(name), w: res0, t: Date.now() };
          }
        } catch (e) {}
        return res0;
      };
    } catch (e) { warn('open hook install', e); }
    // 1.3.3: top/parent에는 고정 래퍼를 한 번만 설치하고 처리기는 매 부팅 최신 Cmp로 교체한다.
    // bootMail 공용 owner를 open/form/hash 디스패처에 사용한다.
    try {
      var _gwxOpenWins = [];
      [W.top, W.parent].forEach(function (TW) {
        if (!TW || TW === W || _gwxOpenWins.indexOf(TW) > -1) return;
        _gwxOpenWins.push(TW);
        TW.__gwxHookOwner = _gwxHookOwner;
        TW.__gwxOpenHandler = function (url, name, feats) {
          if (TW.__gwxHookOwner !== _gwxHookOwner) return { handled: false };
          try {
            var isM = typeof url === 'string' && /(^|\/)msgm\.do(\?|#|$)/i.test(url);
            var isP = typeof url === 'string' && /acton=(print|preview)/i.test(url);
            var isG = typeof name === 'string' && /^gwxpop/.test(name);
            if (S.get('opt.inlineCompose', true) && isM && !isP && !isG) {
              var ab = url; try { ab = new URL(url, location.href).href; } catch (e) {}
              info('편지 팝업(상위 프레임) 인라인 전환:', ab);
              var w2 = Cmp.open(ab);
              if (w2) return { handled: true, value: w2 };
            }
          } catch (e) { warn('top open handler', e); }
          return { handled: false };
        };
        TW.__gwxAfterOpen = function (url, name, feats, res1) {
          if (TW.__gwxHookOwner !== _gwxHookOwner) return;
          try {
            if (S.get('opt.inlineCompose', true) && name && !/^gwx/.test(String(name)) &&
                (!url || url === '' || url === 'about:blank')) {
              TW._gwxBlank = { n: String(name), w: res1, t: Date.now() };
            }
          } catch (e) {}
        };
        if (!TW.__gwxOpenDispatchInstalled) {
          TW.__gwxOpenDispatchInstalled = 1;
          TW._gwxOpenHooked = 1; // 구버전 진단 표식 호환
          TW.__gwxOpenNative = (TW.Window && TW.Window.prototype && TW.Window.prototype.open) ? TW.Window.prototype.open.bind(TW) : (TW.open ? TW.open.bind(TW) : null);
          TW.open = function (url, name, feats) {
            var out = null;
            try {
              var h = TW.__gwxOpenHandler;
              if (typeof h === 'function') out = h(url, name, feats);
            } catch (e) {}
            if (out && out.handled) return out.value;
            var base = TW.__gwxOpenNative;
            var res = base ? base(url, name, feats) : null;
            try {
              var after = TW.__gwxAfterOpen;
              if (typeof after === 'function') after(url, name, feats, res);
            } catch (e2) {}
            return res;
          };
        }
      });
    } catch (e) { warn('top open dispatch install', e); }
    // 1.3.3: 폼 submit도 동일하게 고정 래퍼 + 최신 처리기 방식으로 갱신한다.
    try {
      var _gwxFormWins = [];
      [W, W.top, W.parent].forEach(function (FW) {
        if (!FW || _gwxFormWins.indexOf(FW) > -1) return;
        _gwxFormWins.push(FW);
        var FP = FW.HTMLFormElement && FW.HTMLFormElement.prototype;
        if (!FP) return;
        FW.__gwxHookOwner = _gwxHookOwner;
        FW.__gwxSubmitHandler = function (form, args, nativeSubmit) {
          if (FW.__gwxHookOwner !== _gwxHookOwner) return { handled: false };
          try {
            var act = String(form.action || '');
            var tgt = String(form.target || '');
            var isM = /(^|\/)msgm\.do(\?|#|$)/i.test(act);
            var isP = /acton=(print|preview)/i.test(act);
            var newWin = tgt && tgt !== '_self' && tgt !== 'hidden_frame' && !/^gwx/.test(tgt);
            if (S.get('opt.inlineCompose', true) && isM && !isP && newWin) {
              var w3 = Cmp.open('about:blank');
              if (w3) {
                var id3 = Cmp.activeId();
                var it3 = id3 != null && Cmp.items.get(id3);
                if (it3) {
                  info('편지 폼 제출을 인라인 탭으로 재타깃 (target=' + tgt + ')');
                  var old = form.target;
                  form.target = it3.iframe.name;
                  var ret;
                  try { ret = nativeSubmit.apply(form, args); }
                  finally { form.target = old; }
                  try {
                    [W, W.top, W.parent].forEach(function (FW2) {
                      var b = FW2 && FW2._gwxBlank;
                      if (b && b.n === tgt && Date.now() - b.t < 5000) {
                        try { b.w && b.w.close(); } catch (e4) {}
                        try { FW2._gwxBlank = null; } catch (e5) {}
                      }
                    });
                  } catch (e3) {}
                  return { handled: true, value: ret };
                }
              }
            }
          } catch (e) { warn('form handler', e); }
          return { handled: false };
        };
        if (!FP.__gwxSubmitDispatchInstalled) {
          FP.__gwxSubmitDispatchInstalled = 1;
          FP.__gwxSubmitNative = (FP._gwxSubmit && FP._gwxSubmit !== FP.submit) ? FP._gwxSubmit : FP.submit;
          FP.submit = function () {
            var base = FP.__gwxSubmitNative;
            var out = null;
            try {
              var h = FW.__gwxSubmitHandler;
              if (typeof h === 'function') out = h(this, arguments, base);
            } catch (e) {}
            if (out && out.handled) return out.value;
            return base.apply(this, arguments);
          };
        }
      });
    } catch (e) { warn('form dispatch install', e); }
    try {
      window.addEventListener('pagehide', function (ev) {
        if (ev && ev.persisted) return;
        [W.top, W.parent].forEach(function (TW) {
          try {
            if (TW && TW.__gwxHookOwner === _gwxHookOwner) {
              TW.__gwxOpenHandler = null; TW.__gwxAfterOpen = null; TW.__gwxSubmitHandler = null;
              if (TW.__gwxHashOwner === _gwxHookOwner) { TW.__gwxHashHandler = null; TW.__gwxHashOwner = ''; }
              TW.__gwxHookOwner = '';
            }
          } catch (e) {}
        });
      }, { once: true });
    } catch (e) {}
    // 0.9.8(요구2): target 지정 앵커의 msgm.do 새창도 가로채기
    try {
      document.addEventListener('click', function (e) {
        try {
          var a = e.target.closest && e.target.closest('a[href][target]');
          if (!a) return;
          var href = a.getAttribute('href') || '';
          var tg = a.getAttribute('target') || '';
          if (!/(^|\/)msgm\.do/i.test(href)) return;
          if (/acton=(print|preview)/i.test(href)) return;
          if (tg === '_self' || tg === 'hidden_frame' || /^gwx/.test(tg)) return;
          if (!S.get('opt.inlineCompose', true)) return;
          e.preventDefault(); e.stopPropagation();
          var ab = href; try { ab = new URL(href, location.href).href; } catch (er) {}
          info('편지 링크(target)를 인라인 탭으로 전환:', ab);
          Cmp.open(ab);
        } catch (er2) {}
      }, true);
    } catch (e) {}

    /* ----- decorate 본체 ----- */
    function markDetail() {
      try {
        var found = 0;
        qsa('#main_content a, #main_content button, #main_content span[onclick], #main_content em[onclick]')
          .forEach(function (a) {
            if (a._gwxDt) return;
            if (a.closest && (a.closest('.detail_srch_wrap') || a.closest('#mail_view_area') ||
                a.closest('.gwx-tabs') || a.closest('.content_lst_body'))) return;
            var t = (a.textContent || '').replace(/\s+/g, '');
            if (t.indexOf('상세') !== 0 || t.length > 4) return;
            a._gwxDt = 1; found++;
            a.classList.add('gwx-detailbtn');
            ['nextElementSibling', 'previousElementSibling'].forEach(function (k) {
              var sb = a[k];
              if (sb && sb.classList && !sb.classList.contains('gwx-detailbtn') &&
                  (sb.tagName === 'IMG' || sb.tagName === 'EM' ||
                   (sb.tagName === 'SPAN' && !(sb.textContent || '').trim()))) {
                sb.style.display = 'none'; // 원본 화살표/장식 잔여물
              }
            });
            var pe = a.parentElement;
            if (pe && pe !== document.body && pe.children.length <= 3) {
              pe.style.background = 'none';
              pe.style.backgroundImage = 'none';
              pe.style.border = '0';
              pe.style.boxShadow = 'none';
            }
          });
        if (!found && !markDetail._logged && qsa('.gwx-detailbtn').length === 0) {
          markDetail._logged = 1;
          log('상세 버튼을 찾지 못함 — 해당 요소 outerHTML 제보 필요');
        }
      } catch (e) {}
    }
    function wrapPrint() {
      try {
        qsa('#main_content a, #main_content img, #main_content input[type="image"], #main_content button')
          .forEach(function (n) {
            if (n._gwxPr) return;
            if (n.closest && (n.closest('#mail_view_area') || n.closest('.gwx-printbox'))) return;
            if (n.classList && n.classList.contains('gwx-printbtn')) return;
            var hint = ((n.getAttribute('title') || '') + '|' + (n.getAttribute('alt') || '') + '|' +
                        (n.getAttribute('src') || '') + '|' + (n.getAttribute('onclick') || '')).toLowerCase();
            if (n.tagName !== 'IMG') { // 1.0.2: 앵커/버튼의 '자식 img' 속성도 힌트에 포함(분할 인쇄 대응)
              var ci = n.querySelector && n.querySelector('img');
              if (ci) {
                hint += '|' + ((ci.getAttribute('src') || '') + ' ' +
                               (ci.getAttribute('alt') || '') + ' ' +
                               (ci.getAttribute('title') || '')).toLowerCase();
              }
            }
            if (!(hint.indexOf('인쇄') > -1 || /print|btn_prt|ico_prt/.test(hint))) return;
            n._gwxPr = 1;
            if (n.tagName === 'A' || n.tagName === 'BUTTON') n.classList.add('gwx-printbtn');
            else if (n.parentNode) { // IMG, INPUT[type=image]
              var wb = el('span', 'gwx-printbox');
              n.parentNode.insertBefore(wb, n);
              wb.appendChild(n);
            }
          });
      } catch (e) {}
    }
    function rawSubjectForRow(tr, a) {
      var tv = qs('input[id^="title-"]', tr);
      return tv ? String(tv.value || tv.getAttribute('value') || '') : String((a && a.getAttribute('title')) || '');
    }
    function resetSubjectForReuse(a, raw) {
      if (!a) return;
      qsa('.gwx-badge.b-re,.gwx-badge.b-fw', a).forEach(function (x) { gwxRemove(x); });
      qsa('mark.gwx-kw', a).forEach(function (m) {
        if (m.parentNode) m.parentNode.replaceChild(document.createTextNode(m.textContent || ''), m);
      });
      delete a.dataset.gwxSubj; delete a.dataset.gwxTkey; delete a.dataset.gwxCleanSubject;
      if (raw) {
        var texts = [].slice.call(a.childNodes).filter(function (n) { return n.nodeType === 3 && n.textContent.replace(/\s+/g, ''); });
        if (texts.length) {
          texts[0].textContent = ' ' + raw;
          texts.slice(1).forEach(function (n) { n.textContent = ''; });
        } else a.appendChild(document.createTextNode(' ' + raw));
      }
      a.dataset.gwxRawSubject = raw || '';
      try { a.normalize(); } catch (e) {}
    }
    function roleChips(l) {
      if (!l) return;
      try {
        qsa('tr[id^="mail_list-"]', l).forEach(function (tr) {
          var mid = String((qs('input[id^="mid-"]', tr) || {}).value || '');
          var searched = RoleList.lookup(tr);
          var known = mid ? roleGet(mid) : null;
          var role = searched || known, a = mailSubjectAnchor(tr);
          if (!a) return;
          var reply = !!qs('.gwx-badge.b-re', a), chip = qs('.gwx-rc', a);
          if (!/^(to|cc|both|sent)$/.test(role || '')) {
            if (chip) gwxRemove(chip); tr.removeAttribute('data-gwx-rc'); return;
          }
          var text = { to: '수신', cc: '참조', both: '수신·참조', sent: '발신' }[role];
          var title = (searched ? '그룹웨어 받는이·참조인 검색에서 확인 · ' : '열람 시 확인한 내 수신구분 · ') + text;
          if (!chip) { chip = el('span', 'gwx-rc'); a.insertBefore(chip, a.firstChild); }
          if (chip.textContent !== text) chip.textContent = text;
          var cls = 'gwx-rc rc-' + role;
          if (chip.className !== cls) chip.className = cls;
          if (chip.title !== title) chip.title = title;
          tr.setAttribute('data-gwx-rc', role);
        });
      } catch (e) { log('role chips', e); }
    }
    function syncThreadChips(rows) {
      try {
        var map = {};
        rows.forEach(function (tr) {
          tr.classList.remove('gwx-th-hl');
          var a = mailSubjectAnchor(tr); if (!a) return;
          var k = a.dataset.gwxTkey || a.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
          if (!k) return;
          (map[k] = map[k] || []).push(tr);
        });
        rows.forEach(function (tr) {
          var a = mailSubjectAnchor(tr); if (!a || !a.parentNode) return;
          var k = a.dataset.gwxTkey || a.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
          var g = map[k] || [];
          var ids = g.map(function (x) { return x.id || String(rows.indexOf(x)); }).join('|');
          var sig0 = k + '|' + g.length + '|' + ids;
          var chip = qs('.gwx-th', a.parentNode);
          if (g.length < 2) { if (chip) gwxRemove(chip); return; }
          if (chip && chip.dataset.gwxThreadSig === sig0) return;
          if (chip) gwxRemove(chip);
          chip = el('span', 'gwx-th'); chip.dataset.gwxThreadSig = sig0;
          chip.textContent = '×' + g.length;
          chip.title = '같은 제목 ' + g.length + '통 (현재 페이지 기준)';
          chip.addEventListener('mouseenter', function () { g.forEach(function (x) { x.classList.add('gwx-th-hl'); }); });
          chip.addEventListener('mouseleave', function () { g.forEach(function (x) { x.classList.remove('gwx-th-hl'); }); });
          a.parentNode.insertBefore(chip, a.nextSibling);
        });
      } catch (e) { log('thread sync', e); }
    }
    function tuneColumns() {
      try {
        var head = qs('#list_content .content_lst_head table');
        var body = qs('#list_content .content_lst_body table');
        if (!head) return;
        var ths = qsa('thead th', head);
        var peerIdx = -1, dateIndices = [], folderIndices = [];
        var measure = document.createElement('canvas').getContext('2d');
        function dateWidth(index) {
          var width = 128;
          if (measure && body) qsa('tbody tr', body).forEach(function (tr) {
            var td = tr.children[index]; if (!td) return;
            var cs = getComputedStyle(td); measure.font = cs.font;
            var text = String(td.textContent || '').replace(/\s+/g, ' ').trim();
            width = Math.max(width, measure.measureText(text).width + 24);
          });
          return Math.ceil(Math.min(220, width)) + 'px';
        }
        var want = ths.map(function (th, i) {
          var t = (th.textContent || '').replace(/\s+/g, '');
          // 1.3.7: 보낸 메일함·예약함의 '받는사람' 열도 받은 메일함의 '보낸이'와 동일 규격.
          //  (미인식 시 width:auto로 남아 제목과 잔여 폭을 균등 분배 → 간격이 벌어짐)
          var hasFrom = GWX_SEL.hdPeer.test(t);
          var hasSubj = GWX_SEL.hdSubj.test(t);
          var hasDate = GWX_SEL.hdDate.test(t), hasSize = GWX_SEL.hdSize.test(t);
          if (GWX_SEL.hdState.test(t)) return '100px';
          if (/^(편지함|메일함)$/.test(t)) { folderIndices.push(i); return '150px'; }
          if (hasFrom && hasSubj) return null;              // 분할: 보낸이+제목 통합 → 가변
          if (hasFrom) { peerIdx = i; return '84px'; }
          if (hasSubj) return null;                          // 제목 → 가변
          if (hasDate) { dateIndices.push(i); return dateWidth(i); }
          if (hasSize) return '74px';
          return null;
        });
        [head, body].forEach(function (tb) {
          if (!tb) return;
          var cols = qsa('colgroup col', tb);
          cols.forEach(function (c, i) {
            var w = want[i];
            c.style.width = w || 'auto';
          });
        });
        // 1.3.7: 보낸이/받는사람 열은 폴더마다 클래스명이 달라 말줄임이 빠질 수 있으므로
        //  열 위치를 표식으로 남겨 CSS_MAIL_137이 동일하게 처리하도록 한다.
        probe('목록 헤더:보낸이/받는사람', peerIdx > -1);
        probe('목록 헤더:제목', want.some(function (w, i) {
          return w === null && GWX_SEL.hdSubj.test((ths[i].textContent || '').replace(/\s+/g, ''));
        }));
        if (body) {
          qsa('tbody tr', body).forEach(function (tr) {
            [].forEach.call(tr.children, function (td, i) {
              td.classList.toggle('gwx-date-cell', dateIndices.indexOf(i) >= 0);
              td.classList.toggle('gwx-folder-cell', folderIndices.indexOf(i) >= 0);
              if (folderIndices.indexOf(i) >= 0 && !td.title) td.title = (td.textContent || '').replace(/\s+/g, ' ').trim();
            });
          });
          if (String(peerIdx) !== body.getAttribute('data-gwx-peeridx')) {
            qsa('td[data-gwx-peer]', body).forEach(function (td) { td.removeAttribute('data-gwx-peer'); });
            body.setAttribute('data-gwx-peeridx', String(peerIdx));
          }
          if (peerIdx > -1) {
            qsa('tbody tr', body).forEach(function (tr) {
              var td = tr.children[peerIdx];
              if (td && td.getAttribute('data-gwx-peer') !== '1') td.setAttribute('data-gwx-peer', '1');
            });
          }
        }
      } catch (e) {}
    }
    function decorateList() {
      var l = LIST(); if (!l) return;
      tuneColumns(); renameListTitle(); watchTitle(); renameDetail();
      markDetail(); wrapPrint();
      var rows = qsa(GWX_SEL.rowsAll, l);
      probe('목록 행', rows.length > 0);
      rows.forEach(function (tr) {
        try {
          var a = mailSubjectAnchor(tr);
          var midEl = qs('input[id^="mid-"]', tr);
          var mid = midEl ? String(midEl.value || midEl.getAttribute('value') || '') : '';
          var raw = rawSubjectForRow(tr, a);
          var im = qs('img[id^="wma-icon-"]', tr);
          var status = im ? String(im.getAttribute('src') || '') : '';
          var role = mid ? String(roleGet(mid) || '') : '';
          var sig0 = [mid, raw, status, role].join('\u001f');
          if (tr.dataset.gwxRowSig !== sig0) {
            tr.dataset.gwxRowSig = sig0; tr.setAttribute('data-gwx-row', '1');
            if (a) {
              if (raw && a.dataset.gwxRawSubject !== raw) resetSubjectForReuse(a, raw);
              decorateSubjectNode(a);
              if (raw) a.dataset.gwxRawSubject = raw;
            }
            var td = qs('td.recTD', tr);
            if (td) qsa('.gwx-avatar', td).forEach(function (x) { gwxRemove(x); });
            if (S.get('opt.avatar', false) && td) {
              var uidEl = qs('input[id^="sender-"]', tr);
              var uid = uidEl ? String(uidEl.value || uidEl.getAttribute('value') || '').trim() : '';
              var name = String(td.getAttribute('title') || td.textContent || '').split('<')[0].trim();
              td.insertBefore(makeAvatar(uid, name, 26), td.firstChild);
            }
          }
          if (S.get('opt.relativeDate', true)) humanizeDateEl(qs('td.date', tr));
          // 1.3.7: 아이콘 판정이 불가하면 서버가 내려준 굵게 표시(td_list_bold)를 신뢰한다.
          probe('상태 아이콘', !!im);
          probe('제목 링크', !!a);
          var st0 = im ? iconUnreadState(im.getAttribute('src')) : null;
          var unread0 = (st0 === null) ? serverBoldRow(tr) : st0;
          setRowUnread(tr, unread0);
        } catch (e) { log('row', e); }
      });
      roleChips(l);
      syncThreadChips(rows);
      refreshLabelDots();
      wrapStatusIcons(l);
      saveUnreadSnapshot(l);
      RoleList.schedule();
    }
    function resetViewDecorForMessage(v, num) {
      try {
        var p = qs('p.view_subj', v); if (!p) return;
        if (p.dataset.gwxViewNum === String(num || '')) return;
        qsa('.gwx-badge.b-re,.gwx-badge.b-fw,.gwx-badge.b-role,.gwx-lchip', p).forEach(function (x) { gwxRemove(x); });
        qsa('mark.gwx-kw', p).forEach(function (m) {
          if (m.parentNode) m.parentNode.replaceChild(document.createTextNode(m.textContent || ''), m);
        });
        delete p.dataset.gwxSubj; delete p.dataset.gwxTkey; delete p.dataset.gwxCleanSubject;
        p.dataset.gwxViewNum = String(num || '');
        qsa('.gwx-me', v).forEach(function (x) { x.classList.remove('gwx-me'); });
        qsa('.mail_sender .gwx-avatar', v).forEach(function (x) { gwxRemove(x); });
      } catch (e) {}
    }
    function decorateView() {
      var cdv = getViewCtx();
      var v = (cdv && cdv.root) || NMC();
      if (!v) return;
      try {
        if (qs('.view_body_contents', v)) {
          renameViewTitle();
          var curNum = String((qs('#view_message_number', v) || {}).value || '');
          resetViewDecorForMessage(v, curNum);
          decorateSubjectNode(qs('p.view_subj', v));
          try { roleDecorate(v); } catch (e) { log('role', e); }
          try { labelChip(v); } catch (e) { log('label', e); }
          var sd = qs('.mail_sender .sender dd', v);
          if (S.get('opt.avatar', false) && sd && !qs('.gwx-avatar', sd)) {
            var uid = ((qs('#view_message_from_id', v) || {}).value || '').trim();
            var from = (qs('#view_message_from', v) || {}).value || '';
            sd.insertBefore(makeAvatar(uid, from.split('<')[0].trim(), 38), sd.firstChild);
          }
          var rep = qs('#up_button a[title="답장"]', v) || btnByText(v, ['답장']);
          if (rep) rep.classList.add('gwx-primary');
          if (S.get('opt.relativeDate', true)) qsa('.mail_sender dd.date', v).forEach(humanizeDateEl);
          wrapStatusIcons(v);
        }
      } catch (e) { log('view', e); }
      try { Tabs.upsertFromView(); } catch (e) { warn('tabs', e); }
    }

    function installHashDispatch() {
      try {
        var TW = W.top || W;
        TW.__gwxHashOwner = _gwxHookOwner;
        TW.__gwxHashHandler = function () {
          if (TW.__gwxHashOwner !== _gwxHookOwner) return;
          try { consumeDeepLink(); } catch (e) { log('hash deeplink', e); }
        };
        if (!TW.__gwxHashDispatchInstalled) {
          TW.__gwxHashDispatchInstalled = 1;
          TW.addEventListener('hashchange', function () {
            try {
              var h = TW.__gwxHashHandler;
              if (typeof h === 'function') h();
            } catch (e) {}
          });
        }
      } catch (e) { log('hash dispatch install', e); }
    }

    /* ----- 1.3.8: 목록/열람 키보드 조작 (키맵은 GWX_KEYS·keymapAll 기준) ----- */
    function kbRows() {
      var l = LIST(); if (!l) return [];
      return qsa(GWX_SEL.rowMail, l).filter(function (tr) { return tr.offsetParent !== null; });
    }
    function kbCursorRow() {
      var l = LIST(); if (!l) return null;
      return qs('.content_lst_body tr[data-gwx-cursor="1"]', l);
    }
    function kbSetCursor(tr) {
      var l = LIST(); if (!l) return;
      qsa('tr[data-gwx-cursor]', l).forEach(function (x) { x.removeAttribute('data-gwx-cursor'); });
      if (!tr) return;
      tr.setAttribute('data-gwx-cursor', '1');
      try { tr.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
    function kbMove(d) {
      var rows = kbRows();
      if (!rows.length) { toast('목록에 표시된 메일이 없습니다'); return; }
      var cur = kbCursorRow(), i = cur ? rows.indexOf(cur) : -1;
      i = (i < 0) ? (d > 0 ? 0 : rows.length - 1)
                  : Math.max(0, Math.min(rows.length - 1, i + d));
      kbSetCursor(rows[i]);
    }
    function kbViewBtn(texts, label) {
      var c = getViewCtx();
      if (!(c && c.visible)) { toast('메일을 열람 중일 때만 사용할 수 있습니다'); return null; }
      var b = btnByText(c.root, texts);
      if (!b) toast(label + ' 버튼을 찾지 못했습니다');
      return b;
    }
    function kbDelete() {
      var c = getViewCtx(), btn = null;
      if (c && c.visible) btn = btnByText(c.root, GWX_SEL.btnDel);
      if (!btn) {
        var checked = qsa(GWX_SEL.checkbox + ':checked');
        if (checked.length) btn = btnByText(qs(GWX_SEL.list) || document, GWX_SEL.btnDel);
        else if (!(c && c.visible)) {
          toast('삭제할 메일을 먼저 선택하세요 (체크박스 또는 열람)');
          return;
        }
      }
      if (btn) btn.click();
    }
    var KB_ACTIONS = {
      next: function () { kbMove(1); },
      prev: function () { kbMove(-1); },
      open: function () {
        var tr = kbCursorRow() || kbRows()[0];
        if (!tr) { toast('열 메일이 없습니다'); return; }
        kbSetCursor(tr);
        var a = qs(GWX_SEL.subjLink, tr);
        if (a) a.click(); else toast('제목 링크를 찾지 못했습니다');
      },
      back: function () { try { Tabs.go('list'); } catch (e) { warn('kb back', e); } },
      reply: function () { var b = kbViewBtn(GWX_SEL.btnReply, '답장'); if (b) b.click(); },
      forward: function () { var b = kbViewBtn(GWX_SEL.btnFwd, '전달'); if (b) b.click(); },
      compose: function () {
        var a = qs(GWX_SEL.composeBtn);
        probe('메일 쓰기 버튼', !!a);
        if (a) a.click(); else toast('메일 쓰기 버튼을 찾지 못했습니다');
      },
      del: kbDelete,
      check: function () {
        var tr = kbCursorRow();
        if (!tr) { toast('먼저 커서를 옮기세요 (기본 j / k)'); return; }
        var cb = qs('input[type=checkbox]', tr);
        if (cb) cb.click(); else toast('선택 체크박스를 찾지 못했습니다');
      },
      search: function () {
        var i = qs(GWX_SEL.searchInput);
        probe('검색 입력', !!i);
        if (i) { try { i.focus(); i.select(); } catch (e) {} }
        else toast('검색창을 찾지 못했습니다');
      },
      refresh: function () { refreshList(); },
      help: function () { openKeymapPanel(); }
    };
    function installKeyboard() {
      document.addEventListener('keydown', function (e) {
        try {
          if (S.get('opt.keyboard', true) === false) return;
          if (e.defaultPrevented) return;
          var ae = document.activeElement;
          if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) {
            if (e.key === 'Escape') { try { ae.blur(); } catch (er) {} }
            return;
          }
          if (Cmp.layer && Cmp.layer.classList.contains('on')) return;  // 작성 중에는 개입 금지
          if (qs('.gwx-keypanel')) return;                              // 단축키 캡처 중
          var ks = keyString(e); if (!ks) return;
          var map = keymapAll(), id = null;
          for (var k in map) {
            if (map[k] && map[k] === ks && KB_ACTIONS[k]) { id = k; break; }
          }
          if (!id) return;
          e.preventDefault(); e.stopPropagation();
          KB_ACTIONS[id]();
        } catch (er) { log('keyboard', er); }
      }, true);
      info('키보드 조작 준비 완료 — 도움말/설정: ' + (keymapAll().help || '(해제)') +
        ' · 전체 끄기: 설정 허브 > 키보드 조작');
    }

    /* ----- 부팅 ----- */
    onReady(function () {
      try { gwxDraftGC(); } catch (e) { log('draft gc', e); }   // 1.3.8: 만료 슬롯 정리
      addLogo();
      themeRow();
      renameLabels();
      renameFolders();
      applyTopMenu();
      buildQuota();
      try { S.set('deeplink', null); } catch (e) {} // 1.3.6: 포털 딥링크 경로 제거
      installKeyboard();   // 1.3.8: Del 삭제를 포함한 전체 키보드 조작(사용자 지정)
      // (0.9.13) '기존 창' 즉시열기 리스너는 포털의 창 네비게이션과 경합해
      //  곧 언로드될 구 문서가 딥링크를 선소진하는 원인이 되어 제거함.
      //  포털 클릭은 항상 창 네비게이션 → 새 부팅의 consumeDeepLink가 단일 소비자.
      setTimeout(function () { // 게이트 자동 해제(안전판)
        try { document.documentElement.setAttribute('data-gwx-ready', '1'); } catch (e) {}
      }, 1200);
      var fc = document.getElementById('folder_content');
      if (fc) {
        try {
          new MutationObserver(debounce(renameFolders, 160))
            .observe(fc, { childList: true, subtree: true, characterData: true });
        } catch (e) {}
      }
      function decorateAll() {
        try { decorateList(); } catch (e) { warn('list', e); }
        try { decorateView(); } catch (e) { warn('view', e); }
      }
      var run = debounce(decorateAll, 60);
      var runFast = debounce(function () {
        try { decorateList(); } catch (e) {}
      }, 16);
      ['list_content', 'normal_message_content'].forEach(function (id) {
        var n = document.getElementById(id); if (!n) return;
        var cb = (id === 'list_content') ? function () { _lastListMut = Date.now(); runFast(); run(); } : run;
        try { new MutationObserver(cb).observe(n, { childList: true, subtree: true }); } catch (e) {}
        try { new MutationObserver(run).observe(n, { attributes: true, attributeFilter: ['style'] }); } catch (e) {}
        try { attrObs.observe(n, { attributes: true, subtree: true, attributeFilter: ['src'] }); } catch (e) {}
      });
      decorateAll();
      // 1.3.3: 디바운스 예약이 아니라 실제 첫 장식이 끝난 뒤 화면 공개
      try { document.documentElement.setAttribute('data-gwx-ready', '1'); } catch (e) {}
      // 0.9.5(요구3): 작성 레이어가 떠 있을 때 폴더/트리 클릭 → 목록으로 전환
      try {
        var lm = qs('.left_menu') || document.body;
        lm.addEventListener('click', function (e) {
          try {
            if (!(Cmp.layer && Cmp.layer.classList.contains('on'))) return;
            var a = e.target.closest &&
              e.target.closest('.snb_lst a, ul.quickbtn_area a, #tree_contents_area a, .tree_ttl');
            if (!a) return;
            Cmp.hide();
            Tabs.active = 'list';
            Tabs.render();
          } catch (er) {}
        }, true);
      } catch (e) {}
      // 0.9.8: 분할 상태 마커 + 1:1 비율 초기화
      var splitTick = debounce(function () {
        try {
          var sp = isListVisible() && isViewVisible();
          if (sp) { document.documentElement.setAttribute('data-gwx-split', '1'); applySplitRatio(); }
          else { document.documentElement.removeAttribute('data-gwx-split'); restoreSplitRatio(); }
        } catch (e) {}
      }, 120);
      try {
        ['list_content', 'normal_message_content'].forEach(function (id2) {
          var n2 = document.getElementById(id2);
          if (n2) new MutationObserver(splitTick).observe(n2, { attributes: true, attributeFilter: ['style', 'class'] });
        });
        splitTick();
      } catch (e) {}
      var uq = document.getElementById('usequota');
      if (uq) {
        try {
          new MutationObserver(function () {
            var q = qs('.gwx-quota'); if (q) gwxRemove(q);
            var li = document.getElementById('quotatable');
            if (li) li.removeAttribute('data-gwx');
            buildQuota();
          }).observe(uq, { childList: true, characterData: true, subtree: true });
        } catch (e) {}
      }
      info('mail 모듈 준비 완료 (탭/인라인쓰기/배지 활성)');
    });

    /* ----- 메뉴 커맨드 (mail) ----- */
    // 허브에 없는 mail 고유 동작은 허브 버튼으로도 등록한다(TM 메뉴 숨김 대비)
    hubAction('키워드 설정', function () {
      var v = prompt('강조할 키워드를 쉼표로 구분해 입력 (비우면 해제)', S.get('opt.keywords', ''));
      if (v === null) return;
      S.set('opt.keywords', v.trim());
      toast('키워드 저장됨 — 새로고침 후 적용');
    });
    hubAction('모든 탭 닫기', function () { Tabs.closeAll(); });
    hubAction('역할 캐시 비우기', function () {
      gmSet('gwx.roleCache', '{}'); if (_rcKey) gmDelete(_rcKey); _rc = null; RoleList.clear(); roleChips(LIST()); toast('역할 캐시를 비웠습니다');
    });
    try {
      regMenu('GWX: 탭 기능 ' + (S.get('opt.tabs', true) ? '끄기' : '켜기'), function () {
        S.set('opt.tabs', !S.get('opt.tabs', true)); location.reload();
      });
      regMenu('GWX: 인라인 편지쓰기 ' + (S.get('opt.inlineCompose', true) ? '끄기(새창 복귀)' : '켜기'), function () {
        S.set('opt.inlineCompose', !S.get('opt.inlineCompose', true));
        toast('인라인 편지쓰기: ' + (S.get('opt.inlineCompose', true) ? 'ON' : 'OFF'));
      });
      regMenu('GWX: 메일 탭 복원 — 서버 재조회(안전)', function () {
        S.set('opt.tabRestore', 'refetch'); toast('메일 탭은 서버 재조회 방식으로 복원합니다');
      });
      regMenu('GWX: 모든 탭 닫기', function () { Tabs.closeAll(); });
      regMenu('GWX: 상단 메뉴(GNB) ' + (S.get('opt.hideGnb', true) ? '표시하기' : '숨기기'), function () {
        S.set('opt.hideGnb', !S.get('opt.hideGnb', true)); applyTopMenu();
      });
      regMenu('GWX: 사이드 퀵필터 ' + (S.get('opt.quickRow', true) ? '숨기기' : '표시하기') + ' (새로고침)', function () {
        S.set('opt.quickRow', !S.get('opt.quickRow', true)); location.reload();
      });
      regMenu('GWX: (구)메일함 ' + (S.get('opt.oldMail', false) ? '숨기기' : '표시하기') + ' (새로고침)', function () {
        S.set('opt.oldMail', !S.get('opt.oldMail', false)); location.reload();
      });
      regMenu('GWX: 키워드 하이라이트 설정', function () {
        var v = prompt('강조할 키워드를 쉼표로 구분해 입력 (비우면 해제)', S.get('opt.keywords', ''));
        if (v === null) return;
        S.set('opt.keywords', v.trim());
        toast('키워드 저장됨 — 새로고침 후 적용');
      });
      regMenu('GWX: 제목 개수 배지 ' + (S.get('opt.titleCount', true) ? '숨기기' : '표시하기') + ' (새로고침)', function () {
        S.set('opt.titleCount', !S.get('opt.titleCount', true)); location.reload();
      });
      regMenu('GWX: 목록 밀도 — 현재 ' + (S.get('opt.dense', true) ? '컴팩트(→보통)' : '보통(→컴팩트)') + ' (새로고침)', function () {
        S.set('opt.dense', !S.get('opt.dense', true)); location.reload();
      });
      regMenu('GWX: 프로필 사진 ' + (S.get('opt.avatar', false) ? '숨기기' : '표시하기') + ' (새로고침)', function () {
        S.set('opt.avatar', !S.get('opt.avatar', false)); location.reload();
      });
      regMenu('GWX: 본문 배경 소프트 톤 ' + (S.get('opt.softBody', false) ? '끄기' : '켜기') + ' (새로고침)', function () {
        S.set('opt.softBody', !S.get('opt.softBody', false)); location.reload();
      });
      regMenu('GWX: 본문 글꼴 통일 ' + (S.get('opt.unifyBodyFont', false) ? '끄기' : '켜기') + ' (새로고침)', function () {
        S.set('opt.unifyBodyFont', !S.get('opt.unifyBodyFont', false)); location.reload();
      });
      regMenu('GWX: 역할 캐시 비우기', function () {
        gmSet('gwx.roleCache', '{}'); if (_rcKey) gmDelete(_rcKey); _rc = null; RoleList.clear(); roleChips(LIST()); toast('역할 캐시를 비웠습니다');
      });
    } catch (e) {}
  }

  /* =====================================================================
   * 9. COMPOSE 모듈 (msgm.do — 팝업 또는 GWX 임베드 iframe)
   * ===================================================================== */
  function bootCompose() {
    var embedded = EMBED_ID > 0;
    var draftToken = '';
    try {
      var ff = window.frameElement;
      draftToken = ff && ff.dataset ? String(ff.dataset.gwxDraftKey || '') : '';
    } catch (e) {}
    if (!draftToken) {
      try { draftToken = sessionStorage.getItem('gwx.composeDraftKey') || ''; } catch (e) {}
      if (!draftToken) {
        draftToken = 'win-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
        try { sessionStorage.setItem('gwx.composeDraftKey', draftToken); } catch (e) {}
      }
    }
    draftToken = draftToken.replace(/[^a-z0-9._-]/gi, '').slice(0, 96) || ('compose-' + Date.now());
    var draftStorageKey = 'gwx.draft.' + draftToken;
    var draftAttachBaseline = null, composeBaseline = null, draftPendingBeforeBaseline = false, draftSessionWrote = false;
    function composeContextKey() {
      try {
        var u = new URL(location.href);
        ['K', 'k', '_', 'ts', 'timestamp', 'rnd', 'random', 'cache', 'nocache'].forEach(function (k) { u.searchParams.delete(k); });
        if (u.searchParams.sort) u.searchParams.sort();
        return u.pathname + (u.search ? u.search : '');
      } catch (e) { return location.pathname + location.search; }
    }
    var draftContext = composeContextKey();

    var COMPOSE_FONT = '"Malgun Gothic", "맑은 고딕", sans-serif';
    function composeFontData(html) {
      html = String(html || '');
      if (!html.trim()) return html;
      // A saved draft already contains this default container. Preserve its exact HTML.
      // Explicit font choices inside it continue to override the inherited default.
      if (/^\s*<div\b/i.test(html)) {
        var template = document.createElement('template'); template.innerHTML = html;
        var nodes = gwxArray(template.content.childNodes).filter(function (n) { return n.nodeType !== 3 || n.textContent.trim(); });
        if (nodes.length === 1 && nodes[0].nodeType === 1 && nodes[0].tagName === 'DIV' &&
            /malgun gothic|맑은 고딕/i.test(nodes[0].style.fontFamily || '')) return html;
      }
      return '<div style="font-family: &quot;Malgun Gothic&quot;, &quot;맑은 고딕&quot;, sans-serif;">' + html + '</div>';
    }
    function installComposeFont(ed) {
      if (!ed || ed._gwxDefaultFont) return;
      ed._gwxDefaultFont = true;
      if (ed.config) ed.config.font_defaultLabel = '맑은 고딕';
      var lastInput = null, lastOutput = null;
      function apply() {
        try {
          var doc = ed.document && ed.document.$;
          if (doc && doc.body) doc.body.style.setProperty('font-family', COMPOSE_FONT, 'important');
          if (ed.filter && ed.filter.allow) ed.filter.allow('div{font-family}');
        } catch (e) { log('compose default font', e); }
      }
      // CKEditor getData is also used by preview/draft collection. Do not alter live nodes,
      // the caret, snapshots, or the content of the returned HTML beyond one inheritable wrapper.
      ed.on('getData', function (evt) {
        if (!evt || !evt.data || typeof evt.data.dataValue !== 'string') return;
        var input = evt.data.dataValue;
        if (input !== lastInput) { lastInput = input; lastOutput = composeFontData(input); }
        evt.data.dataValue = lastOutput;
      }, null, null, 999);
      ed.on('contentDom', apply); ed.on('instanceReady', apply); ed.on('dataReady', apply);
      apply();
    }

    function getEd() {
      var CK = W.CKEDITOR;
      if (!CK || !CK.instances) return null;
      var ks = Object.keys(CK.instances);
      var ed = CK.instances.DataFCKeditor || (ks.length ? CK.instances[ks[0]] : null);
      if (ed) installComposeFont(ed);
      return ed;
    }
    // F15: 에디터 본문 영역 드롭을 페이지 드롭 처리로 연결하는 브리지 (attachDrop에서 채움)
    var dropInsertImage = null, dropAttachFiles = null;

    /* ----- (a) 임베드 심: opener/close/제목 동기화 ----- */
    if (embedded) {
      document.documentElement.classList.add('gwx-embedded');
      try { W.opener = window.parent; } catch (e) {}
      try {
        var nc = null; try { nc = W.close ? W.close.bind(W) : null; } catch (e) {}
        W.close = function () {
          try { draftSaveNow(false, true); } catch (e) {}
          try { window.parent.__gwxComposeClosed(EMBED_ID); return; } catch (e) {}
          try { if (nc) nc(); } catch (e2) {}
        };
      } catch (e) {}
      try { W.resizeTo = function () {}; W.moveTo = function () {}; } catch (e) {}
    }

    /* ----- (b) F14 자동 임시저장 (1.3.3: 작성 탭별 슬롯) ----- */
    // The native token widget is the current recipient UI. Its hidden input can be empty or stale.
    function composeRecipient(id) {
      var input = document.getElementById(id), entry = document.getElementById('token-input-' + id);
      var list = entry && entry.closest('ul');
      var names = [], pending = entry ? String(entry.value || '').trim() : '';
      if (list) {
        qsa('li.token-input-token-facebook,li.token-input-token', list).forEach(function (chip) {
          var p = qs('p', chip), copy = (p || chip).cloneNode(true);
          qsa('[class*="delete-token"]', copy).forEach(function (x) { gwxRemove(x); });
          var name = String(copy.textContent || '').replace(/\s+/g, ' ').trim();
          var title = String((p && p.getAttribute('title')) || chip.getAttribute('title') || '').trim();
          // Only append an address actually supplied by the widget, never derive one from a name/ID.
          if (title && /[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/.test(title) && name.indexOf(title) < 0) name += ' <' + title + '>';
          if (name) names.push(name);
        });
      } else if (input && String(input.value || '').trim()) {
        names.push(String(input.value).trim());
      }
      return { names: names, text: names.join('; '), pending: pending, widget: !!list };
    }
    function composeRecipients() {
      var r = { to: composeRecipient('asto'), cc: composeRecipient('ascc'), bcc: composeRecipient('asbcc'), exto: composeRecipient('asexto') };
      if (!r.to.text && (document.getElementById('requestMyself') || {}).checked) r.to.text = '내게쓰기';
      return r;
    }
    function recipientDraftText(r) { return [r.text, r.pending].filter(Boolean).join('; '); }

    // Keep the same iframe/editor alive while switching tabs. Ranges do not insert bookmark markup.
    var composeViewState = null;
    function suspendCompose() {
      try {
        var ed = getEd(), d = ed && ed.document && ed.document.$;
        var a = document.activeElement, sel = d && d.getSelection(), range = null;
        if (sel && sel.rangeCount) range = sel.getRangeAt(0).cloneRange();
        composeViewState = { active: a, range: range, doc: d, x: window.scrollX, y: window.scrollY,
          ex: d ? d.defaultView.scrollX : 0, ey: d ? d.defaultView.scrollY : 0 };
        if (a && typeof a.selectionStart === 'number') {
          composeViewState.start = a.selectionStart; composeViewState.end = a.selectionEnd;
        }
        clearTimeout(draftSaveTimer); draftSaveNow(false, true);
      } catch (e) { log('compose suspend', e); }
    }
    function resumeCompose() {
      var state = composeViewState;
      if (!state) return;
      requestAnimationFrame(function () {
        try {
          var a = state.active;
          if (a && a.isConnected) {
            a.focus({ preventScroll: true });
            if (state.start != null && a.setSelectionRange) a.setSelectionRange(state.start, state.end);
          }
          if (state.doc && state.range && state.range.startContainer.isConnected) {
            var sel = state.doc.getSelection(); sel.removeAllRanges(); sel.addRange(state.range);
          }
          window.scrollTo(state.x, state.y);
          if (state.doc) state.doc.defaultView.scrollTo(state.ex, state.ey);
          window.dispatchEvent(new Event('resize'));
        } catch (e) { log('compose resume', e); }
      });
    }
    try { W.__gwxComposeSuspend = suspendCompose; W.__gwxComposeResume = resumeCompose; } catch (e) {}

    function draftCollect() {
      var body = '';
      try { var ed = getEd(); body = ed && ed.getData ? String(ed.getData() || '') : ''; } catch (e) {}
      var recipients = composeRecipients();
      var att = '';
      try { att = attachSig(); } catch (e) {}
      return {
        t: Date.now(), key: draftToken, context: draftContext,
        subject: (document.getElementById('subject') || {}).value || '',
        body: body,
        to: recipientDraftText(recipients.to),
        cc: recipientDraftText(recipients.cc),
        bcc: recipientDraftText(recipients.bcc),
        attachments: att
      };
    }
    function draftDirty(d) {
      if (String(d.subject || '').trim()) return true;
      if ([d.to, d.cc, d.bcc].some(function (v) { return String(v || '').trim().length > 0; })) return true;
      if (String(d.attachments || '').trim()) return true;
      var html = String(d.body || '');
      if (/<(img|table|hr|object|embed|iframe)\b/i.test(html)) return true;
      return html.replace(/<[^>]+>|&nbsp;|\s/g, '').length > 0;
    }
    function draftComparable(d) {
      return {
        subject: String(d.subject || ''), body: String(d.body || ''), to: String(d.to || ''),
        cc: String(d.cc || ''), bcc: String(d.bcc || ''), attachments: String(d.attachments || '')
      };
    }
    function draftChanged(d) {
      if (!composeBaseline) return draftDirty(d);
      return gwxStringify(draftComparable(d)) !== gwxStringify(draftComparable(composeBaseline));
    }
    function captureComposeBaseline() {
      try {
        if (composeBaseline || draftPendingBeforeBaseline) return;
        var ed0 = getEd(); if (!ed0 || !ed0.getData) return;
        composeBaseline = draftCollect(); draftAttachBaseline = composeBaseline.attachments || '';
        if (draftPendingBeforeBaseline) { draftPendingBeforeBaseline = false; queueDraftSave(); }
      } catch (e) {}
    }
    var draftLastSig = '', draftLargeWarned = false, draftSaveTimer = 0;
    function draftSaveNow(force, silent) {
      if (!force && S.get('opt.autoDraft', true) === false) return;
      var d = draftCollect();
      if (!draftChanged(d)) {
        draftLastSig = '';
        if (draftSessionWrote) { gwxDraftClearSlot(draftStorageKey); draftSessionWrote = false; }
        return;
      }
      var sigObj = Object.assign({}, d, { t: 0 });
      var sig0 = gwxStringify(sigObj);
      if (!force && sig0 === draftLastSig) return;
      var payload = gwxStringify(d);
      // 붙여넣은 대형 data URL 이미지로 매 주기 수 MB를 기록하는 것을 방지한다.
      if (payload.length > 2500000) {
        if (!draftLargeWarned && !silent) toast('본문 이미지가 커서 GWX 자동저장을 일시 중지했습니다');
        draftLargeWarned = true; return;
      }
      draftLargeWarned = false;
      if (!gmSet(draftStorageKey, payload)) {
        if (!silent) toast('자동저장하지 못했습니다. 작성 내용을 유지하고 다시 저장을 시도합니다');
        return;
      }
      draftLastSig = sig0; draftSessionWrote = true;
      gwxDraftRegister(draftStorageKey);
    }
    function queueDraftSave() {
      if (!composeBaseline) draftPendingBeforeBaseline = true;
      clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(function () { try { draftSaveNow(false, false); } catch (e) { log('draft queued save', e); } }, 1200);
    }
    function draftAutosave() {
      try { draftAttachBaseline = attachSig(); } catch (e) { draftAttachBaseline = ''; }
      try { W.__gwxComposeIsDirty = function () { return draftChanged(draftCollect()); }; } catch (e) {}
      if (S.get('opt.autoDraft', true) === false) return;
      captureComposeBaseline();
      document.addEventListener('beforeinput', captureComposeBaseline, true);
      document.addEventListener('input', queueDraftSave, true);
      document.addEventListener('change', queueDraftSave, true);
      var edProbe = 0, edProbeN = 0;
      edProbe = setInterval(function () {
        var ed0 = getEd();
        if (ed0) {
          clearInterval(edProbe);
          try { ed0.on('change', queueDraftSave); } catch (e) {}
          setTimeout(captureComposeBaseline, 120);
        } else if (++edProbeN > 40) clearInterval(edProbe);
      }, 500);
      setTimeout(captureComposeBaseline, 2200);
      var heartbeat = setInterval(function () {
        if (!document.hidden) { try { draftSaveNow(false, true); } catch (e) { log('draft autosave', e); } }
      }, 60000);
      function saveBeforeLeave() {
        try { clearTimeout(draftSaveTimer); draftSaveNow(false, true); } catch (e) {}
      }
      function stopAutosave() {
        try { clearInterval(heartbeat); clearInterval(edProbe); saveBeforeLeave(); } catch (e) {}
      }
      window.addEventListener('beforeunload', saveBeforeLeave);
      window.addEventListener('pagehide', stopAutosave, { once: true });
      setTimeout(function () {
        try {
          var raw = gmGet(draftStorageKey, '');
          var legacy = false, sourceKey = raw ? draftStorageKey : '';
          if (!raw) {
            var cands = [];
            gwxDraftIndex().forEach(function (k) {
              if (k === draftStorageKey) return;
              try {
                var rr = gmGet(k, ''); if (!rr) return;
                var dd = JSON.parse(rr);
                if (!dd || !dd.t || Date.now() - dd.t > 48 * 3600 * 1000) { gwxDraftClearSlot(k); return; }
                if (dd.context === draftContext) cands.push({ k: k, d: dd, raw: rr });
              } catch (e) { gwxDraftClearSlot(k); }
            });
            cands.sort(function (a, b) { return b.d.t - a.d.t; });
            if (cands.length) { raw = cands[0].raw; sourceKey = cands[0].k; }
          }
          if (!raw) { raw = gmGet('gwx.draft', ''); legacy = !!raw; sourceKey = legacy ? 'gwx.draft' : ''; }
          if (!raw) return;
          var d;
          try { d = JSON.parse(raw); } catch (er0) {
            if (sourceKey === 'gwx.draft') gmDelete('gwx.draft');
            else if (sourceKey) gwxDraftClearSlot(sourceKey);
            return;
          }
          if (!d || !d.t || (Date.now() - d.t) > 48 * 3600 * 1000) {
            if (sourceKey === 'gwx.draft') gmDelete('gwx.draft');
            else if (sourceKey) gwxDraftClearSlot(sourceKey);
            return;
          }
          if (draftChanged(draftCollect())) return; // 사용자가 초기 상태에서 실제로 변경한 경우만 제안 생략
          showRestore(d, legacy, sourceKey);
        } catch (e) { log('draft restore read', e); }
      }, 2600);
      function showRestore(d, legacy, sourceKey) {
        var box = el('div', 'gwx-restore');
        var when = new Date(d.t);
        var p1 = el('div');
        var bo = el('b'); bo.textContent = '자동 저장된 임시 작성분';
        p1.appendChild(bo);
        p1.appendChild(document.createTextNode('이 있습니다 (' +
          (when.getMonth() + 1) + '/' + when.getDate() + ' ' +
          ('0' + when.getHours()).slice(-2) + ':' + ('0' + when.getMinutes()).slice(-2) + ')'));
        var p2 = el('div');
        p2.style.cssText = 'margin-top:4px;color:var(--gwx-t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        p2.textContent = '제목: ' + (d.subject || '(없음)');
        var p3 = null;
        if (d.attachments) {
          p3 = el('div');
          p3.style.cssText = 'margin-top:4px;color:var(--gwx-warn);font-size:12px';
          p3.textContent = '첨부파일은 보안상 자동 복원되지 않습니다.';
        }
        var btns = el('div', 'btns');
        var ok = el('button', 'gwx-btn'); ok.type = 'button'; ok.textContent = '복원';
        ok.onclick = function () {
          try {
            var s0 = document.getElementById('subject');
            if (s0 && d.subject && !s0.value.trim()) {
              s0.value = d.subject;
              s0.dispatchEvent(new Event('input', { bubbles: true }));
            }
            var ed = getEd();
            if (ed && d.body) {
              if (ed.status === 'ready') ed.setData(d.body);
              else ed.on('instanceReady', function () { ed.setData(d.body); });
            }
            if (legacy || (sourceKey && sourceKey !== draftStorageKey)) {
              if (!gmSet(draftStorageKey, gwxStringify(Object.assign({}, d, { key: draftToken, context: draftContext })))) {
                toast('복원 내용을 저장하지 못해 이전 임시저장본을 유지했습니다'); return;
              }
              gwxDraftRegister(draftStorageKey);
              if (legacy) gmDelete('gwx.draft');
              else gwxDraftClearSlot(sourceKey);
            }
            draftSessionWrote = true; // 사용자가 복원을 수락한 뒤에는 현재 탭이 해당 슬롯의 수명주기를 관리
          } catch (e) { warn('restore', e); }
          var groups = [['받는이', d.to], ['참조', d.cc], ['숨은참조', d.bcc]].filter(function (g) { return String(g[1] || '').trim(); });
          if (groups.length) {
            box.textContent = '';
            var q = el('div'); q.textContent = '수신자는 구분별로 복사해 해당 칸에 붙여넣으세요.'; box.appendChild(q);
            groups.forEach(function (g) {
              var row = el('div'), label = el('b'), value = el('div'), cp = el('button', 'gwx-btn');
              row.style.cssText = 'margin-top:8px'; label.textContent = g[0];
              value.textContent = String(g[1]); value.style.cssText = 'word-break:break-all;max-height:50px;overflow:auto';
              cp.type = 'button'; cp.textContent = g[0] + ' 복사';
              cp.onclick = function () {
                var text = String(g[1]);
                function fallback() { try { W.prompt(g[0] + ' 주소를 복사해 ' + g[0] + ' 칸에 붙여넣으세요.', text); } catch (e) {} }
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(g[0] + ' 주소 복사됨'); }).catch(fallback);
                else fallback();
              };
              row.appendChild(label); row.appendChild(value); row.appendChild(cp); box.appendChild(row);
            });
            var done = el('button', 'gwx-btn'); done.type = 'button'; done.textContent = '닫기';
            done.onclick = function () { gwxRemove(box); }; box.appendChild(done);
          } else gwxRemove(box);
          toast('제목·본문을 복원했습니다');
        };
        var no = el('button', 'gwx-btn'); no.type = 'button'; no.textContent = '삭제';
        no.onclick = function () {
          if (sourceKey && sourceKey !== 'gwx.draft') gwxDraftClearSlot(sourceKey);
          gwxDraftClearSlot(draftStorageKey);
          if (legacy) gmDelete('gwx.draft');
          gwxRemove(box);
        };
        btns.appendChild(ok); btns.appendChild(no);
        box.appendChild(p1); box.appendChild(p2); if (p3) box.appendChild(p3); box.appendChild(btns);
        (document.body || document.documentElement).appendChild(box);
      }
    }

    /* ----- (0.9.3) 첨부영역 자동 펼침·압축 ----- */
    function ensureAttachOpen() {
      try {
        var tr = document.getElementById('attr_tr');
        if (tr && getComputedStyle(tr).display !== 'none') { compactAttach(); return true; }
        var anc = document.getElementById('attAnchor');
        if (!anc) {
          anc = qsa('#sendtable a,#sendtable img,#sendtable button,#sendtable input[type=button]').filter(function (x) {
            var oc = (x.getAttribute('onclick') || '') + ' ' + (x.getAttribute('href') || '') + ' ' +
                     (x.getAttribute('title') || '') + ' ' + (x.getAttribute('alt') || '') + ' ' + (x.textContent || '');
            return /att(ach|r)|첨부|파일/i.test(oc) && !/삭제|제거|취소/i.test(oc);
          })[0] || null;
        }
        if (anc) { anc.click(); setTimeout(compactAttach, 220); return true; }
      } catch (e) { warn('attach open', e); }
      return false;
    }
    function attachmentNames() {
      try {
        if (W.fileControl && typeof W.fileControl.getOrgFileNames === 'function')
          return gwxArray(W.fileControl.getOrgFileNames() || []).map(String).filter(Boolean);
      } catch (e) {}
      var names = [];
      qsa('#attr_tr input[type=file]').forEach(function (inp) { gwxArray(inp.files || []).forEach(function (f) { names.push(f.name); }); });
      return names;
    }
    function attachSig() {
      try {
        var tr = document.getElementById('attr_tr'); if (!tr) return '';
        var out = attachmentNames();
        qsa('input[type=file]', tr).forEach(function (inp) {
          [].slice.call(inp.files || []).forEach(function (f) { out.push((f.name || 'file') + ':' + (f.size || 0)); });
        });
        qsa('a,span,td', tr).forEach(function (n) {
          var t = String(n.textContent || '').replace(/\s+/g, ' ').trim();
          if (!t || /찾아보기|첨부|파일추가|삭제|제거|전체선택/i.test(t)) return;
          var m = t.match(/[^\/:*?"<>|]+\.[A-Za-z0-9]{1,10}/g);
          if (m) m.forEach(function (x) { out.push(x.trim()); });
        });
        return out.filter(function (x, i, a) { return x && a.indexOf(x) === i; }).sort().join('|').slice(0, 1200);
      } catch (e) { return ''; }
    }
    function findBrowse() {
      try {
        var tr = document.getElementById('attr_tr');
        if (!tr) return null;
        var w = document.createTreeWalker(tr, NodeFilter.SHOW_TEXT, null), n;
        while ((n = w.nextNode())) {
          if (n.textContent.indexOf('찾아보기') > -1) {
            var a = n.parentElement && n.parentElement.closest('a,button,label');
            if (a) return a;
          }
        }
        return qs('#attr_tr a');
      } catch (e) { return null; }
    }
    function compactAttach() {
      try {
        var tr = document.getElementById('attr_tr');
        if (!tr) return;
        qsa('div,tbody', tr).forEach(function (dv) {
          if (dv.offsetHeight > 190) {
            dv.style.maxHeight = '160px';
            dv.style.overflowY = 'auto';
          }
        });
      } catch (e) {}
    }

    /* ----- (c) F15 첨부 드래그앤드롭 / 이미지 본문 삽입 ----- */
    function attachDrop() {
      var dragOpened = false;
      function hasFiles(e) {
        try { return [].slice.call(e.dataTransfer.types || []).indexOf('Files') > -1; } catch (er) { return false; }
      }
      document.addEventListener('dragover', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'copy'; } catch (er) {}
        document.body.classList.add('gwx-drophint');
        if (!dragOpened) { dragOpened = true; ensureAttachOpen(); } // 드래그 진입 즉시 펼침
      });
      ['drop', 'dragend'].forEach(function (ev) {
        document.addEventListener(ev, function () {
          setTimeout(function () {
            try { document.body.classList.remove('gwx-drophint'); } catch (e) {}
          }, 60);
        }, true);
      });
      document.addEventListener('dragleave', function (e) {
        if (!e.relatedTarget) { document.body.classList.remove('gwx-drophint'); dragOpened = false; }
      });
      document.addEventListener('drop', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        document.body.classList.remove('gwx-drophint');
        dragOpened = false;
        var files = [].slice.call((e.dataTransfer && e.dataTransfer.files) || []);
        if (!files.length) return;
        var imgs = [], others = [];
        files.forEach(function (f) {
          if (f.type && f.type.indexOf('image/') === 0 && !e.shiftKey) imgs.push(f);
          else others.push(f);
        });
        imgs.forEach(insertImage);
        if (others.length) attachFiles(others);
      });
      function insertImage(f) {
        var ed = getEd();
        if (!ed) { attachFiles([f]); return; }
        if (f.size > 1.5 * 1024 * 1024) toast('큰 이미지(1.5MB↑)는 본문 삽입 대신 첨부(Shift+드롭)를 권장합니다');
        var rd = new FileReader();
        rd.onload = function () {
          try {
            ed.focus(); ed.fire('saveSnapshot');
            ed.insertHtml('<img src="' + rd.result + '" style="max-width:100%">');
            ed.fire('saveSnapshot');
            toast('이미지를 본문에 삽입했습니다');
          } catch (e) { toast('이미지 삽입 실패'); }
        };
        rd.readAsDataURL(f);
      }
      function attachFiles(fs) {
        try {
          ensureAttachOpen();
          var seek = 0;
          (function waitInput() {
            var inp = qs('#attr_tr input[type=file]') || qs('#fileUpload input[type=file]') || qs('input[type=file]');
            if (!inp && seek++ < 20) { setTimeout(waitInput, 120); return; }
            if (!inp) { toast('첨부 입력을 찾지 못했습니다 — 첨부 버튼을 이용해 주세요'); return; }
            try {
              var before = attachSig();
              var dt = new DataTransfer(); fs.forEach(function (f) { dt.items.add(f); });
              inp.files = dt.files;
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              compactAttach();
              toast(fs.length + '개 파일을 첨부에 넣었습니다 — 업로드 완료를 확인하세요');
              var ck = 0, verifyTm = setInterval(function () {
                ck++;
                if (attachSig() !== before || (inp.files && inp.files.length)) { clearInterval(verifyTm); compactAttach(); return; }
                if (ck >= 24) { clearInterval(verifyTm); toast('첨부 반영이 확인되지 않습니다 — [찾아보기]로 직접 추가해 주세요'); }
              }, 500);
            } catch (e) { toast('이 환경에선 드롭 첨부가 지원되지 않습니다 — 첨부 버튼을 이용해 주세요'); }
          })();
        } catch (e) { warn('attach', e); }
      }
      dropInsertImage = insertImage;
      dropAttachFiles = attachFiles;
    }

    /* ----- (e) F16 수신자 그룹 프리셋 ----- */
    function recipientGroups() {
      var anchor = document.getElementById('recipient_to');
      if (!anchor || qs('.gwx-rgbtn')) return;
      var btn = el('button', 'gwx-chip gwx-rgbtn'); btn.type = 'button';
      btn.innerHTML = icon('group') + '<span>그룹</span>';
      btn.title = '수신자 그룹 프리셋 (이 브라우저에만 저장)';
      btn.style.marginLeft = '6px';
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
      try { // 0.9.7(요구7): 제목 행 우측에 고정 배치(낙하·겹침 원천 차단)
        var scell = document.getElementById('subject');
        scell = scell && scell.closest ? scell.closest('td') : null;
        if (scell) {
          scell.style.position = 'relative';
          var subj0 = document.getElementById('subject');
          if (subj0) subj0.style.setProperty('padding-right', '112px', 'important');
          var sp0 = btn.querySelector('span'); if (sp0) sp0.textContent = '수신 그룹';
          btn.style.cssText += ';position:absolute;right:6px;top:50%;transform:translateY(-50%);margin:0;z-index:2';
          scell.appendChild(btn);
        }
      } catch (e) {}
      function loadG() { try { var g0 = storedJson(gmGet('gwx.rcptGroups', '[]'), []); return Array.isArray(g0) ? g0 : []; } catch (e) { return []; } }
      function addRecipients(str) {
        var items = String(str).split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
        var done = false;
        try {
          var $ = W.jQuery || W.$;
          if ($ && $('#asto').length && typeof $('#asto').tokenInput === 'function') {
            items.forEach(function (v) { $('#asto').tokenInput('add', { id: v, name: v }); });
            done = true;
          }
        } catch (e) { done = false; }
        if (done) { toast(items.length + '명을 받는이에 추가했습니다 — 표시를 확인하세요'); return; }
        try {
          var txt0 = items.join('; ');
          var cp0 = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt0) : null;
          if (cp0 && cp0.then) cp0.then(function () {
            toast('자동 입력이 불가해 주소를 복사했습니다 — 받는이 칸에 붙여넣으세요');
          }).catch(function () { prompt('아래 주소를 복사해 받는이에 붙여넣으세요', txt0); });
          else prompt('아래 주소를 복사해 받는이에 붙여넣으세요', txt0);
        } catch (e) { prompt('아래 주소를 복사해 받는이에 붙여넣으세요', items.join('; ')); }
      }
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        popover(btn, function (pop) {
          pop.classList.add('gwx-plist');
          var tt = el('p', 'gwx-pt'); tt.textContent = '수신자 그룹'; pop.appendChild(tt);
          var G = loadG();
          G.forEach(function (g, idx) {
            var row = el('div', 'row');
            var nm = el('span');
            nm.textContent = g.n + ' (' + String(g.v).split(/[;,]/).filter(Boolean).length + ')';
            nm.title = g.v;
            var delx = el('span', 'del'); delx.textContent = '×';
            delx.onclick = function (ev) {
              ev.stopPropagation();
              G.splice(idx, 1); gmSet('gwx.rcptGroups', gwxStringify(G)); gwxRemove(pop);
            };
            row.appendChild(nm); row.appendChild(delx);
            row.onclick = function () { addRecipients(g.v); gwxRemove(pop); };
            pop.appendChild(row);
          });
          if (!G.length) {
            var em = el('div'); em.textContent = '저장된 그룹이 없습니다';
            em.style.cssText = 'font:12px var(--gwx-font);color:var(--gwx-t3);padding:4px';
            pop.appendChild(em);
          }
          var add = el('div', 'add');
          var inp = el('input'); inp.type = 'text'; inp.placeholder = '그룹 이름';
          var ok = el('button', 'gwx-btn'); ok.type = 'button'; ok.textContent = '현재 받는이 저장';
          ok.style.height = '26px'; ok.style.fontSize = '12px';
          ok.onclick = function () {
            var n = inp.value.trim(); if (!n) { inp.focus(); return; }
            var v = (document.getElementById('asto') || {}).value || '';
            if (!v.trim()) { toast('받는이가 비어 있습니다'); return; }
            G.push({ n: n, v: v }); gmSet('gwx.rcptGroups', gwxStringify(G));
            gwxRemove(pop); toast('그룹을 저장했습니다');
          };
          add.appendChild(inp); add.appendChild(ok); pop.appendChild(add);
        });
      };
    }

    /* ----- (d) F11 에디터 스위트 (G1b: iframe 내부 무주입 — CKEditor API 편집만) ----- */
    var FORE = ['#000000', '#404040', '#7a7a7a', '#b3b3b3', '#ffffff', '#d92f2f', '#e0682f', '#dfa32e',
      '#5f9e2f', '#178043', '#0e8a7d', '#0f7fa8', '#0369a1', '#3555c8', '#7c46c8', '#b6246f'];
    var BACK = ['transparent', '#ffe066', '#ffd6a5', '#ffb3b3', '#d3f3c2', '#c2ecec', '#cfe3ff', '#e6d5f7',
      '#f6c9e0', '#f2f2f2', '#e0e0e0', '#fff2b3', '#d9f2e6', '#e8f4fd', '#fdeaea', '#f3e8ff'];
    var CELLBG = ['', '#ffffff', '#f3f4f6', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#fee2e2'];
    var BORDERC = ['#c9ced4', '#8a919a', '#333333', '#d92f2f', '#0e8a7d', '#0369a1', '#dfa32e', '#ffffff'];

    function snap(ed, fn) {
      try { ed.focus(); ed.fire('saveSnapshot'); fn(); ed.fire('saveSnapshot'); }
      catch (e) { warn('snap', e); }
    }
    function applySpan(ed, styles) {
      snap(ed, function () { ed.applyStyle(new W.CKEDITOR.style({ element: 'span', styles: styles })); });
    }
    function applyBlock(ed, styles) {
      snap(ed, function () { ed.applyStyle(new W.CKEDITOR.style({ element: 'p', styles: styles })); });
    }
    function applyEl(ed, tag) {
      snap(ed, function () { ed.applyStyle(new W.CKEDITOR.style({ element: tag })); });
    }
    function execCkeCommand(ed, name) {
      try {
        var c = ed.getCommand && ed.getCommand(name);
        if (!c) return false;
        var CK0 = W.CKEDITOR;
        if (CK0 && typeof CK0.TRISTATE_DISABLED !== 'undefined' && c.state === CK0.TRISTATE_DISABLED) return false;
        ed.focus();
        return ed.execCommand(name) !== false;
      } catch (e) { return false; }
    }
    function cmdOr(ed, name, fallback) {
      if (execCkeCommand(ed, name)) return true;
      if (fallback) fallback();
      return false;
    }
    function mkBtn(html, title, fn) {
      var b = el('button', 'gwx-fbtn'); b.type = 'button'; b.innerHTML = html; b.title = title;
      if (fn) b.onclick = function (e) { e.preventDefault(); fn(e); };
      return b;
    }
    function mkChip(text, fn) {
      var c = el('button', 'gwx-chip'); c.type = 'button'; c.textContent = text;
      if (fn) c.onclick = function (e) { e.preventDefault(); fn(e); };
      return c;
    }
    function mkSel(title, opts, fn) {
      var s = el('select', 'gwx-fsel'); s.title = title;
      opts.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
      s.onchange = function () {
        var v = s.value; if (v === '') return;
        s.selectedIndex = 0; fn(v);
      };
      return s;
    }
    function chipLab(html) { var s = el('span', 'gwx-clab'); s.innerHTML = html; return s; }
    function swGrid(pop, colors, fn) {
      var g = el('div', 'gwx-swatches');
      colors.forEach(function (c) {
        var none = (c === '' || c === 'transparent');
        var sw = el('i', 'gwx-sw' + (none ? ' none' : ''));
        if (!none) sw.style.background = c;
        sw.title = none ? '없음' : c;
        sw.onclick = function () { fn(c); gwxRemove(pop); };
        g.appendChild(sw);
      });
      pop.appendChild(g);
      var inp = el('input', 'gwx-cinp'); inp.type = 'color'; inp.title = '직접 선택';
      inp.oninput = function () { fn(inp.value); };
      pop.appendChild(inp);
    }
    function palBtn(ed, title, glyph, colors, isBg) {
      var b = mkBtn(glyph, title, null);
      b.onclick = function (e) {
        e.preventDefault();
        popover(b, function (pop) {
          swGrid(pop, colors, function (c) {
            if (isBg) applySpan(ed, { 'background-color': (c === '' || c === 'transparent') ? 'transparent' : c });
            else applySpan(ed, { color: c });
          });
        });
      };
      return b;
    }
    function decoBtn(ed) {
      var b = mkBtn('<b class="gwx-glyph" style="text-decoration:underline">U</b> ▾', '밑줄 스타일·취소선·첨자', null);
      b.onclick = function (e) {
        e.preventDefault();
        popover(b, function (pop) {
          pop.classList.add('gwx-plist');
          function row(label, fn) {
            var r = el('div', 'row'); r.textContent = label;
            r.onclick = function () { fn(); gwxRemove(pop); };
            pop.appendChild(r);
          }
          row('밑줄 (실선)', function () {
            cmdOr(ed, 'underline', function () { applySpan(ed, { 'text-decoration': 'underline' }); });
          });
          row('밑줄 — 점선', function () { applySpan(ed, { 'text-decoration-line': 'underline', 'text-decoration-style': 'dotted' }); });
          row('밑줄 — 물결', function () { applySpan(ed, { 'text-decoration-line': 'underline', 'text-decoration-style': 'wavy' }); });
          row('밑줄 — 이중', function () { applySpan(ed, { 'text-decoration-line': 'underline', 'text-decoration-style': 'double' }); });
          row('밑줄 — 빨간 물결(교정 표시)', function () {
            applySpan(ed, { 'text-decoration-line': 'underline', 'text-decoration-style': 'wavy', 'text-decoration-color': '#d92f2f' });
          });
          row('취소선', function () {
            cmdOr(ed, 'strike', function () { applySpan(ed, { 'text-decoration': 'line-through' }); });
          });
          row('위첨자 (x²)', function () { cmdOr(ed, 'superscript', function () { applyEl(ed, 'sup'); }); });
          row('아래첨자 (x₂)', function () { cmdOr(ed, 'subscript', function () { applyEl(ed, 'sub'); }); });
        });
      };
      return b;
    }
    /* 표 템플릿 (인라인 스타일 — 수신 측 호환) */
    function rep(s, n) { var o = '', i; for (i = 0; i < n; i++) o += s; return o; }
    var TD_CELL = '<td style="border:1px solid #c9ced4;padding:6px 9px;font-size:13px;line-height:1.5"><br></td>';
    function thc(t, w) {
      return '<th style="border:1px solid #c9ced4;padding:7px 9px;font-size:13px;background-color:#f3f4f6;text-align:center' +
        (w ? ';width:' + w : '') + '">' + t + '</th>';
    }
    function tdc(t, extra) {
      return '<td style="border:1px solid #c9ced4;padding:6px 9px;font-size:13px;line-height:1.5' + (extra || '') + '">' + (t || '<br>') + '</td>';
    }
    function tblWrap(inner) {
      return '<table style="border-collapse:collapse;width:100%;border:1px solid #c9ced4">' + inner + '</table><p><br></p>';
    }
    var PRESETS = [
      { n: '비용 정산표', html: tblWrap(
        '<tr>' + thc('일자', '90px') + thc('항목', '110px') + thc('내용') + thc('금액(원)', '110px') + thc('비고', '90px') + '</tr>' +
        rep('<tr>' + tdc() + tdc() + tdc() + tdc('', ';text-align:right') + tdc() + '</tr>', 4) +
        '<tr><td colspan="3" style="border:1px solid #c9ced4;padding:7px 9px;font-size:13px;background-color:#f9fafb;text-align:center;font-weight:bold">합계</td>' +
        tdc('', ';text-align:right;font-weight:bold') + tdc() + '</tr>') },
      { n: '출장 일정표', html: tblWrap(
        '<tr>' + thc('일자', '90px') + thc('시간', '90px') + thc('일정') + thc('장소', '130px') + thc('비고', '90px') + '</tr>' +
        rep('<tr>' + tdc() + tdc() + tdc() + tdc() + tdc() + '</tr>', 5)) },
      { n: '업무 체크리스트', html: tblWrap(
        '<tr>' + thc('✓', '40px') + thc('항목') + thc('담당', '100px') + thc('기한', '100px') + '</tr>' +
        rep('<tr>' + tdc('☐', ';text-align:center') + tdc() + tdc() + tdc() + '</tr>', 5)) }
    ];
    function tblBtn(ed) {
      var b = mkBtn('<b class="gwx-glyph">▦</b> 표 ▾', '표 삽입 / 업무 템플릿', null);
      b.onclick = function (e) {
        e.preventDefault();
        popover(b, function (pop) {
          var wrap = el('div', 'gwx-grid'), lab = el('div', 'gwx-grid-lab');
          lab.textContent = '1 × 1';
          var r, c;
          for (r = 1; r <= 6; r++) for (c = 1; c <= 8; c++) (function (r, c) {
            var cell = el('i', 'gwx-gc');
            cell.onmouseenter = function () {
              lab.textContent = r + ' × ' + c;
              qsa('.gwx-gc', wrap).forEach(function (k, idx) {
                var kr = Math.floor(idx / 8) + 1, kc = (idx % 8) + 1;
                k.classList.toggle('on', kr <= r && kc <= c);
              });
            };
            cell.onclick = function () {
              var rows = '', i, j;
              for (i = 0; i < r; i++) { rows += '<tr>'; for (j = 0; j < c; j++) rows += TD_CELL; rows += '</tr>'; }
              snap(ed, function () { ed.insertHtml(tblWrap(rows)); });
              gwxRemove(pop);
            };
            wrap.appendChild(cell);
          })(r, c);
          pop.appendChild(wrap); pop.appendChild(lab);
          var pt = el('p', 'gwx-pt'); pt.style.marginTop = '10px'; pt.textContent = '업무 템플릿 (원클릭 삽입)';
          pop.appendChild(pt);
          PRESETS.forEach(function (ps) {
            var ch = mkChip(ps.n, function () {
              snap(ed, function () { ed.insertHtml(ps.html); });
              gwxRemove(pop);
            });
            ch.style.margin = '0 4px 4px 0';
            pop.appendChild(ch);
          });
        });
      };
      return b;
    }
    function snipBtn(ed) {
      var b = mkBtn(icon('snippet') + '<span>문구</span>', '자주 쓰는 문구·서명 (이 브라우저에만 저장)', null);
      b.onclick = function (e) {
        e.preventDefault();
        popover(b, function (pop) {
          pop.classList.add('gwx-plist');
          var tt = el('p', 'gwx-pt'); tt.textContent = '자주 쓰는 문구·서명'; pop.appendChild(tt);
          var SN = []; try { var sn0 = storedJson(gmGet('gwx.snippets', '[]'), []); SN = Array.isArray(sn0) ? sn0 : []; } catch (er) { SN = []; }
          SN.forEach(function (sn, idx) {
            var row = el('div', 'row');
            var nm = el('span'); nm.textContent = sn.n; row.appendChild(nm);
            var delx = el('span', 'del'); delx.textContent = '×';
            delx.onclick = function (ev) {
              ev.stopPropagation();
              SN.splice(idx, 1); gmSet('gwx.snippets', gwxStringify(SN)); gwxRemove(pop);
            };
            row.appendChild(delx);
            row.onclick = function () {
              snap(ed, function () { ed.insertHtml(sn.h); });
              gwxRemove(pop);
            };
            pop.appendChild(row);
          });
          if (!SN.length) {
            var em = el('div'); em.textContent = '저장된 문구가 없습니다 — 에디터에서 내용을 선택 후 저장하세요';
            em.style.cssText = 'font:12px var(--gwx-font);color:var(--gwx-t3);padding:4px;max-width:230px';
            pop.appendChild(em);
          }
          var add = el('div', 'add');
          var inp = el('input'); inp.type = 'text'; inp.placeholder = '이름 (예: 외부용 서명)';
          var ok = el('button', 'gwx-btn'); ok.type = 'button'; ok.textContent = '현재 선택 저장';
          ok.style.height = '26px'; ok.style.fontSize = '12px';
          ok.onclick = function () {
            var n = inp.value.trim(); if (!n) { inp.focus(); return; }
            var h = '';
            try { if (ed.getSelectedHtml) h = String(ed.getSelectedHtml(true) || ''); } catch (er) {}
            if (!h) { try { var sel = ed.getSelection(); h = sel ? String(sel.getSelectedText() || '') : ''; } catch (er2) {} }
            if (!h.trim()) { toast('에디터에서 저장할 내용을 먼저 선택하세요'); return; }
            SN.push({ n: n, h: h }); gmSet('gwx.snippets', gwxStringify(SN));
            gwxRemove(pop); toast('문구를 저장했습니다');
          };
          add.appendChild(inp); add.appendChild(ok); pop.appendChild(add);
        });
      };
      return b;
    }

    /* 선택 컨텍스트 패널: 이미지 크기·정렬 / 표 행열·병합·테두리·배경 */
    function imgPanel(ed, img) {
      var box = el('span', 'gwx-ctx');
      box.appendChild(chipLab(icon('image') + '이미지'));
      box.appendChild(chipLab('모서리를 드래그해 크기 조절'));
      box.appendChild(mkChip('원본', function () {
        snap(ed, function () {
          img.removeAttribute('width'); img.removeAttribute('height');
          img.removeStyle('width'); img.removeStyle('height');
        });
      }));
      box.appendChild(mkChip('◀ 좌', function () {
        snap(ed, function () { img.removeStyle('display'); img.setStyle('float', 'left'); img.setStyle('margin', '4px 12px 8px 0'); });
      }));
      box.appendChild(mkChip('중앙', function () {
        snap(ed, function () { img.removeStyle('float'); img.setStyle('display', 'block'); img.setStyle('margin', '8px auto'); });
      }));
      box.appendChild(mkChip('우 ▶', function () {
        snap(ed, function () { img.removeStyle('display'); img.setStyle('float', 'right'); img.setStyle('margin', '4px 0 8px 12px'); });
      }));
      return box;
    }
    /* ===== 1.3.6: 표 크기 모델 =====
     * [1.3.5 결함] 열 폭을 colgroup 'px' + 셀 '%'로 이원 지정 → 두 값이 어긋나면
     *   브라우저가 열 폭을 확정하지 못했고, tableResizeModel()이 null이면
     *   열 드래그뿐 아니라 표 폭 프리셋·표너비 입력까지 함께 무동작이 되었다.
     * [1.3.6] 열 폭 = colgroup·셀 모두 '%'(비율) 단일 기준 / 표 폭만 px 또는 %.
     *   모델 산출에 실패해도 표 폭 변경·자동 맞춤은 항상 수행하고 사유를 알린다. */
    var GWX_TABLE_MIN = 20;
    var GWX_TBL_DIAG = { model: 0, applies: 0, grips: 0, starts: 0, moves: 0, lastKind: '', lastFail: '' };

    function tableResizeModel(t) {
      try {
        if (!t || !t.rows || !t.rows.length) { GWX_TBL_DIAG.lastFail = '행이 없는 표'; return null; }
        var placements = [], covers = [], active = [], cols = 0, valid = true;
        [].forEach.call(t.rows, function (r, ri) {
          if (!valid) return;
          var occupied = active.slice(), reserve = [], cover = [], pos = 0;
          for (var oi = 0; oi < occupied.length; oi++) if (occupied[oi] > 0) cover[oi] = true;
          [].forEach.call(r.cells, function (c) {
            if (!valid) return;
            while ((occupied[pos] || 0) > 0) pos++;
            var cs = Math.max(1, c.colSpan || 1), rs = Math.max(1, c.rowSpan || 1);
            for (var k = 0; k < cs; k++) {
              if ((occupied[pos + k] || 0) > 0 || cover[pos + k]) { valid = false; return; }
            }
            placements.push({ cell: c, row: ri, start: pos, span: cs, rowSpan: rs });
            for (var j = 0; j < cs; j++) {
              cover[pos + j] = true;
              if (rs > 1) reserve[pos + j] = Math.max(reserve[pos + j] || 0, rs - 1);
            }
            pos += cs;
          });
          covers.push(cover); cols = Math.max(cols, cover.length);
          var n = Math.max(occupied.length, reserve.length), next = new Array(n);
          for (var ai = 0; ai < n; ai++) next[ai] = Math.max(Math.max(0, (occupied[ai] || 0) - 1), reserve[ai] || 0);
          active = next;
        });
        if (!valid || !cols) { GWX_TBL_DIAG.lastFail = '셀 배치가 겹치는 표'; return null; }
        for (var cr = 0; cr < covers.length; cr++) {
          for (var cc = 0; cc < cols; cc++) {
            if (!covers[cr][cc]) { GWX_TBL_DIAG.lastFail = '행마다 열 수가 다른 표'; return null; }
          }
        }
        var rect = t.getBoundingClientRect();
        if (!(rect.width > 1)) { GWX_TBL_DIAG.lastFail = '표가 아직 화면에 그려지지 않음'; return null; }
        var edges = new Array(cols + 1), cellMap = new Map();
        edges[0] = [0]; edges[cols] = [rect.width];
        placements.forEach(function (pl) {
          cellMap.set(pl.cell, pl);
          var r = pl.cell.getBoundingClientRect();
          if (pl.start > 0) (edges[pl.start] || (edges[pl.start] = [])).push(r.left - rect.left);
          if (pl.start + pl.span < cols) (edges[pl.start + pl.span] || (edges[pl.start + pl.span] = [])).push(r.right - rect.left);
        });
        var points = edges.map(function (values) {
          if (!values) return null;
          values.sort(function (a, b) { return a - b; }); return values[Math.floor(values.length / 2)];
        });
        for (var left = 0; left < cols;) {
          var right = left + 1; while (right < cols && points[right] == null) right++;
          for (var k = left + 1; k < right; k++) points[k] = points[left] + (points[right] - points[left]) * (k - left) / (right - left);
          left = right;
        }
        var widths = gwxArray({ length: cols }, function (_, i) { return Math.max(1, points[i + 1] - points[i]); });
        GWX_TBL_DIAG.model++;
        return { cols: cols, widths: widths, total: rect.width, placements: placements, cellMap: cellMap };
      } catch (e) {
        GWX_TBL_DIAG.lastFail = '모델 예외: ' + (e && e.message ? e.message : e);
        return null;
      }
    }
    function tableCellRange(cell, model) {
      var pl = model && model.cellMap && model.cellMap.get(cell);
      if (pl) return { start: pl.start, span: pl.span };
      var start = 0, n = cell && cell.parentNode ? cell.parentNode.firstElementChild : null;
      while (n && n !== cell) { start += Math.max(1, n.colSpan || 1); n = n.nextElementSibling; }
      return { start: start, span: Math.max(1, (cell && cell.colSpan) || 1) };
    }
    // 1.3.8: tableFitWidths는 GWXP(순수 함수)로 이관 — 단위 테스트 대상
    var tableFitWidths = GWXP.tableFitWidths;
    // 1.3.10: Override size constraints only on the table the user is resizing.
    // Inline priority is necessary when the editor or pasted content uses !important.
    function tableSizeStyle(n, property, value) { n.style.setProperty(property, value, 'important'); }
    function tableOwnCells(t) {
      return qsa('td,th', t).filter(function (c) { return c.closest('table') === t; });
    }
    function tableWidthLimits(n) {
      n.removeAttribute('width');
      ['inline-size', 'min-inline-size', 'max-inline-size'].forEach(function (p) { n.style.removeProperty(p); });
      tableSizeStyle(n, 'min-width', '0'); tableSizeStyle(n, 'max-width', 'none');
    }
    function tableEnsureColgroup(t, n) {
      var direct = [].slice.call(t.children || []).filter(function (x) { return x.tagName === 'COLGROUP'; });
      var cg = direct.filter(function (x) { return x.getAttribute('data-gwx-cols') === String(n); })[0] || null;
      if (!cg || cg.children.length !== n) {
        direct.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
        cg = t.ownerDocument.createElement('colgroup'); cg.setAttribute('data-gwx-cols', String(n));
        for (var i = 0; i < n; i++) cg.appendChild(t.ownerDocument.createElement('col'));
        // Keep a caption before the colgroup; do not change the editable cell structure.
        var first = t.firstElementChild;
        t.insertBefore(cg, first && first.tagName === 'CAPTION' ? first.nextSibling : first);
      }
      tableWidthLimits(cg); tableSizeStyle(cg, 'width', 'auto');
      [].forEach.call(cg.children, tableWidthLimits);
      return cg;
    }
    function tablePrepCells(t) {
      tableOwnCells(t).forEach(function (c) {
        tableWidthLimits(c); c.removeAttribute('nowrap');
        tableSizeStyle(c, 'box-sizing', 'border-box');
        tableSizeStyle(c, 'white-space', 'normal'); tableSizeStyle(c, 'overflow-wrap', 'anywhere');
        tableSizeStyle(c, 'word-break', 'break-word');
      });
    }
    function tableSyncCellRatios(t, widths, model) {
      var total = gwxReduce(widths, function (a, b) { return a + b; }, 0) || 1;
      model = model || tableResizeModel(t); if (!model) return;
      model.placements.forEach(function (pl) {
        var w = 0;
        for (var k = 0; k < pl.span && pl.start + k < widths.length; k++) w += widths[pl.start + k];
        var pct = (w / total * 100).toFixed(4) + '%';
        tableSizeStyle(pl.cell, 'width', pct);
      });
    }
    function tableSetWidth(t, value) {
      tableWidthLimits(t);
      tableSizeStyle(t, 'box-sizing', 'border-box'); tableSizeStyle(t, 'table-layout', 'fixed');
      tableSizeStyle(t, 'width', value);
    }
    function tableApplyPx(t, widths, total, syncCells) {
      var m = tableResizeModel(t);
      if (!m) {
        tablePrepCells(t);
        tableOwnCells(t).forEach(function (c) { tableSizeStyle(c, 'width', 'auto'); });
        qsa('colgroup,col', t).filter(function (n) { return n.closest('table') === t; }).forEach(function (n) {
          tableWidthLimits(n); tableSizeStyle(n, 'width', 'auto');
        });
        tableSetWidth(t, Math.max(40, Math.round(+total || 40)) + 'px');
        GWX_TBL_DIAG.applies++;
        return { widths: [], total: t.getBoundingClientRect().width };
      }
      var ws = (widths || []).slice(0, m.cols);
      while (ws.length < m.cols) ws.push(m.widths[ws.length] || (m.total / m.cols));
      ws = tableFitWidths(ws, total, GWX_TABLE_MIN);
      var sum = gwxReduce(ws, function (a, b) { return a + b; }, 0) || 1, cg = tableEnsureColgroup(t, m.cols);
      [].forEach.call(cg.children, function (c, i) {
        var pct = (ws[i] / sum * 100).toFixed(4) + '%';
        tableSizeStyle(c, 'width', pct);
      });
      tableSetWidth(t, Math.round(sum) + 'px'); tablePrepCells(t);
      // Keep cell and column constraints in agreement during, not just after, the drag.
      tableSyncCellRatios(t, ws, m);
      GWX_TBL_DIAG.applies++;
      return { widths: ws, total: sum };
    }
    function tableApplyPercent(t, pct) {
      if (!t) return false;
      var m = tableResizeModel(t), total = t.getBoundingClientRect().width;
      tableApplyPx(t, m ? m.widths : [], total, true);
      tableSetWidth(t, Math.max(1, +pct || 100) + '%');
      return true;
    }
    function tableClearHeight(n) {
      n.removeAttribute('height');
      ['block-size', 'min-block-size', 'max-block-size'].forEach(function (p) { n.style.removeProperty(p); });
      tableSizeStyle(n, 'height', 'auto');
      tableSizeStyle(n, 'min-height', '0'); tableSizeStyle(n, 'max-height', 'none');
    }
    function tableReleaseHeight(t) {
      tableClearHeight(t);
      [].forEach.call(t.children, function (n) { if (/^(THEAD|TBODY|TFOOT)$/.test(n.tagName)) tableClearHeight(n); });
      // A merged cell must not retain a height that forces the entire table to stay tall.
      tableOwnCells(t).forEach(function (c) { if (c.rowSpan !== 1) tableClearHeight(c); });
    }
    function tableSetRowHeight(row, h, released) {
      if (!row) return false;
      var t = row.closest('table'); if (!t) return false;
      if (!released) tableReleaseHeight(t);
      tableClearHeight(row);
      h = Math.max(16, Math.round(h));
      tableSizeStyle(row, 'height', h + 'px');
      [].forEach.call(row.cells, function (c) {
        tableClearHeight(c); tableSizeStyle(c, 'box-sizing', 'border-box');
        if (c.rowSpan === 1) tableSizeStyle(c, 'height', h + 'px');
      });
      GWX_TBL_DIAG.applies++; return true;
    }
    function tableAutoWidth(t) {
      if (!t) return false;
      tableWidthLimits(t); tableReleaseHeight(t);
      tableSizeStyle(t, 'width', 'auto');
      tableSizeStyle(t, 'table-layout', 'auto');
      qsa('colgroup,col', t).filter(function (n) { return n.closest('table') === t; }).forEach(function (n) {
        tableWidthLimits(n); tableSizeStyle(n, 'width', 'auto');
      });
      tableOwnCells(t).forEach(function (c) {
        tableWidthLimits(c); tableClearHeight(c);
        tableSizeStyle(c, 'width', 'auto');
      });
      [].forEach.call(t.rows, tableClearHeight);
      GWX_TBL_DIAG.applies++; return true;
    }
    function tableSetSelectedWidth(t, cell, target) {
      var m = tableResizeModel(t);
      if (!m) { toast('이 표는 열 너비 대신 전체 너비를 조절해 주세요'); return false; }
      var rg = tableCellRange(cell, m), old = 0;
      for (var i = 0; i < rg.span && rg.start + i < m.widths.length; i++) old += m.widths[rg.start + i];
      target = Math.max(GWX_TABLE_MIN * rg.span, target);
      var spanNew = tableFitWidths(m.widths.slice(rg.start, rg.start + rg.span), target, GWX_TABLE_MIN);
      for (var j = 0; j < spanNew.length; j++) m.widths[rg.start + j] = spanNew[j];
      tableApplyPx(t, m.widths, m.total + target - old, true); return true;
    }
    function tblPanel(ed, cell, tbl) {
      var box = el('span', 'gwx-ctx');
      box.appendChild(chipLab(icon('table') + '표'));
      var $c = cell.$, $t = tbl.$;
      function cmd(n) { return execCkeCommand(ed, n); }
      function simpleTable() {
        if (!$t.rows || !$t.rows.length) return false;
        var n = $t.rows[0].cells.length;
        return !!n && gwxArray($t.rows).every( function (r) {
          return r.cells.length === n && gwxArray(r.cells).every( function (c) {
            return (c.colSpan || 1) === 1 && (c.rowSpan || 1) === 1;
          });
        });
      }
      function cleanCell(x) {
        x.innerHTML = '<br>';
        x.style.backgroundColor = '';
        ['id', 'name', 'colspan', 'rowspan'].forEach(function (a) { x.removeAttribute(a); });
      }
      function manRow(before) {
        if (!simpleTable()) { toast('병합 셀 표는 CKEditor 표 명령으로만 행을 추가할 수 있습니다'); return; }
        snap(ed, function () {
          var tr = $c.parentNode, nr = tr.cloneNode(true);
          nr.removeAttribute('id'); nr.removeAttribute('name');
          qsa('td,th', nr).forEach(cleanCell);
          tr.parentNode.insertBefore(nr, before ? tr : tr.nextSibling);
        });
      }
      function manCol(before) {
        if (!simpleTable()) { toast('병합 셀 표는 CKEditor 표 명령으로만 열을 추가할 수 있습니다'); return; }
        snap(ed, function () {
          var tr = $c.parentNode, idx = gwxArray(tr.children).indexOf($c);
          qsa('tr', $t).forEach(function (r) {
            var ref = r.children[Math.min(idx, r.children.length - 1)];
            if (!ref) return;
            var ncl = ref.cloneNode(true); cleanCell(ncl);
            r.insertBefore(ncl, before ? ref : ref.nextSibling);
          });
        });
      }
      box.appendChild(mkChip('행↑', function () { if (!cmd('rowInsertBefore')) manRow(true); }));
      box.appendChild(mkChip('행↓', function () { if (!cmd('rowInsertAfter')) manRow(false); }));
      box.appendChild(mkChip('열←', function () { if (!cmd('columnInsertBefore')) manCol(true); }));
      box.appendChild(mkChip('열→', function () { if (!cmd('columnInsertAfter')) manCol(false); }));
      box.appendChild(mkChip('행 삭제', function () {
        if (cmd('rowDelete')) return;
        if (qsa('tr', $t).length <= 1) return;
        var tr = $c.parentNode;
        snap(ed, function () { tr.parentNode.removeChild(tr); });
      }));
      box.appendChild(mkChip('열 삭제', function () {
        if (cmd('columnDelete')) return;
        if (!simpleTable()) { toast('병합 셀 표는 열 삭제를 지원하지 않습니다'); return; }
        var tr = $c.parentNode, idx = gwxArray(tr.children).indexOf($c);
        if (tr.children.length <= 1) return;
        snap(ed, function () {
          qsa('tr', $t).forEach(function (r) { if (r.children[idx]) r.removeChild(r.children[idx]); });
        });
      }));
      // 0.9.4(요구5): 크기 조정 — 열 너비/행 높이(px), 표 전체 너비
      var colW = el('input', 'gwx-num'); colW.type = 'number'; colW.min = String(GWX_TABLE_MIN);
      colW.placeholder = '열px'; colW.title = '선택 셀 구간의 실제 너비(px) — 표 전체 폭도 함께 조정';
      colW.value = Math.round($c.getBoundingClientRect().width) || '';
      colW.onchange = function () {
        var vv = parseInt(colW.value, 10); if (!(vv >= GWX_TABLE_MIN)) return;
        if (!tableResizeModel($t)) { toast('구조가 불규칙한 표는 열 너비 직접 조절을 지원하지 않습니다'); return; }
        snap(ed, function () { tableSetSelectedWidth($t, $c, vv); });
      };
      box.appendChild(colW);
      var rowH = el('input', 'gwx-num'); rowH.type = 'number'; rowH.min = '16';
      rowH.placeholder = '행px'; rowH.title = '현재 행 높이(px)';
      rowH.value = parseInt($c.parentNode.style.height, 10) ||
        Math.round($c.parentNode.getBoundingClientRect().height) || '';
      rowH.onchange = function () {
        var vv = parseInt(rowH.value, 10); if (!(vv >= 16)) return;
        snap(ed, function () { tableSetRowHeight($c.parentNode, vv); });
      };
      box.appendChild(rowH);
      var tw = mkChip('표너비', null);
      tw.onclick = function (e) {
        e.preventDefault();
        popover(tw, function (pop) {
          var wr = el('div');
          [['50%', 50], ['75%', 75], ['100%', 100], ['자동', 0]].forEach(function (pp) {
            var ch = mkChip(pp[0], function () {
              snap(ed, function () { if (pp[1]) tableApplyPercent($t, pp[1]); else tableAutoWidth($t); });
              gwxRemove(pop);
            });
            ch.style.margin = '0 4px 4px 0'; wr.appendChild(ch);
          });
          var px = el('input', 'gwx-num'); px.type = 'number'; px.placeholder = 'px'; px.min = '60';
          px.onchange = function () {
            var vv = parseInt(px.value, 10), mm = tableResizeModel($t);
            if (vv >= 60 && mm) snap(ed, function () { tableApplyPx($t, mm.widths, vv, true); });
            else if (!mm) toast('구조가 불규칙한 표는 폭 조절을 지원하지 않습니다');
            gwxRemove(pop);
          };
          wr.appendChild(px); pop.appendChild(wr);
        });
      };
      box.appendChild(tw);
      [[100, '100%'], [70, '70%'], [50, '50%'], [0, '자동']].forEach(function (w) {
        box.appendChild(mkChip(w[0] ? '폭 ' + w[1] : '폭 자동', function () {
          snap(ed, function () { if (w[0]) tableApplyPercent($t, w[0]); else tableAutoWidth($t); });
        }));
      });
      box.appendChild(mkChip('열 균등', function () {
        var mm = tableResizeModel($t);
        if (!mm) { toast('이 표는 열 균등을 지원하지 않습니다 — ' + (GWX_TBL_DIAG.lastFail || '원인 불명')); return; }
        snap(ed, function () {
          var eq = new Array(mm.cols).fill(mm.total / mm.cols);
          tableApplyPx($t, eq, mm.total, true);
        });
      }));
      box.appendChild(mkChip('표 정리', function () { // 엑셀/아웃룩 붙여넣기 표준화
        snap(ed, function () {
          $t.style.borderCollapse = 'collapse';
          $t.removeAttribute('cellspacing');
          qsa('td,th', $t).forEach(function (c) {
            c.style.border = '1px solid #8a8a8a';
            c.style.padding = '4px 8px';
            c.style.fontFamily = '';
            if (/^Mso/i.test(c.className || '')) c.removeAttribute('class');
          });
        });
        toast('표 서식을 표준화했습니다');
      }));
      box.appendChild(mkChip('머리글 행', function () {
        snap(ed, function () {
          var r0 = $t.rows[0]; if (!r0) return;
          var on = r0.getAttribute('data-gwx-h') === '1';
          [].forEach.call(r0.cells, function (c) {
            c.style.background = on ? '' : '#efefef';
            c.style.fontWeight = on ? '' : '700';
            c.style.textAlign = on ? '' : 'center';
          });
          if (on) r0.removeAttribute('data-gwx-h');
          else r0.setAttribute('data-gwx-h', '1');
        });
      }));
      try { if (ed.getCommand && ed.getCommand('cellMerge')) box.appendChild(mkChip('셀 병합', function () { cmd('cellMerge'); })); } catch (e) {}
      try { if (ed.getCommand && ed.getCommand('cellHorizontalSplit')) box.appendChild(mkChip('셀 분할', function () { cmd('cellHorizontalSplit'); })); } catch (e) {}
      var bgc = mkChip('셀 배경', null);
      bgc.onclick = function (e) {
        e.preventDefault();
        popover(bgc, function (pop) {
          swGrid(pop, CELLBG, function (c) {
            snap(ed, function () { $c.style.backgroundColor = c; });
          });
        });
      };
      box.appendChild(bgc);
      function setBorder(wd, col) {
        snap(ed, function () {
          var win = $t.ownerDocument.defaultView || window;
          function cur(x) {
            var cs = win.getComputedStyle(x);
            var cc = cs.borderTopColor;
            return {
              w: parseInt(cs.borderTopWidth, 10) || 1,
              c: (cc && cc !== 'rgba(0, 0, 0, 0)') ? cc : '#c9ced4'
            };
          }
          qsa('td,th', $t).forEach(function (x) {
            var b = cur(x);
            x.style.border = (wd || b.w) + 'px solid ' + (col || b.c);
          });
          var bt = cur($t);
          $t.style.border = (wd || bt.w) + 'px solid ' + (col || bt.c);
          $t.style.borderCollapse = 'collapse';
        });
      }
      var bdc = mkChip('테두리', null);
      bdc.onclick = function (e) {
        e.preventDefault();
        popover(bdc, function (pop) {
          var pt = el('p', 'gwx-pt'); pt.textContent = '테두리 색'; pop.appendChild(pt);
          swGrid(pop, BORDERC, function (c) { if (c) setBorder(null, c); });
          var pt2 = el('p', 'gwx-pt'); pt2.style.marginTop = '10px'; pt2.textContent = '굵기'; pop.appendChild(pt2);
          var wr = el('div');
          ['1', '2', '3'].forEach(function (wdv) {
            var ch = mkChip(wdv + 'px', function () { setBorder(wdv, null); gwxRemove(pop); });
            ch.style.marginRight = '4px'; wr.appendChild(ch);
          });
          var no = mkChip('없음', function () {
            snap(ed, function () {
              $t.style.border = '0';
              qsa('td,th', $t).forEach(function (x) { x.style.border = '0'; });
            });
            gwxRemove(pop);
          });
          wr.appendChild(no); pop.appendChild(wr);
        });
      };
      box.appendChild(bdc);
      box.appendChild(mkChip('표 삭제', function () {
        if (!confirm('표를 삭제할까요?')) return;
        snap(ed, function () { if ($t.parentNode) $t.parentNode.removeChild($t); });
      }));
      return box;
    }
    function bindCtx(ed, ctx) {
      var ctxScrollView = null;
      var upd = debounce(function () {
        try {
          var sel = ed.getSelection && ed.getSelection();
          var st = sel && sel.getStartElement && sel.getStartElement();
          var img = null, cell = null, tbl = null;
          if (st) {
            if (st.getName && st.getName() === 'img') img = st;
            if (st.getAscendant) {
              cell = st.getAscendant('td', true) || st.getAscendant('th', true);
              tbl = st.getAscendant('table', true);
            }
          }
          ctx.innerHTML = '';
          if (img) ctx.appendChild(imgPanel(ed, img));
          else if (cell && tbl) ctx.appendChild(tblPanel(ed, cell, tbl));
          try { // 대상 바로 위에 부유 배치(부모 좌표계)
            var host2 = ctx.parentElement;
            var tgtEl = (img || tbl);
            if (tgtEl && tgtEl.$ && host2) {
              var f2 = qs('.cke_wysiwyg_frame', host2);
              var fr2 = f2 ? f2.getBoundingClientRect() : null;
              var hr2 = host2.getBoundingClientRect();
              var rr = tgtEl.$.getBoundingClientRect();
              if (fr2) {
                ctx.style.display = 'flex';
                ctx.style.left = Math.max(4, rr.left + fr2.left - hr2.left) + 'px';
                ctx.style.top = Math.max(4, rr.top + fr2.top - hr2.top - 36) + 'px';
              }
            } else {
              ctx.style.display = 'none';
            }
          } catch (e2) {}
        } catch (e) {}
      }, 160);
      try { ed.on('selectionChange', upd); } catch (e) {}
      function hookDoc() {
        try {
          var d0 = ed.document && ed.document.$; if (!d0) return;
          if (!d0._gwxCtxBound) {
            d0._gwxCtxBound = 1;
            ed.document.on('click', upd); ed.document.on('keyup', upd);
          }
          var nv = d0.defaultView || null;
          if (ctxScrollView && ctxScrollView !== nv) ctxScrollView.removeEventListener('scroll', upd, true);
          ctxScrollView = nv;
          if (ctxScrollView && !ctxScrollView._gwxCtxScrollBound) {
            ctxScrollView._gwxCtxScrollBound = 1; ctxScrollView.addEventListener('scroll', upd, true);
          }
        } catch (e) {}
      }
      try { ed.on('contentDom', hookDoc); } catch (e) {}
      try { W.addEventListener('resize', upd); } catch (e) {}
      try { ed.on('destroy', function () {
        try { W.removeEventListener('resize', upd); } catch (e) {}
        try { if (ctxScrollView) ctxScrollView.removeEventListener('scroll', upd, true); } catch (e) {}
        try { if (ctx && ctx.parentNode) ctx.parentNode.removeChild(ctx); } catch (e) {}
      }); } catch (e) {}
      hookDoc();
    }
    /* ----- 1.1.0: 에디터 대개편 — 표 마우스 조작·Tab 이동·이미지 붙여넣기·단축키·카운터 ----- */
    function enhanceEditor(ed) {
      var EDGE = 5, drag = null, hoverCell = null;
      var chrome0 = document.getElementById('cke_' + ed.name) || qs('.cke_chrome');
      var wrap = chrome0 && qs('.cke_contents', chrome0);
      if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      var ov = null, tip = null, addC = null, addR = null;
      var enhFlags = {};

      function edDoc() { try { return ed.document && ed.document.$; } catch (e) { return null; } }
      function ifr() { return wrap && qs('.cke_wysiwyg_frame', wrap); }
      function toWrap(x, y) {
        var f = ifr(), fr = f ? f.getBoundingClientRect() : { left: 0, top: 0 };
        var wr = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
        return { x: x + fr.left - wr.left, y: y + fr.top - wr.top };
      }
      function ensureOv() {
        if (ov || !wrap) return;
        ov = el('div', 'gwx-tblov'); wrap.appendChild(ov);
        tip = el('div', 'gwx-drag-tip'); ov.appendChild(tip);
        addC = el('button', 'gwx-tbl-add'); addC.type = 'button'; addC.textContent = '+'; addC.title = '오른쪽에 열 추가';
        addR = el('button', 'gwx-tbl-add'); addR.type = 'button'; addR.textContent = '+'; addR.title = '아래에 행 추가';
        ov.appendChild(addC); ov.appendChild(addR);
        [addC, addR].forEach(function (b) {
          b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
        });
        addC.addEventListener('click', function () { if (hoverCell) insCol(hoverCell); });
        addR.addEventListener('click', function () { if (hoverCell) insRow(hoverCell); });
      }
      function hideHandles() {
        if (addC) { addC.style.display = 'none'; addR.style.display = 'none'; }
      }
      function showHandles(cell) {
        ensureOv(); if (!addC) return;
        var t = cell.closest('table'); if (!t) { hideHandles(); return; }
        var tr = t.getBoundingClientRect(), cr = cell.getBoundingClientRect();
        var pr = toWrap(tr.right, cr.top + cr.height / 2);
        addC.style.display = 'flex';
        addC.style.left = (pr.x - 9) + 'px'; addC.style.top = (pr.y - 9) + 'px';
        var pb = toWrap(cr.left + cr.width / 2, tr.bottom);
        addR.style.display = 'flex';
        addR.style.left = (pb.x - 9) + 'px'; addR.style.top = (pb.y - 9) + 'px';
      }
      function colCells(tbl, idx) {
        var out = [];
        [].forEach.call(tbl.rows, function (r) {
          var c = r.cells[Math.min(idx, r.cells.length - 1)];
          if (c) out.push(c);
        });
        return out;
      }
      function insCol(cell) {
        var t = cell.closest('table'); if (!t) return;
        var idx = cell.cellIndex;
        snap(ed, function () {
          [].forEach.call(t.rows, function (r) {
            var ref = r.cells[Math.min(idx, r.cells.length - 1)];
            var nd = ref ? ref.cloneNode(false) : t.ownerDocument.createElement('td');
            nd.removeAttribute('colspan'); nd.removeAttribute('rowspan');
            nd.innerHTML = '&nbsp;';
            if (ref && ref.nextSibling) r.insertBefore(nd, ref.nextSibling);
            else r.appendChild(nd);
          });
        });
        toast('열을 추가했습니다');
      }
      function insRow(cell) {
        var t = cell.closest('table'), row = cell.closest('tr');
        if (!t || !row) return;
        snap(ed, function () {
          var nr = row.cloneNode(true);
          [].forEach.call(nr.cells, function (c) {
            c.innerHTML = '&nbsp;'; c.removeAttribute('rowspan');
          });
          if (row.nextSibling) row.parentNode.insertBefore(nr, row.nextSibling);
          else row.parentNode.appendChild(nr);
        });
        toast('행을 추가했습니다');
      }
      function edgeInfo(e) {
        var c = e.target && e.target.closest ? e.target.closest('td,th') : null;
        if (!c) return null;
        var r = c.getBoundingClientRect();
        var nearR = r.right - e.clientX <= EDGE && e.clientX <= r.right + EDGE;
        var nearB = !nearR && r.bottom - e.clientY <= EDGE && e.clientY <= r.bottom + EDGE;
        if (!nearR && !nearB) return null;
        return { cell: c, col: nearR };
      }
      function onMove(e) {
        if (e._gwx) return; e._gwx = 1;
        var d = edDoc(); if (!d) return;
        if (drag) {
          e.preventDefault();
          var pt = toWrap(e.clientX, e.clientY);
          tip.style.display = 'block';
          tip.style.left = (pt.x + 12) + 'px'; tip.style.top = (pt.y + 12) + 'px';
          if (drag.kind === 'col') {
            var w = Math.max(24, drag.w0 + (e.clientX - drag.x0));
            drag.cells.forEach(function (c) { c.style.width = w + 'px'; });
            drag.tbl.style.tableLayout = 'fixed';
            tip.textContent = w + 'px';
          } else {
            var h = Math.max(18, drag.h0 + (e.clientY - drag.y0));
            drag.tr.style.height = h + 'px';
            tip.textContent = h + 'px';
          }
          return;
        }
        var info = edgeInfo(e);
        d.body.style.cursor = info ? (info.col ? 'col-resize' : 'row-resize') : '';
      }
      function onDown(e) {
        if (e._gwx) return; e._gwx = 1;
        if (e.button !== 0) return;
        var info = edgeInfo(e); if (!info) return;
        e.preventDefault();
        ensureOv();
        var tbl = info.cell.closest('table');
        try { ed.fire('saveSnapshot'); } catch (er) {}
        if (info.col) {
          drag = { kind: 'col', tbl: tbl, cells: colCells(tbl, info.cell.cellIndex),
                   x0: e.clientX, w0: info.cell.getBoundingClientRect().width };
        } else {
          var rw = info.cell.closest('tr');
          drag = { kind: 'row', tbl: tbl, tr: rw, y0: e.clientY,
                   h0: rw.getBoundingClientRect().height };
        }
      }
      function onDbl(e) {
        if (e._gwxD) return; e._gwxD = 1;
        var infoE = edgeInfo(e); if (!infoE || !infoE.col) return;
        e.preventDefault();
        var t = infoE.cell.closest('table');
        snap(ed, function () {
          colCells(t, infoE.cell.cellIndex).forEach(function (c) { c.style.width = ''; });
        });
        toast('열 너비: 내용 자동 맞춤');
      }
      function onUp() {
        if (!drag) return;
        drag = null;
        if (tip) tip.style.display = 'none';
        try { ed.fire('saveSnapshot'); } catch (e) {}
      }
      function onKey(e) {
        if (e._gwx) return; e._gwx = 1;
        if (e.altKey && e.shiftKey && (e.code === 'KeyX' || (e.key || '').toLowerCase() === 'x')) {
          e.preventDefault(); gwxKill(); return;
        }
        if (e.key === 'Tab') { // 셀 이동 / 마지막 셀 = 행 추가
          var d = edDoc(); if (!d) return;
          var sel = d.getSelection && d.getSelection();
          var node = sel && sel.anchorNode;
          var cell = node && (node.nodeType === 1 ? node : node.parentElement);
          cell = cell && cell.closest ? cell.closest('td,th') : null;
          if (!cell) return;
          e.preventDefault();
          var t = cell.closest('table');
          var cells = [].slice.call(t.querySelectorAll('td,th'));
          var i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
          if (i >= cells.length && !e.shiftKey) {
            var lastRow = cell.closest('tr');
            insRow(lastRow.cells[lastRow.cells.length - 1]);
            cells = [].slice.call(t.querySelectorAll('td,th'));
            i = cells.length - lastRow.cells.length;
          }
          if (i < 0) i = 0;
          var target = cells[Math.min(i, cells.length - 1)];
          try {
            var r = d.createRange();
            r.selectNodeContents(target); r.collapse(true);
            var s2 = d.getSelection(); s2.removeAllRanges(); s2.addRange(r);
          } catch (er) {}
          return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          var k = (e.key || '').toLowerCase();
          if (k === 's') {
            e.preventDefault();
            var b = null;
            qsa('.btn_area .btns a').some(function (a2) {
              if ((a2.textContent || '').replace(/\s+/g, '') === '임시저장') { b = a2; return true; }
              return false;
            });
            if (b) { b.click(); toast('임시저장 (Ctrl+S)'); }
          } else if (k === 'enter') {
            e.preventDefault();
            var sb = document.getElementById('menu-send') || qs('.gwx-send');
            if (sb) sb.click();
          } else if (k === 'f') {
            e.preventDefault();
            try { ed.execCommand('find'); } catch (er2) {}
          }
        }
      }
      function onPaste(e) {
        if (e._gwx) return; e._gwx = 1;
        try {
          var cd = e.clipboardData; if (!cd) return;
          if (cd.getData && cd.getData('text/html')) return; // 서식 붙여넣기는 원본 흐름
          var items = cd.items || [];
          for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
              var f = items[i].getAsFile();
              if (!f) continue;
              e.preventDefault(); e.stopPropagation();
              var rd = new FileReader();
              rd.onload = function () {
                snap(ed, function () {
                  ed.insertHtml('<img src="' + rd.result + '" style="max-width:100%">');
                });
                toast('클립보드 이미지를 본문에 삽입했습니다');
              };
              rd.readAsDataURL(f);
              return;
            }
          }
        } catch (er) {}
      }
      function bindDom() {
        var d = edDoc(); if (!d || d._gwxEnh) return;
        d._gwxEnh = 1;
        // 1순위: CKE 자체 이벤트 채널 — 이 스크립트의 드롭 기능에서 이미 검증된 방식
        try {
          // 1.3.3: 표/이미지 포인터 조작은 tableGrips 단일 경로만 사용한다.
          ed.document.on('keydown', function (evt) { try { onKey(evt.data.$); } catch (e) {} });
          ed.document.on('paste', function (evt) { try { onPaste(evt.data.$); } catch (e) {} });
        } catch (e) { log('cke bind', e); }
        // raw 백업(캡처) — 플래그로 1회만 처리
        d.addEventListener('keydown', onKey, true);
        d.addEventListener('paste', onPaste, true);
        info('에디터 키보드·붙여넣기 바인딩 완료');
      }
      try { ed.on('contentDom', bindDom); } catch (e) {}
      bindDom();
    }

    /* 1.3.6: 표/이미지 마우스 조작 이중화
     *  ① 부모 문서 오버레이 그립(가시화·포인터 캡처)  ② 편집 iframe 내부 셀 경계 드래그
     *  1.3.3에서 ②를 제거한 뒤 ①만 남았는데 ①이 투명·7px이라 발견되지 않아
     *  "조절이 안 된다"로 체감되던 문제를 해소한다. */
    // 1.3.9: native pointer events; all handles live outside the editable document.
    function tableGrips(ed) {
      if (ed._gwxDirectResize) return;
      var chrome0 = document.getElementById('cke_' + ed.name) || qs('.cke_chrome');
      var wrap = chrome0 && qs('.cke_contents', chrome0);
      if (!wrap) { GWX_TBL_DIAG.lastFail = '편집영역을 찾지 못함'; return; }
      ed._gwxDirectResize = true;
      var layer = el('div', 'gwx-resize-layer'), box = el('div', 'gwx-resize-outline');
      var bar = el('div', 'gwx-resize-bar'), tip = el('div', 'gwx-resize-tip');
      layer.appendChild(box); layer.appendChild(bar); layer.appendChild(tip);
      document.body.appendChild(layer);
      var selected = null, drag = null, boundDoc = null, dead = false, raf = 0;
      var mo = null, ro = null, io = null, handles = [], cleanups = [], lastPoint = null;
      var toolTarget = null, label = null, detailOpen = false, widthSlider = null, sliderEditing = false;
      function doc() { try { return ed.document && ed.document.$; } catch (e) { return null; } }
      function frame() { return qs('.cke_wysiwyg_frame', wrap); }
      function geometry() {
        var f = frame(), d = doc();
        if (!f || !d || !d.body || (ed.mode && ed.mode !== 'wysiwyg')) return null;
        var r = f.getBoundingClientRect();
        if (!f.getClientRects().length || r.width < 2 || r.height < 2) return null;
        var sx = r.width / (f.offsetWidth || r.width), sy = r.height / (f.offsetHeight || r.height);
        return { x: r.left + f.clientLeft * sx, y: r.top + f.clientTop * sy,
          w: f.clientWidth * sx, h: f.clientHeight * sy, sx: sx, sy: sy };
      }
      function isEditable(n) {
        return n && n.ownerDocument === doc() && n.isConnected && !ed.readOnly &&
          !n.closest('[contenteditable="false"]');
      }
      function targetAt(n) { return n && n.closest ? n.closest('img,table') : null; }
      function point(e) {
        var g = geometry();
        if (!g) return { x: 0, y: 0 };
        var inner = e.target && e.target.ownerDocument === doc();
        return inner ? { x: e.clientX, y: e.clientY } :
          { x: (e.clientX - g.x) / g.sx, y: (e.clientY - g.y) / g.sy };
      }
      function listen(obj, type, fn, opts, list) {
        obj.addEventListener(type, fn, opts);
        (list || cleanups).push(function () { obj.removeEventListener(type, fn, opts); });
      }
      function snapshot() { try { ed.fire('saveSnapshot'); } catch (e) {} }
      function changed() { snapshot(); try { ed.fire('change'); } catch (e) {} schedule(); }
      function hide() { layer.style.display = 'none'; }
      function choose(n) {
        if (!isEditable(n)) n = null;
        if (selected !== n) { selected = n; detailOpen = false; }
        chrome0.classList.toggle('gwx-direct-selected', !!selected && !detailOpen);
        if (!selected) hide();
        schedule();
      }
      function clearHandles() { handles.forEach(function (h) { gwxRemove(h); }); handles = []; }
      function addHandle(kind, x, y, w, h, title, ref, index) {
        var n = el('div', 'gwx-resize-handle ' + kind);
        n.setAttribute('role', 'presentation'); n.title = title;
        if (kind === 'table-width' || kind === 'table-size') {
          var visible = geometry();
          if (visible) { x = Math.max(1, Math.min(x, visible.w - w - 2)); y = Math.max(1, Math.min(y, visible.h - h - 2)); }
        }
        n.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px';
        n.addEventListener('pointerdown', function (e) { start(e, kind, ref, index); });
        n.addEventListener('lostpointercapture', finish);
        layer.appendChild(n); handles.push(n);
      }
      function tool(text, title, action) {
        var b = el('button'); b.type = 'button'; b.textContent = text; b.title = title;
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); });
        b.onclick = function () {
          if (!isEditable(selected)) return;
          snapshot(); action(); changed();
        };
        bar.appendChild(b);
      }
      function toolsFor(n) {
        if (toolTarget === n) return;
        toolTarget = n; bar.textContent = ''; widthSlider = null; sliderEditing = false;
        label = el('span', 'gwx-resize-size'); bar.appendChild(label);
        if (n.tagName === 'TABLE') {
          var sliderLabel = el('label', 'gwx-table-width-slider'); sliderLabel.title = '표 전체 너비';
          var sliderText = el('span'); sliderText.textContent = '너비'; sliderLabel.appendChild(sliderText);
          widthSlider = el('input'); widthSlider.type = 'range'; widthSlider.step = '1';
          widthSlider.setAttribute('aria-label', '표 너비');
          var gm = geometry(), model = tableResizeModel(n);
          widthSlider.min = String(model ? model.cols * GWX_TABLE_MIN : 40);
          widthSlider.max = String(Math.round(Math.max(gm ? gm.w / gm.sx * 1.5 : 1500, n.getBoundingClientRect().width * 1.25)));
          widthSlider.value = String(Math.round(n.getBoundingClientRect().width));
          widthSlider.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          widthSlider.addEventListener('input', function () {
            if (!isEditable(selected) || selected.tagName !== 'TABLE') return;
            if (!sliderEditing) { snapshot(); sliderEditing = true; }
            var current = tableResizeModel(selected);
            tableApplyPx(selected, current ? current.widths : [], +widthSlider.value, true); schedule();
          });
          widthSlider.addEventListener('change', function () { if (sliderEditing) { sliderEditing = false; changed(); } });
          sliderLabel.appendChild(widthSlider); bar.appendChild(sliderLabel);
          tool('본문 폭', '표를 본문 너비에 맞춥니다', function () { tableApplyPercent(selected, 100); });
          tool('열 균등', '표 전체 너비를 유지하면서 열을 균등하게 나눕니다', function () {
            var m = tableResizeModel(selected);
            if (m) tableApplyPx(selected, new Array(m.cols).fill(m.total / m.cols), m.total, true);
            else toast('이 표는 병합 구조가 불규칙해 열 균등을 적용할 수 없습니다');
          });
          tool('자동', '내용에 맞춰 표 너비와 행 높이를 초기화합니다', function () { tableAutoWidth(selected); });
        } else {
          tool('본문 폭', '사진 비율을 유지하면서 본문 너비에 맞춥니다', function () {
            var r = selected.getBoundingClientRect(), g = geometry();
            if (g) imageSize(selected, Math.max(24, g.w / g.sx - 24), r.height / r.width);
          });
          tool('원본', '사진을 원본 비율과 크기로 되돌립니다', function () {
            if (selected.naturalWidth) imageSize(selected, selected.naturalWidth, selected.naturalHeight / selected.naturalWidth);
            else { selected.style.width = ''; selected.style.height = ''; selected.removeAttribute('width'); selected.removeAttribute('height'); }
          });
        }
        var b = el('button'); b.type = 'button'; b.textContent = '상세';
        b.title = '기존 상세 편집 도구 열기 / 닫기';
        b.onmousedown = function (e) { e.preventDefault(); };
        b.onclick = function () {
          detailOpen = !detailOpen;
          chrome0.classList.toggle('gwx-direct-selected', !detailOpen);
          try { ed.fire('selectionChange', { selection: ed.getSelection() }); } catch (e) {}
        };
        bar.appendChild(b);
      }
      function imageSize(im, width, ratio) {
        var w = Math.max(24, Math.round(width)), h = Math.max(1, Math.round(w * ratio));
        im.removeAttribute('width'); im.removeAttribute('height');
        im.style.width = w + 'px'; im.style.height = h + 'px';
        im.style.maxWidth = 'none'; im.style.minWidth = '0';
        return w + ' × ' + h + ' px';
      }
      function layout() {
        raf = 0;
        if (dead) return;
        var g = geometry();
        if (!g || !isEditable(selected)) { hide(); return; }
        var r = selected.getBoundingClientRect(), x = r.left * g.sx, y = r.top * g.sy;
        var w = r.width * g.sx, h = r.height * g.sy;
        if (x > g.w || y > g.h || x + w < 0 || y + h < 0) { hide(); return; }
        layer.style.cssText = 'display:block;left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px;height:' + g.h + 'px';
        box.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px';
        if (drag) {
          if (drag.capture && drag.capture.ownerDocument === document && (drag.kind === 'table-width' || drag.kind === 'table-size')) {
            var cap = drag.capture, cw = drag.kind === 'table-size' ? 14 : 12, ch = cw;
            cap.style.left = Math.max(1, Math.min(x + w - cw / 2, g.w - cw - 2)) + 'px';
            cap.style.top = Math.max(1, Math.min(y + (drag.kind === 'table-size' ? h : h / 2) - ch / 2, g.h - ch - 2)) + 'px';
          }
          return; // Never detach a captured pointer target during a drag.
        }
        toolsFor(selected);
        label.textContent = (selected.tagName === 'TABLE' ? '표 ' : '사진 ') + Math.round(r.width) + ' × ' + Math.round(r.height);
        if (widthSlider && !sliderEditing) widthSlider.value = String(Math.round(r.width));
        bar.style.left = Math.max(3, Math.min(x, g.w - bar.offsetWidth - 4)) + 'px';
        if (selected.tagName === 'TABLE') {
          // A short table at the top of the editor used to be entirely covered by its toolbar.
          var bh = bar.offsetHeight || 34, by = y - bh - 8;
          if (by < 3) by = y + h + 8;
          if (by + bh > g.h - 3) by = Math.max(3, Math.min(y - bh - 8, g.h - bh - 3));
          bar.style.top = by + 'px';
        } else bar.style.top = Math.max(3, Math.min(y - 37, g.h - 34)) + 'px';
        clearHandles();
        if (selected.tagName === 'TABLE') {
          var m = tableResizeModel(selected);
          if (m) {
            var sum = 0;
            m.widths.slice(0, -1).forEach(function (cw, i) {
              sum += cw;
              addHandle('col', x + sum * g.sx - 5, y, 10, h, '드래그: 열 너비', selected, i);
            });
          }
          [].forEach.call(selected.rows, function (row) {
            var rr = row.getBoundingClientRect();
            addHandle('row', x, rr.bottom * g.sy - 5, w, 10, '드래그: 행 높이', row);
          });
          addHandle('table-width', x + w - 6, y + h / 2 - 6, 12, 12, '드래그: 표 전체 너비', selected);
          addHandle('table-size', x + w - 7, y + h - 7, 14, 14, '드래그: 표 전체 크기', selected);
        } else {
          [['nw', x, y], ['ne', x + w, y], ['sw', x, y + h], ['se', x + w, y + h]].forEach(function (a) {
            addHandle('image-' + a[0], a[1] - 6, a[2] - 6, 12, 12, '드래그: 사진 크기 (비율 유지)', selected);
          });
        }
        GWX_TBL_DIAG.grips = handles.length;
      }
      function schedule() { if (!dead && !raf) raf = requestAnimationFrame(layout); }
      function start(e, kind, ref, index) {
        if (e.button !== 0 || drag || !isEditable(ref)) return;
        var target = ref.tagName === 'TR' ? ref.closest('table') : ref;
        choose(target);
        var m = target.tagName === 'TABLE' ? tableResizeModel(target) : null;
        if (kind === 'col' && !m) { toast('이 경계의 열 구조를 확인하지 못했습니다'); return; }
        e.preventDefault(); e.stopImmediatePropagation();
        var r = target.getBoundingClientRect(), p = point(e);
        snapshot();
        drag = { kind: kind, target: target, ref: ref, index: index, model: m, x: p.x, y: p.y,
          w: r.width, h: r.height, ratio: r.height / (r.width || 1),
          rowHeight: ref.getBoundingClientRect().height, pointer: e.pointerId, capture: e.target,
          rows: target.rows ? gwxArray(target.rows, function (row) { return { row: row, h: row.getBoundingClientRect().height }; }) : [] };
        lastPoint = p; GWX_TBL_DIAG.starts++; GWX_TBL_DIAG.lastKind = kind;
        try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
        layer.classList.add('dragging'); bar.style.visibility = 'hidden';
        GWX_TBL_DIAG.lastFail = '';
      }
      function applyMove(p) {
        if (!drag || !isEditable(drag.target)) return;
        var a = drag, dx = p.x - a.x, dy = p.y - a.y, message = '';
        if (a.kind.indexOf('image-') === 0) {
          var dir = a.kind.slice(6), xx = dx * (dir.indexOf('w') > -1 ? -1 : 1);
          var yy = dy * (dir.indexOf('n') > -1 ? -1 : 1) / a.ratio;
          message = imageSize(a.target, a.w + (Math.abs(xx) >= Math.abs(yy) ? xx : yy), a.ratio);
        } else if (a.kind === 'row') {
          tableSetRowHeight(a.ref, a.rowHeight + dy);
          message = '행 ' + Math.round(a.ref.getBoundingClientRect().height) + ' px';
        } else {
          var ws = a.model ? a.model.widths.slice() : null, total = a.w;
          if (a.kind === 'col') {
            var i = a.index, pair = ws[i] + ws[i + 1];
            ws[i] = Math.max(GWX_TABLE_MIN, Math.min(pair - GWX_TABLE_MIN, ws[i] + dx));
            ws[i + 1] = pair - ws[i];
          } else {
            total = Math.max(ws ? ws.length * GWX_TABLE_MIN : 40, a.w + dx);
          }
          tableApplyPx(a.target, ws || [], total, true);
          if (a.kind === 'table-size') {
            var scale = Math.max(16 * a.rows.length, a.h + dy) / (a.h || 1);
            tableReleaseHeight(a.target);
            a.rows.forEach(function (row) { tableSetRowHeight(row.row, row.h * scale, true); });
          }
          var r = a.target.getBoundingClientRect();
          message = '표 ' + Math.round(r.width) + ' × ' + Math.round(r.height) + ' px';
        }
        var g = geometry();
        if (g) {
          tip.textContent = message; tip.style.display = 'block';
          tip.style.left = Math.max(3, Math.min(p.x * g.sx + 14, g.w - 180)) + 'px';
          tip.style.top = Math.max(3, Math.min(p.y * g.sy + 16, g.h - 30)) + 'px';
        }
        schedule();
      }
      var moveRaf = 0;
      function move(e) {
        if (!drag || e.pointerId !== drag.pointer) return;
        GWX_TBL_DIAG.moves++;
        e.preventDefault(); e.stopImmediatePropagation(); lastPoint = point(e);
        if (!moveRaf) moveRaf = requestAnimationFrame(function () { moveRaf = 0; applyMove(lastPoint); });
      }
      function finish(e) {
        if (!drag || (e && e.pointerId != null && e.pointerId !== drag.pointer)) return;
        if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
        if (lastPoint) applyMove(lastPoint);
        var a = drag; drag = null;
        try { a.capture.releasePointerCapture(a.pointer); } catch (err) {}
        layer.classList.remove('dragging'); bar.style.visibility = ''; tip.style.display = 'none';
        changed();
      }
      function innerDown(e) {
        if (drag || e.button !== 0) return;
        var n = targetAt(e.target); choose(n);
        if (!n || n.tagName !== 'TABLE') return;
        var p = point(e), r = n.getBoundingClientRect(), edge = 7;
        if (Math.abs(p.x - r.right) <= edge && Math.abs(p.y - r.bottom) <= edge) { start(e, 'table-size', n); return; }
        if (Math.abs(p.x - r.right) <= edge) { start(e, 'table-width', n); return; }
        var c = e.target.closest('td,th'); if (!c || c.closest('table') !== n) return;
        var cr = c.getBoundingClientRect();
        if (Math.abs(p.x - cr.right) <= edge) {
          var m = tableResizeModel(n), range = m && tableCellRange(c, m);
          if (range && range.start + range.span < m.cols) start(e, 'col', n, range.start + range.span - 1);
        } else if (Math.abs(p.y - cr.bottom) <= edge && c.rowSpan === 1) start(e, 'row', c.parentNode);
      }
      function key(e) {
        if (e.key === 'Escape') { if (drag) finish(); choose(null); }
      }
      var docClean = [];
      function unbindDoc() { docClean.forEach(function (f) { f(); }); docClean = []; if (mo) mo.disconnect(); }
      function bindDoc() {
        unbindDoc(); boundDoc = doc(); choose(null);
        if (!boundDoc || !boundDoc.body) return;
        listen(boundDoc, 'pointerdown', innerDown, true, docClean);
        listen(boundDoc, 'pointermove', move, true, docClean);
        listen(boundDoc, 'pointerup', finish, true, docClean);
        listen(boundDoc, 'pointercancel', finish, true, docClean);
        listen(boundDoc, 'keydown', key, true, docClean);
        listen(boundDoc, 'scroll', schedule, true, docClean);
        listen(boundDoc, 'load', schedule, true, docClean);
        listen(boundDoc, 'dragstart', function (e) { if (drag) e.preventDefault(); }, true, docClean);
        mo = new MutationObserver(schedule);
        mo.observe(boundDoc.body, { childList: true, subtree: true, characterData: true,
          attributes: true, attributeFilter: ['style', 'width', 'height', 'colspan', 'rowspan', 'src'] });
      }
      function teardown() {
        dead = true; drag = null; unbindDoc(); cleanups.forEach(function (f) { f(); });
        if (raf) cancelAnimationFrame(raf); if (moveRaf) cancelAnimationFrame(moveRaf);
        if (ro) ro.disconnect(); if (io) io.disconnect();
        chrome0.classList.remove('gwx-direct-selected'); gwxRemove(layer);
      }
      listen(document, 'pointermove', move, true);
      listen(document, 'pointerup', finish, true);
      listen(document, 'pointercancel', finish, true);
      listen(document, 'keydown', key, true);
      listen(document, 'scroll', schedule, true);
      listen(document, 'visibilitychange', function () { if (document.hidden) finish(); schedule(); });
      listen(window, 'resize', schedule);
      listen(window, 'blur', function () { if (drag) finish(); });
      listen(window, 'pagehide', teardown, { once: true });
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(schedule); ro.observe(wrap); }
      if (typeof IntersectionObserver !== 'undefined') { io = new IntersectionObserver(schedule); io.observe(wrap); }
      ed.on('contentDom', bindDoc);
      ed.on('contentDomUnload', function () { finish(); unbindDoc(); choose(null); });
      ed.on('mode', schedule); ed.on('change', schedule); ed.on('readOnly', schedule); ed.on('destroy', teardown);
      bindDoc(); hide();
      info('표·사진 직접 조절 준비 완료 — 클릭 후 모서리/경계 드래그');
    }
    function mountSuite(ed) {
      try { if (ed.config) ed.config.disableObjectResizing = false; } catch (e) {}
      var chrome = document.getElementById('cke_' + ed.name) || qs('.cke_chrome');
      var top = chrome && qs('.cke_top', chrome);
      if (!top || qs('.gwx-fmtbar', top)) return;
      try { enhanceEditor(ed); } catch (e) { warn('enhance', e); }
      try { tableGrips(ed); } catch (e) { warn('grips', e); }
      var bar = el('div', 'gwx-fmtbar');
      bar.appendChild(mkSel('글꼴', [
        ['', '기본: 맑은 고딕'], ['"Malgun Gothic",sans-serif', '맑은 고딕'], ['Dotum,sans-serif', '돋움'],
        ['Gulim,sans-serif', '굴림'], ['Batang,serif', '바탕'], ['Gungsuh,serif', '궁서'],
        ['Arial,sans-serif', 'Arial'], ['Verdana,sans-serif', 'Verdana'],
        ['"Times New Roman",serif', 'Times'], ['"Courier New",monospace', 'Courier']
      ], function (v) { applySpan(ed, { 'font-family': v }); }));
      bar.appendChild(mkSel('글자 크기', [
        ['', '크기'], ['9', '9'], ['10', '10'], ['11', '11'], ['12', '12'], ['13', '13'],
        ['14', '14'], ['16', '16'], ['18', '18'], ['20', '20'], ['24', '24'], ['28', '28'], ['36', '36']
      ], function (v) { applySpan(ed, { 'font-size': v + 'px' }); }));
      bar.appendChild(el('span', 'gwx-fdiv'));
      bar.appendChild(palBtn(ed, '글자색',
        '<b class="gwx-glyph" style="border-bottom:3px solid #d92f2f;padding-bottom:1px">A</b>', FORE, false));
      bar.appendChild(palBtn(ed, '형광펜(음영)', '<b class="gwx-glyph hl">가</b>', BACK, true));
      bar.appendChild(decoBtn(ed));
      bar.appendChild(el('span', 'gwx-fdiv'));
      bar.appendChild(tblBtn(ed));
      bar.appendChild(snipBtn(ed));
      bar.appendChild(mkBtn('<b class="gwx-glyph">⌫</b> 서식', '선택 영역 서식 지우기', function () {
        try { ed.focus(); ed.execCommand('removeFormat'); } catch (e) {}
      }));
      var advB = mkBtn('고급 ▾', '자간 · 줄간격', null);
      advB.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        popover(advB, function (pop) {
          pop.classList.add('gwx-plist');
          var r1 = el('div', 'row');
          r1.appendChild(document.createTextNode('자간'));
          r1.appendChild(mkSel('자간', [
            ['', '기본'], ['-1px', '-1'], ['-0.5px', '-0.5'], ['normal', '보통'],
            ['0.5px', '+0.5'], ['1px', '+1'], ['2px', '+2']
          ], function (v) { applySpan(ed, { 'letter-spacing': v }); gwxRemove(pop); }));
          var r2 = el('div', 'row');
          r2.appendChild(document.createTextNode('줄간격'));
          r2.appendChild(mkSel('줄 간격', [
            ['', '기본'], ['1', '1.0'], ['1.15', '1.15'], ['1.5', '1.5'], ['1.8', '1.8'], ['2', '2.0']
          ], function (v) { applyBlock(ed, { 'line-height': v }); gwxRemove(pop); }));
          pop.appendChild(r1); pop.appendChild(r2);
        });
      };
      bar.appendChild(advB);
      top.appendChild(bar);
      // 1.3.0: 상시 칩 나열 제거 → 선택 대상 위에 뜨는 미니툴바
      var ctx = el('div', 'gwx-ctxfloat');
      var host = (chrome && qs('.cke_contents', chrome)) || top;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(ctx);
      bindCtx(ed, ctx);
      // F15 보강: 편집영역 안으로의 파일 드롭도 처리 (리스너만 부착 — 본문 DOM/CSS 무주입)
      function wireEdDrop() {
        try {
          var dd0 = ed.document && ed.document.$; if (!dd0 || dd0._gwxDropBound) return;
          dd0._gwxDropBound = 1;
          ed.document.on('dragover', function (evt) {
            try {
              var de = evt.data.$;
              if (de.dataTransfer && [].slice.call(de.dataTransfer.types || []).indexOf('Files') > -1) {
                evt.data.preventDefault();
              }
            } catch (e) {}
          });
          ed.document.on('drop', function (evt) {
            try {
              var de = evt.data.$;
              var fs = [].slice.call((de.dataTransfer && de.dataTransfer.files) || []);
              if (!fs.length) return;
              evt.data.preventDefault();
              var imgs = [], others = [];
              fs.forEach(function (f) {
                if (f.type && f.type.indexOf('image/') === 0 && !de.shiftKey) imgs.push(f);
                else others.push(f);
              });
              if (dropInsertImage) imgs.forEach(dropInsertImage);
              if (others.length && dropAttachFiles) dropAttachFiles(others);
            } catch (e) { warn('ed drop', e); }
          });
        } catch (e) {}
      }
      try { ed.on('contentDom', wireEdDrop); } catch (e) {}
      wireEdDrop();
      log('editor suite mounted:', ed.name);
    }
    function editorSuite() {
      var tries = 0;
      var tm = setInterval(function () {
        var CK = W.CKEDITOR;
        if (CK && CK.instances && Object.keys(CK.instances).length) {
          clearInterval(tm);
          function hook(ed2) {
            if (!ed2) return;
            installComposeFont(ed2);
            if (ed2._gwx || S.get('opt.editorSuite', true) === false) return;
            ed2._gwx = 1;
            if (ed2.status === 'ready') mountSuite(ed2);
            else ed2.on('instanceReady', function () { mountSuite(ed2); });
          }
          Object.keys(CK.instances).forEach(function (k) { hook(CK.instances[k]); });
          try { CK.on('instanceReady', function (ev) { hook(ev.editor); }); } catch (e) {}
        } else if (++tries > 75) { clearInterval(tm); log('CKEDITOR not found'); }
      }, 400);
    }

    /* ----- 부팅 (compose) ----- */
    function fitEditor() {
      try {
        var c = qs('.cke_contents');
        if (!c) return;
        var top = c.getBoundingClientRect().top;
        var h = Math.max(280, (W.innerHeight || 800) - top - 96);
        c.style.height = h + 'px';
      } catch (e) {}
    }
    function shrinkAttach() {
      try {
        qsa('#attr_tr div, #attr_tr tbody').forEach(function (d) {
          if (d.offsetHeight > 150 && !qs('img', d)) {
            d.style.maxHeight = '110px';
            d.style.overflowY = 'auto';
          }
        });
      } catch (e) {}
    }
    onReady(function () {
      addStyle(iconVars);
      addStyle('@media screen{' + iconCls + '}');
      setTimeout(function () { fitEditor(); shrinkAttach(); }, 380);
      setTimeout(fitEditor, 1200);
      try { W.addEventListener('resize', debounce(fitEditor, 180)); } catch (e) {}
      if (embedded) {
        var s = document.getElementById('subject');
        if (s) {
          var sync = debounce(function () {
            try { window.parent.__gwxComposeTitle(EMBED_ID, s.value.trim()); } catch (e) {}
          }, 300);
          s.addEventListener('input', sync);
          setTimeout(sync, 1200); // 답장/전달 프리필 제목 반영
        }
      }
      try { // (3) 명칭 변경
        var h1 = qs('#sending_page .title_area h1') || qs('.title_area h1');
        if (h1 && /편지\s*쓰기/.test(h1.textContent || '')) {
          h1.textContent = h1.textContent.replace(/편지(\s*)쓰기/, '메일$1쓰기');
        }
        if (/편지쓰기/.test(document.title || '')) {
          document.title = document.title.replace(/편지쓰기/g, '메일 쓰기');
        }
      } catch (e) {}
      var sendBtn = document.getElementById('menu-send');
      if (!sendBtn) { // id 불일치 대비 텍스트 매칭
        qsa('.btn_area .btns a').some(function (a) {
          if ((a.textContent || '').replace(/\s+/g, '') === '보내기') { sendBtn = a; return true; }
          return false;
        });
      }
      var confirmedSend = false;
      function showSendPreview(onOk) {
        try {
          qsa('.gwx-preview').forEach(function (x) { gwxRemove(x); });
          var ov = el('div', 'gwx-preview');
          var box = el('div', 'gwx-pv-box');
          var hd = el('div', 'gwx-pv-hd');
          hd.innerHTML = icon('send') + '<b>보내기 전 최종 확인</b>';
          var xb = el('button', 'gwx-btn'); xb.type = 'button'; xb.textContent = '×';
          xb.style.cssText = 'width:30px;padding:0;justify-content:center;margin-left:auto';
          var returnFocus = document.activeElement;
          function dismiss() {
            gwxRemove(ov); document.removeEventListener('keydown', previewKey, true);
            if (returnFocus && returnFocus.isConnected) try { returnFocus.focus({ preventScroll: true }); } catch (e) {}
          }
          function previewKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dismiss(); } }
          xb.setAttribute('aria-label', '최종 확인 닫기'); xb.onclick = dismiss;
          hd.appendChild(xb);
          var meta = el('div', 'gwx-pv-meta');
          function rowm(k, v) {
            var r = el('div', 'r');
            var kk = el('b'); kk.textContent = k;
            var vv = el('span'); vv.textContent = v || '—';
            r.appendChild(kk); r.appendChild(vv); meta.appendChild(r);
          }
          rowm('제목', (document.getElementById('subject') || {}).value || '(제목 없음)');
          var recipients = composeRecipients();
          [['받는이', 'to'], ['참조', 'cc'], ['숨은참조', 'bcc'], ['수신제외', 'exto']].forEach(function (g) {
            var r = recipients[g[1]];
            if (r.text || g[1] === 'to') rowm(g[0] + (r.names.length ? ' (' + r.names.length + ')' : ''), r.text || '지정되지 않음');
            if (r.pending) rowm(g[0] + ' 입력 중', r.pending + ' — 작성 화면에서 이름 칩으로 확정하세요');
          });
          var att = attachmentNames();
          rowm('첨부', att.length ? att.slice(0, 5).join(', ') + (att.length > 5 ? ' 외 ' + (att.length - 5) + '개' : '') : '없음');
          var body = '';
          try { var ed0 = getEd(); body = ed0 && ed0.getData ? String(ed0.getData() || '') : ''; } catch (e) {}
          var fr = el('iframe', 'gwx-pv-body');
          fr.setAttribute('sandbox', '');
          fr.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' +
            'body{margin:10px 12px;font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-size:12px;' +
            'color:#111;background:#fff;word-break:break-word;line-height:1.4}p,div{margin:0;padding:0}img{max-width:100%}' +
            '</style></head><body>' + body + '</body></html>';
          var ft = el('div', 'gwx-pv-ft');
          var edit = el('button', 'gwx-btn'); edit.type = 'button'; edit.textContent = '계속 수정';
          edit.onclick = dismiss;
          var okb = el('button', 'gwx-btn gwx-pv-send'); okb.type = 'button';
          okb.innerHTML = icon('send') + '<span>이대로 보내기</span>';
          okb.onclick = function () { dismiss(); onOk(); };
          if (Object.keys(recipients).some(function (k) { return !!recipients[k].pending; })) {
            okb.disabled = true; okb.title = '입력 중인 수신자를 이름 칩으로 확정한 뒤 다시 확인하세요';
          }
          ft.appendChild(edit); ft.appendChild(okb);
          box.appendChild(hd); box.appendChild(meta); box.appendChild(fr); box.appendChild(ft);
          ov.appendChild(box);
          document.body.appendChild(ov);
          ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '보내기 전 최종 확인');
          document.addEventListener('keydown', previewKey, true);
          edit.focus();
          ov.addEventListener('mousedown', function (e) { if (e.target === ov) dismiss(); });
        } catch (e) { warn('preview', e); toast('미리보기를 열지 못해 발송을 중지했습니다. 내용을 확인하고 다시 시도하세요'); }
      }
      if (sendBtn) {
        sendBtn.classList.add('gwx-send');
        if (S.get('opt.sendPreview', true)) {
          sendBtn.addEventListener('click', function (e) {
            if (confirmedSend) { confirmedSend = false; return; }
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            showSendPreview(function () {
              confirmedSend = true;
              sendBtn.click();
            });
          }, true);
        }
      }
      try { draftAutosave(); } catch (e) { warn('draft', e); }
      try { attachDrop(); } catch (e) { warn('drop', e); }
      try { recipientGroups(); } catch (e) { warn('rcpt', e); }
      info('compose 모듈 준비 완료', embedded ? '(임베드 #' + EMBED_ID + ')' : '(팝업)');
    });
    editorSuite();

    /* ----- 메뉴 커맨드 (compose) ----- */
    hubAction('표 조작 진단', function () {
      try {
        var ed0 = getEd();
        var ch0 = ed0 && (document.getElementById('cke_' + ed0.name) || qs('.cke_chrome'));
        var wr0 = ch0 && qs('.cke_contents', ch0);
        var d0 = null; try { d0 = ed0 && ed0.document && ed0.document.$; } catch (e) {}
        var tb = d0 ? [].slice.call(d0.querySelectorAll('table')) : [];
        var ok = 0; tb.forEach(function (t) { if (tableResizeModel(t)) ok++; });
        var msg = '에디터=' + (ed0 ? ed0.name : '없음') +
          ' / 편집영역=' + (wr0 ? 'OK' : '없음') +
          ' / 그립층=' + (qs('.gwx-resize-layer') ? 'OK' : '없음') +
          ' / 그립=' + GWX_TBL_DIAG.grips + '개' +
          ' / 표=' + tb.length + '개(조절 가능 ' + ok + ')' +
          ' / 버전=' + GWX_VER + ' / 드래그시작=' + GWX_TBL_DIAG.starts + ' / 이동=' + GWX_TBL_DIAG.moves + ' / 조절종류=' + GWX_TBL_DIAG.lastKind +
          ' / 적용횟수=' + GWX_TBL_DIAG.applies +
          ' / 마지막 실패=' + (GWX_TBL_DIAG.lastFail || '없음');
        info('표 조작 진단 —', msg); toast(msg);
      } catch (e) { toast('표 진단 실패: ' + e); }
    });
    try {
      regMenu('GWX: 편집 도구모음 ' + (S.get('opt.editorSuite', true) ? '끄기' : '켜기'), function () {
        S.set('opt.editorSuite', !S.get('opt.editorSuite', true)); location.reload();
      });
      regMenu('GWX: 보내기 전 미리보기 확인 ' + (S.get('opt.sendPreview', true) ? '끄기' : '켜기'), function () {
        S.set('opt.sendPreview', !S.get('opt.sendPreview', true)); location.reload();
      });
      regMenu('GWX: 자동 임시저장 ' + (S.get('opt.autoDraft', true) ? '끄기' : '켜기'), function () {
        S.set('opt.autoDraft', !S.get('opt.autoDraft', true)); location.reload();
      });
      regMenu('GWX: 표 조작 진단 (콘솔·화면 알림)', function () {
        try {
          var ed0 = getEd();
          var ch0 = ed0 && (document.getElementById('cke_' + ed0.name) || qs('.cke_chrome'));
          var wr0 = ch0 && qs('.cke_contents', ch0);
          var d0 = null; try { d0 = ed0 && ed0.document && ed0.document.$; } catch (e) {}
          var tb = d0 ? [].slice.call(d0.querySelectorAll('table')) : [];
          var ok = 0; tb.forEach(function (t) { if (tableResizeModel(t)) ok++; });
          var msg = '에디터=' + (ed0 ? ed0.name : '없음') +
            ' / 편집영역=' + (wr0 ? 'OK' : '없음') +
            ' / 그립층=' + (qs('.gwx-resize-layer') ? 'OK' : '없음') +
            ' / 그립=' + GWX_TBL_DIAG.grips + '개' +
            ' / 표=' + tb.length + '개(조절 가능 ' + ok + ')' +
            ' / 버전=' + GWX_VER + ' / 드래그시작=' + GWX_TBL_DIAG.starts + ' / 이동=' + GWX_TBL_DIAG.moves + ' / 조절종류=' + GWX_TBL_DIAG.lastKind +
          ' / 적용횟수=' + GWX_TBL_DIAG.applies +
            ' / 마지막 실패=' + (GWX_TBL_DIAG.lastFail || '없음');
          info('표 조작 진단 —', msg);
          toast(msg);
        } catch (e) { toast('표 진단 실패: ' + e); }
      });
      regMenu('GWX: 임시저장 데이터 지우기', function () {
        gwxDraftClearAll(); toast('모든 GWX 임시저장 데이터를 지웠습니다');
      });
    } catch (e) {}
  }

  /* =====================================================================
   * 10. GNB / COMZ 모듈
   * ===================================================================== */
  function bootGnb() {
    // 0.9.13: 첫 페인트 전에 상단 GNB 행을 선차단(fld의 onReady를 기다리며 보이던 깜빡임 제거)
    try {
      if (S.get('opt.hideGnb', true)) {
        var pfs = W.parent && W.parent.document ? W.parent.document.querySelectorAll('frameset') : [];
        for (var gi = 0; gi < pfs.length; gi++) {
          var gfr = pfs[gi].querySelector(':scope>frame[src*="menu.jsp"]');
          if (!gfr) continue;
          if (!pfs[gi].getAttribute('data-gwx-rows')) pfs[gi].setAttribute('data-gwx-rows', pfs[gi].rows || '');
          pfs[gi].rows = '0,*';
          break;
        }
      }
    } catch (e) {}
    onReady(function () {
      try {
        var sel = (new URLSearchParams(location.search).get('SelMenu') || '').toLowerCase();
        if (sel) {
          var li = qs('#normal_menu li[class*="menu_' + sel + '"]');
          if (li) li.classList.add('gwx-active');
        }
      } catch (e) {}
      info('gnb 모듈 준비 완료');
    });
  }

  function bootWpop() {
    onReady(function () {
      try { // 팝업 내 '편지함→메일함' 개칭(라벨만, value 속성은 미변경)
        var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
        while ((n = w.nextNode())) {
          var pe = n.parentElement;
          if (pe && /^(SCRIPT|STYLE|TEXTAREA)$/.test(pe.tagName)) continue;
          if (n.textContent.indexOf('편지함') > -1) {
            n.textContent = n.textContent.replace(/편지함/g, '메일함');
          }
        }
      } catch (e) {}
      // 1.3.4: 발송 성공이 확정된 뒤에만 해당 작성 슬롯을 삭제한다.
      var bodyText = String((document.body && document.body.textContent) || '').replace(/\s+/g, ' ').trim();
      var resultText = String(((qs('.svrMsg .info') || qs('.svrMsg .popup') || {}).textContent) || bodyText).replace(/\s+/g, ' ').trim();
      var successPath = /\/wma\/wmasm(?:\.do)?(?:$|[/?#])/i.test(location.pathname + location.search);
      var successDom = !!qs('.svrMsg .info, .svrMsg .popup');
      var successText = gwxCalmMsg(resultText) || /(?:메일|편지).{0,30}(?:발송|전송).{0,30}(?:성공|완료)|(?:발송|전송).{0,30}(?:성공|완료)/.test(resultText);
      var confirmed = successPath && successDom && successText;
      if (confirmed) {
        var dk0 = gwxCurrentDraftKey();
        if (dk0) gwxDraftClearSlot(dk0);
      }
      if (EMBED_ID > 0) {
        if (confirmed) {
          try { W.close = function () { try { window.parent.__gwxComposeClosed(EMBED_ID); } catch (e) {} }; } catch (e) {}
          setTimeout(function () { try { window.parent.__gwxComposeClosed(EMBED_ID); } catch (e) {} }, 500);
          info('발송 성공 결과 확인 — 임시저장 정리·작성 탭 자동 닫기');
        } else warn('임베드 wpop 자동 닫기 보류 — 성공 결과가 확인되지 않음:', location.pathname);
      }
      info('wma 팝업 스킨 적용:', location.pathname);
    });
  }

  /* =====================================================================
   * 10-K. 키맵 — 목록/열람 키보드 조작 (1.3.8, 전 항목 사용자 지정 가능)
   *  저장 키: gwx.keymap = { actionId: "키문자열" }  (빈 문자열 = 해제)
   *  키문자열 형식: [ctrl+][alt+][shift+][meta+]키   예) j / ? / Delete / ctrl+k
   *  ※ 문자 키는 shift가 이미 문자에 반영되므로 shift 접두어를 붙이지 않는다.
   * ===================================================================== */
  var GWX_KEYS = [
    { id: 'next',    l: '다음 메일로 커서 이동', d: 'j' },
    { id: 'prev',    l: '이전 메일로 커서 이동', d: 'k' },
    { id: 'open',    l: '커서 위치 메일 열기',   d: 'Enter' },
    { id: 'back',    l: '목록으로 돌아가기',     d: 'u' },
    { id: 'reply',   l: '답장',                  d: 'r' },
    { id: 'forward', l: '전달',                  d: 'f' },
    { id: 'compose', l: '메일 쓰기',             d: 'c' },
    { id: 'del',     l: '삭제',                  d: 'Delete' },
    { id: 'check',   l: '선택(체크) 토글',       d: 'x' },
    { id: 'search',  l: '검색창 포커스',         d: '/' },
    { id: 'refresh', l: '목록 새로고침',         d: '.' },
    { id: 'help',    l: '단축키 도움말·설정',    d: '?' }
  ];
  function keymapAll() {
    var st = storedJson(gmGet('gwx.keymap', '{}'), {}) || {};
    var out = {};
    GWX_KEYS.forEach(function (k) {
      out[k.id] = (typeof st[k.id] === 'string') ? st[k.id] : k.d;
    });
    return out;
  }
  function keymapSet(id, key) {
    var st = storedJson(gmGet('gwx.keymap', '{}'), {}) || {};
    st[id] = String(key || '');
    gmSet('gwx.keymap', gwxStringify(st));
  }
  function keymapReset() { gmSet('gwx.keymap', '{}'); }
  function keymapDupes(map) {
    var seen = {}, dup = {};
    Object.keys(map).forEach(function (id) {
      var v = map[id]; if (!v) return;
      if (seen[v]) { dup[id] = 1; dup[seen[v]] = 1; } else seen[v] = id;
    });
    return dup;
  }
  function openKeymapPanel() {
    try {
      qsa('.gwx-keypanel').forEach(function (x) { gwxRemove(x); });
      var ov = el('div', 'gwx-keypanel');
      var box = el('div', 'gwx-kp-box');
      var hd = el('div', 'gwx-kp-hd');
      var tt = el('b'); tt.textContent = '단축키 설정';
      var cl = el('button', 'gwx-btn'); cl.type = 'button'; cl.textContent = '닫기';
      cl.style.marginLeft = 'auto'; cl.style.height = '26px'; cl.style.fontSize = '11.5px';
      hd.appendChild(tt); hd.appendChild(cl);
      var bd = el('div', 'gwx-kp-bd');
      var ft = el('div', 'gwx-kp-ft');
      var msg = el('span', 'msg');
      var map = keymapAll(), capturing = null, btns = {};
      function paint() {
        var dup = keymapDupes(map), nd = 0;
        GWX_KEYS.forEach(function (k) {
          var b = btns[k.id];
          if (!b) return;
          if (capturing && capturing.id === k.id) return;
          b.textContent = map[k.id] || '(해제)';
          b.classList.remove('cap');
          b.classList.toggle('dup', !!dup[k.id]);
          if (dup[k.id]) nd++;
        });
        msg.textContent = nd
          ? '⚠ 중복된 키가 ' + nd + '개 있습니다 — 먼저 누른 항목이 우선합니다'
          : '키 칸을 클릭한 뒤 원하는 키를 누르세요 (Esc 취소 · Backspace 해제)';
        msg.style.color = nd ? 'var(--gwx-danger)' : 'var(--gwx-t3)';
      }
      GWX_KEYS.forEach(function (k) {
        var row = el('div', 'gwx-kp-row');
        var lb = el('span', 'lb'); lb.textContent = k.l;
        var b = el('button', 'gwx-kp-key'); b.type = 'button';
        b.title = '클릭 후 키 입력 (기본값: ' + k.d + ')';
        b.onclick = function () {
          if (capturing && btns[capturing.id]) btns[capturing.id].classList.remove('cap');
          capturing = { id: k.id };
          b.classList.add('cap'); b.textContent = '키 입력…';
        };
        var rs = el('button', 'gwx-kp-rs'); rs.type = 'button'; rs.textContent = '기본값';
        rs.onclick = function () {
          capturing = null; map[k.id] = k.d; keymapSet(k.id, k.d); paint();
        };
        btns[k.id] = b;
        row.appendChild(lb); row.appendChild(b); row.appendChild(rs);
        bd.appendChild(row);
      });
      function onKey(e) {
        if (!document.body || !document.body.contains(ov)) {
          document.removeEventListener('keydown', onKey, true); return;
        }
        if (!capturing) {
          if (e.key === 'Escape') { e.preventDefault(); close(); }
          return;
        }
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { capturing = null; paint(); return; }
        if (e.key === 'Backspace') {
          map[capturing.id] = ''; keymapSet(capturing.id, ''); capturing = null; paint(); return;
        }
        var ks = keyString(e);
        if (!ks) return;   // 수정자 단독 입력은 무시
        map[capturing.id] = ks; keymapSet(capturing.id, ks); capturing = null; paint();
      }
      var allRs = el('button', 'gwx-btn'); allRs.type = 'button'; allRs.textContent = '전체 기본값';
      allRs.onclick = function () {
        keymapReset(); map = keymapAll(); capturing = null; paint();
      };
      function close() {
        try { document.removeEventListener('keydown', onKey, true); } catch (e) {}
        gwxRemove(ov);
      }
      cl.onclick = close;
      ft.appendChild(msg); ft.appendChild(allRs);
      box.appendChild(hd); box.appendChild(bd); box.appendChild(ft);
      ov.appendChild(box);
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
      (document.body || document.documentElement).appendChild(ov);
      document.addEventListener('keydown', onKey, true);
      paint();
    } catch (e) { warn('keymap panel', e); }
  }

  /* ---------- 10-H. 설정 허브(우하단 미세 점) ---------- */
  /* 설정 허브 추가 동작 — 각 라우트 모듈이 등록한다.
   *  TM 메뉴를 숨겨도 고유 기능(키워드·탭 정리·표 진단 등)에 접근할 수 있게 하는 통로. */
  var GWX_HUB_ACTIONS = [];
  function hubAction(label, fn) {
    try { GWX_HUB_ACTIONS.push({ l: String(label), f: fn }); } catch (e) {}
  }
  var HUB_DEFS = [
    { t: '테마', k: 'theme', d: 'auto', o: [['light', '라이트'], ['dark', '다크'], ['auto', '자동']] },
    { t: '라이트 컬러', k: 'opt.accent', d: 'teal', o: [['teal', 'Sea Glass'], ['blue', 'Ocean Blue'], ['indigo', 'Indigo']] },
    { t: '목록 밀도', k: 'opt.dense', d: true, o: [[true, '컴팩트'], [false, '보통']] },
    { t: '폴더 개수 표시', k: 'opt.titleCount', d: true, o: [[true, '표시'], [false, '숨김']] },
    { t: '프로필 사진', k: 'opt.avatar', d: false, o: [[true, '표시'], [false, '숨김']] },
    { t: '상단 메뉴(GNB)', k: 'opt.hideGnb', d: true, o: [[true, '숨김'], [false, '표시']] },
    { t: '사이드 퀵필터', k: 'opt.quickRow', d: true, o: [[true, '표시'], [false, '숨김']] },
    { t: '(구)메일함', k: 'opt.oldMail', d: false, o: [[true, '표시'], [false, '숨김']] },
    { t: '탭 열람', k: 'opt.tabs', d: true, o: [[true, '켬'], [false, '끔']] },
    { t: '인라인 편지쓰기', k: 'opt.inlineCompose', d: true, o: [[true, '켬'], [false, '끔']] },
    { t: '보내기 전 미리보기', k: 'opt.sendPreview', d: true, o: [[true, '켬'], [false, '끔']] },
    { t: '자동 임시저장', k: 'opt.autoDraft', d: true, o: [[true, '켬'], [false, '끔']] },
    { t: '본문 소프트 톤', k: 'opt.softBody', d: false, o: [[true, '켬'], [false, '끔']] },
    { t: '본문 글꼴 통일', k: 'opt.unifyBodyFont', d: false, o: [[true, '켬'], [false, '끔']] },
    { t: '다크 본문 강제 보정', k: 'opt.darkBodyBoost', d: false, o: [[true, '켬'], [false, '원문 보존']] },
    { t: '목록 수신·참조 자동 표시', k: 'opt.roleAuto', d: true, o: [[true, '켬'], [false, '끔']] },
    { t: '키보드 조작', k: 'opt.keyboard', d: true, o: [[true, '켬'], [false, '끔']] },
    { t: '에디터 고급 기능', k: 'opt.editorSuite', d: true, o: [[true, '켬'], [false, '끔']] },
    { t: '다크 폴더트리 아이콘 반전', k: 'opt.darkTreeFilter', d: false, o: [[true, '켬'], [false, '끔']] },
    { t: 'TM 메뉴 표시', k: 'opt.tmMenu', d: false, o: [[true, '표시'], [false, '숨김']] },
    { t: '디버그 로그', k: 'debug', d: false, o: [[true, '켬'], [false, '끔']] }
  ];
  function mountHub() {
    if (document.getElementById('gwx-dot')) return;
    var dot = el('div'); dot.id = 'gwx-dot';
    var panel = null;
    function close() { if (panel) { gwxRemove(panel); panel = null; } }
    function open() {
      if (panel) { close(); return; }
      panel = el('div', 'gwx-hub');
      var hd = el('div', 'gwx-hub-hd');
      hd.innerHTML = '<b>GWX 설정</b><span>v' + GWX_VER + '</span>';
      panel.appendChild(hd);
      var body = el('div', 'gwx-hub-bd');
      HUB_DEFS.forEach(function (d) {
        var row = el('div', 'gwx-hub-row');
        var lb = el('span', 'lb'); lb.textContent = d.t;
        var seg = el('div', 'seg');
        var cur = S.get(d.k, d.d);
        d.o.forEach(function (o) {
          var b = el('button', 'sg' + (String(cur) === String(o[0]) ? ' on' : ''));
          b.type = 'button'; b.textContent = o[1];
          b.onclick = function () { S.set(d.k, o[0]); location.reload(); };
          seg.appendChild(b);
        });
        row.appendChild(lb); row.appendChild(seg);
        body.appendChild(row);
      });
      panel.appendChild(body);
      var ft = el('div', 'gwx-hub-ft');
      var off = el('button', 'gwx-btn'); off.type = 'button';
      off.textContent = 'GWX 끄기 (Alt+Shift+X)';
      off.onclick = function () { gwxKill(); };
      var rst = el('button', 'gwx-btn'); rst.type = 'button'; rst.textContent = '모듈 전부 켜기';
      rst.onclick = function () {
        ['mail', 'compose', 'gnb', 'comz', 'wpop'].forEach(function (r) {
          gmSet('gwx.module.' + r, true);
        });
        gmSet('gwx.enabled', true); location.reload();
      };
      var clr = el('button', 'gwx-btn'); clr.type = 'button'; clr.textContent = '캐시·임시저장 지우기';
      clr.onclick = function () {
        gwxDraftClearAll(); gmSet('gwx.roleCache', '{}');
        (gmList() || []).filter(function (k) { return k.indexOf('gwx.roleCache.v139.') === 0 || k.indexOf('gwx.roleSearch.v1315.') === 0; }).forEach(gmDelete);
        S.set('unread.snap', null);
        toast('캐시를 지웠습니다');
      };
      var kb = el('button', 'gwx-btn'); kb.type = 'button'; kb.textContent = '단축키 설정';
      kb.onclick = function () { close(); openKeymapPanel(); };
      var stb = el('button', 'gwx-btn'); stb.type = 'button'; stb.textContent = '자체 점검';
      stb.onclick = function () {
        var r = gwxSelfTest();
        toast(r.head + (r.fail ? ' — 콘솔에서 상세 확인' : ''));
      };
      var pb = el('button', 'gwx-btn'); pb.type = 'button'; pb.textContent = '셀렉터 점검';
      pb.onclick = function () {
        var r = probeReport();
        toast(r.bad.length
          ? '탐지 실패 ' + r.bad.length + '건: ' + r.bad.slice(0, 3).join(', ') + ' — 콘솔 확인'
          : '결합 지점 ' + r.rows.length + '개 모두 정상 · CSS 통합 시트 ' +
            GWX_CSS_INFO.sheets + '개(' + GWX_CSS_INFO.bytes + 'B)');
      };
      var gc = el('button', 'gwx-btn'); gc.type = 'button'; gc.textContent = '임시저장 정리';
      gc.title = '만료(48시간)·손상된 자동저장 슬롯만 삭제합니다';
      gc.onclick = function () {
        var r = gwxDraftGC();
        toast('임시저장 정리 — 유지 ' + r.kept + '건 / 삭제 ' + r.removed + '건');
      };
      ft.appendChild(kb); ft.appendChild(stb); ft.appendChild(pb); ft.appendChild(gc);
      GWX_HUB_ACTIONS.forEach(function (a) {
        var b = el('button', 'gwx-btn'); b.type = 'button'; b.textContent = a.l;
        b.onclick = function () { try { a.f(); } catch (e) { warn('hub action', e); } };
        ft.appendChild(b);
      });
      ft.appendChild(off); ft.appendChild(rst); ft.appendChild(clr);
      panel.appendChild(ft);
      document.body.appendChild(panel);
      setTimeout(function () {
        document.addEventListener('mousedown', function h(e) {
          if (!panel) { document.removeEventListener('mousedown', h, true); return; }
          if (panel.contains(e.target) || e.target === dot) return;
          close(); document.removeEventListener('mousedown', h, true);
        }, true);
      }, 0);
    }
    dot.onclick = open;
    document.body.appendChild(dot);
  }

  /* ---------- 11. 공통 메뉴 & 부팅 스위치 ---------- */
  try {
    regMenu('GWX: 라이트 포인트 컬러 — 현재 ' +
      ({ teal: 'Sea Glass(청록)', blue: 'Ocean Blue(파랑)', indigo: 'Indigo(남색)' }[S.get('opt.accent', 'teal')] || 'Sea Glass') +
      ' (전환·새로고침)', function () {
      var seq = ['teal', 'blue', 'indigo'];
      var cur = S.get('opt.accent', 'teal');
      S.set('opt.accent', seq[(seq.indexOf(cur) + 1) % seq.length]);
      location.reload();
    });
    regMenu('GWX: 테마 — 라이트(Sea Glass)', function () { gmSet('gwx.theme', 'light'); applyTheme(); });
    regMenu('GWX: 테마 — 다크(Ember)', function () { gmSet('gwx.theme', 'dark'); applyTheme(); });
    regMenu('GWX: 테마 — 자동(OS 연동)', function () { gmSet('gwx.theme', 'auto'); applyTheme(); });
    regMenu('GWX: 다크 폴더트리 아이콘 반전 ' + (S.get('opt.darkTreeFilter', false) ? '끄기' : '켜기'), function () {
      S.set('opt.darkTreeFilter', !S.get('opt.darkTreeFilter', false)); applyTheme();
    });
    regMenu('GWX: 전체 ' + (gmGet('gwx.enabled', true) ? '끄기' : '켜기') + ' (새로고침)', function () {
      gmSet('gwx.enabled', !gmGet('gwx.enabled', true)); location.reload();
    });
    regMenu('GWX: 모듈 상태 초기화 — 전부 켜기 (새로고침)', function () {
      ['mail', 'compose', 'gnb', 'comz', 'wpop'].forEach(function (r) {
        gmSet('gwx.module.' + r, true);
      });
      gmSet('gwx.enabled', true); location.reload();
    });
    regMenu('GWX: 단축키 설정 열기', function () { openKeymapPanel(); });
    regMenu('GWX: 키보드 조작 ' + (S.get('opt.keyboard', true) ? '끄기' : '켜기'), function () {
      S.set('opt.keyboard', !S.get('opt.keyboard', true));
      toast('키보드 조작: ' + (S.get('opt.keyboard', true) ? 'ON' : 'OFF'));
    });
    regMenu('GWX: 자체 점검(단위 테스트) 실행', function () {
      var r = gwxSelfTest();
      toast(r.head + (r.fail ? ' — 콘솔에서 상세 확인' : ''));
    });
    regMenu('GWX: 셀렉터 점검(결합 지점 진단)', function () {
      var r = probeReport();
      toast(r.bad.length ? '탐지 실패 ' + r.bad.length + '건 — 콘솔 확인'
                         : '결합 지점 ' + r.rows.length + '개 모두 정상');
    });
    regMenu('GWX: 임시저장 슬롯 정리(만료·손상)', function () {
      var r = gwxDraftGC();
      toast('임시저장 정리 — 유지 ' + r.kept + '건 / 삭제 ' + r.removed + '건');
    });
    regMenu('GWX: 디버그 로그 ' + (S.get('debug', false) ? '끄기' : '켜기'), function () {
      S.set('debug', !S.get('debug', false));
    });
  } catch (e) {}

  /* ----- 1.2.0: 전역 킬스위치 (Alt+Shift+X) ----- */
  function gwxKill() {
    try { gmSet('gwx.enabled', false); } catch (e) {}
    gwxDeactivatePersistentHooks();
    try { console.info('[GWX] Alt+Shift+X — 전체 비활성화. 같은 화면에서 Alt+Shift+X를 다시 누르면 즉시 복구됩니다'); } catch (e) {}
    try { (W.top || W).location.reload(); } catch (e) { try { location.reload(); } catch (e2) {} }
  }
  try {
    document.addEventListener('keydown', function (e) {
      if (e.altKey && e.shiftKey && (e.code === 'KeyX' || (e.key || '').toLowerCase() === 'x')) {
        e.preventDefault(); e.stopPropagation();
        gwxKill();
      }
    }, true);
  } catch (e) {}

  try { // 설정 허브: 메일·독립 작성창
    // TM 메뉴를 숨기므로, 임베드 작성 탭에서도 허브로 설정·진단에 접근할 수 있어야 한다.
    if (route === 'mail' || route === 'compose') {
      onReady(function () { try { mountHub(); } catch (e) { warn('hub', e); } });
    }
  } catch (e) {}

  if (route === 'mail') bootMail();
  else if (route === 'compose') bootCompose();
  else if (route === 'gnb') bootGnb();
  else if (route === 'comz') onReady(function () { info('comz 모듈 준비 완료'); });
  else if (route === 'wpop') bootWpop();

  } catch (gwxFatal) {
    try { console.error('[GWX] 치명적 부팅 오류 — 스킨 미적용, 원본 페이지는 정상 동작:', gwxFatal); } catch (e) {}
    try {
      var fatalDot = function () {
        if (!document.body || document.getElementById('gwx-dot')) return;
        var b0 = document.createElement('div'); b0.id = 'gwx-dot';
        b0.title = 'GWX 부팅 오류 — 클릭해 다시 로드';
        b0.style.cssText = 'position:fixed;right:5px;bottom:5px;width:11px;height:11px;border-radius:50%;background:#8a8a8a;opacity:.25;z-index:2147483000;cursor:pointer';
        b0.onclick = function () { location.reload(); }; document.body.appendChild(b0);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fatalDot, { once: true });
      else fatalDot();
    } catch (e3) {}
  }
})();