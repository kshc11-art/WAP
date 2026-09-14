// ==UserScript==
// @name         KRISS 입력 Helper
// @namespace    https://krisstar.kriss.re.kr/
// @version      1.11.1
// @description  KRISS 입력 Helper 1.11.1: 주소록 수신자 확정·리마인더 문구 편집·전달 오류 확인. 선행조사 상세·기관별 소유지분·기존 요청 단건 확인. 문구 대상·업무 분류, Enter 삽입, 등록·수정·삭제·되돌리기. Alt+7.
// @match        *://krisstar.kriss.re.kr/*
// @match        *://*.kriss.re.kr/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/* v1.11.0 (2026-09-08): 선행조사 사전조회 대기·재시도, 비용분담과 소유지분 분리, 특정 외부기관 과반 예외. */

/*
 * v1.10.0 (2026-09-08) — 문구함 개선
 * Enter 삽입 / Shift+Enter 줄바꿈 / Ctrl+Enter 전체 교체. 이름·전달 대상·업무 분류로 등록·수정.
 * 내 문구 안정 ID와 기존 데이터 백업, 삭제 되돌리기, 기본·서버 문구 숨김·복원.
 * 한국어 조합 보호, 삽입 대상·선택범위 보존, 기본 문구 감사말, 늦은 조회 응답 포커스 보호.
 */

/*
 * v1.9.1 (2026-09-08) — 결재완료 04만 선행조사 생성 대상, 대시보드와 공통 판정.
 * 클릭은 제출시도, 서버 재조회로 상태 확인. 사번 확정 후 입력·기존 결재행 보호.
 * 세금계산서 문구 화면 범위 제한, 사용자 편집 존중, 전역 window.open 패치 제거.
 */

/*
 * v1.8.11 (2026-09-04) — 초기화 순서 안정화 (patch, 1.8.10 -> 1.8.11)
 *  [원인확정] Tampermonkey가 document-start 스크립트를 늦게 주입해 document.readyState가 이미
 *    interactive/complete인 경우, 파일 중간의 detectAndInit()가 즉시 실행되어 뒤쪽에서 할당되는
 *    EXP_CFG / REF_CFG / RF가 아직 undefined인 상태로 참조될 수 있었다.
 *  [수정] 페이지 감지 부팅 블록을 파일 맨 아래로 이동하고 1회 실행 가드를 추가.
 *    모든 설정 객체와 함수 정의가 완료된 뒤 detectAndInit()를 호출하므로 AUTO_TAX_PHRASE /
 *    TARGETS / open 관련 TypeError와 setInterval 반복 오류를 방지한다.
 *  [무변경] 문구 모달 · 세금계산서 자동문구 · 검토자 자동채움 · 선행조사 기능 로직.
 */

/*
 * v1.8.10 (2026-08-19) — 문구 수정 동작 안정화 · 내 문구 저장 (patch, 1.8.9 -> 1.8.10)
 *  [수정1·편집 간섭 제거] 편집창에 쓴 내용이 흔들리던 원인 세 가지를 차단.
 *    · 목록 위 마우스 이동만으로 선택이 바뀌며 편집창이 다시 그려지던 동작(hover 선택)을 폐지.
 *      선택은 클릭 또는 ↑↓ 로만 바뀐다.
 *    · 첫 호출 시 서버 문구함 응답이 늦게 도착하면 목록을 다시 그리며 검색창으로 포커스를
 *      되가져가 편집 중 커서가 튀던 문제 → 편집 중이면 다시 그리지도, 포커스를 옮기지도 않는다.
 *    · 같은 항목을 다시 그릴 때 편집창 내용을 통째로 덮어쓰던 동작 → 편집 중에는 유지한다.
 *  [수정2·삽입 경로 단일화] 삽입 시 항상 편집창의 현재 내용을 그대로 넣는다(항목 원문 비교 제거).
 *    [삽입]·[전체 교체] 버튼을 편집창 바로 아래로 옮겨 눈에 띄게 하고, 수정 시 '수정됨' 표시.
 *  [추가·내 문구] 고친 문구를 그대로 보관할 수 있다.
 *    · 편집 후 [내 문구로 저장] → 이름 입력 → 목록 맨 위 '내 문구' 그룹에 추가(브라우저 저장).
 *    · 내 문구 선택 시 [삭제] 활성. 저장 위치는 localStorage 'kriss.ref.mine.v1'.
 *    · 서버 문구함·내장 문구는 변경하지 않는다(읽기 전용 유지).
 *  [무변경] Alt+7 호출 · 추천 채점 · 세금계산서 자동 문구 · 선행조사 미제출 원장.
 */

/*
 * v1.8.9 (2026-08-19) — HOTFIX: 비용청구서 검토자 자동 채움 회귀 복구 (patch, 1.8.8 -> 1.8.9)
 *  [회귀·원인] v1.8.6에서 세금계산서 문구용 분기를 라우터 앞쪽에 넣으면서 `return` 을 붙였다.
 *    · 조건이 `href에 B_RES00015` 또는 `#plfDlivMatt 존재` 였기 때문에, 해당 요소가 있는
 *      비용청구서 계열 화면에서 라우터가 여기서 끊겨 뒤쪽의 '비용청구서 페이지' 분기가
 *      실행되지 않았다. 그 결과 initExpPage() 안의 검토자 자동 채움(tryAutoFillReviewer)과
 *      리마인더 버튼이 함께 사라졌다.
 *  [수정] 세금계산서 문구 처리를 라우터 분기에서 빼고, 문구 모듈과 같은 '공통 실행'으로 옮긴다.
 *    · initExpCnfPage() 는 자체 진입 가드(B_RES00015 또는 #plfDlivMatt 존재)로 대상 화면에서만
 *      동작하고, 다른 화면에서는 즉시 반환한다. 라우터 분기·return 은 제거.
 *    · 이에 따라 비용청구서 화면에서 검토자 자동 채움 · 리마인더 · 세금계산서 문구가 함께 동작한다.
 *  [무변경] Alt+7 문구 호출 · 모달 수정 후 삽입 · 선행조사 미제출 원장 · 업무요청 버튼 설정.
 */

/*
 * v1.8.8 (2026-08-19) — 문구 호출을 Alt+7 단축키로 · 수정 후 삽입 동선 정리 · 자동문구 보정 (patch, 1.8.7 -> 1.8.8)
 *  [수정1·자동문구 미동작] 비용청구서 세금계산서 문구가 들어가지 않던 문제 보정.
 *    · 원인① 단계 조건이 statusCode='ST0301' 완전일치여서, 관리자 권한으로 목록(S_PMS_03015020)
 *      에서 연 경우처럼 단계코드가 다른 진입 경로에서는 삽입이 통째로 생략됐다.
 *      → 단계 조건을 기본 해제(EXP_CFG.REQUIRE_STATUS='')하고, '전달사항 칸이 보이고 입력 가능할 것'
 *        만을 조건으로 삼는다(해당 칸은 특허사무소 신청상태 02·03에서만 노출됨).
 *    · 원인② getBasInfo(AJAX)가 뒤늦게 응답하면 우리가 넣은 값을 val()로 덮어썼다.
 *      → 삽입 후 1.5초·4초 시점에 문구 잔존을 확인해 사라졌으면 1회 재삽입한다.
 *    · 진단 로그 추가: processCode·statusCode·노출 여부를 콘솔에 남겨 원인 확인이 가능하다.
 *    · 대기 시간 16초 → 32초(RETRY 40→80)로 연장.
 *  [수정2·문구 수정 동선] 목록을 클릭하면 곧바로 삽입되어 수정할 틈이 없던 문제 해소.
 *    · 클릭 = 선택(오른쪽 편집창에 내용 표시 + 포커스 이동), 더블클릭 = 즉시 삽입.
 *    · 하단에 [삽입]·[전체 교체] 버튼 추가. 검색창에서 Enter/Ctrl+Enter 는 기존과 동일.
 *    · 편집 중 마우스가 목록 위를 지나가면 선택이 바뀌어 편집창이 갱신되던 간섭도 차단.
 *  [수정3·버튼 제거 + 단축키] 입력칸 옆 '문구' 버튼을 없애고 Alt+7 로 호출한다.
 *    · 커서가 있는 입력칸(입력 가능한 textarea·input이면 대상 제한 없음)에서 Alt+7 → 문구 모달.
 *    · 기존 Alt+Q 도 유지. 대상 칸에는 마우스 툴팁으로 'Alt+7' 안내를 남긴다.
 *    · REF_CFG.SHOW_BUTTON=true 로 되돌리면 버튼 주입이 복구된다.
 *  [무변경] 선행조사 미제출 원장 · 추천 채점 · 자리표시자(F8) 동작.
 */

/*
 * v1.8.7 (2026-08-19) — 지재권담당자의견 문구 버튼 복구 · 업무요청 주입 버튼 정리 (patch, 1.8.6 -> 1.8.7)
 *  [수정1·문구 버튼 누락] 지재권담당자의견(#reptCntnt)에 Helper 문구 버튼이 붙지 않던 문제 해소.
 *    · 원인: SKIP_NATIVE 설정으로 화면 기본 [문구선택](#btnGetRefNm)이 있으면 주입을 건너뛰었다.
 *      기본 버튼은 서버 문구함 팝업(1200x800)만 열고 추천·검색·수정이 없어 대체가 되지 않았다.
 *    · 조치: SKIP_NATIVE 를 비우고, 기본 버튼과 나란히 Helper 문구 버튼을 함께 주입한다.
 *      두 버튼은 독립적으로 동작하며 화면 기본 동작은 그대로 유지된다.
 *  [수정2·주입 버튼 정리] 업무요청 화면 상단의 [발명자→담당자]·[메일발송] 버튼을 기본 비표시로 전환.
 *    · ETC_BTN_CFG 로 개별 제어(기본 false). 담당자 자동 채움(tryAutoFillCmpl)과 배지 표시는
 *      그대로 동작하므로 실사용에 영향이 없다. [날인신청]·[리마인더]는 유지.
 *    · 코드는 남겨 두었으므로 필요 시 ETC_BTN_CFG 값을 true 로 바꾸면 즉시 복구된다.
 *  [무변경] 선행조사 미제출 원장 · 비용청구서 자동 문구 · 추천/편집 모달 동작.
 */

/*
 * v1.8.6 (2026-08-19) — 선행조사 미제출 추적 · 문구 모듈 재정비 · 비용청구서 자동 문구 (patch, 1.8.5 -> 1.8.6)
 *  [추가1·선행조사 미제출 추적] '의뢰 클릭 = 조사 완료'로 오인되던 문제를 Helper에서 해소.
 *    · 선행조사 요청 팝업(S_PMS_03011010) 진입 시 결재상태(#apvStat)를 읽어 미제출(빈값·00)이면
 *      localStorage 원장 'kriss.pps.draft.v1' 에 draft 로 기록하고 화면 상단에 미제출 경고를 띄운다.
 *    · 팝업의 제출·의뢰·승인 계열 버튼 클릭 시 submitted, 임시저장 계열은 draft 로 갱신.
 *      ⚠️ 버튼 라벨 문자열 기반 판정(추정) — 라벨이 바뀌면 갱신이 누락될 수 있음.
 *    · 원장은 같은 오리진의 다른 스크립트(대시보드 등)가 localStorage 또는
 *      window.KrissPpsDraft.list() 로 읽을 수 있다. 90일(제출건 3일) 경과분 자동 정리.
 *    · 서버 쓰기 없음(조회·기록 전용). 팝업 자체 상태를 근거로 하므로 목록 API의
 *      임시저장 반환 여부와 무관하게 판정된다.
 *  [수정1·문구 버튼 위치] 입력 가능한 칸에만 주입. 실제로 편집 가능한 textarea/input 이고
 *    disabled·readonly 가 아니며 화면에 보이는 경우로 한정. 읽기 전용 표시란(요청내용 span 등)에는
 *    더 이상 붙지 않는다. 대상: 지재권담당자의견 · 특허사무소 전달사항(업무요청·비용청구서) ·
 *    주발명자 회신 · 반려 사유. (rqstCntnt 제거, plfDlivMatt·cnfOpi 추가)
 *  [수정2·문구 직접 수정] 모달 오른쪽 미리보기를 편집 가능한 입력창으로 교체.
 *    선택한 문구를 그 자리에서 고쳐 삽입 가능(Ctrl+Enter 삽입 · Tab 편집창 이동 · Esc 목록 복귀).
 *    편집 내용은 모달이 열려 있는 동안 항목별로 유지된다.
 *  [수정3·추천 강화] 분류(rqstTpeNm)·제목·요청내용을 가중 채점(분류 45 / 제목 30 / 본문 18,
 *    역할 일치 40)하고, 기본 화면은 '추천 + 해당 칸 역할 문구'만 표시한다.
 *    전체 목록은 하단 [전체 보기] 또는 검색어 입력으로 확장. 업무 유형 문구 14건 추가
 *    (1·2차 OA, 해외 OA 검토보고서, 번역문, PCT 국내단계, 우선권, 정보제공·이의신청,
 *     등록료, 연차료, 서열·도면 보완, 사무소 지시 문구 등).
 *  [추가2·비용청구서 자동 문구] B_RES00015 담당자확인 단계(statusCode ST0301)에서
 *    특허사무소 전달사항(#plfDlivMatt)이 편집 가능하면 세금계산서 발행 요청 문구를 맨 끝에 자동 추가.
 *    이미 같은 문구가 있으면 넣지 않으며, 삽입 후 자유롭게 수정 가능(입력칸 채움만, 저장·제출 없음).
 *    문구함에도 '세금계산서 발행 요청(비용청구서)'으로 등록되어 수동 재삽입 가능.
 *  [실측 반영] B_RES00015 단계코드 — ST0101 신청자(주발명자) / ST0301 담당자확인(최종·전달사항 필수).
 *    화면 소스에서 확인(rqstValidation·getStatusMsg 분기).
 *  [안전] 저장·제출·승인 버튼은 여전히 일절 건드리지 않음. 조회 및 입력칸 채움 전용.
 */

/* 1.11.1
 * 수신자: 실제 searchaddress 결과의 내부 ID와 USER 유형으로 insertItem을 호출하고
 * list.recipients, list.text[TO], hwto, 이름 칩의 일치를 확인한다. 이메일을 사번으로 생성하지 않는다.
 * 이름/사번 자동 일치 또는 사용자의 후보 선택 후 등록. 조회 중 사용자 입력은 유지한다.
 * 제목/본문은 업무별 문구 편집·저장·미리보기에서 구성하며 기본 업무 문구는 유지한다.
 * 메일별 전용 전달 ID·분할 쿠키·크기/읽기 검증. 다른 작성창에서 가져가지 않는다.
 * 실제 메일 발송, 승인, 업무 제출은 실행하지 않는다.
 */
(function () {
  'use strict';

  var TAG = '[KRISS-HELPER]';
  var VERSION = '1.11.1';
  var MAIL_COOKIE_KEY = 'krissMailData';
  var STAMP_COOKIE_KEY = 'krissStampData';
  var COOKIE_TTL = 120;
  var MARK = 'data-kriss-helper';   // v1.6.0 삽입 요소 공통 표식(긴급 원상복구용)

  // ############################################################
  // ##  자주 쓰는 문구  —  이 블록만 편집하면 됩니다            ##
  // ############################################################
  //  g : 그룹명        n : 구분명        c : 내용(문자열 또는 줄 배열)
  //  f : 어느 칸용인가  'iven' 발명자 안내 / 'plf' 사무소 전달 / 'rej' 반려사유
  //      (생략하면 어느 칸에서든 중립)
  //  w : 추천 키워드. 화면의 분류·제목·요청내용에 이 말이 있으면 상단 '추천'에 뜸
  //
  //  OO / OOOO.OO.OO. 는 자리표시자입니다. 삽입하면 첫 자리가 자동 선택되고,
  //  F8 을 누르면 다음 자리로 이동합니다. 그대로 덮어 쓰면 됩니다.
  //
  //  추가 형식 (한 덩어리 복사해서 고치면 됩니다)
  //    { g: '그룹', n: '구분명', f: 'iven', w: ['키워드'], c: [
  //      '첫 줄',
  //      '둘째 줄'
  //    ]},
  // ############################################################
  var REF_LOCAL = [

    // ── 2차 사이클(재송부) ────────────────────────────────────
    { g: '2차 사이클', n: '대응안 수정본 전달', f: 'iven', w: ['수정', '보정', '대응방안'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허출원 관련하여 특허사무소에서 보내온 의견제출 대응안 수정본을 전달드립니다.',
      '앞서 회신하신 의견이 반영된 안이오니 검토하시고 회신 부탁드립니다.',
      '추가 수정이 필요할 경우, 해당 내용 첨부하여 회신 부탁드립니다.'
    ]},
    { g: '2차 사이클', n: '명세서 수정 초안 전달', f: 'iven', w: ['명세서', '초안', '수정'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허 출원과 관련하여 특허사무소에서 보내온 명세서 수정 초안을 전달드립니다.',
      '요청하신 사항이 반영되었는지 확인하시고 회신 부탁드립니다. (예시: 이대로 제출, 추가 수정 필요 등)'
    ]},
    { g: '2차 사이클', n: '의견제출통지서 추가 접수', f: 'iven', w: ['의견제출', '통지'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 특허와 관련하여 의견제출 통지서가 추가로 접수되었습니다. 내용 확인 후 \'확인하였음\' 등 간단한 내용 또는 의견을 작성해 주십시오.',
      '회신 주시는대로 특허사무소에 대응안 마련 및 후속 안내를 하도록 요청할 예정입니다.'
    ]},

    // ── 거절 계열 ─────────────────────────────────────────────
    { g: '거절 대응', n: '거절결정 통지', f: 'iven', w: ['거절결정', '거절'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 특허출원에 대하여 거절결정서가 접수되어 전달드립니다.',
      '특허사무소 안내 기준 대응 기한은 OOOO.OO.OO.입니다.',
      '내용 확인 후 \'확인하였음\' 등 간단한 내용을 입력해 주시면, 대응 방향은 별도로 안내드리겠습니다.'
    ]},
    { g: '거절 대응', n: '대응방향 조회(재심사/심판/포기)', f: 'iven', w: ['거절결정', '거절대응', '거절'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허의 거절결정 대응 방향을 확인드립니다.',
      '아래 중 선택하여 회신 부탁드립니다.',
      ' ① 재심사 청구(보정)  ② 거절결정불복심판 청구  ③ 대응하지 않음',
      '①·②의 경우 특허사무소에 대응안 검토를 요청할 예정이며, 별도 비용이 발생합니다. 사용 예산도 함께 지정해 주십시오.',
      '특허사무소 안내 기한: OOOO.OO.OO. / 회신 기한: OO월 OO일'
    ]},
    { g: '거절 대응', n: '거절결정 대응안 검토', f: 'iven', w: ['거절대응', '거절', '재심사'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허출원 관련하여 특허사무소에서 보내온 거절결정 대응안을 전달드립니다.',
      '검토하시고 의견 회신 부탁드립니다.',
      '내용 수정이 필요할 경우, 해당 내용 첨부하여 회신 부탁드립니다.'
    ]},
    { g: '거절 대응', n: '거절 확정 · 종결 안내', f: 'iven', w: ['거절', '확정', '종결'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 특허출원은 대응하지 않기로 결정됨에 따라 거절이 확정되어 종결되었음을 안내드립니다.',
      '본 화면은 의견을 입력하셔야 종료되므로 확인하였다는 간단한 내용을 입력해주시면 됩니다.'
    ]},

    // ── 심사 · 출원 단계 ──────────────────────────────────────
    { g: '심사·출원', n: '심사청구 여부 확인', f: 'iven', w: ['심사청구'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허출원의 심사청구 마감 안내를 전달드립니다.',
      '특허사무소 안내 기준 마감일은 OOOO.OO.OO.이며, 기한 내 심사청구가 없으면 출원취하로 간주됩니다.',
      '심사청구 진행 여부와 사용 예산을 지정하여 OO월 OO일까지 회신 부탁드립니다.',
      '※ 기술이전 또는 출자가 된 특허는 심사청구를 반드시 진행하여 주시기 바랍니다.'
    ]},
    { g: '심사·출원', n: '우선심사 신청 여부 확인', f: 'iven', w: ['우선심사'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허출원의 우선심사 신청 여부를 확인드립니다.',
      '기술이전 협의, 제3자 실시, 과제 성과 제출 기한 등 조기 권리화가 필요한 사유가 있으시면 사유와 함께 회신 부탁드립니다.',
      '별도 관납료 및 대리인 비용이 발생하므로 사용 예산도 지정해 주십시오. (회신 기한: OO월 OO일)'
    ]},
    { g: '심사·출원', n: '출원 완료 통보', f: 'iven', w: ['출원번호', '출원완료', '출원서', '출원 보고'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 발명 건의 특허 출원이 완료되어 안내드립니다.',
      '출원번호 및 출원일자는 첨부된 출원번호통지서를 참고하여 주십시오.',
      '서지사항에 오기가 있는 경우 회신하여 주시기 바랍니다.',
      '본 화면은 의견을 입력하셔야 종료되므로 확인하였다는 간단한 내용을 입력해주시면 됩니다.'
    ]},
    { g: '심사·출원', n: '공개공보 발행 안내', f: 'iven', w: ['공개', '공보'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 특허출원의 공개공보가 발행되었다는 특허사무소의 안내를 전달드리오니 참고하시기 바랍니다.',
      '본 화면은 의견을 입력하셔야 종료되므로 확인하였다는 간단한 내용을 입력해주시면 됩니다.'
    ]},
    { g: '심사·출원', n: '심사관 면담 · 보정안 리뷰', f: 'iven', w: ['면담', '심사관'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허의 심사관 면담(보정안 리뷰) 관련 안내를 전달드립니다.',
      '면담 시 활용할 설명자료 또는 기술적 보완 의견이 필요한 사안이오니, 검토하시고 회신 부탁드립니다.'
    ]},
    { g: '심사·출원', n: '분할출원 검토 요청', f: 'iven', w: ['분할'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허의 분할출원 필요 여부 검토를 요청드립니다.',
      '특허사무소 안내 기준 분할출원 가능 기한은 OOOO.OO.OO.입니다.',
      '청구범위에서 제외된 실시예를 별도 권리화할 필요가 있는지 검토하시어 회신 부탁드리며, 진행 시 신규 출원에 준하는 비용이 발생하므로 사용 예산도 지정해 주십시오.'
    ]},
    { g: '심사·출원', n: '서지 · 명칭 변경 확인', f: 'iven', w: ['서지', '명칭', '주소', '정보변경', '사사'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 특허의 서지사항 변경(출원인 명칭·주소, 발명자, 사사정보 등) 관련 건을 전달드립니다.',
      '변경 내용이 정확한지 확인하시고 회신 부탁드립니다. 정정이 필요한 경우 해당 내용을 함께 기재해 주십시오.'
    ]},
    { g: '심사·출원', n: '포기 · 취하 여부 확인', f: 'iven', w: ['포기', '취하', '유지'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허의 포기(취하) 여부를 확인드립니다.',
      '해당 특허의 활용 가능성(기술이전·실시 계획, 후속과제 연계 등)을 검토하시어',
      '\'유지 희망\' 또는 \'포기 희망\' 중 선택하여 OO월 OO일까지 회신 부탁드립니다.',
      '포기 시 권리 회복이 어렵거나 별도 비용이 발생할 수 있습니다.'
    ]},
    { g: '심사·출원', n: '등록결정 · 등록 진행 여부', f: 'iven', w: ['등록결정', '등록'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허의 등록이 결정되어 안내드립니다.',
      '등록 진행 여부를 결정하시어 회신 부탁드립니다. 추후 비용처리에 사용할 예산도 지정 부탁드립니다.',
      '(등록비용 청구 및 지출발의는 약 1개월 내로 진행될 예정)'
    ]},

    // ── 특허사무소 전달사항 ───────────────────────────────────
    { g: '사무소 전달', n: '원안 그대로 진행', f: 'plf', w: ['검토', '대응', '초안', '보정'], c:
      '발명자 검토 완료되었습니다. 송부하신 안 그대로 진행 부탁드립니다.' },
    { g: '사무소 전달', n: '수정 반영 후 진행', f: 'plf', w: ['수정', '보정'], c:
      '발명자 검토 의견 회신드립니다. 첨부(또는 아래) 내용 반영하여 수정본 송부 부탁드립니다.' },
    { g: '사무소 전달', n: '진행하지 않음', f: 'plf', w: ['포기', '취하'], c:
      '검토 결과 이번에 요청하신 OO 절차는 진행하지 않기로 결정되어 전달드립니다. 관련 처리사항을 확인하여 회신 부탁드립니다.' },
    { g: '사무소 전달', n: '회신 지연 안내', f: 'plf', w: ['마감', '기한'], c:
      '발명자 검토가 진행 중으로 회신이 지연되고 있습니다. 확인되는 대로 회신드리겠습니다. 기한 연장이 필요한 경우 안내 부탁드립니다.' },
    { g: '사무소 전달', n: '기한 연장 요청', f: 'plf', w: ['마감', '기한'], c:
      '내부 검토에 시간이 필요하여 회신 기한 연장을 요청드립니다. 가능한 기한을 회신하여 주시기 바랍니다.' },
    { g: '사무소 전달', n: '등록료 납부 · 등록 진행 요청', f: 'plf', w: ['등록결정', '등록'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 등록료 납부 및 등록진행 요청드립니다. (온라인 등록증으로 발급 부탁드립니다.)',
      '등록 이후 마크프로(02-785-3040, markpro.data@clarivate.com)에 이관하여 주시기 바랍니다.',
      '※ 이관 시 관리번호(ex.P240001KR) 정보를 함께 이관하여 주시기 바랍니다.'
    ]},

    // ── 리마인더 · 공통 ───────────────────────────────────────
    { g: '리마인더', n: '회신 요청(2차 · 최종)', f: 'iven', w: ['마감', '기한'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 건은 OOOO.OO.OO.이 기한인 사안으로 재안내드립니다.',
      'OO월 OO일까지 검토 의견 회신 부탁드립니다. 기한 내 회신이 어려우시면 예상 회신일을 알려 주십시오. (T.5410)'
    ]},
    { g: '리마인더', n: '단순 확인 요청', f: 'iven', c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 특허와 관련하여 업무 요청 건 전달드리오니 참고하여 주십시오.',
      '본 화면은 의견을 입력하셔야 종료되므로 확인하였다는 간단한 내용을 입력해주시면 됩니다.'
    ]},
    { g: '리마인더', n: '제출 완료 보고 전달', f: 'iven', w: ['제출', '보고', '완료'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다.',
      '위 특허와 관련하여 의견서/보정서 제출이 완료되었다는 특허사무소의 안내를 전달드리오니 참고하시기 바랍니다.',
      '본 화면은 의견을 입력하셔야 종료되므로 확인하였다는 간단한 내용을 입력해주시면 됩니다.'
    ]},

    // ── [v1.8.6] 업무 유형별 (분류·요청내용 기반 추천) ────────
    { g: 'OA 대응', n: '1차 OA 대응안 검토 요청', f: 'iven', w: ['1차OA', 'OA', '의견제출통지', '대응안'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허출원에 대한 1차 의견제출통지(OA) 대응안을 전달드립니다.',
      '검토하시어 이대로 제출할지, 수정이 필요한지 회신 부탁드립니다.',
      '특허사무소 안내 기준 대응 기한은 OOOO.OO.OO.입니다. (회신 기한: OO월 OO일)'
    ]},
    { g: 'OA 대응', n: '추가 OA 대응안 검토 요청', f: 'iven', w: ['2차OA', 'FOA', '최종거절', '최종'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허출원의 2차(최종) 의견제출통지에 대한 대응안을 전달드립니다.',
      '최종 단계인 만큼 보정 범위에 제한이 있을 수 있으니, 청구범위 위주로 검토하시어 회신 부탁드립니다.',
      '특허사무소 안내 기준 대응 기한은 OOOO.OO.OO.입니다.'
    ]},
    { g: 'OA 대응', n: '해외 OA 검토보고서 전달', f: 'iven', w: ['검토보고서', '해외', 'US', 'EP', 'JP', 'CN'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 해외 출원 건의 OA 검토보고서를 전달드립니다.',
      '검토하시어 대응안 제출 지시 여부를 회신 부탁드립니다. 대응 진행 시 별도 비용이 발생하므로 사용 예산도 지정해 주십시오.',
      '특허사무소 안내 기준 대응 기한은 OOOO.OO.OO.입니다.'
    ]},
    { g: '해외·PCT', n: 'PCT 국내단계 진입 여부 확인', f: 'iven', w: ['PCT', '국내단계', '진입'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 PCT 출원의 국내단계 진입 여부를 확인드립니다.',
      '진입 희망 국가와 사용 예산을 지정하여 OO월 OO일까지 회신 부탁드립니다.',
      '기한(OOOO.OO.OO.) 경과 시 해당 국가의 권리 확보가 불가하며 회복이 어렵습니다.'
    ]},
    { g: '해외·PCT', n: '우선권 주장 해외출원 여부 확인', f: 'iven', w: ['우선권', '해외출원', 'PCT출원'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 국내출원의 우선권 주장 기한 안내드립니다.',
      '해외출원(또는 PCT 출원) 진행 여부를 결정하시어 사용 예산과 함께 회신 부탁드립니다.',
      '우선권 주장 기한은 OOOO.OO.OO.이며, 경과 시 우선권 이익을 받을 수 없습니다.'
    ]},
    { g: '해외·PCT', n: '번역문 확인 요청', f: 'iven', w: ['번역', '번역문'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 출원의 번역문을 전달드립니다.',
      '기술 용어가 원문 취지와 다르게 번역된 부분이 없는지 확인하시고 회신 부탁드립니다.'
    ]},
    { g: '심사·출원', n: '정보제공·이의신청 대응 확인', f: 'iven', w: ['정보제공', '이의신청'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 건에 대하여 제3자 정보제공(이의신청)이 접수되어 전달드립니다.',
      '제시된 선행문헌과 우리 발명의 차이점에 대한 기술적 의견을 회신하여 주시면 대응안 마련에 반영하겠습니다.'
    ]},
    { g: '심사·출원', n: '서열목록·도면 보완 요청', f: 'iven', w: ['서열', '도면', '보완'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 출원의 형식 보완(서열목록·도면 등) 요청이 접수되었습니다.',
      '해당 자료 준비가 필요한 사안이오니 확인 후 회신 부탁드립니다. 기한은 OOOO.OO.OO.입니다.'
    ]},
    { g: '등록·연차', n: '등록료 납부 안내', f: 'iven', w: ['등록료', '납부', '설정등록'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허의 설정등록료 납부 절차를 안내드립니다.',
      '납부 기한은 OOOO.OO.OO.이며, 사용 예산 지정 부탁드립니다. 기한 경과 시 등록이 무효화될 수 있습니다.'
    ]},
    { g: '등록·연차', n: '연차유지료 유지 여부 확인', f: 'iven', w: ['연차', '연차료', '유지'], c: [
      '안녕하십니까. 기술사업화그룹 송훈찬입니다. 위 특허의 연차유지료 납부 시기가 도래하여 유지 여부를 확인드립니다.',
      '기술이전·실시 계획 등 활용 가능성을 검토하시어 \'유지\' 또는 \'포기\' 중 선택하여 OO월 OO일까지 회신 부탁드립니다.',
      '포기 시 권리 회복이 어려우며, 유지 시 사용 예산 지정이 필요합니다.'
    ]},
    { g: '사무소 전달', n: '대응안 제출 지시', f: 'plf', w: ['대응안', '제출', '지시', 'OA'], c:
      '발명자 검토 완료되었습니다. 송부하신 대응안대로 제출 진행 부탁드리며, 제출 완료 후 결과 회신 부탁드립니다.' },
    { g: '사무소 전달', n: '심사청구 진행 요청', f: 'plf', w: ['심사청구'], c:
      '해당 건 심사청구 진행 요청드립니다. 관납료 및 대리인 비용은 비용청구서로 청구하여 주시기 바랍니다.' },
    { g: '사무소 전달', n: '연차유지료 납부·포기 통보', f: 'plf', w: ['연차', '연차료', '유지', '포기'], c:
      '해당 건의 연차유지료는 발명자 검토 결과에 따라 OO(납부/미납부) 처리 예정입니다. 확인 부탁드립니다.' },
    { g: '사무소 전달', n: '세금계산서 발행 요청(비용청구서)', f: 'plf', w: ['세금계산서', '계산서', '비용청구', '예산'], c: [
      '\u203B 전자세금계산서 발행 메일주소: songhc@kriss.re.kr (patent@kriss.re.kr 로 발행 시 계산서가 확인되지 않으므로 사용 지양)',
      '안녕하십니까.기술사업화그룹 송훈찬입니다. 사용예산 확인 완료되었습니다. 전자세금계산서 발행 요청드립니다.',
      '발행일자는 발행하시는 당일 날짜로 입력 부탁드립니다.',
      '(계산서 발행 해당사항이 없는 경우 임의발행일자 및 임의승인번호 입력 후 시스템 제출 버튼)'
    ]},

    // ── 반려 사유 ─────────────────────────────────────────────
    { g: '반려', n: '대상 건 오류', f: 'rej', c:
      '해당 관리번호의 건이 아닌 것으로 확인되어 반려합니다. 관리번호 확인 후 재요청 부탁드립니다.' },
    { g: '반려', n: '첨부 누락', f: 'rej', w: ['첨부'], c:
      '검토에 필요한 첨부파일이 확인되지 않아 반려합니다. 파일 첨부하여 재요청 부탁드립니다.' }

  ];
  // ############################################################
  // ##  문구 목록 끝                                            ##
  // ############################################################

  // [v1.8.5] 선행조사 상태표시 수정
  // - 지재권 임시저장(00) + PPS 없음 => "상태확인: 선행조사 없음"으로 노출
  // - 지재권 임시저장(00) + PPS 연결값 => 실제 신청 여부 확인 필요로 노출
  // - "미의뢰 0건"이 "선행조사 완료"처럼 보이는 오해 방지

  // ============================================================
  // v1.6.0 설정 — 선행기술조사 / 사번 보강
  // ============================================================
  var PPS_CFG = {
    DUE_DAYS_DOMESTIC: 14,     // [v1.7.0] 국내(관리번호 끝 KR) 완료희망일자 = 오늘 + N일
    DUE_DAYS_FOREIGN: 21,      // [v1.7.0] 국외·PCT 완료희망일자 = 오늘 + N일
    SKIP_WEEKEND: true,        // 결과가 토/일이면 다음 월요일로 이동
    OVERWRITE_DUE: false,      // true = 기존 값도 덮어씀 (기본 false)
    SCAN_MONTHS: 6,            // [미의뢰 점검] 서버 조회 기간(개월)
    SCAN_TAKE: 1000,           // 서버 조회 최대 건수
    // v1.9.1: 대상은 신청 결재완료(04)만. 실제 판정은 krissPpsPolicy 공통 함수.
    //   목록 그리드 실측: 00 임시저장 / 02 내부결재 / 04 완료 (검색 드롭다운의 03=내부결재와 상충)
    //   → 코드 화이트리스트 + 화면 표시문구 블랙리스트 2중 판정
    TARGET_APVSTAT: ['04'],
    EXCLUDE_STATUS_TEXT: ['\uC784\uC2DC\uC800\uC7A5', '\uB0B4\uBD80\uACB0\uC7AC', '\uBC18\uB824', '\uCE58\uC18C'],   // 임시저장·내부결재·반려·취소
    SHOW_DUE_BUTTON: false,    // [v1.7.1] 완료희망일자 수동 버튼 표시 여부
    SHOW_SCAN_BUTTON: true,   // [v1.7.1] [미의뢰 점검] 버튼 표시 여부(코드는 유지, 필요시 true)
    DOMESTIC_CODE: 'KR'        // 공동출원 지분은 krissPpsPolicy에서 근거별 확인
  };

  // v1.6.0 사번 보강 설정
  var EMP_CFG = {
    USE_API: true,             // selectEmpInfo.json 조회로 사번 보강(조회 전용)
    USE_TAB_SIMULATION: true   // API 실패 시 화면 자체 핸들러(Tab/blur) 시뮬레이션
  };

  var EMP_API = '/pms/iprs/aply/selectEmpInfo.json';

  // 등록결정사항 검토 페이지 설정 (v1.3.0) — 실제 화면 HTML 기준 확정값
  var REG_CFG = {
    titleKeyword: '\uB4F1\uB85D\uACB0\uC815\uC0AC\uD56D',   // '등록결정사항' (백업 감지용)
    inventorId:   'mainIvenInfo',          // 주발명자 정보 표시 span
    nextRevId:    'nextReEmpNm',           // 차상위검토자 정보 (퇴직 대체용)
    revNmId:      'intellRegDecsnUserNm',  // 검토자 '이름' 입력 필드
    revIdId:      'intellRegDecsnUserId',  // 검토자 '사번' 입력 필드 (disabled)
    badgeId:      'krissRegBadge'
  };

  // ============================================================
  // 리마인더 메일 페이지별 설정 (v1.5.0)
  // ============================================================
  var REMINDER_CFG = {
    etcTask: {   // 업무요청 상세 (S_PMS_03014020)
      taskNm: '\uC5C5\uBB34\uC694\uCCAD',                 // 업무요청
      mngNo: '#intellMngNo', ivenNm: '#ivenNm', subj: '#rqstSbjt',
      dueDt: '#cmplNeedDt', dueLabel: '\uC644\uB8CC\uD76C\uB9DD\uC77C'   // 완료희망일 (존재)
    },
    exp: {       // 비용청구서 상세 (S_PMS_03015030) — 완료희망일 필드 없음
      taskNm: '\uBE44\uC6A9\uCCAD\uAD6C\uC11C \uAC80\uD1A0',   // 비용청구서 검토
      mngNo: '#intellMngNo', ivenNm: '#ivenNm', subj: '#rqstSbjt',
      dueDt: '', dueLabel: '\uC644\uB8CC\uD76C\uB9DD\uC77C'
    },
    reg: {       // 등록결정사항 검토 (S_PMS_03013020) — 완료희망일 존재
      taskNm: '\uB4F1\uB85D\uACB0\uC815\uC0AC\uD56D \uAC80\uD1A0',   // 등록결정사항 검토
      mngNo: '#intellMngNo', ivenNm: '#ivenNm', subj: '',
      dueDt: '#cmplNeedDt', dueLabel: '\uC5C5\uBB34\uC644\uB8CC \uD76C\uB9DD\uC77C'   // 업무완료 희망일
    },
    regCmpl: {   // 등록완료 보고 (S_PMS_03013030) — 사후 보고, 기한 필드 없음
      taskNm: '\uB4F1\uB85D\uC644\uB8CC \uBCF4\uACE0 \uAC80\uD1A0',   // 등록완료 보고 검토
      mngNo: '#intellMngNo', ivenNm: '#ivenNm', subj: '',
      dueDt: '', dueLabel: '\uC644\uB8CC\uD76C\uB9DD\uC77C'
    }
  };

  // 긴급 원상복구: 콘솔에서 __krissRemoveAll() 실행
  window.__krissRemoveAll = function () {
    var n = document.querySelectorAll('[' + MARK + ']');
    for (var i = 0; i < n.length; i++) n[i].remove();
    var tr = document.querySelectorAll('.kriss-pps-target,.kriss-pps-hold');
    for (var j = 0; j < tr.length; j++) {
      tr[j].classList.remove('kriss-pps-target');
      tr[j].classList.remove('kriss-pps-hold');
    }
    console.log(TAG, '삽입 요소 전체 제거 완료');
  };

  // ============================================================
  // 1. window.open 패치 (팝업→탭)
  // ============================================================
  // v1.9.1: preserve window.open(url,name,features) owned by the portal.
  // No global interception; the dashboard captures handles around its own popup calls.

  // ============================================================
  // 2. 페이지 감지
  // ============================================================
  // Fill only an existing application-date display. No added rows, banners or form events.
  function applicationDateKey() {
    var key=ppsVal('intellRqstNo');
    if(!key && /B_RES00004_01\.do/.test(location.pathname))key=ppsVal('bizKey');
    if(!key && typeof window.intellRqstNo==='string')key=window.intellRqstNo.trim();
    return key;
  }
  function fillApplicationDateDisplay(date) {
    var master=/S_PMS_03019020\.do/.test(location.pathname);
    var blank=function(v){return !String(v == null ? '' : v).replace(/[\s\-—–.]/g,'');};
    function fill(el) {
      if(!el)return false;
      if(el.matches('input,textarea')) {
        if(el.type==='hidden' || !(el.readOnly || el.disabled) || !blank(el.value))return false;
        el.value=date;return true;
      }
      var inputs=el.querySelectorAll('input,textarea');
      if(inputs.length===1)return fill(inputs[0]);
      if(inputs.length || !blank(el.textContent))return false;
      if(el.children.length===1 && el.children[0].matches('span,div'))return fill(el.children[0]);
      if(el.children.length)return false;
      el.textContent=date;return true;
    }
    // The bare rqstDt field is application-specific only on the patent master popup.
    if(master && fill(document.getElementById('rqstDt')))return true;
    var labels=document.querySelectorAll('th,label,dt');
    for(var i=0;i<labels.length;i++) {
      var label=labels[i], name=String(label.textContent || '').replace(/[\s:*]/g,'');
      if(!/^(지재권|지식재산권)신청일(자)?$/.test(name) && !(master && /^신청일(자)?$/.test(name)))continue;
      var target=label.htmlFor?document.getElementById(label.htmlFor):label.nextElementSibling;
      if(target && (label.htmlFor || target.matches('td,dd')) && fill(target))return true;
    }
    return false;
  }
  function initApplicationDateInfo() {
    if (!/(?:S_PMS_03019020|B_RES00004_01|S_PMS_03011010|S_PMS_03012020|S_PMS_03013020|S_PMS_03013030|S_PMS_03014020|S_PMS_03015030|B_RES00011_01|B_RES00012_01|B_RES00015_01)\.do/.test(location.pathname) || window.__krissAppDateStarted) return;
    window.__krissAppDateStarted=true;
    var tries=0, requested=false, key='', date='';
    var timer=setInterval(function(){
      if(++tries>60){clearInterval(timer);return;}
      var current=applicationDateKey();if(!current)return;
      if(key && key!==current){clearInterval(timer);return;}
      if(date && fillApplicationDateDisplay(date)){clearInterval(timer);return;}
      if(requested)return;requested=true;key=current;
      getJson('/pms/res/intellppty/searchIntellRqst.json',{intellRqstNo:key},function(res){
        var x=res && (res.data || res);
        if(!x || typeof x!=='object' || Array.isArray(x) || (x.intellRqstNo && String(x.intellRqstNo)!==key) || applicationDateKey()!==key)return;
        var m=String(x.rqstDt || '').trim().match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?=$|[T\s])/);
        if(!m)return;
        var t=new Date(+m[1],+m[2]-1,+m[3]);
        if(t.getFullYear()!==+m[1] || t.getMonth()!==+m[2]-1 || t.getDate()!==+m[3])return;
        date=m[1]+'-'+m[2]+'-'+m[3];
        if(fillApplicationDateDisplay(date))clearInterval(timer);
      },function(){clearInterval(timer);});
    },500);
  }

  function detectAndInit() {
    initApplicationDateInfo();
    var href = location.href;

    // [v1.8.2] 공통 기능 — 페이지 분기(early return)와 무관하게 먼저 실행
    //   [v1.8.9] 세금계산서 문구도 여기서 실행한다(라우터를 끊지 않는다).
    if (href.indexOf('gw.kriss.re.kr') === -1) {
      initRefPhrases();
      initExpCnfPage();
    }

    if (location.hostname === 'gw.kriss.re.kr' && new URLSearchParams(location.search).get('acton') === 'compose') {
      console.log(TAG, 'v' + VERSION, 'GW 편지쓰기 페이지 감지');
      initComposePage();
      return;
    }

    if (href.indexOf('stmpRqst') !== -1 || href.indexOf('S_GEA_01200100') !== -1) {
      console.log(TAG, 'v' + VERSION, '인장 날인 신청 페이지 감지');
      initStampPage();
      return;
    }

    // [v1.6.0] 선행기술조사 요청 팝업 — 완료희망일자 자동 지정
    if (href.indexOf('S_PMS_03011010') !== -1) {
      console.log(TAG, 'v' + VERSION, '선행기술조사 요청 팝업 감지');
      initPpsPopup();
      return;
    }

    // [v1.7.0] 출원신청 팝업 — 특허사무소 연계 + 완료희망일자 자동 지정
    if (href.indexOf('S_PMS_03012020') !== -1) {
      console.log(TAG, 'v' + VERSION, '출원신청 팝업 감지');
      initAplyPopup();
      return;
    }

    // [v1.6.0] 지식재산권 신청 목록 — 선행조사 미의뢰 감지
    if (href.indexOf('S_PMS_03010100') !== -1) {
      console.log(TAG, 'v' + VERSION, '지식재산권 신청 목록 감지');
      initIntellList();
      return;
    }

    // [v1.8.3] 출원결과검토 페이지 — 검토자 그리드 자동추가 대상
    if (isAplyRsltCnfPage()) {
      console.log(TAG, 'v' + VERSION, '출원결과검토 페이지 감지');
      initAplyRsltCnfPage();
      return;
    }

    // 등록완료 보고 페이지 (v1.4.0) — 검토자 그리드 자동추가 대상
    if (isRegCmplPage()) {
      console.log(TAG, 'v' + VERSION, '등록완료 보고 페이지 감지');
      initRegCmplPage();
      return;
    }

    if (href.includes('etcTask') || href.includes('S_PMS_03014')) {
      console.log(TAG, 'v' + VERSION, '업무요청 페이지 감지');
      initEtcTask();
      return;
    }

    // 등록결정사항 검토 페이지 (v1.3.0) — 검토자 입력 필드 존재로 감지
    if (document.getElementById('intellRegDecsnUserNm')
        || document.title.indexOf(REG_CFG.titleKeyword) !== -1) {
      console.log(TAG, 'v' + VERSION, '등록결정사항 검토 페이지 감지');
      initRegPage();
      return;
    }

    var isExpPage = document.title.indexOf('\uBE44\uC6A9\uCCAD\uAD6C\uC11C') !== -1
      || (document.getElementById('cnfUserNm') && document.getElementById('mainIvenInfo'));

    if (isExpPage) {
      console.log(TAG, 'v' + VERSION, '비용청구서 페이지 감지');
      initExpPage();
      return;
    }
  }

  // ============================================================
  // 3. 대상자 결정 — 퇴직 시 차상위검토자로 대체
  // ============================================================
  function resolveTarget() {
    var inventor = parseInventor(getText('#mainIvenInfo'));
    if (!inventor) {
      toast('주발명자 정보를 파싱할 수 없습니다.', 'error');
      return null;
    }

    if (!inventor.isRetired) {
      return { person: inventor, source: '주발명자' };
    }

    console.log(TAG, '주발명자 퇴직 확인 → 차상위검토자 탐색');
    var nextText = getText('#nextReEmpNm');
    if (!nextText) {
      toast('주발명자(' + inventor.empNm + ') 퇴직 — 차상위검토자 정보 없음', 'error');
      return null;
    }

    var next = parseInventor(nextText);
    if (!next || next.isRetired) {
      toast('주발명자(' + inventor.empNm + ') 퇴직 — 차상위검토자 파싱 불가: ' + nextText, 'error');
      return null;
    }

    console.log(TAG, '차상위검토자 사용:', next.empNm, '(' + (next.empNo || '사번없음') + ')');
    return { person: next, source: '차상위검토자(퇴직대체)' };
  }

  // ============================================================
  // 3-B. [v1.6.0] 사번 보강 — 이름만 있는 대상자(차상위검토자 등) 처리
  //   1순위: selectEmpInfo.json 조회(조회 전용) → 단일 매칭이면 사번 자동 입력
  //   2순위: 화면 자체 핸들러(Tab/blur) 시뮬레이션 — 이름 입력 필드의 기존 동작 유도
  // ============================================================
  function resolveEmpNo(empNm, onDone) {
    if (!EMP_CFG.USE_API || !empNm) { onDone(null, 'api-skip'); return; }
    postJson(EMP_API, { popEmpNm: empNm }, function (res) {
      var list = (res && res.data) ? res.data : [];
      list = Array.isArray(list) ? list.filter(function(r){ return String(r.empNm || '').trim() === String(empNm).trim() && String(r.empNo || '').trim(); }) : [];
      if (list.length === 1) { onDone(list[0], 'single-exact'); return; }
      if (list.length > 1) { onDone(null, 'multi:' + list.length); return; }
      onDone(null, 'none');
    }, function (msg) {
      console.warn(TAG, 'selectEmpInfo 실패:', msg);
      onDone(null, 'error');
    });
  }

  // 이름 입력 필드에 화면의 사번 조회 로직(Tab 이동 시 동작)을 강제 발생
  function triggerEmpResolve(el) {
    if (!EMP_CFG.USE_TAB_SIMULATION || !el) return;
    try {
      el.focus();
      try { $(el).trigger('input'); } catch (e) {}
      try { $(el).trigger('change'); } catch (e) {}
      ['keydown', 'keyup'].forEach(function (t) {
        el.dispatchEvent(new KeyboardEvent(t, {
          keyCode: 9, which: 9, key: 'Tab', bubbles: true, cancelable: true
        }));
      });
      el.blur();
      try { $(el).trigger('blur'); } catch (e) {}
      try { $(el).trigger('focusout'); } catch (e) {}
      console.log(TAG, 'Tab 시뮬레이션 실행 →', el.id);
    } catch (e) {
      console.warn(TAG, 'Tab 시뮬레이션 실패:', e.message);
    }
  }

  // 이름/사번 필드 공통 입력 루틴 (업무요청·비용청구서·등록결정 공용)
  //   nmId/idId: 필드 id, badgeId: 배지 id, role: 로그 라벨
  //   afterFill: 사번 확정 후 추가 처리(선택)
  function fillPersonFields(target, nmId, idId, badgeId, role, afterFill) {
    var nmEl=document.getElementById(nmId),idEl=document.getElementById(idId);
    if(!nmEl || !idEl || !target || target.person.isRetired || !isRefEditable(nmEl) || ppsVal('workFlag')==='readOnly')return;
    var oldNm=nmEl.value, oldId=idEl.value, token={};
    nmEl.__krissPersonToken=token;
    var apply=function(empNo) {
      if(!empNo || nmEl.__krissPersonToken!==token || nmEl.value!==oldNm || idEl.value!==oldId || !isRefEditable(nmEl) || ppsVal('workFlag')==='readOnly')return;
      // Assign the pair before firing events; no old ID can accompany the new name.
      nmEl.value=target.person.empNm; idEl.value=String(empNo).trim();
      target.person.empNo=idEl.value;
      triggerChange(nmEl); triggerChange(idEl);
      showBadge(target,nmEl,badgeId);
      if(typeof afterFill==='function')afterFill(idEl.value);
    };
    if(target.person.empNo){apply(target.person.empNo);return;}
    resolveEmpNo(target.person.empNm,function(rec){
      if(rec && rec.empNo)apply(rec.empNo);
      else toast(target.person.empNm+' 사번을 확정할 수 없어 기존 결재자를 유지했습니다. 검색으로 선택하세요.','warn');
    });
  }

  // ============================================================
  // 4-A. 업무요청 페이지
  // ============================================================
  function initEtcTask() {
    waitFor('#mainIvenInfo', 30000, function () {
      addEtcTaskButtons();
      addReminderButton(REMINDER_CFG.etcTask);   // v1.5.0
      tryAutoFillCmpl();
    }, function () {
      console.warn(TAG, '#mainIvenInfo 타임아웃');
    });
  }

  function tryAutoFillCmpl() {
    var rslt = document.getElementById('rqstRslt');
    if (!rslt) return;
    var style = window.getComputedStyle(rslt);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    var nmEl = document.getElementById('cmplUserNm');
    if (!nmEl || (nmEl.value && nmEl.value.trim())) return;
    fillCmpl(false);
  }

  function fillCmpl(isManual) {
    var target = resolveTarget();
    if (!target) return;

    var nmEl = document.getElementById('cmplUserNm');
    if (!nmEl) { toast('#cmplUserNm 없음', 'error'); return; }
    if (!isManual && nmEl.value && nmEl.value.trim()) return;

    logFill('담당자', target, isManual);
    fillPersonFields(target, 'cmplUserNm', 'cmplUserId', 'krissEtcBadge', '담당자');
  }

  // [v1.8.7] 업무요청 화면 상단 주입 버튼 개별 제어 — 기본은 날인신청만 표시.
  //   담당자 자동 채움은 tryAutoFillCmpl() 이 계속 수행하므로 버튼이 없어도 동작에 지장이 없다.
  var ETC_BTN_CFG = {
    SHOW_FILL_CMPL: false,   // [발명자→담당자] 수동 채움 버튼
    SHOW_SEND_MAIL: false,   // [메일발송] 버튼
    SHOW_STAMP: true         // [날인신청] 버튼
  };

  function addEtcTaskButtons() {
    var area = document.querySelector('.titlegroup3 .ft_right');
    if (!area) return;
    if (ETC_BTN_CFG.SHOW_FILL_CMPL) {
      mkBtn(area, '\uBC1C\uBA85\uC790\u2192\uB2F4\uB2F9\uC790', '#4CAF50', '#388E3C', function () {
        fillCmpl(true);
      });
    }
    if (ETC_BTN_CFG.SHOW_SEND_MAIL) {
      mkBtn(area, '\uBA54\uC77C\uBC1C\uC1A1', '#2196F3', '#1976D2', function () {
        sendMailToInventor();
      });
    }
    if (ETC_BTN_CFG.SHOW_STAMP) {
      mkBtn(area, '\uB0A0\uC778\uC2E0\uCCAD', '#FF9800', '#F57C00', function () {
        openStampRequest();
      });
    }
  }

  // ============================================================
  // 4-B. 비용청구서 페이지
  // ============================================================
  function initExpPage() {
    waitFor('#mainIvenInfo', 30000, function () {
      addReminderButton(REMINDER_CFG.exp);       // v1.5.0
      tryAutoFillReviewer();
    }, function () {
      console.warn(TAG, '#mainIvenInfo 타임아웃');
    });
  }

  function tryAutoFillReviewer() {
    var rslt = document.getElementById('rqstRslt');
    if (!rslt) return;
    var style = window.getComputedStyle(rslt);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    var nmEl = document.getElementById('cnfUserNm');
    if (!nmEl || (nmEl.value && nmEl.value.trim())) return;
    fillReviewer(false);
  }

  function fillReviewer(isManual) {
    var target = resolveTarget();
    if (!target) return;

    var nmEl = document.getElementById('cnfUserNm');
    if (!nmEl) { toast('#cnfUserNm 없음', 'error'); return; }
    if (!isManual && nmEl.value && nmEl.value.trim()) return;

    logFill('검토자', target, isManual);
    fillPersonFields(target, 'cnfUserNm', 'cnfUserId', 'krissExpBadge', '검토자', function (empNo) {
      // 화면 공통 콜백(있는 경우) — 부서·직급 등 파생 필드 갱신
      try {
        if (typeof window.empCallBack === 'function') {
          window.empCallBack({ empNo: empNo, empNm: target.person.empNm });
        }
      } catch (e) {
        console.warn(TAG, 'empCallBack 호출 실패:', e.message);
      }
    });
  }

  // ============================================================
  // 4-C. 등록결정사항 검토 페이지 (v1.3.0)
  //      검토자(intellRegDecsn…)를 주발명자(퇴직 시 차상위검토자)로 자동 입력
  // ============================================================
  function initRegPage() {
    waitFor('#' + REG_CFG.inventorId, 30000, function () {
      addReminderButton(REMINDER_CFG.reg);       // v1.5.0
      fillRegReviewer(false);
    }, function () {
      console.warn(TAG, '#' + REG_CFG.inventorId + ' 타임아웃 (등록결정사항 검토)');
    });
  }

  function fillRegReviewer(isManual) {
    var target = resolveTargetGeneric(REG_CFG.inventorId, REG_CFG.nextRevId);
    if (!target) return;

    var nmEl = document.getElementById(REG_CFG.revNmId);
    if (!nmEl) {
      toast('#' + REG_CFG.revNmId + ' 없음 (등록결정사항 검토)', 'error');
      return;
    }
    if (!isManual && nmEl.value && nmEl.value.trim()) return;

    // data-value-map="#intellRegDecsnUserId:empNo,#intellRegDecsnUserNm:empNm" 와 동일 효과
    logFill('검토자', target, isManual);
    fillPersonFields(target, REG_CFG.revNmId, REG_CFG.revIdId, REG_CFG.badgeId, '검토자');
  }

  // 주발명자/차상위검토자 결정 (id 주입형) — resolveTarget의 일반화 버전
  function resolveTargetGeneric(inventorId, nextRevId) {
    var ivEl = document.getElementById(inventorId);
    var inventor = parseInventor(ivEl ? ivEl.textContent.trim() : '');
    if (!inventor) {
      toast('주발명자 정보를 파싱할 수 없습니다. (#' + inventorId + ')', 'error');
      return null;
    }
    if (!inventor.isRetired) {
      return { person: inventor, source: '주발명자' };
    }

    console.log(TAG, '주발명자 퇴직 확인 → 차상위검토자 탐색');
    var nextEl = document.getElementById(nextRevId);
    var nextText = nextEl ? nextEl.textContent.trim() : '';
    if (!nextText) {
      toast('주발명자(' + inventor.empNm + ') 퇴직 — 차상위검토자 정보 없음', 'error');
      return null;
    }
    var next = parseInventor(nextText);
    if (!next || next.isRetired) {
      toast('주발명자(' + inventor.empNm + ') 퇴직 — 차상위검토자 파싱 불가: ' + nextText, 'error');
      return null;
    }
    console.log(TAG, '차상위검토자 사용:', next.empNm, '(' + (next.empNo || '사번없음') + ')');
    return { person: next, source: '차상위검토자(퇴직대체)' };
  }

  // ============================================================
  // 4-D. 등록완료 보고 페이지 (v1.4.2)
  //      검토자 그리드(#grid1)에 주발명자(퇴직 시 차상위검토자)를 자동 추가
  // ============================================================
  function isRegCmplPage() {
    var h4 = document.querySelector('.titlegroup3 .h4_normal');
    var titleMatch = (h4 && h4.textContent.indexOf('\uB4F1\uB85D\uC644\uB8CC') !== -1)   // '등록완료'
      || (document.title && document.title.indexOf('\uB4F1\uB85D\uC644\uB8CC') !== -1);
    var structMatch = !!document.getElementById('grid1')
      && !!document.getElementById('btnGridAdd')
      && !!document.getElementById('mainIvenInfo')
      && !!document.getElementById('editForm')
      && !document.getElementById('cnfUserNm')            // 비용청구서 배제
      && !document.getElementById('intellRegDecsnUserNm'); // 등록결정사항 검토 배제
    return !!(titleMatch && structMatch);
  }

  function initRegCmplPage() {
    // 주발명자 정보는 getBasInfo→getIntellRqstInfo AJAX 이후 채워짐 → 로드 대기
    waitFor('#mainIvenInfo', 30000, function () {
      addRegCmplButton();        // 검토자 행추가 옆 보조 버튼(상단 접수영역과 분리)
      addReminderButton(REMINDER_CFG.regCmpl);   // v1.5.0
      scheduleRegCmplAuto();     // 접수 상태 확정 + 그리드 로드 완료 시 자동 첫 행 추가
    }, function () {
      console.warn(TAG, '#mainIvenInfo 타임아웃 (등록완료 보고)');
    });
  }

  // '접수 상태 확정' 판정 — 타이밍과 무관하게 접수 후에만 true
  function isRegCmplAccepted() {
    if(ppsVal('workFlag')==='readOnly')return false;
    var f = document.getElementById('editForm');
    if (!f || window.getComputedStyle(f).display === 'none') return false;   // 결과입력폼 노출 필요
    var rept = document.getElementById('btnRept');
    if (rept && window.getComputedStyle(rept).display !== 'none') return false; // 접수버튼 보이면 미접수
    var save = document.getElementById('btnSave');
    if (save && window.getComputedStyle(save).display === 'none') return false;  // 임시저장 숨김이면 미접수/완료
    var addBtn = document.getElementById('btnGridAdd');
    if (!addBtn || addBtn.disabled) return false;   // 행추가 없거나 비활성(완료)이면 제외
    return true;
  }

  // 보조 버튼 — 검토자 행추가(#btnGridAdd) 옆에 배치. 접수 후에만 보이며 접수 버튼과 무관.
  function addRegCmplButton() {
    var addBtn = document.getElementById('btnGridAdd');
    if (!addBtn) return;                       // 검토자 영역 자체가 없으면 미배치
    var area = addBtn.parentNode;
    if (!area || document.getElementById('krissRegCmplBtn')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'krissRegCmplBtn';
    b.setAttribute(MARK, '1');
    b.textContent = '\uC8FC\uBC1C\uBA85\uC790';   // 주발명자
    b.title = '\uC8FC\uBC1C\uBA85\uC790(\uD1F4\uC9C1 \uC2DC \uCC28\uC0C1\uC704\uAC80\uD1A0\uC790)\uB97C \uAC80\uD1A0\uC790 \uCCAB \uD589\uC5D0 \uCD94\uAC00';
    b.style.cssText = 'margin-left:6px;background:#66BB6A;color:#fff;border:1px solid #4CAF50;'
      + 'border-radius:3px;font-weight:normal;font-size:11px;padding:2px 8px;cursor:pointer;'
      + 'vertical-align:middle;line-height:16px;font-family:Malgun Gothic,sans-serif;opacity:0.9;';
    b.addEventListener('click', function () { fillRegCmplReviewer(); });
    b.addEventListener('mouseenter', function () { b.style.opacity = '1'; });
    b.addEventListener('mouseleave', function () { b.style.opacity = '0.9'; });
    area.appendChild(b);
    console.log(TAG, '등록완료 보고 보조 버튼 추가(검토자 행추가 옆)');
  }

  // 접수 상태 확정 + 그리드 로드 완료 + 검토자 0건이면 자동으로 첫 행 추가
  function scheduleRegCmplAuto() {
    if (window.__krissRegCmplAutoDone) return;
    if (!isRegCmplAccepted()) { console.log(TAG, '미접수/완료 상태 — 자동추가 미실행'); return; }
    var kg = null; try { kg = $('#grid1').data('kendoGrid'); } catch (e) {}
    if (!kg || !kg.dataSource) { console.warn(TAG, '검토자 그리드 미초기화 — 자동추가 보류'); return; }
    var ds = kg.dataSource;

    var run = function (reason) {
      if (window.__krissRegCmplAutoDone) return;
      if (!isRegCmplAccepted()) { console.log(TAG, '상태 재확인 실패 — 자동추가 중단'); return; }  // 실행 직전 재확인
      window.__krissRegCmplAutoDone = true;
      if (ds.data().length > 0) { console.log(TAG, '검토자 행 존재 — 자동추가 생략'); return; }
      console.log(TAG, '검토자 자동추가(주발명자) [' + reason + ']');
      fillRegCmplReviewer();
    };

    // 1순위 신호: 검토자 목록(read) 로드 완료 시점
    ds.bind('requestEnd', function (e) {
      if (!e || !e.type || e.type === 'read') setTimeout(function () { run('read완료'); }, 150);
    });
    // 폴백: requestEnd를 놓친 경우 대비, 충분히 대기(3.5s) 후 실행
    setTimeout(function () { run('타임아웃대비'); }, 3500);
  }

  function fillRegCmplReviewer() {
    if (!isRegCmplAccepted()) {
      toast('검토자 입력 단계가 아닙니다. [접수] 처리 후 사용해 주세요.', 'warn');
      return;
    }
    var target = resolveTarget();   // 주발명자, 퇴직 시 차상위검토자
    if (!target) return;
    if (target.person.isRetired) {
      toast(target.person.empNm + '님은 퇴직자입니다. 검토자로 추가할 수 없습니다.', 'warn');
      return;
    }
    lookupEmpAndAddRow(target);
  }

  function extractTelnoFromInventor(text) {
    // "01150-나희경 (5861, nahk@kriss.re.kr)" → 5861
    var m = (text || '').match(/\(\s*(\d{3,5})\s*[,)]/);
    return m ? m[1] : '';
  }

  function lookupEmpAndAddRow(target) {
    var empNm = target.person.empNm;
    var empNo = target.person.empNo;
    var source = target.source;
    var contextKey=ppsVal('rqstNo')+'|'+ppsVal('bizKey');

    var buildFallback = function () {
      return {
        empNo: empNo, empNm: empNm, deptNm: '', fgradeNm: '',
        telnoOffc: extractTelnoFromInventor(getText('#mainIvenInfo'))
      };
    };

    postJson(EMP_API, { popEmpNm: empNm }, function (res) {
      var list = (res && res.data) ? res.data : [];
      var rec = null;
      if (empNo && list.length) {
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].empNo).trim() === String(empNo).trim()) { rec = list[i]; break; }
        }
        if (!rec) {   // 사번 앞자리 0 차이 대비
          var sz = function (v) { return String(v || '').replace(/^0+/, ''); };
          for (var j = 0; j < list.length; j++) {
            if (sz(list[j].empNo) === sz(empNo)) { rec = list[j]; break; }
          }
        }
      }
      if (!rec && empNo && list.length) { toast(empNm+' 조회 사번 불일치 — 직접 선택하세요.','warn'); return; }
      if (!rec && !empNo && list.length===1 && String(list[0].empNm || '').trim()===String(empNm).trim()) rec=list[0];
      if (!rec && list.length > 1) {
        toast('동명이인(' + empNm + ') ' + list.length + '명 중 사번 ' + (empNo || '?') + ' 미매칭 — [행추가] 후 직접 검색해 주세요.', 'warn');
        return;
      }
      if (!rec) { rec = buildFallback(); console.warn(TAG, 'selectEmpInfo 결과 없음 — 화면값으로 추가:', rec); }
      if(contextKey!==ppsVal('rqstNo')+'|'+ppsVal('bizKey'))return;
      addReviewerRow(rec, source);
    }, function (msg) {
      console.warn(TAG, 'selectEmpInfo 호출 실패 — 화면값으로 추가:', msg);
      if(contextKey!==ppsVal('rqstNo')+'|'+ppsVal('bizKey'))return;
      addReviewerRow(buildFallback(), source);
    });
  }

  function addReviewerRow(rec, source) {
    var row = {
      userId: rec.empNo || '', userNm: rec.empNm || '',
      deptNm: rec.deptNm || '', fgradeNm: rec.fgradeNm || '', telnoOffc: rec.telnoOffc || ''
    };
    if (!isRegCmplAccepted()) return;
    if (!row.userId || !row.userNm) { toast('추가할 검토자 정보가 없습니다.', 'error'); return; }

    var kg = null; try { kg = $('#grid1').data('kendoGrid'); } catch (e) {}

    // 중복 확인 (Kendo dataSource 기준)
    if (kg && kg.dataSource) {
      var arr = kg.dataSource.data();
      for (var i = 0; i < arr.length; i++) {
        if (sameEmpNo(arr[i].userId,row.userId)) {
          toast('이미 추가된 검토자입니다: ' + row.userNm + ' (' + row.userId + ')', 'warn');
          return;
        }
      }
    }

    // 1순위: 페이지 grid API로 행추가(저장추적 정확) 후, 방금 만들어진 '빈 행'을 직접 채움
    try {
      if (typeof grid1 !== 'undefined' && grid1 && grid1.addRow && kg && kg.dataSource) {
        var beforeRows = Array.from(kg.dataSource.data());
        grid1.addRow();
        var d = kg.dataSource.data();
        var item = null;
        for (var j = 0; j < d.length; j++) {
          if (!beforeRows.some(function(x){return x===d[j] || (x.uid && x.uid===d[j].uid);})) { item = d[j]; break; }   // 방금 생긴 빈 행
        }
        if(!item){toast('새 검토행 생성을 확인하지 못했습니다. 기존 결재선은 유지됩니다.','warn');return;}
        // No existing-row fallback.
        if (item) {
          Object.keys(row).forEach(function(k){if(typeof item.set==='function')item.set(k,row[k]);else item[k]=row[k];});item.dirty=true;
          try { kg.refresh(); } catch (e2) { if (grid1.refreshRow) grid1.refreshRow(); }
          toast(source + ' ' + row.userNm + ' (' + row.userId + ') 검토자 추가 완료', 'ok');
          console.log(TAG, '검토자 추가(addRow+빈행 채움):', row);
          return;
        }
      }
    } catch (e) { console.warn(TAG, 'addRow 경로 실패:', e.message); toast('검토행 처리 오류 — 현재 결재선을 확인하세요.','warn'); return; }

    // 2순위(폴백): Kendo dataSource 첫 행(index 0) 직접 삽입
    try {
      if (kg && kg.dataSource) {
        var it = kg.dataSource.insert(0, {
          userId: row.userId, userNm: row.userNm, deptNm: row.deptNm,
          fgradeNm: row.fgradeNm, telnoOffc: row.telnoOffc
        });
        if (it) it.dirty = true;
        toast(source + ' ' + row.userNm + ' (' + row.userId + ') 검토자 첫 행 추가(폴백)', 'ok');
        console.log(TAG, '검토자 추가(dataSource.insert 0):', row);
        return;
      }
    } catch (e) { console.warn(TAG, 'dataSource.insert 실패:', e.message); }

    toast('검토자 그리드를 찾지 못했습니다. [행추가] 후 수동 입력해 주세요.', 'error');
  }

  // ============================================================
  // 4-E. [v1.8.3] 출원결과검토 페이지
  //      첨부 화면 실측 구조:
  //        - 제목: 출원결과검토
  //        - 프로세스: B_RES00011
  //        - 검토자 그리드 필드: ivenEmpNo / ivenEmpNm / deptNm / fgradeNm / telnoOffc
  //      처리:
  //        - 신청자 입력 단계에서 검토자 0건이면 주발명자를 자동 추가
  //        - 주발명자 퇴직 시 차상위검토자로 대체
  //        - selectEmpInfo.json으로 부서/직급/내선 보강
  //        - 사번 기준 중복 및 동명이인 오입력 방지
  // ============================================================
  function isAplyRsltCnfPage() {
    var h4 = document.querySelector('.titlegroup3 .h4_normal');
    var titleText = h4 ? String(h4.textContent || '').trim() : '';
    var proc = document.getElementById('processCode');
    var procVal = proc ? String(proc.value || '').trim() : '';

    var titleMatch = titleText.indexOf('\uCD9C\uC6D0\uACB0\uACFC\uAC80\uD1A0') !== -1; // 출원결과검토
    var structMatch = !!document.getElementById('form1')
      && !!document.getElementById('grid1')
      && !!document.getElementById('btnGridAdd')
      && !!document.getElementById('mainIvenInfo')
      && !!document.getElementById('intellRqstNo')
      && !!document.getElementById('aplyRqstNo');

    // 프로세스코드는 화면 실측값(B_RES00011)을 우선 확인하되,
    // 추후 서버에서 코드가 바뀌어도 제목+구조가 일치하면 동작하도록 한다.
    return !!(titleMatch && structMatch && (!procVal || procVal === 'B_RES00011' || titleText === '\uCD9C\uC6D0\uACB0\uACFC\uAC80\uD1A0'));
  }

  function initAplyRsltCnfPage() {
    waitFor('#mainIvenInfo', 30000, function () {
      addAplyRsltCnfButton();
      scheduleAplyRsltCnfAuto();
    }, function () {
      console.warn(TAG, '#mainIvenInfo 타임아웃 (출원결과검토)');
    });
  }

  function isAplyRsltCnfEditable() {
    var workEl = document.getElementById('workFlag');
    var statEl = document.getElementById('statusCode');
    var work = workEl ? String(workEl.value || '').trim() : '';
    var stat = statEl ? String(statEl.value || '').trim() : '';

    if (work === 'readOnly') return false;
    // myWork에서 ST0101은 신청자, ST0102는 검토자 화면(원본 화면 로직 기준)
    if (work === 'myWork' && stat && stat !== 'ST0101') return false;

    var addBtn = document.getElementById('btnGridAdd');
    if (!addBtn || addBtn.disabled) return false;
    try {
      var cs = window.getComputedStyle(addBtn);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    } catch (e) {}
    return true;
  }

  function addAplyRsltCnfButton() {
    var addBtn = document.getElementById('btnGridAdd');
    if (!addBtn || document.getElementById('krissAplyRsltCnfBtn')) return;
    var area = addBtn.parentNode;
    if (!area) return;

    var b = mkBtn(area, '\uC8FC\uBC1C\uBA85\uC790', '#66BB6A', '#4CAF50', function () { // 주발명자
      fillAplyRsltCnfReviewer(true);
    }, 'krissAplyRsltCnfBtn');
    b.title = '\uC8FC\uBC1C\uBA85\uC790(\uD1F4\uC9C1 \uC2DC \uCC28\uC0C1\uC704\uAC80\uD1A0\uC790)\uB97C \uCD9C\uC6D0\uACB0\uACFC\uAC80\uD1A0 \uAC80\uD1A0\uC790\uB85C \uCD94\uAC00';
    console.log(TAG, '출원결과검토 보조 버튼 추가(행추가 옆)');
  }

  // 신규 건은 그리드 초기화 직후, 저장 건은 기존 검토자 목록 read 완료 후 실행한다.
  function scheduleAplyRsltCnfAuto() {
    if (window.__krissAplyRsltCnfAutoScheduled || window.__krissAplyRsltCnfAutoDone) return;
    window.__krissAplyRsltCnfAutoScheduled = true;

    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tries > 100) {
        clearInterval(t);
        console.warn(TAG, '출원결과검토 검토자 그리드 초기화 타임아웃');
        return;
      }

      if (!isAplyRsltCnfEditable()) {
        clearInterval(t);
        console.log(TAG, '출원결과검토 입력 단계 아님 — 검토자 자동추가 생략');
        return;
      }

      var kg = null;
      try { kg = $('#grid1').data('kendoGrid'); } catch (e) {}
      var pageGrid = (typeof window.grid1 !== 'undefined') ? window.grid1 : null;
      if (!kg || !kg.dataSource || !pageGrid || typeof pageGrid.addRow !== 'function') return;

      clearInterval(t);
      var ds = kg.dataSource;
      var bizEl = document.getElementById('bizKey');
      var bizKeyVal = bizEl ? String(bizEl.value || '').trim() : '';

      var run = function (reason) {
        if (window.__krissAplyRsltCnfAutoDone) return;
        if (!isAplyRsltCnfEditable()) {
          window.__krissAplyRsltCnfAutoDone = true;
          console.log(TAG, '출원결과검토 상태 재확인 실패 — 자동추가 중단');
          return;
        }
        if (ds.data().length > 0) {
          window.__krissAplyRsltCnfAutoDone = true;
          console.log(TAG, '출원결과검토 검토자 행 존재 — 자동추가 생략');
          return;
        }
        window.__krissAplyRsltCnfAutoDone = true;
        console.log(TAG, '출원결과검토 검토자 자동추가 [' + reason + ']');
        fillAplyRsltCnfReviewer(false);
      };

      // 신규 신청(newWork/bizKey 없음)은 서버 검토자 목록 read가 없으므로 바로 실행.
      if (!bizKeyVal) {
        setTimeout(function () { run('신규건'); }, 350);
        return;
      }

      // 저장/재조회 건은 기존 검토자 목록을 덮어쓰지 않도록 read 완료를 우선 기다린다.
      var onEnd = function (e) {
        if (!e || !e.type || e.type === 'read') {
          try { ds.unbind('requestEnd', onEnd); } catch (x) {}
          setTimeout(function () { run('기존목록 read완료'); }, 180);
        }
      };
      try { ds.bind('requestEnd', onEnd); } catch (e2) {}

      // 이미 read가 끝난 뒤 Helper가 붙은 경우를 위한 폴백.
      setTimeout(function () {
        try { ds.unbind('requestEnd', onEnd); } catch (x2) {}
        run('read대기 폴백');
      }, 3500);
    }, 300);
  }

  function fillAplyRsltCnfReviewer(isManual) {
    if (!isAplyRsltCnfEditable()) {
      if (isManual) toast('현재는 검토자 입력 단계가 아닙니다.', 'warn');
      return;
    }

    var target = resolveTarget();
    if (!target) return;
    if (target.person.isRetired) {
      toast(target.person.empNm + '님은 퇴직자입니다. 검토자로 추가할 수 없습니다.', 'warn');
      return;
    }

    lookupEmpAndAddAplyRsltRow(target);
  }

  function sameEmpNo(a, b) {
    var aa = String(a || '').trim();
    var bb = String(b || '').trim();
    if (!aa || !bb) return false;
    if (aa === bb) return true;
    return aa.replace(/^0+/, '') === bb.replace(/^0+/, '');
  }

  function lookupEmpAndAddAplyRsltRow(target) {
    var empNm = target.person.empNm;
    var empNo = target.person.empNo;
    var source = target.source;
    var contextKey=ppsVal('rqstNo')+'|'+ppsVal('bizKey');
    var srcText = source.indexOf('\uCC28\uC0C1\uC704') !== -1
      ? getText('#nextReEmpNm') : getText('#mainIvenInfo');

    var buildFallback = function () {
      return {
        empNo: empNo, empNm: empNm, deptNm: '', fgradeNm: '',
        telnoOffc: extractTelnoFromInventor(srcText)
      };
    };

    postJson(EMP_API, { popEmpNm: empNm }, function (res) {
      var list = (res && res.data) ? res.data : [];
      var rec = null;

      if (empNo && list.length) {
        for (var i = 0; i < list.length; i++) {
          if (sameEmpNo(list[i].empNo, empNo)) { rec = list[i]; break; }
        }
        if (!rec) {
          toast(empNm + ' 조회 결과에서 사번 ' + empNo + ' 일치 항목을 찾지 못했습니다. 직접 선택해 주세요.', 'warn');
          return;
        }
      } else if (!empNo && list.length === 1 && String(list[0].empNm || '').trim() === String(empNm).trim()) {
        rec = list[0];
      } else if (!empNo && list.length > 1) {
        toast('동명이인(' + empNm + ') ' + list.length + '명 — [행추가] 후 직접 선택해 주세요.', 'warn');
        return;
      }

      if (!rec) {
        rec = buildFallback();
        if (!rec.empNo) {
          toast(empNm + ' 사번을 자동 확인할 수 없습니다. [행추가] 후 직접 선택해 주세요.', 'warn');
          return;
        }
        console.warn(TAG, 'selectEmpInfo 결과 없음 — 화면 사번으로 출원결과검토 검토자 추가:', rec);
      }
      if(contextKey!==ppsVal('rqstNo')+'|'+ppsVal('bizKey'))return;
      addAplyRsltReviewerRow(rec, source);
    }, function (msg) {
      console.warn(TAG, 'selectEmpInfo 호출 실패(출원결과검토):', msg);
      var rec = buildFallback();
      if (!rec.empNo) {
        toast(empNm + ' 사번 조회에 실패했습니다. [행추가] 후 직접 선택해 주세요.', 'warn');
        return;
      }
      if(contextKey!==ppsVal('rqstNo')+'|'+ppsVal('bizKey'))return;
      addAplyRsltReviewerRow(rec, source);
    });
  }

  function addAplyRsltReviewerRow(rec, source) {
    if (!isAplyRsltCnfEditable()) return;
    var row = {
      ivenEmpNo: String(rec.empNo || '').trim(),
      ivenEmpNm: String(rec.empNm || '').trim(),
      deptNm: rec.deptNm || '',
      fgradeNm: rec.fgradeNm || '',
      telnoOffc: rec.telnoOffc || ''
    };
    if (!row.ivenEmpNo || !row.ivenEmpNm) {
      toast('검토자 사번/성명 정보가 부족하여 자동추가하지 않았습니다.', 'error');
      return;
    }

    var kg = null;
    try { kg = $('#grid1').data('kendoGrid'); } catch (e) {}
    var pageGrid = (typeof window.grid1 !== 'undefined') ? window.grid1 : null;
    if (!kg || !kg.dataSource) {
      toast('출원결과검토 검토자 그리드를 찾지 못했습니다.', 'error');
      return;
    }

    // 사번 기준 중복 방지. 사번이 비정상적으로 비어 있는 기존 행은 이름도 보조 확인.
    var arr = kg.dataSource.data();
    for (var i = 0; i < arr.length; i++) {
      if (sameEmpNo(arr[i].ivenEmpNo, row.ivenEmpNo)
          || (!String(arr[i].ivenEmpNo || '').trim()
              && String(arr[i].ivenEmpNm || '').trim() === row.ivenEmpNm)) {
        toast('이미 추가된 검토자입니다: ' + row.ivenEmpNm + ' (' + row.ivenEmpNo + ')', 'warn');
        return;
      }
    }

    // 1순위: 화면의 kriss.ui.grid.addRow()를 사용해 신규행 상태를 만든 뒤 실제 필드명으로 채운다.
    try {
      if (pageGrid && typeof pageGrid.addRow === 'function') {
        var before = {};
        var beforeData = Array.from(kg.dataSource.data());
        for (var j = 0; j < beforeData.length; j++) {
          if (beforeData[j].uid) before[beforeData[j].uid] = true;
        }

        pageGrid.addRow();

        var d = kg.dataSource.data();
        var item = null;
        for (var k = 0; k < d.length; k++) {
          if (d[k].uid && !before[d[k].uid]) { item = d[k]; break; }
        }
        if (!item) item=Array.from(d).find(function(x){return !beforeData.some(function(b){return b===x || (b.uid && b.uid===x.uid);});}) || null;
        if(!item){toast('새 검토행 생성을 확인하지 못했습니다. 기존 결재선은 유지됩니다.','warn');return;}
        // No first/last/previously blank row fallback.

        if (item) {
          Object.keys(row).forEach(function(k){if(typeof item.set==='function')item.set(k,row[k]);else item[k]=row[k];});item.dirty=true;

          // 원본 [행추가] 핸들러와 동일하게 비어 있는 순번을 현재 행 순서로 보강.
          if(!item.seqNo){var nextSeq=Array.from(d).indexOf(item)+1;if(typeof item.set==='function')item.set('seqNo',nextSeq);else item.seqNo=nextSeq;}

          try { kg.refresh(); }
          catch (e2) {
            try { if (pageGrid.refreshRow) pageGrid.refreshRow(item); } catch (e3) {}
          }

          toast(source + ' ' + row.ivenEmpNm + ' (' + row.ivenEmpNo + ') 검토자 추가 완료', 'ok');
          console.log(TAG, '출원결과검토 검토자 추가(addRow):', row);
          return;
        }
      }
    } catch (e4) {
      console.warn(TAG, '출원결과검토 addRow 경로 실패:', e4.message);
      toast('검토행 처리 오류 — 현재 결재선을 확인하세요.','warn');return;
    }

    // 2순위: Kendo dataSource 직접 추가. 저장 추적을 위해 dirty=true 처리.
    try {
      var it = kg.dataSource.add({
        isChecked: false,
        seqNo: kg.dataSource.data().length + 1,
        ivenEmpNo: row.ivenEmpNo,
        ivenEmpNm: row.ivenEmpNm,
        deptNm: row.deptNm,
        fgradeNm: row.fgradeNm,
        telnoOffc: row.telnoOffc,
        apvlDt: ''
      });
      if (it) it.dirty = true;
      try { kg.refresh(); } catch (e5) {}
      toast(source + ' ' + row.ivenEmpNm + ' (' + row.ivenEmpNo + ') 검토자 추가 완료(폴백)', 'ok');
      console.log(TAG, '출원결과검토 검토자 추가(dataSource.add):', row);
      return;
    } catch (e6) {
      console.warn(TAG, '출원결과검토 dataSource.add 실패:', e6.message);
    }

    toast('검토자 자동추가에 실패했습니다. [행추가] 후 직접 선택해 주세요.', 'error');
  }

  // ============================================================
  // 5. 주발명자 / 차상위검토자 정보 파싱 (다중 형식)
  //
  //    형식 1: "01102-승홍민 (5664, shm@kriss.re.kr)"      → empNo + empNm
  //    형식 2: "01102-승홍민 / 퇴직"                         → empNo + empNm
  //    형식 3: "박춘수 / 지분율 가장 높은 재직 발명자"       → empNm only
  //    형식 4: "오타니 쇼헤이 / 설명"                        → empNm only (외국인)
  //    형식 5: "박춘수(5690)"                                → empNm only
  //    형식 6: "박춘수"                                      → empNm only
  // ============================================================
  function parseInventor(text) {
    if (!text) return null;
    text = text.trim();

    // 형식 1,2: 사번-이름 → "01102-승홍민 (...)" 또는 "01102-승홍민 / ..."
    var m1 = text.match(/^(\d{3,})\s*-\s*(.+?)(?:\s*[\(（\/]|$)/);
    if (m1) {
      return {
        empNo: m1[1].trim(),
        empNm: m1[2].trim(),
        isRetired: /퇴직/.test(text)
      };
    }

    // 형식 3,4: 이름 / 설명 (사번 없음)
    var m2 = text.match(/^(.+?)\s*\/\s*/);
    if (m2 && m2[1].trim()) {
      return {
        empNo: '',
        empNm: m2[1].trim(),
        isRetired: /퇴직/.test(text)
      };
    }

    // 형식 5: 이름(내선) 또는 이름 (내선)
    var m3 = text.match(/^(.+?)\s*[\(（]/);
    if (m3 && m3[1].trim()) {
      return {
        empNo: '',
        empNm: m3[1].trim(),
        isRetired: /퇴직/.test(text)
      };
    }

    // 형식 6: 이름만 (특수기호 없음) — 최소 1자 이상
    if (text.length >= 1) {
      return {
        empNo: '',
        empNm: text,
        isRetired: /퇴직/.test(text)
      };
    }

    console.warn(TAG, '파싱 실패:', text);
    return null;
  }

  // ============================================================
  // 6. 사번 변경 감시 (동명이인 체크)
  // ============================================================
  function watchForChange(expected, idFieldId, badgeId) {
    var idEl = document.getElementById(idFieldId);
    if (!idEl) return;
    var watcherKey = '__krissWatcher_' + idFieldId;
    if (window[watcherKey]) clearInterval(window[watcherKey]);

    var prevVal = idEl.value;
    window[watcherKey] = setInterval(function () {
      var cur = idEl.value;
      if (cur === prevVal) return;
      prevVal = cur;

      var badge = document.getElementById(badgeId);
      if (!badge) return;

      if (cur && cur !== expected.empNo) {
        badge.style.background = '#FFEBEE';
        badge.style.borderColor = '#F44336';
        badge.style.color = '#C62828';
        badge.textContent = '\u26A0 사번 불일치 \u2014 기대: '
          + expected.empNo + ' / 현재: ' + cur + ' (동명이인 확인)';
      } else if (cur === expected.empNo) {
        badge.style.background = '#E8F5E9';
        badge.style.borderColor = '#4CAF50';
        badge.style.color = '#2E7D32';
        badge.textContent = '\u2713 사번 일치 확인 (' + expected.empNo + ')';
      }
    }, 800);
  }

  // 1.11.1: editable mail templates; existing business wording retained.
  var HELPER_MAIL_TEMPLATE_KEY = 'kriss.mail.templates.v1';
  var HELPER_MAIL_FONT = '"Malgun Gothic", "맑은 고딕", sans-serif';

  function helperMailText(selector) {
    var el = selector && document.querySelector(selector);
    return el ? String(('value' in el ? el.value : el.textContent) || '').trim() : '';
  }

  function helperMailEscape(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function helperMailDays(dateText, now) {
    var m = String(dateText || '').trim().match(/^(\d{4})[-./](\d{2})[-./](\d{2})\.?$/);
    if (!m) return null;
    var date = new Date(+m[1], +m[2] - 1, +m[3]);
    if (date.getFullYear() !== +m[1] || date.getMonth() !== +m[2] - 1 || date.getDate() !== +m[3]) return null;
    now = now || new Date();
    return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
      - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
  }

  function helperMailTemplateId(kind, cfg) {
    return kind + ':' + String(cfg.taskNm || '업무요청');
  }

  function helperMailDefaults(kind) {
    if (kind === 'initial') return {
      subject: '[업무요청] {{관리번호}} 확인 및 승인 요청 ({{기한}}까지)',
      body: '{{이름}} 박사님 안녕하세요.\n\n아래 업무요청 건에 대하여 {{기한}}까지 KRISSTAR에서 확인 및 승인 처리를 요청드립니다.\n\n{{상세정보}}\n\n감사합니다.'
    };
    return {
      subject: '[리마인더] {{관리번호접두}}{{업무}} 확인 요청{{기한태그}}',
      body: '{{이름}} 박사님 안녕하세요.\n\n아래 건에 대한 {{업무}} 확인 및 처리를 다시 한번 요청드립니다.\n{{기한안내}}\n\n{{상세정보}}\n\n감사합니다.'
    };
  }

  function helperMailVariables(cfg, target, now) {
    var no = helperMailText(cfg.mngNo), invention = helperMailText(cfg.ivenNm);
    var subject = helperMailText(cfg.subj), due = helperMailText(cfg.dueDt);
    var application = helperMailText(cfg.rqstNo);
    var label = cfg.dueLabel || '완료희망일', days = helperMailDays(due, now);
    var tag = '', note = '', details = [];
    if (due && days !== null) {
      if (days > 0) {
        tag = ' (' + label + ' ' + days + '일 경과)';
        note = label + '이(가) ' + days + '일 지났습니다. (' + due + ')';
      } else if (days === 0) {
        tag = ' (' + label + ' 오늘 마감)';
        note = '오늘이 ' + label + '입니다. (' + due + ')';
      } else {
        tag = ' (' + label + ' D' + days + ')';
        note = label + '까지 ' + (-days) + '일 남았습니다. (' + due + ')';
      }
    }
    if (no) details.push('- 관리번호: ' + no);
    if (invention) details.push('- 발명의 명칭: ' + invention);
    if (subject) details.push('- 제목: ' + subject);
    if (application) details.push('- 신청번호: ' + application);
    if (due) details.push('- ' + label + ': ' + due);
    return {
      '이름': String(target.person.empNm || ''), '업무': String(cfg.taskNm || '업무요청'),
      '관리번호': no, '관리번호접두': no ? no + ' ' : '', '발명명': invention,
      '요청제목': subject, '신청번호': application, '기한': due, '기한명': label,
      '기한태그': tag, '기한안내': note, '상세정보': details.join('\n')
    };
  }

  function helperMailRender(template, variables) {
    function expand(text) {
      return String(text).replace(/\{\{([^{}]+)\}\}/g, function (_, key) {
        key = key.trim();
        if (!Object.prototype.hasOwnProperty.call(variables, key)) throw new Error('지원하지 않는 항목: {{' + key + '}}');
        return variables[key];
      }).replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim();
    }
    var subject = expand(template.subject).replace(/[\r\n]+/g, ' ').trim();
    var plain = expand(template.body);
    if (!subject || !plain) throw new Error('제목과 본문을 입력해 주세요.');
    if (/\{\{|\}\}/.test(subject + plain)) throw new Error('채워지지 않은 {{항목}}을 확인해 주세요.');
    var parts = plain.split(/\n\s*\n/), paragraphs = [];
    for (var i = 0; i < parts.length; i++) paragraphs.push('<p>' + helperMailEscape(parts[i]).replace(/\n/g, '<br>') + '</p>');
    return { subject: subject, plain: plain,
      body: '<div style="font-family:' + helperMailEscape(HELPER_MAIL_FONT) + ';line-height:1.6">' + paragraphs.join('') + '</div>' };
  }

  function helperMailLoadTemplate(id, kind) {
    var raw = localStorage.getItem(HELPER_MAIL_TEMPLATE_KEY), data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('저장된 문구 형식을 확인해 주세요.');
    var t = Object.prototype.hasOwnProperty.call(data, id) ? data[id] : null;
    if (t && (typeof t.subject !== 'string' || typeof t.body !== 'string')) throw new Error('저장된 문구를 읽을 수 없습니다.');
    return t ? { subject: t.subject, body: t.body } : helperMailDefaults(kind);
  }

  function helperMailSaveTemplate(id, template) {
    var raw = localStorage.getItem(HELPER_MAIL_TEMPLATE_KEY), data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('기존 문구를 읽을 수 없어 저장하지 않았습니다.');
    // Copy only the template schema; do not retain inherited Prototype serializers.
    var clean = Object.create(null);
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var t = data[keys[i]];
      if (t && typeof t.subject === 'string' && typeof t.body === 'string') {
        var item = Object.create(null); item.subject = t.subject; item.body = t.body; clean[keys[i]] = item;
      }
    }
    var item = Object.create(null); item.subject = template.subject; item.body = template.body; clean[id] = item;
    var json = JSON.stringify(clean);
    localStorage.setItem(HELPER_MAIL_TEMPLATE_KEY, json);
    if (localStorage.getItem(HELPER_MAIL_TEMPLATE_KEY) !== json) throw new Error('문구 저장을 확인하지 못했습니다.');
  }

  function helperMailOpenTemplate(kind, cfg, target, onDraft) {
    var old = document.getElementById('krissMailTemplate');
    if (old) { old.focus(); return; }
    var id = helperMailTemplateId(kind, cfg), variables = helperMailVariables(cfg, target), template;
    try { template = helperMailLoadTemplate(id, kind); }
    catch (e) { toast(e.message, 'error'); return; }
    var previousFocus = document.activeElement, overlay = document.createElement('div');
    overlay.id = 'krissMailTemplate'; overlay.tabIndex = -1;
    overlay.setAttribute(MARK, '1'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'krissMailTemplateHeading');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#18334277;display:flex;align-items:center;justify-content:center;padding:20px;font:14px/1.6 ' + HELPER_MAIL_FONT;
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#183342;border-radius:12px;padding:24px;width:1040px;max-width:100%;max-height:92vh;overflow:auto;box-shadow:0 15px 70px #142c4a33;box-sizing:border-box';
    box.innerHTML = '<h2 id="krissMailTemplateHeading" style="margin:0 0 8px;font-size:21px">리마인더 문구 편집</h2>'
      + '<p data-part="recipient" style="margin:0 0 16px"></p>'
      + '<p style="margin:0 0 16px;color:#59707f">{{이름}}, {{업무}}, {{기한}}, {{상세정보}}를 사용하면 현재 건의 정보가 들어갑니다. 저장하지 않고 이번 메일에만 적용할 수도 있습니다.</p>'
      + '<div style="display:flex;flex-wrap:wrap;gap:24px"><div style="flex:1 1 340px;min-width:0">'
      + '<label for="krissMailTemplateSubject">제목 문구</label><input id="krissMailTemplateSubject" type="text" style="box-sizing:border-box;width:100%;padding:10px;border:1px solid #c3d1da;border-radius:6px;font:inherit;margin:6px 0 14px">'
      + '<label for="krissMailTemplateBody">본문 문구</label><textarea id="krissMailTemplateBody" style="box-sizing:border-box;width:100%;height:320px;padding:12px;border:1px solid #c3d1da;border-radius:6px;font:inherit;resize:vertical;margin:6px 0"></textarea>'
      + '<details><summary>사용할 수 있는 항목</summary><p data-part="tokens"></p></details></div>'
      + '<div style="flex:1 1 340px;min-width:0;background:#f5f8fa;border:1px solid #e0e8ed;border-radius:8px;padding:18px;box-sizing:border-box">'
      + '<strong>미리보기</strong><h3 data-part="previewSubject" style="font-size:16px;overflow-wrap:anywhere"></h3><div data-part="previewBody" style="overflow-wrap:anywhere"></div></div></div>'
      + '<p data-part="status" role="status" style="min-height:24px;color:#915b11"></p>'
      + '<div data-part="buttons" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end"></div>';
    overlay.appendChild(box); document.body.appendChild(overlay);
    var q = function (part) { return box.querySelector('[data-part="' + part + '"]'); };
    box.querySelector('h2').textContent = kind === 'initial' ? '최초 안내 문구 편집' : '리마인더 문구 편집';
    q('recipient').textContent = target.source + ' · ' + variables['이름'] + ' · ' + variables['업무'];
    var names = Object.keys(variables), tokens = [];
    for (var n = 0; n < names.length; n++) tokens.push('{{' + names[n] + '}}');
    q('tokens').textContent = tokens.join(' · ');
    var subject = box.querySelector('input'), body = box.querySelector('textarea');
    subject.value = template.subject; body.value = template.body;
    var launch, rendered = null;
    function current() { return { subject: subject.value, body: body.value }; }
    function refresh() {
      try {
        rendered = helperMailRender(current(), variables);
        q('previewSubject').textContent = rendered.subject;
        q('previewBody').innerHTML = rendered.body;
        q('status').textContent = ''; if (launch) launch.disabled = false;
      } catch (e) {
        rendered = null; q('status').textContent = e.message;
        q('previewSubject').textContent = ''; q('previewBody').textContent = ''; if (launch) launch.disabled = true;
      }
    }
    function close() {
      document.removeEventListener('keydown', keys, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }
    function button(label, action, primary) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = label;
      btn.style.cssText = 'padding:9px 14px;border-radius:6px;border:1px solid #bacbd6;cursor:pointer;font:inherit;background:' + (primary ? '#176db5;color:#fff' : '#fff;color:#24465b');
      btn.addEventListener('click', action); q('buttons').appendChild(btn); return btn;
    }
    button('닫기', close);
    button('기본 문구 불러오기', function () {
      var base = helperMailDefaults(kind); subject.value = base.subject; body.value = base.body; refresh();
      q('status').textContent = '기본 문구를 불러왔습니다. 저장한 문구는 아직 변경되지 않았습니다.';
    });
    button('이 문구 저장', function () {
      refresh(); if (!rendered) return;
      try { helperMailSaveTemplate(id, current()); q('status').textContent = '이 업무의 문구를 저장했습니다. 다음에도 같은 문구를 사용합니다.'; }
      catch (e) { q('status').textContent = '저장하지 못했습니다: ' + e.message; }
    });
    launch = button('메일 작성 화면 열기', function () {
      refresh(); if (!rendered) return;
      var data = { empNm: target.person.empNm, empNo: target.person.empNo, source: target.source,
        subject: rendered.subject, body: rendered.body, ts: Date.now() };
      // Callback must synchronously open a draft or report failure. It never sends mail.
      try { if (onDraft(data) !== false) close(); }
      catch (e) { q('status').textContent = '작성 화면을 열지 못했습니다: ' + e.message; }
    }, true);
    function keys(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') {
        var nodes = box.querySelectorAll('button:not(:disabled),input,textarea,summary');
        var first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === overlay)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    subject.addEventListener('input', refresh); body.addEventListener('input', refresh);
    document.addEventListener('keydown', keys, true); refresh(); subject.focus();
  }


  // ============================================================
  // 7. GW 메일 연계 발송 (최초 안내)
  // ============================================================

  function sendMailToInventor() {
    var target = resolveTarget();
    if (!target) return;

    var empNo = target.person.empNo;
    var empNm = target.person.empNm;

    if (target.person.isRetired) {
      toast(empNm + '님은 퇴직자입니다. 메일을 발송할 수 없습니다.', 'warn');
      return;
    }

    if (!empNo) {
      // [v1.6.0] 사번 없는 대상자는 조회로 보강 후 재시도
      resolveEmpNo(empNm, function (rec, note) {
        if (rec && rec.empNo) {
          target.person.empNo = String(rec.empNo).trim();
          console.log(TAG, '메일 대상 사번 보강:', empNm, target.person.empNo, '[' + note + ']');
          sendMailWith(target);
        } else {
          toast(empNm + ' \u2014 사번 미확인. 메일 대상자를 확정할 수 없습니다.', 'warn');
        }
      });
      return;
    }
    sendMailWith(target);
  }

  function sendMailWith(target) {
    var cfg = { taskNm: '업무요청', mngNo: '#intellMngNo', ivenNm: '#ivenNm',
      subj: '#rqstSbjt', dueDt: '#cmplNeedDt', dueLabel: '완료희망일', rqstNo: '#rqstNoSpan' };
    if (!helperMailText(cfg.dueDt)) { toast('완료희망일 정보를 찾을 수 없습니다.', 'error'); return; }
    helperMailOpenTemplate('initial', cfg, target, helperMailOpenDraft);
  }

  // ============================================================
  // 7-B. 리마인더 메일 (v1.5.0) — 페이지별 공통
  //   수신자: resolveTarget() = 주발명자(재직) / 차상위검토자(주발명자 퇴직 시)
  // ============================================================

  // 완료희망일(YYYY-MM-DD) → 오늘 기준 일수 (양수=경과, 0=오늘, 음수=남음). 파싱 불가 시 null
  function daysFromToday(dateStr) {
    var m = (dateStr || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var target = new Date(+m[1], +m[2] - 1, +m[3]);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - target) / 86400000);
  }

  function sendReminder(cfg) {
    var target = resolveTarget();   // 주발명자(퇴직 시 차상위검토자)
    if (!target) return;

    if (target.person.isRetired) {
      toast(target.person.empNm + '님은 퇴직자입니다. 리마인더를 발송할 수 없습니다.', 'warn');
      return;
    }
    if (!target.person.empNo) {
      // [v1.6.0] 사번 보강 후 재시도
      resolveEmpNo(target.person.empNm, function (rec, note) {
        if (rec && rec.empNo) {
          target.person.empNo = String(rec.empNo).trim();
          console.log(TAG, '리마인더 대상 사번 보강:', target.person.empNm, target.person.empNo, '[' + note + ']');
          sendReminderWith(cfg, target);
        } else {
          toast(target.person.empNm + ' \u2014 사번 미확인. 메일 대상자를 확정할 수 없습니다.', 'warn');
        }
      });
      return;
    }
    sendReminderWith(cfg, target);
  }

  function sendReminderWith(cfg, target) {
    helperMailOpenTemplate('reminder', cfg, target, helperMailOpenDraft);
  }

  // 리마인더 버튼 — 각 페이지의 .titlegroup3 .ft_right 에 축소 스타일로 1개 추가
  function addReminderButton(cfg) {
    var area = document.querySelector('.titlegroup3 .ft_right');
    if (!area) area = document.querySelector('.titlegroup3');   // ft_right 없으면 타이틀 영역에
    if (!area || document.getElementById('krissReminderBtn')) return;
    mkBtn(area, '\uB9AC\uB9C8\uC778\uB354', '#9C27B0', '#7B1FA2', function () {   // '리마인더'
      sendReminder(cfg);
    }, 'krissReminderBtn');
    console.log(TAG, '리마인더 버튼 추가:', cfg.taskNm);
  }

  // ============================================================
  // 8. 인장 날인 신청 연계
  // ============================================================

  function openStampRequest() {
    var mngNo = getText('#intellMngNo');
    var plfNm = getText('#plfMgmtNm');

    if (!mngNo) {
      toast('관리번호를 찾을 수 없습니다.', 'error');
      return;
    }
    if (!plfNm) {
      toast('특허사무소 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    var stampData = {
      rcvr: plfNm,
      stmpPurp: '2',
      qy: 1,
      rmk: '특허출원 관련 위임장 날인(' + mngNo + ')',
      mngNo: mngNo,
      ts: Date.now()
    };

    setCrossCookie(STAMP_COOKIE_KEY, stampData);

    // fnShowNewBpmPopup — KRISSTAR BPM 페이지 표준 호출 방식
    var stampUrl = '/mis/gea/stmp/stmpRqst/S_GEA_01200100_P01.do?popupAt=popup';
    try {
      fnShowNewBpmPopup(stampUrl);
    } catch (e) {
      console.warn(TAG, 'fnShowNewBpmPopup 실패:', e.message);
      try {
        $.postWindow(stampUrl, {
          width: 1024, height: 900,
          modalDialog: false, center: 'screen',
          scrollbars: true, resizable: true
        });
      } catch (e2) {
        window.open(stampUrl, '_blank');
      }
    }

    toast('인장 날인 신청 페이지를 열고 있습니다. (' + mngNo + ')', 'info');
  }

  function initStampPage() {
    var data = readAndClearCookie(STAMP_COOKIE_KEY);
    if (!data) return;

    console.log(TAG, '인장 날인 자동채움 시작:', data.mngNo);

    var attempts = 0;
    var fillTimer = setInterval(function () {
      attempts++;
      if (attempts > 60) {
        clearInterval(fillTimer);
        console.warn(TAG, '인장 날인 자동채움 타임아웃');
        return;
      }

      if (typeof $ === 'undefined' || typeof kendo === 'undefined') return;
      var purpWidget = $('#stmpPurp').data('kendoDropDownList');
      if (!purpWidget) return;

      var rcvrEl = document.getElementById('rcvr');
      var rmkEl = document.getElementById('rmk');
      if (!rcvrEl || !rmkEl) return;

      clearInterval(fillTimer);

      // 수신
      rcvrEl.value = data.rcvr;

      // 용도 (Kendo DropDownList)
      purpWidget.value(data.stmpPurp);

      // 부수 (Kendo NumericTextBox)
      try {
        var qyWidget = $('#qy').data('kendoNumericTextBox');
        if (qyWidget && data.qy) {
          qyWidget.value(data.qy);
        }
      } catch (e) {
        console.warn(TAG, '부수 설정 실패:', e.message);
      }

      // 적요
      rmkEl.value = data.rmk;

      console.log(TAG, '인장 날인 자동채움 완료');
      showStampBanner(data);

    }, 500);
  }

  function showStampBanner(data) {
    var existing = document.getElementById('krissStampBanner');
    if (existing) existing.remove();

    var banner = document.createElement('div');
    banner.id = 'krissStampBanner';
    banner.setAttribute(MARK, '1');
    banner.style.cssText = 'background:#FFF3E0;border-bottom:2px solid #FF9800;'
      + 'padding:8px 16px;font-size:12px;color:#E65100;'
      + 'font-family:Malgun Gothic,Dotum,sans-serif;margin-bottom:8px;'
      + 'display:flex;align-items:center;justify-content:space-between;';

    var info = document.createElement('span');
    info.innerHTML = '<b>[KRISS-HELPER]</b> '
      + '<b>' + data.mngNo + '</b> 기준 날인 신청 자동 작성됨'
      + ' &nbsp;|&nbsp; 수신: ' + data.rcvr
      + ' &nbsp;|&nbsp; <b>위임장 파일을 첨부해 주세요.</b>';

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00D7';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;'
      + 'color:#E65100;cursor:pointer;padding:0 4px;';
    closeBtn.addEventListener('click', function () { banner.remove(); });

    banner.appendChild(info);
    banner.appendChild(closeBtn);

    var titleEl = document.querySelector('.titlegroup3');
    if (titleEl) {
      titleEl.parentNode.insertBefore(banner, titleEl.nextSibling);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }

  // ============================================================
  // 7-C. GW 편지쓰기 자동채움 (최초 안내 · 리마인더 공용)
  // ============================================================
  // 1.11.1 — native autoSuggest.js: searchaddress -> insertItem -> addedItem -> list.recipients.
  var HELPER_MAIL_PREFIX = 'krissMailV2_';
  var HELPER_MAIL_TTL = 180;

  function helperMailEmit(node, type) {
    var event = document.createEvent('Event'); event.initEvent(type, true, false); node.dispatchEvent(event);
  }

  function helperMailId() {
    var bytes = new Uint8Array(12); window.crypto.getRandomValues(bytes);
    var out = ''; for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }
  function helperMailCookieName(id, part) { return HELPER_MAIL_PREFIX + id + '_' + part; }
  function helperMailSetCookie(name, value, ttl) {
    document.cookie = name + '=' + value + '; domain=.kriss.re.kr; path=/; max-age=' + ttl + '; SameSite=Lax; Secure';
  }
  function helperMailClearTransfer(id) {
    for (var i = 0; i < 3; i++) helperMailSetCookie(helperMailCookieName(id, i), '', 0);
  }
  function helperMailPrepareTransfer(data) {
    var clean = Object.create(null), fields = ['empNo', 'empNm', 'source', 'subject', 'body'];
    for (var i = 0; i < fields.length; i++) clean[fields[i]] = String(data[fields[i]] || '');
    clean.ts = Date.now(); clean.id = helperMailId();
    // UTF-8/base64 avoids percent-encoding every Korean byte. Bound total helper cookies.
    var bytes = new TextEncoder().encode(JSON.stringify(clean)), binary = '';
    for (var b = 0; b < bytes.length; b++) binary += String.fromCharCode(bytes[b]);
    var value = btoa(binary);
    if (value.length > 6000) throw new Error('메일 내용이 자동 전달 한도를 넘었습니다. 문구를 줄여 열고, 긴 내용은 메일 작성창에서 추가해 주세요.');
    var active = document.cookie.split(';'), used = 0;
    for (var k = 0; k < active.length; k++) if (active[k].trim().indexOf(HELPER_MAIL_PREFIX) === 0) used += active[k].length;
    if (used + value.length > 6500) throw new Error('앞서 연 메일 작성창에 내용이 전달된 뒤 다시 시도해 주세요.');
    var count = Math.ceil(value.length / 3000), id = clean.id;
    try {
      for (var part = 0; part < count; part++) {
        var chunk = value.slice(part * 3000, (part + 1) * 3000);
        helperMailSetCookie(helperMailCookieName(id, part + 1), chunk, HELPER_MAIL_TTL);
        if (getCookie(helperMailCookieName(id, part + 1)) !== chunk) throw new Error('메일 내용 전달용 쿠키를 저장하지 못했습니다.');
      }
      var manifest = count + '.' + value.length;
      helperMailSetCookie(helperMailCookieName(id, 0), manifest, HELPER_MAIL_TTL);
      if (getCookie(helperMailCookieName(id, 0)) !== manifest) throw new Error('메일 내용 전달을 확인하지 못했습니다.');
      return id;
    } catch (e) { helperMailClearTransfer(id); throw e; }
  }
  function helperMailReadTransfer(id) {
    var manifest = getCookie(helperMailCookieName(id, 0)), m = /^(1|2)\.(\d{1,4})$/.exec(manifest || '');
    if (!m) throw new Error('메일 작성 정보가 없거나 만료됐습니다. 원래 업무 화면에서 리마인더를 다시 열어 주세요.');
    var value = '';
    for (var i = 1; i <= +m[1]; i++) {
      var chunk = getCookie(helperMailCookieName(id, i));
      if (!chunk) throw new Error('메일 작성 정보의 일부가 전달되지 않았습니다. 리마인더를 다시 열어 주세요.');
      value += chunk;
    }
    if (value.length !== +m[2] || value.length > 6000) throw new Error('메일 작성 정보 길이가 맞지 않습니다.');
    var binary = atob(value), bytes = new Uint8Array(binary.length);
    for (var b = 0; b < binary.length; b++) bytes[b] = binary.charCodeAt(b);
    var data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || data.id !== id || typeof data.ts !== 'number' || Date.now() - data.ts > HELPER_MAIL_TTL * 1000 || data.ts > Date.now() + 30000) throw new Error('메일 작성 정보가 만료됐습니다.');
    var fields = ['empNo', 'empNm', 'source', 'subject', 'body'];
    for (var f = 0; f < fields.length; f++) if (typeof data[fields[f]] !== 'string') throw new Error('메일 작성 정보 형식이 맞지 않습니다.');
    if (!data.empNm || !data.subject || !data.body) throw new Error('수신자 이름·제목·본문을 확인해 주세요.');
    return data;
  }
  function helperMailOpenDraft(data) {
    var id = helperMailPrepareTransfer(data);
    try {
      // The fragment binds this data to one popup/modal, without exposing the body in its URL.
      window.open('https://gw.kriss.re.kr/wma/msgm.do?acton=compose&popup=true&path=INBOX#kriss-helper-mail=' + id, '_blank');
      // Popup managers can return null even when they create a modal. Keep the short-lived payload.
      toast('메일 작성창으로 연결했습니다. 창이 나타나지 않으면 팝업 허용 상태를 확인해 주세요.', 'info');
      return true;
    } catch (e) { helperMailClearTransfer(id); throw e; }
  }

  function helperMailNativeReady() {
    return typeof window.insertItem === 'function' && typeof window.USER !== 'undefined' && typeof window.TO !== 'undefined'
      && window.to_tokenInput && typeof window.to_tokenInput.tokenInput === 'function'
      && window.list && window.list.recipients && window.list.text
      && document.getElementById('hwto') && document.getElementById('token-input-asto');
  }
  function helperMailRecipientStamp() {
    var out = [], list = window.list && window.list.recipients;
    if (list) for (var i = 0; i < list.length; i++) {
      var r = list[i]; out.push(String(r.id) + ':' + String(r.objectType) + ':' + String(r.recipientType) + ':' + String(r.name));
    }
    var entry = document.getElementById('token-input-asto'), hidden = document.getElementById('hwto');
    return out.join('|') + '\n' + (entry ? entry.value : '') + '\n' + (hidden ? hidden.value : '');
  }
  function helperMailRecord(item) {
    var recipients = window.list && window.list.recipients;
    if (recipients) for (var i = 0; i < recipients.length; i++) {
      var r = recipients[i];
      if (String(r.id) === String(item.id) && String(r.objectType) === String(window.USER) && String(r.recipientType) === String(window.TO)) return r;
    }
    return null;
  }
  function helperMailCommitted(item) {
    if (!helperMailNativeReady() || !helperMailRecord(item)) return false;
    var entry = document.getElementById('token-input-asto'), listEl = entry.closest('ul');
    var text = String(window.list.text[window.TO] || '');
    var chips = listEl ? listEl.querySelectorAll('li.token-input-token-facebook p') : [], found = false;
    for (var i = 0; i < chips.length; i++) if (chips[i].textContent.trim() === item.name.trim()) found = true;
    return !!text.trim() && document.getElementById('hwto').value === text && found;
  }
  function helperMailFindCandidates(rows, data) {
    if (!Array.isArray(rows)) throw new Error('주소검색 응답 형식을 확인할 수 없습니다.');
    var exact = [], other = [], seen = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || typeof r !== 'object' || String(r.type) !== String(window.USER) || String(r.name || '').trim() !== data.empNm.trim()) continue;
      if (typeof r.id !== 'string' || !r.id.trim() || seen[r.id]) continue;
      seen[r.id] = true;
      var item = { id: r.id, name: r.name, type: window.USER, email: typeof r.email === 'string' ? r.email : '',
        eng_name: typeof r.eng_name === 'string' ? r.eng_name : '', dept_name: typeof r.dept_name === 'string' ? r.dept_name : '',
        emp_code: r.emp_code == null ? '' : String(r.emp_code), linkage: typeof r.linkage === 'string' ? r.linkage : '' };
      if (data.empNo && item.emp_code && sameEmpNo(data.empNo, item.emp_code)) exact.push(item);
      else if (!item.emp_code || !data.empNo) other.push(item);
      // A returned employee number that contradicts the source person is not a selectable match.
    }
    return { exact: exact, unverified: other };
  }
  function helperMailAddressSearch(term, done) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/wma/wma.do?acton=searchaddress', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    xhr.timeout = 15000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) { done(new Error('주소검색 응답 오류 (' + xhr.status + ')')); return; }
      try {
        if (xhr.responseText.length > 1000000) throw new Error('주소검색 응답이 너무 큽니다.');
        var rows = JSON.parse(xhr.responseText); if (!Array.isArray(rows)) throw new Error('주소검색 응답 형식을 확인할 수 없습니다.');
        done(null, rows);
      } catch (e) { done(e); }
    };
    xhr.onerror = function () { done(new Error('주소검색에 연결하지 못했습니다.')); };
    xhr.ontimeout = function () { done(new Error('주소검색 응답이 지연됩니다.')); };
    xhr.send('term=' + encodeURIComponent(term)); return xhr;
  }

  function helperMailBanner(data) {
    var old = document.getElementById('krissMailBanner');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var panel = document.createElement('section'); panel.id = 'krissMailBanner'; panel.setAttribute(MARK, '1');
    panel.style.cssText = 'padding:10px 16px;background:#eef6fc;border-bottom:1px solid #bdd9ee;color:#194d73;font:13px/1.6 ' + HELPER_MAIL_FONT;
    var heading = document.createElement('strong');
    heading.textContent = 'KRISS Helper · ' + (data ? data.empNm + ' · ' + data.source : '리마인더'); panel.appendChild(heading);
    var body = document.createElement('div'), recipient = document.createElement('div'), options = document.createElement('div');
    body.setAttribute('role', 'status'); recipient.setAttribute('role', 'status');
    panel.appendChild(body); panel.appendChild(recipient); panel.appendChild(options);
    var anchor = document.querySelector('.btn_area');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else document.body.insertBefore(panel, document.body.firstChild);
    return { panel: panel, body: body, recipient: recipient, options: options };
  }
  function helperMailAction(parent, title, handler) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = title;
    b.style.cssText = 'font:inherit;background:#fff;color:#195780;border:1px solid #a9c6da;padding:3px 9px;border-radius:4px;margin:5px 8px 0 0;cursor:pointer';
    b.addEventListener('click', handler); parent.appendChild(b); return b;
  }
  function helperMailFillRecipient(data, ui) {
    var attempts = 0, xhr = null, generation = 0, selected = null, stop = false, retry;
    function status(text) { ui.recipient.textContent = '받는이: ' + text; }
    function clearOptions() { while (ui.options.firstChild) ui.options.removeChild(ui.options.firstChild); }
    function allowRetry(text) {
      status(text); clearOptions();
      retry = helperMailAction(ui.options, '받는이 다시 확인', function () { begin(); });
    }
    function register(item, baseline) {
      if (stop) return;
      if (baseline !== helperMailRecipientStamp()) { allowRetry('작성 중에 받는이가 변경되어 자동 등록을 멈췄습니다.'); return; }
      if (helperMailCommitted(item)) { complete(item); return; }
      if (helperMailRecord(item)) { allowRetry('수신자 정보와 화면 표시가 일치하지 않습니다. 받는이를 확인해 주세요.'); return; }
      clearOptions(); status('주소록 수신자를 등록하는 중…');
      var created = false;
      try { window.insertItem(item, window.TO); created = true; }
      catch (e) {
        if (typeof window.removeItem === 'function') try { window.removeItem(item, window.TO); } catch (ignore) {}
        allowRetry('기본 주소록 등록 중 오류가 발생했습니다.'); return;
      }
      var n = 0;
      function verify() {
        if (stop) return;
        if (helperMailCommitted(item)) { complete(item); return; }
        if (++n < 10) { setTimeout(verify, 100); return; }
        // Clean up only the specific item this attempt inserted, using the native delete path.
        if (created && typeof window.removeItem === 'function') try { window.removeItem(item, window.TO); } catch (e) {}
        allowRetry('실제 수신자 목록에 등록됐는지 확인하지 못했습니다.');
      }
      verify();
    }
    function complete(item) {
      selected = item; clearOptions();
      status(item.name + (item.email ? ' <' + item.email + '>' : '') + ' · 등록 확인됨');
      var entry = document.getElementById('token-input-asto'), root = entry && entry.closest('ul');
      if (root) {
        var observer = new MutationObserver(function () {
          if (!helperMailCommitted(selected)) {
            observer.disconnect(); selected = null;
            allowRetry('받는이가 변경되었습니다. 자동으로 다시 추가하지 않습니다.');
          }
        });
        observer.observe(root, { childList: true, subtree: true });
        window.addEventListener('pagehide', function () { observer.disconnect(); }, { once: true });
      }
      var hidden = document.getElementById('hwto');
      if (hidden) { helperMailEmit(hidden, 'input'); helperMailEmit(hidden, 'change'); }
      window.isChanged = true;
    }
    function choose(candidates, baseline) {
      clearOptions(); status('이름은 일치하지만 사번을 확정할 수 없습니다. 소속과 주소를 확인해 선택해 주세요.');
      for (var i = 0; i < candidates.length; i++) (function (item) {
        var row = document.createElement('div'), label = document.createElement('span');
        label.textContent = item.name + ' · ' + (item.dept_name || '소속 정보 없음') + ' · ' + (item.email || '메일 주소 정보 없음') + (item.emp_code ? ' · 사번 ' + item.emp_code : '');
        row.appendChild(label);
        helperMailAction(row, '이 사람을 받는이로 등록', function () { register(item, baseline); }); ui.options.appendChild(row);
      })(candidates[i]);
      helperMailAction(ui.options, '주소 다시 조회', begin);
    }
    function begin() {
      if (stop) return;
      if (!helperMailNativeReady()) { allowRetry('기본 주소록이 아직 준비되지 않았습니다.'); return; }
      if (xhr) xhr.abort(); var seq = ++generation, baseline = helperMailRecipientStamp(), firstCandidates = [];
      var entry = document.getElementById('token-input-asto');
      if (entry.value.trim()) { allowRetry('입력 중인 이름이 있습니다. 해당 입력을 확정하거나 지운 뒤 다시 확인해 주세요.'); return; }
      clearOptions(); status('주소록에서 이름과 사번을 확인하는 중…');
      function query(term, second) {
        xhr = helperMailAddressSearch(term, function (error, rows) {
          if (stop || seq !== generation) return;
          if (error) { allowRetry(error.message); return; }
          if (baseline !== helperMailRecipientStamp()) { allowRetry('조회 중에 받는이가 변경되어 자동 등록을 멈췄습니다.'); return; }
          var matches;
          try { matches = helperMailFindCandidates(rows, data); }
          catch (e) { allowRetry(e.message); return; }
          if (matches.exact.length === 1) { register(matches.exact[0], baseline); return; }
          if (matches.exact.length > 1) { choose(matches.exact, baseline); return; }
          if (!second && data.empNo && term !== data.empNo) {
            firstCandidates = matches.unverified;
            query(data.empNo, true); return;
          }
          if (matches.unverified.length) { choose(matches.unverified, baseline); return; }
          if (firstCandidates.length) { choose(firstCandidates, baseline); return; }
          allowRetry('이름과 사번이 일치하는 주소록 수신자를 찾지 못했습니다. 기본 받는이 검색에서 확인해 주세요.');
        });
      }
      query(data.empNm, false);
    }
    var waiting = setInterval(function () {
      if (stop) { clearInterval(waiting); return; }
      if (helperMailNativeReady()) { clearInterval(waiting); begin(); }
      else if (++attempts >= 120) { clearInterval(waiting); allowRetry('기본 주소록 준비가 지연됩니다.'); }
    }, 250);
    status('기본 주소록이 준비되기를 기다리는 중…');
    window.addEventListener('pagehide', function () { stop = true; clearInterval(waiting); if (xhr) xhr.abort(); }, { once: true });
  }

  function initComposePage() {
    var match = /(?:^#|&)kriss-helper-mail=([a-f0-9]{24})(?:&|$)/.exec(location.hash);
    if (!match || window.__krissMailComposeStarted) return;
    window.__krissMailComposeStarted = true;
    var id = match[1], data, ui, readyAttempts = 0, applying = false, bodyDone = false;
    function beginWhenBodyReady() {
      if (!document.body) { setTimeout(beginWhenBodyReady, 50); return; }
      try { data = helperMailReadTransfer(id); }
      catch (e) { ui = helperMailBanner(null); ui.body.textContent = e.message; return; }
      ui = helperMailBanner(data); helperMailClearTransfer(id);
      helperMailFillRecipient(data, ui);
      ui.body.textContent = '제목·본문: 편집기가 준비되기를 기다리는 중…';
      var timer = setInterval(function () {
        if (++readyAttempts > 120) {
          clearInterval(timer); ui.body.textContent = '제목·본문: 편집기 준비가 지연됩니다.';
          helperMailAction(ui.panel, '제목·본문 다시 채우기', function () { fillBody(true); }); return;
        }
        if (fillBody(false)) clearInterval(timer);
      }, 250);
      window.addEventListener('pagehide', function () { clearInterval(timer); }, { once: true });
    }
    function fillBody(manual) {
      if (bodyDone || applying) return true;
      var ed = window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.DataFCKeditor;
      var subject = document.getElementById('subject');
      if (!ed || ed.status !== 'ready' || ed.mode === 'source' || !subject) {
        if (manual) ui.body.textContent = '제목·본문: 편집기가 아직 준비되지 않았습니다.';
        return false;
      }
      var existing;
      try { existing = ed.getData() || ''; } catch (e) { ui.body.textContent = '제목·본문: 편집기 내용을 읽지 못했습니다.'; return false; }
      var keptSubject = !!subject.value.trim();
      if (!keptSubject) {
        subject.value = data.subject;
        helperMailEmit(subject, 'input'); helperMailEmit(subject, 'change');
      }
      applying = true;
      try {
        ed.setData(data.body + '<br>' + existing, function () {
          bodyDone = true; applying = false; window.isChanged = true;
          if (typeof ed.fire === 'function') ed.fire('change');
          ui.body.textContent = '제목·본문: 채움 완료' + (keptSubject ? ' · 기존 제목 유지' : '') + ' · 기존 본문과 서명 유지';
        });
      } catch (e) {
        applying = false; ui.body.textContent = '제목·본문: 편집기에 내용을 넣지 못했습니다.';
        helperMailAction(ui.panel, '제목·본문 다시 채우기', function () { fillBody(true); });
      }
      return true;
    }
    beginWhenBodyReady();
  }


  // ============================================================
  // 9. [v1.6.0] 선행기술조사 요청 팝업 (S_PMS_03011010)
  //     완료희망일자 = 오늘 + PPS_CFG.DUE_DAYS (주말이면 다음 월요일)
  // ============================================================
  // ============================================================
  // 8-9. [v1.8.6] 비용청구서 검토(B_RES00015) — 세금계산서 발행 문구 자동 삽입
  //   조건: processCode=B_RES00015 · statusCode=ST0301(담당자확인 단계) ·
  //         특허사무소 전달사항(#plfDlivMatt)이 화면에 보이고 편집 가능할 것.
  //   동작: 기존 입력값 끝에 문구를 덧붙인다(이미 있으면 넣지 않음). 입력칸 채움만 수행하며
  //         저장·승인 버튼은 건드리지 않는다. 삽입 후 자유롭게 수정 가능.
  //   근거: 화면 소스 rqstValidation() — ST0301 에서 전달사항이 필수값.
  // ============================================================
  var EXP_CFG = {
    AUTO_TAX_PHRASE: true,       // false = 자동 삽입 끄기(문구함에서 수동 선택은 계속 가능)
    PROCESS: 'B_RES00015',
    // [v1.8.8] 단계 조건 기본 해제. 'ST0301' 로 두면 담당자확인 단계에서만 삽입한다.
    //   전달사항 칸 자체가 특허사무소 신청상태 02·03에서만 노출되므로 노출+편집가능이면 충분하다.
    REQUIRE_STATUS: '',
    FIELD: 'plfDlivMatt',
    RETRY: 80,                   // [v1.8.8] 400ms × 80 = 최대 32초 대기
    RECHECK: [1500, 4000]        // [v1.8.8] 삽입 후 잔존 확인 시점(getBasInfo 늦은 응답 대비)
  };
  var TAX_PHRASE = [
    '\u203B \uC804\uC790\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uBA54\uC77C\uC8FC\uC18C: songhc@kriss.re.kr (patent@kriss.re.kr \uB85C \uBC1C\uD589 \uC2DC \uACC4\uC0B0\uC11C\uAC00 \uD655\uC778\uB418\uC9C0 \uC54A\uC73C\uBBC0\uB85C \uC0AC\uC6A9 \uC9C0\uC591)',
    '\uC548\uB155\uD558\uC2ED\uB2C8\uAE4C.\uAE30\uC220\uC0AC\uC5C5\uD654\uADF8\uB8F9 \uC1A1\uD6C8\uCC2C\uC785\uB2C8\uB2E4. \uC0AC\uC6A9\uC608\uC0B0 \uD655\uC778 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC804\uC790\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uC694\uCCAD\uB4DC\uB9BD\uB2C8\uB2E4.',
    '\uBC1C\uD589\uC77C\uC790\uB294 \uBC1C\uD589\uD558\uC2DC\uB294 \uB2F9\uC77C \uB0A0\uC9DC\uB85C \uC785\uB825 \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.',
    '(\uACC4\uC0B0\uC11C \uBC1C\uD589 \uD574\uB2F9\uC0AC\uD56D\uC774 \uC5C6\uB294 \uACBD\uC6B0 \uC784\uC758\uBC1C\uD589\uC77C\uC790 \uBC0F \uC784\uC758\uC2B9\uC778\uBC88\uD638 \uC785\uB825 \uD6C4 \uC2DC\uC2A4\uD15C \uC81C\uCD9C \uBC84\uD2BC)'
  ].join('\n');
  TAX_PHRASE = refEnsureThanks(TAX_PHRASE, 'plf');
  var TAX_MARK = '\uC804\uC790\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uBA54\uC77C\uC8FC\uC18C';   // 중복 삽입 방지 표식

  function expReadCode(id, globalName) {
    var v = '';
    var el = document.getElementById(id);
    if (el && typeof el.value === 'string') v = el.value;
    if (!v) { try { v = String(window[globalName] || ''); } catch (e) {} }
    return String(v).trim();
  }

  // [v1.8.8] 삽입 본체 — 이미 문구가 있으면 넣지 않고, 없으면 끝에 덧붙인다.
  //   반환값: 'inserted' | 'exists' | 'skip'
  function expInsertTaxPhrase(ta, quiet) {
    if (!ta) return 'skip';
    var cur = String(ta.value || '');
    if (cur.indexOf(TAX_MARK) !== -1) return 'exists';
    ta.value = cur ? (cur.replace(/\s+$/, '') + '\n' + TAX_PHRASE) : TAX_PHRASE;
    triggerChange(ta);
    try { $(ta).trigger('input'); } catch (e) {}
    try { $(ta).removeClass('k-invalid'); } catch (e2) {}
    expTaxNotice(ta);
    if (!quiet) toast('\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uBB38\uAD6C\uB97C \uB123\uC5C8\uC2B5\uB2C8\uB2E4. \uC218\uC815 \uAC00\uB2A5\uD569\uB2C8\uB2E4.', 'ok');
    return 'inserted';
  }

  function initExpCnfPage() {
    if (!EXP_CFG.AUTO_TAX_PHRASE) return;
    // [v1.8.9] 자체 진입 가드 — 대상 화면이 아니면 즉시 반환(다른 화면의 초기화를 방해하지 않음)
    if (!/\/pms\/iprs\/exp\/(?:B_RES00015_01|S_PMS_03015030)\.do/.test(location.pathname)) return;
    console.log(TAG, 'v' + VERSION, '\uBE44\uC6A9\uCCAD\uAD6C\uC11C \uC804\uB2EC\uC0AC\uD56D \uAC10\uC9C0 \u2014 \uC138\uAE08\uACC4\uC0B0\uC11C \uBB38\uAD6C \uB300\uAE30');
    var tries = 0, logged = false;
    var t = setInterval(function () {
      tries++;
      if (tries > EXP_CFG.RETRY) {
        clearInterval(t);
        var ta0 = document.getElementById(EXP_CFG.FIELD);
        console.log(TAG, '\uC138\uAE08\uACC4\uC0B0\uC11C \uBB38\uAD6C \uB300\uAE30 \uC885\uB8CC \u2014 \uC804\uB2EC\uC0AC\uD56D \uCE78 '
          + (ta0 ? (isRefEditable(ta0) ? '\uD3B8\uC9D1\uAC00\uB2A5' : '\uC228\uAE40/\uC77D\uAE30\uC804\uC6A9') : '\uC5C6\uC74C'));
        return;
      }

      var pc = expReadCode('processCode', 'processCode');
      if (pc && pc !== EXP_CFG.PROCESS) { clearInterval(t); return; }

      var ta = document.getElementById(EXP_CFG.FIELD);
      if (!ta) return;                                   // getBasInfo 이후 노출됨(khide/kshow)
      if (!isRefEditable(ta)) return;                    // 숨김·읽기전용 단계에서는 대기

      var st = expReadCode('statusCode', 'statusCode');
      if (!logged) {
        logged = true;
        console.log(TAG, '\uBE44\uC6A9\uCCAD\uAD6C\uC11C \uD654\uBA74 \u2014 processCode=' + (pc || '?')
          + ' statusCode=' + (st || '?') + ' apvStat=' + (expReadCode('apvStat', '') || '?'));
      }
      // 단계 조건은 기본 해제. 설정되어 있을 때만 일치 검사.
      if (EXP_CFG.REQUIRE_STATUS && st && st !== EXP_CFG.REQUIRE_STATUS) {
        clearInterval(t);
        console.log(TAG, '\uB2E8\uACC4 ' + st + ' \u2014 \uC138\uAE08\uACC4\uC0B0\uC11C \uBB38\uAD6C \uC790\uB3D9\uC0BD\uC785 \uC0DD\uB7B5');
        return;
      }
      clearInterval(t);

      var userEdited=false;
      ta.addEventListener('input',function(e){if(e.isTrusted)userEdited=true;});
      var r = expInsertTaxPhrase(ta, false);
      ta.setAttribute('data-kriss-tax', r);
      console.log(TAG, '\uC138\uAE08\uACC4\uC0B0\uC11C \uBB38\uAD6C:', r);

      // [v1.8.8] getBasInfo(AJAX)가 늦게 응답해 값을 덮어쓰는 경우 대비 — 잔존 확인 후 1회 재삽입
      var re = 0;
      for (var i = 0; i < EXP_CFG.RECHECK.length; i++) {
        (function (ms) {
          setTimeout(function () {
            var el = document.getElementById(EXP_CFG.FIELD);
            if (userEdited || !el || !isRefEditable(el)) return;
            if (String(el.value || '').indexOf(TAX_MARK) !== -1) return;
            if (re > 0) return;
            re++;
            expInsertTaxPhrase(el, true);
            console.log(TAG, '\uC138\uAE08\uACC4\uC0B0\uC11C \uBB38\uAD6C \uC7AC\uC0BD\uC785(' + ms + 'ms)');
          }, ms);
        })(EXP_CFG.RECHECK[i]);
      }
    }, 400);
  }

  function expTaxNotice(ta) {
    if (document.getElementById('krissTaxNote')) return;
    var n = document.createElement('div');
    n.id = 'krissTaxNote';
    n.setAttribute(MARK, '1');
    n.style.cssText = 'margin-top:4px;font-size:11px;color:#00695C;font-family:Malgun Gothic,sans-serif;';
    n.textContent = 'Helper: \uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uBB38\uAD6C \uC790\uB3D9 \uCD94\uAC00\uB428 \u2014 \uB0B4\uC6A9 \uC218\uC815\uD558\uC154\uB3C4 \uB429\uB2C8\uB2E4.';
    try { ta.parentNode.appendChild(n); } catch (e) {}
  }

  // ============================================================
  // 9-0. [v1.8.6] 선행조사 미제출(임시저장) 추적 원장
  //   문제: 목록/대시보드의 [선행기술조사 의뢰]는 팝업을 열기 전에 서버 레코드를 만든다.
  //         그 뒤 저장·제출을 하지 않아도 선행조사번호가 생겨 '조사 완료'로 오인된다.
  //   처리: 팝업 자체의 결재상태(#apvStat)를 근거로 미제출 여부를 판정해 원장에 남기고,
  //         화면에 경고를 띄운다. 서버 쓰기 없음(조회·기록 전용).
  //   공유: localStorage['kriss.pps.draft.v1'] — 같은 오리진의 다른 스크립트가 읽을 수 있다.
  //         window.KrissPpsDraft.list() / .get(rqstNo) 로도 조회 가능.
  // ============================================================
  var PPSD_KEY = 'kriss.pps.draft.v1';
  var PPSD_DAY = 86400000;

  function ppsdLoad() {
    try {
      var s = localStorage.getItem(PPSD_KEY);
      var o = s ? JSON.parse(s) : null;
      if (!o || typeof o !== 'object' || !o.items) o = { v: 1, items: {} };
      return o;
    } catch (e) { return { v: 1, items: {} }; }
  }
  function ppsdPrune(o) {
    var now = Date.now(), keep = {};
    for (var k in o.items) {
      if (!Object.prototype.hasOwnProperty.call(o.items, k)) continue;
      var it = o.items[k];
      if (!it) continue;
      var age = now - (it.at || 0);
      if (it.state === 'submitted' && age > 3 * PPSD_DAY) continue;   // 제출 확인분은 3일 후 정리
      if (age > 90 * PPSD_DAY) continue;                              // 그 외 90일 보관
      keep[k] = it;
    }
    o.items = keep;
    return o;
  }
  function ppsdSave(o) {
    try { localStorage.setItem(PPSD_KEY, JSON.stringify(o)); } catch (e) {
      console.warn(TAG, '\uC120\uD589\uC870\uC0AC \uC6D0\uC7A5 \uC800\uC7A5 \uC2E4\uD328:', e.message);
    }
  }
  function ppsdMark(rqstNo, patch) {
    if (!rqstNo) return null;
    var o = ppsdPrune(ppsdLoad());
    var cur = o.items[rqstNo] || { rqst: rqstNo, first: Date.now() };
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) cur[k] = patch[k];
    cur.at = Date.now();
    o.items[rqstNo] = cur;
    ppsdSave(o);
    return cur;
  }
  try {
    window.KrissPpsDraft = {
      KEY: PPSD_KEY,
      list: function () { return ppsdPrune(ppsdLoad()).items; },
      drafts: function () {
        var it = ppsdPrune(ppsdLoad()).items, out = [];
        for (var k in it) if (it[k] && it[k].state === 'draft') out.push(it[k]);
        return out;
      },
      get: function (r) { return ppsdLoad().items[r] || null; },
      mark: ppsdMark
    };
  } catch (e) {}

  // 화면 값 읽기(input·span 공통)
  function ppsVal(id) {
    var el = document.getElementById(id);
    if (!el) return '';
    var v = (typeof el.value === 'string' && el.value !== '') ? el.value : (el.textContent || '');
    return String(v).trim();
  }

  function ppsDraftBanner(rqstNo) {
    if (document.getElementById('krissPpsDraftBar')) return;
    var b = document.createElement('div');
    b.id = 'krissPpsDraftBar';
    b.setAttribute(MARK, '1');
    b.style.cssText = 'margin:6px 0;padding:8px 12px;border-radius:6px;background:#FFF3E0;'
      + 'border:1px solid #FFB74D;color:#7A4A00;font-size:12px;line-height:1.6;'
      + 'font-family:Malgun Gothic,sans-serif;';
    b.textContent = '\uBBF8\uC81C\uCD9C \uC0C1\uD0DC\uC785\uB2C8\uB2E4 ('
      + rqstNo + '). \uC774 \uD654\uBA74\uC744 \uADF8\uB0E5 \uB2EB\uC73C\uBA74 '
      + '\uC120\uD589\uC870\uC0AC\uAC00 \uC2E0\uCCAD\uB418\uC9C0 \uC54A\uACE0 '
      + '\uBC88\uD638\uB9CC \uB0A8\uC2B5\uB2C8\uB2E4. \uC800\uC7A5\u00B7\uC81C\uCD9C\uAE4C\uC9C0 '
      + '\uC644\uB8CC\uD574 \uC8FC\uC2ED\uC2DC\uC624.';
    var host = document.getElementById('con_center') || document.body;
    host.insertBefore(b, host.firstChild);
  }

  // 제출·의뢰 계열 버튼 클릭 감지 → 원장 갱신 (라벨 문자열 기반 판정: 추정)
  var PPSD_VERIFY_SEQ=Object.create(null);
  function verifyPpsState(rqstNo) {
    var seq=(PPSD_VERIFY_SEQ[rqstNo] || 0)+1;PPSD_VERIFY_SEQ[rqstNo]=seq;
    getJson('/pms/iprs/pps/selectPpsRqst.json', {rqstNo:rqstNo}, function(res) {
      if(PPSD_VERIFY_SEQ[rqstNo]!==seq)return;
      var x = res && (res.data || res);
      if (!x || typeof x !== 'object' || Array.isArray(x) || (x.rqstNo && String(x.rqstNo)!==String(rqstNo))) return;
      var raw = x.apvStat;
      if (raw == null || String(raw).trim()==='') return;
      var st = String(raw).trim().padStart(2,'0');
      if (['00','01','02','03','04'].indexOf(st)<0) return;
      ppsdMark(rqstNo, {st:st,state:st==='00'?'draft':st==='04'?'complete':'progress',src:'server',verifiedAt:Date.now()});
      var bar = document.getElementById('krissPpsDraftBar');
      if (st==='00') {
        ppsDraftBanner(rqstNo); bar=document.getElementById('krissPpsDraftBar');
        if(bar)bar.textContent='서버 확인: 선행조사 미제출 ('+rqstNo+'). 검증 메시지와 최종 제출 여부를 확인하세요.';
      } else if(bar)bar.remove();
    }, function(){ /* Leave the result unconfirmed; never turn a failed read into success. */ });
  }
  function ppsHookButtons(rqstNo) {
    if (document.documentElement.getAttribute('data-kriss-ppsdhook')) return;
    document.documentElement.setAttribute('data-kriss-ppsdhook','1');
    document.addEventListener('click',function(e) {
      var b=e.target.closest && e.target.closest('button,a,input[type=button],input[type=submit]');
      if(!b || b.disabled) return;
      var t=String(b.textContent || b.value || '').replace(/\s/g,'');
      if(/취소|닫기|삭제|검색|초기화/.test(t) || !/임시저장|신청|제출|의뢰|승인|완료/.test(t))return;
      PPSD_VERIFY_SEQ[rqstNo]=(PPSD_VERIFY_SEQ[rqstNo] || 0)+1;
      ppsdMark(rqstNo,{state:'submitAttempt',by:t,attemptAt:Date.now(),src:'click'});
      ppsDraftBanner(rqstNo);
      var bar=document.getElementById('krissPpsDraftBar');
      if(bar)bar.textContent='버튼 클릭 감지 · 처리 결과 확인 중 ('+rqstNo+'). 클릭·창 닫기는 제출완료 증거가 아닙니다.';
      [1800,5000,10000].forEach(function(ms){setTimeout(function(){verifyPpsState(rqstNo);},ms);});
    },true);
  }
  function trackPpsDraft() {
    var rqstNo=ppsVal('rqstNo'); if(!rqstNo)return;
    var raw=ppsVal('apvStat'), st=raw ? raw.padStart(2,'0') : '';
    var state=st==='00'?'draft':st==='04'?'complete':['01','02','03'].indexOf(st)>=0?'progress':'unknown';
    ppsdMark(rqstNo,{rqst:rqstNo,iRqst:ppsVal('intellRqstNo'),mng:readMngNo(),st:st,state:state,src:'popup'});
    if(state==='draft')ppsDraftBanner(rqstNo);
    ppsHookButtons(rqstNo); verifyPpsState(rqstNo);
  }

  function initPpsPopup() {
    injectPpsStyle();
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tries > 80) { clearInterval(t); console.warn(TAG, '선행조사 팝업 초기화 타임아웃'); return; }
      if (typeof window.$ === 'undefined') return;
      var el = document.getElementById('cmplNeedDt');
      if (!el) return;
      var dp = null;
      try { dp = $('#cmplNeedDt').data('kendoDatePicker'); } catch (e) {}
      if (!dp) return;                       // Kendo 위젯 생성 전
      clearInterval(t);

      addPpsDueButton();
      // getBasInfo(AJAX)가 기존 값을 채울 수 있으므로 잠시 대기 후 판정
      setTimeout(function () { fillPpsDueDate(false); }, 1200);
      // [v1.8.6] 미제출(임시저장) 추적 — 기본정보 조회 완료 후 상태를 읽는다
      setTimeout(function () { try { trackPpsDraft(); } catch (e) { console.warn(TAG, '\uC120\uD589\uC870\uC0AC \uCD94\uC801 \uC624\uB958:', e.message); } }, 1500);
    }, 300);
  }

  // [v1.7.0] 관리번호 읽기 — 화면에 따라 span 또는 input
  function readMngNo() {
    var el = document.getElementById('intellMngNo');
    if (!el) return '';
    var v = '';
    if (typeof el.value === 'string' && el.value.trim()) v = el.value;
    else v = el.textContent || '';
    return String(v).trim().toUpperCase();
  }

  // [v1.7.0] 국내/국외 판별 — 1순위 관리번호 끝 국가코드, 2순위 출원국가 표시, 판별 불가 시 국내
  function isDomesticCase() {
    var mng = readMngNo();
    var m = mng.match(/([A-Z]{2,4})$/);
    if (m) return m[1] === PPS_CFG.DOMESTIC_CODE;
    var ntn = getText('#aplyNtnNm');
    if (ntn) return ntn.indexOf('\uB300\uD55C\uBBFC\uAD6D') !== -1;   // '대한민국'
    return true;
  }

  function dueDaysFor() {
    return isDomesticCase() ? PPS_CFG.DUE_DAYS_DOMESTIC : PPS_CFG.DUE_DAYS_FOREIGN;
  }

  // 완료희망일자 계산 (국내 2주 / 국외·PCT 3주, 주말이면 다음 월요일)
  function calcPpsDueDate(days) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    if (PPS_CFG.SKIP_WEEKEND) {
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);        // 토 → 월
      else if (d.getDay() === 0) d.setDate(d.getDate() + 1);   // 일 → 월
    }
    return d;
  }

  function fmtDate(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // force=true : 버튼 수동 실행(빈 값 조건 무시)
  function fillPpsDueDate(force) {
    var el = document.getElementById('cmplNeedDt');
    if (!el) { toast('#cmplNeedDt 필드를 찾을 수 없습니다.', 'error'); return; }

    var apv = '';
    var apvEl = document.getElementById('apvStat');
    if (apvEl) apv = String(apvEl.value || '').trim();

    // 신규(값 없음) 또는 임시저장(00) 단계에서만 자동 채움 — 진행/완료 건 값 보호
    if (!force && apv !== '' && apv !== '00') {
      console.log(TAG, '선행조사 결재상태 ' + apv + ' — 완료희망일자 자동지정 생략');
      return;
    }
    if (!force && !PPS_CFG.OVERWRITE_DUE && el.value && el.value.trim()) {
      console.log(TAG, '완료희망일자 기존 값 유지:', el.value);
      return;
    }

    var days = dueDaysFor();
    var d = calcPpsDueDate(days);
    var s = fmtDate(d);
    var ok = false;

    try {
      var dp = $('#cmplNeedDt').data('kendoDatePicker');
      if (dp) { dp.value(d); ok = true; }
    } catch (e) { console.warn(TAG, 'kendoDatePicker 설정 실패:', e.message); }

    if (!ok) { try { $('#cmplNeedDt').kval(s); ok = !!el.value; } catch (e) {} }  // 폴백 1
    if (!ok) { el.value = s; ok = !!el.value; }                                   // 폴백 2

    // 유효성 표시(empty/k-invalid) 정리 + change 전파
    try {
      $(el).removeClass('k-invalid').trigger('change');
      $(el).closest('.k-datepicker').removeClass('empty');
    } catch (e) {}

    var scope = isDomesticCase() ? '국내' : '국외/PCT';
    if (ok) {
      // [v1.7.1] 토스트 제거 — 콘솔 로그와 필드 옆 배지만 표시
      console.log(TAG, '완료희망일자 자동 지정:', s, '(' + scope + ' 오늘+' + days + '일'
        + (PPS_CFG.SKIP_WEEKEND ? ', 주말 보정' : '') + ')');
      showPpsDueBadge(s, scope, days);
    } else {
      toast('완료희망일자 자동 지정 실패 — 직접 입력해 주세요.', 'error');
    }
  }

  function addPpsDueButton() {
    if (!PPS_CFG.SHOW_DUE_BUTTON) return;   // [v1.7.1] 기본 비표시
    var area = document.querySelector('.titlegroup3 .ft_right');
    if (!area || document.getElementById('krissPpsDueBtn')) return;
    mkBtn(area, '+' + dueDaysFor() + '\uC77C', '#009688', '#00796B', function () {
      fillPpsDueDate(true);
    }, 'krissPpsDueBtn');
  }

  function showPpsDueBadge(s, scope, days) {
    var old = document.getElementById('krissPpsDueBadge');
    if (old) old.remove();
    var el = document.getElementById('cmplNeedDt');
    if (!el) return;
    var wrap = (el.closest ? el.closest('td') : null) || el.parentNode;
    var b = document.createElement('span');
    b.id = 'krissPpsDueBadge';
    b.setAttribute(MARK, '1');
    b.textContent = '\u2713 자동';   // [v1.7.1] 날짜 표기 제거
    b.title = '자동 지정: ' + s + (scope ? ' (' + scope + ' 오늘+' + days + '일)' : '');
    b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:3px;'
      + 'font-size:11px;background:#E0F2F1;border:1px solid #009688;color:#00695C;'
      + 'vertical-align:middle;font-family:Malgun Gothic,sans-serif;';
    wrap.appendChild(b);
  }

  // ============================================================
  // 10. [v1.6.0] 지식재산권 신청 목록 (S_PMS_03010100)
  //     선행조사 미의뢰 건 감지·강조 + 안전 선택 + 서버 기간확장 점검
  //     [v1.8.4] 원본 의뢰 버튼은 클릭 시 서버 레코드를 선생성하므로 Helper에서 자동 클릭하지 않음
  // ============================================================
  function initIntellList() {
    injectPpsStyle();
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tries > 80) { clearInterval(t); console.warn(TAG, '신청 목록 그리드 대기 타임아웃'); return; }
      var kg = intellGrid();
      if (!kg || !kg.dataSource) return;
      clearInterval(t);

      addIntellListButtons();
      guardNativePpsButton();   // [v1.8.4] 원본 버튼은 팝업 오픈 전에 서버 레코드 생성 → 경고/취소 가드
      kg.bind('dataBound', function () { setTimeout(renderIntellList, 60); });
      renderIntellList();
    }, 300);
  }

  function intellGrid() {
    try { return $('#grid1').data('kendoGrid'); } catch (e) { return null; }
  }

  // [v1.7.1] 그리드 행의 '결재상태' 셀 표시문구 읽기 (field='apvStat' 컬럼 위치 기준)
  function statusTextOfRow(kg, tr) {
    try {
      if (!kg || !tr || !tr.length) return '';
      var cols = kg.columns || [];
      var idx = -1;
      for (var i = 0; i < cols.length; i++) {
        if (cols[i] && cols[i].field === 'apvStat') { idx = i; break; }
      }
      if (idx < 0) return '';
      var tds = tr.children('td');
      if (!tds.length || idx >= tds.length) return '';
      return String(tds.eq(idx).text() || '').trim();
    } catch (e) { return ''; }
  }

  function isExcludedStatusText(txt) {
    var list = PPS_CFG.EXCLUDE_STATUS_TEXT || [];
    for (var i = 0; i < list.length; i++) {
      if (txt.indexOf(list[i]) !== -1) return true;
    }
    return false;
  }

  // ---- 대상/보류/제외 분류 (규칙 기반) ----
  // [v1.8.5] 중요: 지재권 apvStat=00(임시저장)은 선행조사 완료가 아니다.
  // 목록에서 조용히 skip하면 "미의뢰 없음"으로 오해되므로 반드시 상태확인(hold)으로 노출한다.
  // KRISS-PPS-POLICY 2026-09-08: identical in Dashboard and Helper.
  // Owner detail: owrQuota = ownership; costShareRatio = cost allocation, never ownership.
  function krissOwnerEvidence(res, key) {
    if (!res || res.success === false || res.error) throw Error('특허권자 조회 응답 오류');
    var rows = Array.isArray(res) ? res : Array.isArray(res.data) ? res.data : res.data && Array.isArray(res.data.rows) ? res.data.rows : Array.isArray(res.rows) ? res.rows : null;
    if (!rows || !rows.length) throw Error('특허권자 정보 없음');
    var total = res.total != null ? res.total : res.data && res.data.total;
    if (total != null && total !== '' && Number(total) > rows.length) throw Error('특허권자 정보 일부 수신');
    var seen = Object.create(null), owners = [], sum = 0;
    rows.forEach(function(r) {
      if (!r || (r.intellRqstNo && String(r.intellRqstNo) !== key)) throw Error('특허권자 신청번호 불일치');
      var code = String(r.orgCd || '').trim(), raw = String(r.owrQuota == null ? '' : r.owrQuota).replace(/\s|%/g, '');
      if (!code || !/^\d+(?:\.\d+)?$/.test(raw) || Number(raw) > 100) throw Error('기관별 소유지분 확인 필요');
      var n = Number(raw);
      if (Object.prototype.hasOwnProperty.call(seen,code)) { if (seen[code] !== n) throw Error('동일 기관 소유지분 불일치'); return; }
      seen[code] = n; sum += n;
      owners.push({orgCd:code,orgNm:String(r.orgNm || code),owrQuota:n,costShareRatio:r.costShareRatio});
    });
    if (!Object.prototype.hasOwnProperty.call(seen,'200835806')) throw Error('KRISS 특허권자 정보 미확인');
    if (Math.abs(sum - 100) > 0.5) throw Error('기관별 소유지분 합계 확인 필요');
    return {owners:owners,externalMajority:owners.find(function(o){return o.orgCd !== '200835806' && o.owrQuota > 50;}) || null};
  }
  function krissPpsRecord(res, key) {
    if (!res || res.success === false || res.error || !Object.prototype.hasOwnProperty.call(res,'data')) throw Error('기존 선행조사 응답 형식 미확인');
    if (res.data === null) return null;
    var d = res.data;
    if (!d || typeof d !== 'object' || Array.isArray(d) || !String(d.rqstNo || '').trim() || (d.intellRqstNo && String(d.intellRqstNo) !== key)) throw Error('기존 선행조사 응답 확인 필요');
    return d;
  }
  async function krissReadPpsContext(key, request, active) {
    var res = await request('GET','/pms/res/intellppty/searchIntellRqst.json',{intellRqstNo:key});
    if (active && !active()) throw Error('조회 중지');
    var d = res && res.data;
    if (!d || typeof d !== 'object' || Array.isArray(d) || String(d.intellRqstNo || '') !== key || d.apvStat == null || res.success === false || res.error) throw Error('신청 상세 응답 불일치');
    // Explicitly clear older UI evidence before any merge with a cached/list row.
    var row = Object.assign({},d,{apvStatNm:String(d.apvStatNm || ''),__krissOwnerEvidence:null,__krissOwnerError:'',__krissPpsChecked:false,__krissPpsRecord:null,__krissPpsError:''});
    if (String(d.apvStat).padStart(2,'0') !== '04' || String(d.ppsRqstNo || '').trim()) return row;
    var result = await Promise.allSettled([
      request('POST','/pms/res/intellppty/searchIntellOwr.json',{intellRqstNo:key}),
      request('GET','/pms/iprs/mng/selectPpsRqst.json',{intellRqstNo:key})
    ]);
    if (active && !active()) throw Error('조회 중지');
    try {
      if (result[0].status !== 'fulfilled') throw result[0].reason;
      row.__krissOwnerEvidence = krissOwnerEvidence(result[0].value,key);
    } catch(e) { row.__krissOwnerError = String(e && e.message || e); }
    try {
      if (result[1].status !== 'fulfilled') throw result[1].reason;
      var pps = krissPpsRecord(result[1].value,key);
      row.__krissPpsChecked = true;
      if (pps) { row.ppsRqstNo = String(pps.rqstNo); row.ppsRqstDt = pps.rqstDt || row.ppsRqstDt; row.__krissPpsRecord = pps; }
    } catch(e) { row.__krissPpsError = String(e && e.message || e); }
    return row;
  }
  function krissPpsPolicy(r) {
    r = r || {};
    var val = function(k) { return String(r[k] == null ? '' : r[k]).trim(); };
    var apv = val('apvStat').padStart(2, '0');
    if (apv !== '04') return {kind:'skip', reason:'지식재산권 신청 결재완료 전 (' + (val('apvStat') || '미확인') + ')'};
    if (/임시|내부결재|반려|취소|철회/.test(val('apvStatNm'))) return {kind:'hold', reason:'결재상태 코드·명칭 불일치'};
    if (val('ppsRqstNo') || val('ppsRqstDt')) return {kind:'linked', reason:'기존 선행조사 요청 있음 · 새로 생성하지 않고 기존 요청 확인'};
    if (r.__krissOwnerEvidence && r.__krissOwnerEvidence.externalMajority) {
      var owner = r.__krissOwnerEvidence.externalMajority;
      return {kind:'exclude',reason:'선행조사 예외 · ' + owner.orgNm + ' 소유지분 ' + owner.owrQuota + '% (한 기관 50% 초과)'};
    }
    var cls = val('cntCls').toUpperCase(), m = /\d{4,}([A-Z]{2,4})$/.exec(val('intellMngNo').toUpperCase());
    var nm = val('cntClsNm') + ' ' + val('aplyNtnNm');
    var domestic = cls === 'I' || /국내|대한민국/.test(nm) || (m && m[1] === 'KR');
    var foreign = cls === 'O' || cls === 'M' || /국외|해외|PCT/.test(nm) || (m && m[1] !== 'KR');
    if (domestic && foreign) return {kind:'hold', reason:'국가정보 불일치'};
    // A family identifier alone does not prove an already-filed domestic parent.
    if (foreign) return {kind:'hold', foreign:true, reason:'국외·PCT: 이미 출원된 국내 원출원 및 선행조사 예외 확인'};
    if (!domestic) return {kind:'hold', reason:'국가 미확인'};
    var type = val('reRqstType') || val('__pdReRqstType');
    if (type !== 'G') return {kind:'hold', reason:type ? '출원종류 ' + type + ' · 선행조사 필요 여부 확인' : '출원종류 미확인'};
    if (val('aplyRqstDt')) return {kind:'hold', reason:'출원지시 이력 있음 · 선행조사 필요 여부 확인'};
    if (!r.__krissOwnerEvidence) return {kind:'hold',reason:'기관별 소유지분 확인 필요' + (r.__krissOwnerError ? ' · ' + r.__krissOwnerError : '')};
    if (r.__krissPpsChecked !== true) return {kind:'hold',reason:'기존 선행조사 확인 필요' + (r.__krissPpsError ? ' · ' + r.__krissPpsError : '')};
    return {kind:'target', reason:'신청 결재완료 · 국내 일반출원 · 선행조사 미의뢰'};
  }


  var PPS_DETAIL = Object.create(null), PPS_DETAIL_BUSY = Object.create(null);
  var PPS_DETAIL_QUEUE = [], PPS_DETAIL_ACTIVE = 0, PPS_DETAIL_REV = Object.create(null);
  function ppsContextRequest(method,url,params) {
    return new Promise(function(resolve,reject) {
      var settled = false;
      function finish(error,res) { if(settled)return;settled=true;clearTimeout(timer);error?reject(Error(String(error))):resolve(res); }
      var timer = setTimeout(function(){finish('조회 시간 초과 · 다시 확인해 주세요');},15000);
      (method === 'POST' ? postJson : getJson)(url,params,function(res){finish(null,res);},function(err){finish(err || '조회 실패');});
    });
  }
  // Failed reads stay visibly unresolved until an explicit retry or a new button click.
  // They are never treated as a successful empty response or automatically retried by rendering.
  function ppsCacheValid(detail) { return detail && (detail.error || Date.now() - detail.at < 300000); }
  function classifyPps(it) {
    var key = String(it.intellRqstNo || ''), detail = PPS_DETAIL[key];
    var row = Object.assign({},it.toJSON ? it.toJSON() : it);
    if (String(row.apvStat).padStart(2,'0') !== '04') return krissPpsPolicy(row);
    if (String(row.ppsRqstNo || '').trim()) return {kind:'skip',reason:'기존 선행조사 요청 있음'};
    if (ppsCacheValid(detail) && detail.data) Object.assign(row,detail.data);
    else if (PPS_DETAIL_BUSY[key]) return {kind:'loading',reason:'신청 상세·기관별 지분·기존 선행조사 확인 중'};
    if (detail && detail.error && ppsCacheValid(detail)) return {kind:'hold',reason:'조회 확인 필요 · ' + detail.error};
    var c = krissPpsPolicy(row);
    return c.kind === 'linked' ? {kind:'skip',reason:c.reason} : c;
  }
  async function readPpsListContext(key) {
    var rev = PPS_DETAIL_REV[key] = (PPS_DETAIL_REV[key] || 0) + 1;
    try {
      var data = await krissReadPpsContext(key,ppsContextRequest);
      var error = data.__krissOwnerError || data.__krissPpsError || '';
      if (PPS_DETAIL_REV[key] === rev) PPS_DETAIL[key] = {at:Date.now(),data:data,error:error};
      return data;
    } catch(e) {
      if (PPS_DETAIL_REV[key] === rev) PPS_DETAIL[key] = {at:Date.now(),error:String(e && e.message || e)};
      throw e;
    }
  }
  function enrichPpsListRow(it) {
    var key = String(it.intellRqstNo || '').trim();
    if (!key || String(it.apvStat).padStart(2,'0') !== '04' || String(it.ppsRqstNo || '').trim()) return;
    if (PPS_DETAIL_BUSY[key] || ppsCacheValid(PPS_DETAIL[key])) return;
    PPS_DETAIL_BUSY[key] = true; PPS_DETAIL_QUEUE.push(key); pumpPpsDetails();
  }
  function pumpPpsDetails() {
    while (PPS_DETAIL_ACTIVE < 3 && PPS_DETAIL_QUEUE.length) {
      (function(key) {
        PPS_DETAIL_ACTIVE++;
        readPpsListContext(key).catch(function(){}).finally(function(){
          delete PPS_DETAIL_BUSY[key]; PPS_DETAIL_ACTIVE--; renderIntellList(); pumpPpsDetails();
        });
      })(PPS_DETAIL_QUEUE.shift());
    }
  }
  function retryPpsListDetails() {
    var kg = intellGrid(); if (!kg || !kg.dataSource) return;
    var rows = kg.dataSource.view();
    for (var i=0;i<rows.length;i++) delete PPS_DETAIL[String(rows[i].intellRqstNo || '')];
    renderIntellList();
  }


  // ---- 현재 그리드 기준 렌더링 ----
  function renderIntellList() {
    var kg = intellGrid();
    if (!kg || !kg.dataSource) return;
    var data = kg.dataSource.view();
    var targets = [], holds = [], loading = 0;

    for (var i = 0; i < data.length; i++) {
      var it = data[i];

      // [v1.8.5] 원본 버튼은 `ppsRqstNo != null`로만 판정한다.
      // 서버/Kendo가 미의뢰 값을 빈 문자열("")로 준 경우에도 true가 되어
      // "선행기술조사가 진행된 건입니다"라고 오판하므로, 화면 메모리에서만 null로 정규화한다.
      // 서버 저장/수정은 발생하지 않는다.
      if (typeof it.ppsRqstNo === 'string' && !it.ppsRqstNo.trim()) it.ppsRqstNo = null;

      enrichPpsListRow(it);
      var c = classifyPps(it);
      var tr = kg.tbody.find('tr[data-uid="' + it.uid + '"]');
      tr.removeClass('kriss-pps-target kriss-pps-hold');

      // [v1.7.1] 코드 판정이 통과해도 화면 표시문구가 제외 대상이면 대상에서 제거
      if (c.kind === 'target') {
        var stTxt = statusTextOfRow(kg, tr);
        if (stTxt && isExcludedStatusText(stTxt)) {
          c = { kind: 'skip', reason: '결재상태 ' + stTxt };
          console.log(TAG, '조사의뢰 대상 제외:', it.intellMngNo, stTxt);
        }
      }

      if (c.kind === 'target') { tr.addClass('kriss-pps-target'); targets.push({ it: it, c: c }); }
      else if (c.kind === 'hold') { tr.addClass('kriss-pps-hold'); holds.push({ it: it, c: c }); }
      else if (c.kind === 'loading') loading++;
    }
    drawPpsBanner(targets, holds, data.length, loading);
  }

  function drawPpsBanner(targets, holds, total, loading) {
    var old = document.getElementById('krissPpsBanner');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = 'krissPpsBanner';
    box.setAttribute(MARK, '1');
    box.className = 'kriss-pps-box';

    var head = document.createElement('div');
    head.className = 'kriss-pps-head';
    head.innerHTML = '<b>[선행조사 점검]</b> 현재 목록 ' + total + '건 중 '
      + '<b class="kriss-pps-n">미의뢰 즉시대상 ' + targets.length + '건</b>'
      + ' · 상태확인 ' + holds.length + '건' + (loading ? ' · 확인 중 ' + loading + '건' : '');
    box.appendChild(head);
    var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'kriss-pps-btn'; retry.textContent = '다시 확인';
    retry.addEventListener('click',retryPpsListDetails); head.appendChild(retry);

    // [v1.8.4] 이 목록의 ppsRqstDt/ppsRqstNo는 팝업 오픈 시 선생성될 수 있어
    // '실제 신청 완료'를 보증하지 않는다. 오판 방지를 위해 화면에 명시한다.
    var stateNote = document.createElement('div');
    stateNote.className = 'kriss-pps-row hold';
    stateNote.textContent = '※ 주의: 선행기술조사 요청일/번호가 있어도 실제 신청 완료를 뜻하지 않을 수 있습니다. 팝업 오픈만으로 번호가 먼저 생성될 수 있습니다.';
    box.appendChild(stateNote);

    if (!targets.length && !holds.length && !loading) {
      var okline = document.createElement('div');
      okline.className = 'kriss-pps-row';
      okline.textContent = '현재 목록에는 즉시 의뢰 대상 또는 상태확인 건이 없습니다. (과거 건은 [미의뢰 점검] 버튼으로 확인)';
      box.appendChild(okline);
    }

    targets.forEach(function (o) { box.appendChild(ppsRowEl(o, true)); });
    holds.forEach(function (o) { box.appendChild(ppsRowEl(o, false)); });

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'kriss-pps-x';
    x.textContent = '\u00D7';
    x.addEventListener('click', function () { box.remove(); });
    box.appendChild(x);

    var anchor = document.querySelector('.grid_area');
    var host = document.querySelector('.inner') || document.body;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
    else host.appendChild(box);
  }

  function ppsRowEl(o, isTarget) {
    var it = o.it;
    var row = document.createElement('div');
    row.className = 'kriss-pps-row' + (isTarget ? '' : ' hold');

    var txt = document.createElement('span');
    txt.textContent = (it.intellMngNo || '(관리번호 없음)')
      + ' | ' + (it.mainIvenEmpNm || '') + ' | ' + cutStr(it.ivenNm, 40)
      + ' | ' + o.c.reason;
    row.appendChild(txt);

    if (isTarget) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'kriss-pps-btn';
      b.textContent = '\uC120\uD0DD';   // 선택
      b.title = '이 건만 선택합니다. 서버에는 선행기술조사 데이터를 생성하지 않습니다.';
      b.addEventListener('click', function () { selectPpsTarget(it.uid); });
      row.appendChild(b);
    }
    return row;
  }

  function cutStr(s, n) {
    s = String(s || '');
    return s.length > n ? s.substring(0, n) + '\u2026' : s;
  }

  // ---- [v1.8.4 HOTFIX] 안전 선택: 체크박스만 선택. 서버 쓰기/원본 버튼 클릭 금지 ----
  function selectPpsTarget(uid) {
    var kg = intellGrid();
    if (!kg) { toast('그리드를 찾을 수 없습니다.', 'error'); return; }
    var tr = kg.tbody.find('tr[data-uid="' + uid + '"]');
    if (!tr.length) { toast('해당 행이 현재 목록에 없습니다.', 'warn'); return; }

    // 기존 선택 해제 → 대상 1건만 체크
    kg.tbody.find('input.check_row').each(function () { if (this.checked) this.click(); });
    var cb = tr.find('input.check_row')[0];
    if (!cb) { toast('선택 체크박스를 찾을 수 없습니다.', 'error'); return; }
    if (!cb.checked) cb.click();
    try { kg.select(tr); } catch (e) {}

    toast('대상만 선택했습니다. 실제 의뢰할 때만 상단 [선행기술조사 의뢰]를 누르세요.', 'info');
  }

  // 원본 화면의 [선행기술조사 의뢰]는 클릭 즉시 updateIntellPpsInfo.json을 POST하여
  // 팝업 저장/신청 전에도 rqstNo가 생성된다. 사용자가 취소할 수 있도록 캡처 단계에서 경고한다.
  var PPS_NATIVE_WRITES = Object.create(null);
  function observeNativePpsWrites() {
    var ajax = window.kriss && window.kriss.ajax;
    if (!ajax || typeof ajax.post !== 'function' || ajax.post.__krissPpsMonitor) return;
    var original = ajax.post;
    function monitoredPost(url,params,callback) {
      var key = String(params && params.intellRqstNo || '').trim();
      if (String(url).split('?')[0] !== '/pms/iprs/pps/updateIntellPpsInfo.json' || !key) return original.apply(this,arguments);
      var state = PPS_NATIVE_WRITES[key] = {state:'sending',at:Date.now()}, args = Array.prototype.slice.call(arguments);
      args[2] = function(res) {
        state.state = res && res.data && res.data.rqstNo ? 'created' : 'uncertain';
        if (typeof callback === 'function') return callback.apply(this,arguments);
      };
      try { return original.apply(this,args); } catch(e) { state.state='uncertain'; throw e; }
    }
    monitoredPost.__krissPpsMonitor = true; ajax.post = monitoredPost;
  }
  function guardNativePpsButton() {
    var btn = document.getElementById('btnPpsRqst');
    if (!btn || btn.__krissPpsGuarded) return;
    btn.__krissPpsGuarded = true;
    observeNativePpsWrites();
    var busy = false, permit = '';
    function selected() { try { return intellGrid() && typeof grid1 !== 'undefined' && grid1 ? grid1.getRowData() : null; } catch(e) { return null; } }
    function keyOf(it) { return String(it && it.intellRqstNo || '').trim(); }
    btn.addEventListener('click', async function(e) {
      var it = selected(), key = keyOf(it);
      if (permit && permit === key) { permit = ''; return; }
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (busy) { toast('선행조사 대상 확인 중입니다.', 'info'); return; }
      if (!key) { toast('신청 건을 한 건 선택해 주세요.', 'warn'); return; }
      // Incomplete applications need no remote requests. An approved row is always rechecked below.
      if (String(it.apvStat).padStart(2,'0') !== '04') { toast(krissPpsPolicy(it).reason,'warn'); return; }
      busy = true;
      toast('신청 상세·기관별 지분·기존 선행조사를 확인하고 있습니다.', 'info');
      try {
        var row = await readPpsListContext(key);
        if (keyOf(selected()) !== key || !document.getElementById('btnPpsRqst') || btn.isConnected === false) { toast('선택한 건이 바뀌어 중지했습니다. 현재 건에서 다시 눌러 주세요.','info'); return; }
        var c = krissPpsPolicy(row);
        if (c.kind !== 'target') { toast('선행조사: ' + c.reason,'warn'); return; }
        if (PPS_NATIVE_WRITES[key]) { toast('이미 생성 요청을 보낸 건입니다. 결과가 아직 확인되지 않아 재전송하지 않습니다. 목록과 기존 요청을 확인해 주세요.','warn'); return; }
        if (!window.confirm((row.intellMngNo || it.intellMngNo || key) + '\n선행기술조사 요청을 생성하고 입력창을 열까요?\n입력창에서 최종 신청해야 의뢰가 완료됩니다.')) return;
        var current = selected();
        if (keyOf(current) !== key) return;
        if (typeof current.ppsRqstNo === 'string' && !current.ppsRqstNo.trim()) current.ppsRqstNo = null;
        // Delegate exactly once to the portal's existing handler; never implement/retry a write here.
        observeNativePpsWrites(); permit = key; btn.click(); permit = '';
      } catch(err) { toast('선행조사 확인 실패: ' + String(err && err.message || err) + ' · 다시 누르면 재조회합니다.','warn'); }
      finally { permit = ''; busy = false; renderIntellList(); }
    },true);
  }


  // ---- 상단 보조 버튼 ----
  function addIntellListButtons() {
    if (!PPS_CFG.SHOW_SCAN_BUTTON) return;   // [v1.7.1] 기본 비표시(화면의 '확인 필요건' 체크박스로 대체)
    var area = document.querySelector('.titlegroup3 .ft_right');
    if (!area || document.getElementById('krissPpsScanBtn')) return;
    mkBtn(area, '\uBBF8\uC758\uB8B0 \uC810\uAC80', '#009688', '#00796B', function () {
      scanPpsServer();
    }, 'krissPpsScanBtn');
  }

  // ---- 서버 기간확장 점검 (조회 전용 API) ----
  function scanPpsServer() {
    var end = new Date();
    var start = new Date();
    start.setMonth(start.getMonth() - PPS_CFG.SCAN_MONTHS);

    var body = {
      item: '', keyword: '',
      rqstStrDt: fmtDate(start), rqstEndDt: fmtDate(end),   // 신청 탭 날짜형식: 하이픈
      apvStat: '', aplyRqstYn: '', cntCls: '',
      take: PPS_CFG.SCAN_TAKE, skip: 0, page: 1, pageSize: PPS_CFG.SCAN_TAKE
    };

    toast('최근 ' + PPS_CFG.SCAN_MONTHS + '개월 신청 건 조회 중...', 'info');
    postJson('/pms/res/intellppty/selectIntellpptyList.json', body, async function (res) {
      var list = (res && Array.isArray(res.data)) ? res.data : [];
      var idx = 0;
      await Promise.all([0,1,2].map(async function(){ while(idx < list.length) { var it=list[idx++]; if(String(it.apvStat).padStart(2,'0')==='04' && !String(it.ppsRqstNo || '').trim()) { try { await readPpsListContext(String(it.intellRqstNo)); } catch(e) {} } } }));
      var targets = [], holds = [];
      for (var i = 0; i < list.length; i++) {
        var c = classifyPps(list[i]);
        if (c.kind === 'target') targets.push({ it: list[i], c: c });
        else if (c.kind === 'hold') holds.push({ it: list[i], c: c });
      }
      drawPpsScanPanel(list.length, targets, holds);
    }, function (msg) {
      toast('서버 점검 실패: ' + msg, 'error');
    });
  }

  function drawPpsScanPanel(total, targets, holds) {
    var old = document.getElementById('krissPpsScanPanel');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = 'krissPpsScanPanel';
    box.setAttribute(MARK, '1');
    box.className = 'kriss-pps-box scan';

    var head = document.createElement('div');
    head.className = 'kriss-pps-head';
    head.innerHTML = '<b>[미의뢰 점검 · 최근 ' + PPS_CFG.SCAN_MONTHS + '개월]</b> 조회 ' + total + '건 중 '
      + '<b class="kriss-pps-n">미의뢰 즉시대상 ' + targets.length + '건</b>'
      + ' · 상태확인 ' + holds.length + '건 &nbsp;|&nbsp; 항목 클릭 시 해당 관리번호로 목록 재검색';
    box.appendChild(head);

    var scanNote = document.createElement('div');
    scanNote.className = 'kriss-pps-row hold';
    scanNote.textContent = '※ 요청일/번호 존재 여부만으로 실제 선행기술조사 신청 완료 여부는 판별할 수 없습니다.';
    box.appendChild(scanNote);

    var mk = function (o, isTarget) {
      var row = document.createElement('div');
      row.className = 'kriss-pps-row' + (isTarget ? '' : ' hold');
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = (o.it.intellMngNo || '(관리번호 없음)')
        + ' | ' + (o.it.rqstDt || '') + ' | ' + (o.it.mainIvenEmpNm || '')
        + ' | ' + cutStr(o.it.ivenNm, 36) + ' | ' + o.c.reason;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        searchByMngNo(o.it.intellMngNo);
      });
      row.appendChild(a);
      return row;
    };

    if (!targets.length) {
      var okline = document.createElement('div');
      okline.className = 'kriss-pps-row';
      okline.textContent = '미의뢰 대상이 없습니다.';
      box.appendChild(okline);
    }
    targets.forEach(function (o) { box.appendChild(mk(o, true)); });
    holds.forEach(function (o) { box.appendChild(mk(o, false)); });

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'kriss-pps-x';
    x.textContent = '\u00D7';
    x.addEventListener('click', function () { box.remove(); });
    box.appendChild(x);

    var anchor = document.querySelector('.grid_area');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
    else (document.querySelector('.inner') || document.body).appendChild(box);
  }

  // 관리번호로 목록 재검색 (검색기준=관리번호, 기간 해제) → 재조회 후 해당 행으로 이동
  function searchByMngNo(mngNo) {
    if (!mngNo) return;
    var up = String(mngNo).toUpperCase();   // 관리번호는 대문자만 서버 매칭
    try {
      var dd = $('#item').data('kendoDropDownList');
      if (dd) dd.value('intellMngNo'); else $('#item').val('intellMngNo');
      var kw = document.getElementById('keyword');
      if (kw) { kw.readOnly = false; kw.removeAttribute('readonly'); kw.value = up; }
      ['rqstStrDt', 'rqstEndDt'].forEach(function (id) {
        var dp = $('#' + id).data('kendoDatePicker');
        if (dp) dp.value(null);
        else { var e2 = document.getElementById(id); if (e2) e2.value = ''; }
      });
      var kg = intellGrid();
      if (kg) {
        var once = function () {
          kg.unbind('dataBound', once);
          setTimeout(function () {
            renderIntellList();
            var d = kg.dataSource.view();
            for (var i = 0; i < d.length; i++) {
              if (String(d[i].intellMngNo || '').toUpperCase() === up) {
                var row = kg.tbody.find('tr[data-uid="' + d[i].uid + '"]')[0];
                if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
                break;
              }
            }
          }, 80);
        };
        kg.bind('dataBound', once);
      }
      document.getElementById('btnSearch').click();
      toast(up + ' 재검색 중 — 목록에서 [선택] 버튼으로 대상만 선택할 수 있습니다.', 'info');
    } catch (e) {
      toast('재검색 실패: ' + e.message, 'error');
    }
  }

  function injectPpsStyle() {
    if (document.getElementById('krissPpsStyle')) return;
    var st = document.createElement('style');
    st.id = 'krissPpsStyle';
    st.setAttribute(MARK, '1');
    st.textContent =
      '.kriss-pps-box{position:relative;border:1px solid #009688;background:#F1F8F7;'
      + 'padding:8px 28px 8px 12px;margin:6px 0;font-size:12px;color:#00463F;'
      + 'font-family:Malgun Gothic,Dotum,sans-serif;line-height:1.7;}'
      + '.kriss-pps-box.scan{border-color:#5C6BC0;background:#F3F4FB;color:#283593;}'
      + '.kriss-pps-head{margin-bottom:4px;}'
      + '.kriss-pps-n{color:#C62828;}'
      + '.kriss-pps-row{padding:1px 0;}'
      + '.kriss-pps-row.hold{color:#8D6E63;}'
      + '.kriss-pps-row a{color:inherit;text-decoration:underline;}'
      + '.kriss-pps-btn{margin-left:8px;background:#009688;color:#fff;border:1px solid #00796B;'
      + 'border-radius:3px;font-size:11px;padding:1px 7px;cursor:pointer;}'
      + '.kriss-pps-x{position:absolute;top:4px;right:6px;background:none;border:none;'
      + 'font-size:16px;color:#00695C;cursor:pointer;}'
      + 'tr.kriss-pps-target > td{background:#FFF9C4 !important;}'
      + 'tr.kriss-pps-hold > td{background:#F5F5F5 !important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  // ============================================================
  // 11. UI 헬퍼
  // ============================================================
  //  mkBtn: 상단 공용 버튼 생성 (v1.5.0 — 크기 축소 / v1.6.0 — MARK 표식 추가)
  function mkBtn(parent, text, bg, border, handler, id) {
    var b = document.createElement('button');
    b.type = 'button';
    if (id) b.id = id;
    b.setAttribute(MARK, '1');
    b.textContent = text;
    b.style.cssText = 'margin-left:4px;background:' + bg + ';color:#fff;border:1px solid '
      + border + ';border-radius:3px;font-weight:normal;font-size:11px;padding:2px 8px;'
      + 'cursor:pointer;vertical-align:middle;line-height:16px;'
      + 'font-family:Malgun Gothic,sans-serif;';
    b.addEventListener('click', handler);
    b.addEventListener('mouseenter', function () { b.style.opacity = '0.85'; });
    b.addEventListener('mouseleave', function () { b.style.opacity = '1'; });
    parent.appendChild(b);
    return b;
  }

  function showBadge(target, anchorEl, badgeId) {
    var old = document.getElementById(badgeId);
    if (old) old.remove();
    var badge = document.createElement('span');
    badge.id = badgeId;
    badge.setAttribute(MARK, '1');

    var isRetired = target.source.indexOf('\uD1F4\uC9C1') !== -1;
    var noEmpNo = !target.person.empNo;

    var bg, border, color;
    if (noEmpNo) {
      bg = '#FFF8E1'; border = '#FFC107'; color = '#F57F17';
    } else if (isRetired) {
      bg = '#FFF3E0'; border = '#FF9800'; color = '#E65100';
    } else {
      bg = '#E8F5E9'; border = '#4CAF50'; color = '#2E7D32';
    }

    badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 8px;'
      + 'border-radius:3px;font-size:11px;vertical-align:middle;'
      + 'background:' + bg + ';border:1px solid ' + border + ';color:' + color + ';';

    if (noEmpNo) {
      badge.textContent = '\u26A0 ' + target.source + ' '
        + target.person.empNm + ' (사번 조회 중\u2026)';
    } else {
      badge.textContent = (isRetired ? '\u26A0 ' : '\u2713 ')
        + target.source + ' ' + target.person.empNm
        + ' (' + target.person.empNo + ')';
    }
    anchorEl.parentNode.appendChild(badge);
  }

  function toast(msg, type) {
    var old = document.getElementById('krissHelperToast');
    if (old) old.remove();
    var colors = { ok: '#4CAF50', warn: '#FF9800', error: '#F44336', info: '#2196F3' };
    var el = document.createElement('div');
    el.id = 'krissHelperToast';
    el.setAttribute(MARK, '1');
    el.style.cssText = 'position:fixed;top:12px;right:12px;background:'
      + (colors[type] || '#333') + ';color:#fff;padding:10px 18px;border-radius:6px;'
      + 'z-index:100000;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.3);'
      + 'max-width:500px;font-family:Malgun Gothic,sans-serif;'
      + 'display:flex;align-items:center;gap:10px;';

    var msgSpan = document.createElement('span');
    msgSpan.textContent = TAG + ' ' + msg;
    msgSpan.style.flex = '1';
    el.appendChild(msgSpan);

    var closeBtn = document.createElement('span');
    closeBtn.textContent = '\u00D7';
    closeBtn.style.cssText = 'cursor:pointer;font-size:18px;font-weight:bold;'
      + 'opacity:0.8;flex-shrink:0;';
    closeBtn.addEventListener('click', function () { el.remove(); });
    el.appendChild(closeBtn);

    document.body.appendChild(el);

    var duration = (type === 'error') ? 10000 : 4000;
    setTimeout(function () { if (el.parentNode) el.remove(); }, duration);
  }

  // ============================================================
  // 12. DOM / 통신 / 쿠키 유틸리티
  // ============================================================
  function getText(sel) {
    var el = document.querySelector(sel);
    return el ? el.textContent.trim() : '';
  }

  function triggerChange(el) {
    try { $(el).trigger('change'); } catch (e) {}
  }

  function waitFor(selector, timeout, onSuccess, onTimeout) {
    var elapsed = 0, interval = 500;
    var timer = setInterval(function () {
      elapsed += interval;
      var el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        clearInterval(timer);
        onSuccess();
      } else if (elapsed >= timeout) {
        clearInterval(timer);
        if (onTimeout) onTimeout();
      }
    }, interval);
  }

  // [v1.6.0] 조회 전용 POST 공통 — 1순위 kriss.ajax.post, 폴백 fetch(JSON)
  function postJson(url, body, onOk, onErr) {
    try {
      if (window.kriss && kriss.ajax && kriss.ajax.post) {
        kriss.ajax.post(url, body, function (res) { onOk(res); }, '#con_center');
        return;
      }
    } catch (e) { console.warn(TAG, 'kriss.ajax.post 실패:', e.message); }
    try {
      fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json(); })
        .then(function (j) { onOk(j); })
        .catch(function (err) { if (onErr) onErr(err.message || String(err)); });
    } catch (e2) {
      if (onErr) onErr(e2.message || String(e2));
    }
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return match ? match[1] : null;
  }

  function setCrossCookie(key, data) {
    var val = encodeURIComponent(JSON.stringify(data));
    document.cookie = key + '=' + val
      + '; domain=.kriss.re.kr; path=/; max-age=' + COOKIE_TTL
      + '; SameSite=Lax';
  }

  function readAndClearCookie(key) {
    var raw = getCookie(key);
    if (!raw) return null;

    document.cookie = key + '=; domain=.kriss.re.kr; path=/; max-age=0';

    var data;
    try {
      data = JSON.parse(decodeURIComponent(raw));
    } catch (e) {
      console.warn(TAG, key + ' 파싱 실패:', e.message);
      return null;
    }

    if (Date.now() - data.ts > COOKIE_TTL * 1000) {
      console.warn(TAG, key + ' 만료');
      return null;
    }

    return data;
  }

  function logFill(role, target, isManual) {
    console.log(TAG, role + ' 입력:', target.person.empNm,
      '(' + (target.person.empNo || '사번없음') + ')',
      '[' + target.source + ']',
      isManual ? '(수동)' : '(자동)');
  }

  // ============================================================
  // 13. [v1.7.0] 출원신청 팝업 (S_PMS_03012020)
  //   (1) 특허법률사무소: 선행기술조사서(#ppsRqstNo) → selectPpsRqst.json 조회 후
  //       busiRegNm/plfMgmtNo 를 #plfNm/#plfMgmtNo 에 자동 입력
  //       (선행조사 번호 없으면 의뢰희망 사무소(#plfMgmtNm) 이름만 채우고 경고)
  //   (2) 완료희망일자: 국내 2주 / 국외·PCT 3주 (관리번호 끝 국가코드 기준)
  //   ※ 임시저장·출원지시 버튼은 자동 클릭하지 않음
  // ============================================================
  function initAplyPopup() {
    injectPpsStyle();
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tries > 100) { clearInterval(t); console.warn(TAG, '출원신청 팝업 초기화 타임아웃'); return; }
      if (typeof window.$ === 'undefined') return;
      var dp = null;
      try { dp = $('#cmplNeedDt').data('kendoDatePicker'); } catch (e) {}
      if (!dp) return;
      if (!readMngNo()) return;      // getIntellRqstInfo(AJAX) 완료 대기
      clearInterval(t);

      addAplyButtons();
      setTimeout(function () {
        if (!isAplyEditable()) {
          console.log(TAG, '출원신청 편집 단계 아님(신청 이후) — 자동입력 생략');
          return;
        }
        fillPpsDueDate(false);          // 완료희망일자
        fillAplyPlfFromPps(false);      // 특허법률사무소
      }, 900);
    }, 300);
  }

  // 편집 가능 단계 판정 — 임시저장 버튼이 보이는 경우만(신청 이후에는 khide 처리됨)
  function isAplyEditable() {
    var save = document.getElementById('btnSave');
    if (!save) return false;
    return window.getComputedStyle(save).display !== 'none';
  }

  function addAplyButtons() {
    var area = document.querySelector('.titlegroup3 .ft_right');
    if (!area) return;
    if (!document.getElementById('krissAplyPlfBtn')) {
      mkBtn(area, '\uC0AC\uBB34\uC18C\uC5F0\uACC4', '#3F51B5', '#303F9F', function () {   // 사무소연계
        fillAplyPlfFromPps(true);
      }, 'krissAplyPlfBtn');
    }
    addPpsDueButton();   // '+14일' 또는 '+21일'
  }

  function fillAplyPlfFromPps(force) {
    var nmEl = document.getElementById('plfNm');
    var noEl = document.getElementById('plfMgmtNo');
    if (!nmEl || !noEl) { toast('#plfNm / #plfMgmtNo 필드를 찾을 수 없습니다.', 'error'); return; }
    if (!force && nmEl.value && nmEl.value.trim()) {
      console.log(TAG, '특허법률사무소 기존 값 유지:', nmEl.value);
      return;
    }

    var ppsEl = document.getElementById('ppsRqstNo');
    var ppsNo = ppsEl ? String(ppsEl.value || '').trim() : '';
    if (!ppsNo) {
      console.log(TAG, '선행기술조사서 번호 없음 — 의뢰희망 사무소로 폴백');
      fallbackPlfFromSpan();
      return;
    }

    getJson('/pms/iprs/pps/selectPpsRqst.json', { rqstNo: ppsNo }, function (res) {
      var d = (res && res.data) ? res.data : null;
      if (!d) { fallbackPlfFromSpan(); return; }
      var plfNm = String(d.busiRegNm || '').trim();
      var plfNo = String(d.plfMgmtNo || '').trim();
      if (!plfNm && !plfNo) { fallbackPlfFromSpan(); return; }
      setAplyPlf(plfNm, plfNo, '선행조사 ' + ppsNo);
    }, function (msg) {
      console.warn(TAG, 'selectPpsRqst 조회 실패:', msg);
      fallbackPlfFromSpan();
    });
  }

  // 폴백: 신고서의 '의뢰희망 특허사무소'(#plfMgmtNm) — 이름만 존재, 관리번호 없음
  function fallbackPlfFromSpan() {
    var want = getText('#plfMgmtNm');
    if (!want) {
      toast('선행기술조사·의뢰희망 사무소 정보를 찾을 수 없습니다. 돋보기 버튼으로 선택해 주세요.', 'warn');
      return;
    }
    setAplyPlf(want, '', '의뢰희망 사무소');
  }

  function setAplyPlf(plfNm, plfNo, src) {
    var nmEl = document.getElementById('plfNm');
    var noEl = document.getElementById('plfMgmtNo');
    if (!nmEl || !noEl) return;

    if (plfNm) { nmEl.value = plfNm; triggerChange(nmEl); }
    if (plfNo) { noEl.value = plfNo; triggerChange(noEl); }
    try { $(nmEl).removeClass('k-invalid'); } catch (e) {}

    showPlfBadge(plfNm, plfNo, src);
    if (plfNo) {
      console.log(TAG, '특허법률사무소 자동입력:', plfNm, '(' + plfNo + ')', '[' + src + ']');
      toast('특허법률사무소 자동입력: ' + plfNm + ' [' + src + ']', 'ok');
    } else {
      console.warn(TAG, '사무소 관리번호 미확인:', plfNm, '[' + src + ']');
      toast(plfNm + ' \u2014 사무소 관리번호 미확인. 돋보기 버튼으로 다시 선택해 주세요.', 'warn');
    }
  }

  function showPlfBadge(plfNm, plfNo, src) {
    var old = document.getElementById('krissAplyPlfBadge');
    if (old) old.remove();
    var nmEl = document.getElementById('plfNm');
    if (!nmEl) return;
    var wrap = (nmEl.closest ? nmEl.closest('td') : null) || nmEl.parentNode;

    var b = document.createElement('span');
    b.id = 'krissAplyPlfBadge';
    b.setAttribute(MARK, '1');
    var okColor = !!plfNo;
    b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:3px;'
      + 'font-size:11px;vertical-align:middle;font-family:Malgun Gothic,sans-serif;'
      + (okColor
        ? 'background:#E8EAF6;border:1px solid #3F51B5;color:#283593;'
        : 'background:#FFF8E1;border:1px solid #FFC107;color:#F57F17;');
    b.textContent = (okColor ? '\u2713 ' : '\u26A0 ') + src
      + (plfNo ? ' \u2192 ' + plfNo : ' (관리번호 미확인)');
    wrap.appendChild(b);
  }

  // [v1.7.0] 조회 전용 GET 공통 — 1순위 kriss.ajax.get, 폴백 fetch
  function getJson(url, params, onOk, onErr) {
    try {
      if (window.kriss && kriss.ajax && kriss.ajax.get) {
        kriss.ajax.get(url, params, function (res) { onOk(res); }, '#con_center');
        return;
      }
    } catch (e) { console.warn(TAG, 'kriss.ajax.get 실패:', e.message); }
    try {
      var qs = [];
      for (var k in (params || {})) {
        if (Object.prototype.hasOwnProperty.call(params, k)) {
          qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
        }
      }
      fetch(url + (qs.length ? ('?' + qs.join('&')) : ''), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) { onOk(j); })
        .catch(function (err) { if (onErr) onErr(err.message || String(err)); });
    } catch (e2) {
      if (onErr) onErr(e2.message || String(e2));
    }
  }


  REF_LOCAL.push(
    {g:'신청·선행조사',n:'신청 내용 보완 요청',f:'iven',w:['신청','보완'],c:'안녕하십니까. 기술사업화그룹 송훈찬입니다. 신청 내용 중 OO 사항의 확인이 필요하여 안내드립니다.\n해당 내용을 보완하시어 회신 부탁드립니다.'},
    {g:'신청·선행조사',n:'선행조사 결과 검토 요청',f:'iven',w:['선행조사','선행기술조사','조사결과'],c:'안녕하십니까. 기술사업화그룹 송훈찬입니다. 선행기술조사 결과를 전달드립니다.\n인용문헌과 본 발명의 차이점 및 보완할 내용을 검토하시어 회신 부탁드립니다.'},
    {g:'신청·선행조사',n:'선행조사 진행 요청',f:'plf',w:['선행조사','선행기술조사'],c:'첨부된 발명 내용을 바탕으로 선행기술조사 진행을 요청드립니다.\n조사에 추가 자료가 필요하거나 일정 협의가 필요한 경우 알려 주십시오.'},
    {g:'명세서·출원',n:'명세서 초안 검토 요청',f:'iven',w:['명세서','초안'],c:'안녕하십니까. 기술사업화그룹 송훈찬입니다. 특허사무소에서 보내온 명세서 초안을 전달드립니다.\n발명 내용과 청구범위가 적절히 반영되었는지 검토하시고, 수정할 사항이 있으면 함께 회신 부탁드립니다.'},
    {g:'내부 검토',n:'내부 검토 의견 작성',f:'internal',w:[],c:'검토 대상: OO\n확인 내용: OO\n보완 또는 후속 조치: OO'}
  );

  // Phrase library: recipient and task category are independent from storage origin.
  var REF_CFG = {
    API:'/pms/iprs/etcTask/selectRefContList.json', USE_SERVER:true,
    TARGETS:['reptCntnt','cmplCntnt','plfDlivMatt','mssage','rejectCntnt','mainIvenCntnt','cnfOpi'],
    MINE_KEY:'kriss.ref.mine.v1', BACKUP_KEY:'kriss.ref.mine.before1.10', HIDDEN_KEY:'kriss.ref.hidden.v1',
    SERVER_GRP:'서버 문구', RETRY:20
  };
  var REF_ROLES = {'':'공통·대상 미지정',iven:'발명자 안내',plf:'사무소 전달',internal:'내부 검토',rej:'반려·보완'};
  var REF_CATEGORIES = {application:'신청·선행조사',draft:'명세서·출원',oa:'OA·심사 대응',rejection:'거절결정 대응',foreign:'해외·PCT',registration:'등록',maintenance:'연차·유지',cost:'비용·계산서',change:'서지·자료 보완',common:'공통·회신',return:'반려·보완'};
  var REF_CATEGORY_BY_NAME = {
    '대응안 수정본 전달':'oa','명세서 수정 초안 전달':'draft','의견제출통지서 추가 접수':'oa',
    '거절결정 통지':'rejection','대응방향 조회(재심사/심판/포기)':'rejection','거절결정 대응안 검토':'rejection','거절 확정 · 종결 안내':'rejection',
    '심사청구 여부 확인':'oa','우선심사 신청 여부 확인':'oa','출원 완료 통보':'draft','공개공보 발행 안내':'draft','심사관 면담 · 보정안 리뷰':'oa','분할출원 검토 요청':'draft',
    '서지 · 명칭 변경 확인':'change','포기 · 취하 여부 확인':'common','등록결정 · 등록 진행 여부':'registration',
    '원안 그대로 진행':'common','수정 반영 후 진행':'common','진행하지 않음':'common','회신 지연 안내':'common','기한 연장 요청':'common','등록료 납부 · 등록 진행 요청':'registration',
    '회신 요청(2차 · 최종)':'common','단순 확인 요청':'common','제출 완료 보고 전달':'oa','1차 OA 대응안 검토 요청':'oa','2차·최종 OA(FOA) 대응안 검토 요청':'oa','추가 OA 대응안 검토 요청':'oa','해외 OA 검토보고서 전달':'oa',
    'PCT 국내단계 진입 여부 확인':'foreign','우선권 주장 해외출원 여부 확인':'foreign','번역문 확인 요청':'foreign','정보제공·이의신청 대응 확인':'oa','서열목록·도면 보완 요청':'change',
    '등록료 납부 안내':'registration','연차유지료 유지 여부 확인':'maintenance','대응안 제출 지시':'oa','심사청구 진행 요청':'oa','연차유지료 납부·포기 통보':'maintenance','세금계산서 발행 요청(비용청구서)':'cost','대상 건 오류':'return','첨부 누락':'return',
    '신청 내용 보완 요청':'application','선행조사 결과 검토 요청':'application','선행조사 진행 요청':'application','명세서 초안 검토 요청':'draft','내부 검토 의견 작성':'common'
  };
  var RF = {cache:null,local:null,loading:false,loaded:false,back:null,open:false,mounted:false,bound:false,
    ta:null,flat:[],sel:-1,selected:null,drafts:{},session:0,undo:null,storageError:false,newDraft:false};
  var RF_PH = /(OOOO\.OO\.OO\.|OOOO\.OO\.OO|OO월 OO일|OOO원|OOOO|OO)/;
  function refHash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
  function refFold(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
  function refHas(obj,key){return Object.prototype.hasOwnProperty.call(obj,key);}
  function refRoleNm(r){return REF_ROLES[r] || REF_ROLES[''];}
  function refKeyOf(x){return x ? x.id : '';}
  function refEnsureThanks(text,role){
    var t=String(text||'').trim();
    if(!t || role==='internal' || /감사(?:합니다|드립니다)[.!。]?(?:\s+[^\n]{1,30}(?:드림|올림))?\s*$/.test(t))return t;
    return t+'\n\n감사합니다.';
  }
  function refNotice(msg,kind){
    if(RF.status){RF.status.textContent=msg;RF.status.setAttribute('data-kind',kind||'info');}
    else toast(msg,kind||'info');
  }
  function refCategory(text){
    var s=refFold(text);
    if(/반려|첨부누락/.test(s))return 'return';
    if(/계산서|비용|청구서|예산/.test(s))return 'cost';
    if(/연차|유지료/.test(s))return 'maintenance';
    if(/거절결정|불복|재심사|거절대응/.test(s))return 'rejection';
    if(/pct|해외|국외|번역|우선권|국내단계/.test(s))return 'foreign';
    if(/등록/.test(s))return 'registration';
    if(/명세서|초안|출원완료|출원 완료|분할/.test(s))return 'draft';
    if(/(?:^|[^a-z])oa(?:[^a-z]|$)|의견제출|대응안|심사|보정/.test(s))return 'oa';
    if(/선행|발명신고|지식재산권신청|지재권신청/.test(s))return 'application';
    if(/서지|명칭|정보변경|서열|도면|보완/.test(s))return 'change';
    return '';
  }
  function refTxt(id){var el=document.getElementById(id);if(!el)return '';if(el.tagName==='SELECT'){var opt=el.options[el.selectedIndex];return opt?String(opt.textContent||'').trim():'';}return String(typeof el.value==='string'?el.value:el.textContent||'').trim();}
  function refContext(){
    var cls=refTxt('rqstTpeNm') || refTxt('rqstTpe');
    var sbjt=[refTxt('rqstSbjt'),refTxt('rqstClsNm')].join(' ');
    var body=[refTxt('rqstCntnt'),refTxt('plfRqstCntnt'),refTxt('memo')].join(' ');
    return {cls:cls,sbjt:sbjt,body:body,all:cls+' '+sbjt+' '+body,category:refCategory(cls)||refCategory(sbjt)};
  }
  function refRoleOf(ta){
    if(!ta)return '';
    var lab='';
    try{
      var cell=ta.closest('td'), th=cell && cell.previousElementSibling;
      if(th && th.tagName==='TH')lab=th.textContent||'';
      if(!lab && ta.id){var labels=document.querySelectorAll('label');for(var i=0;i<labels.length;i++)if(labels[i].htmlFor===ta.id){lab=labels[i].textContent||'';break;}}
    }catch(e){}
    lab=lab.replace(/\s+/g,'');
    if(/반려/.test(lab) || ta.id==='rejectCntnt')return 'rej';
    if(/특허사무소.*전달|사무소전달/.test(lab) || ta.id==='plfDlivMatt')return 'plf';
    if(/검토자의견|내부검토|발명자의견/.test(lab) || ta.id==='cnfOpi' || ta.id==='mainIvenCntnt')return 'internal';
    if(/지재권담당자의견|지식재산권담당자의견|발명자.*안내|발명자.*전달/.test(lab))return 'iven';
    return '';
  }
  function refKeyword(text,word){
    var s=refFold(text), k=refFold(word);if(!k)return false;
    if(/^[a-z]{1,3}$/.test(k))return new RegExp('(^|[^a-z0-9])'+k+'([^a-z0-9]|$)','i').test(s);
    return s.indexOf(k)>=0;
  }
  function refScore(x,ctx,role){
    if(role==='all')role='';
    if(role && x.f && x.f!==role)return {sc:-1,why:[]};
    if(x.manualOnly)return {sc:0,why:[]};
    var sc=0,why=[];
    if(ctx.category && x.category===ctx.category){sc+=80;why.push(REF_CATEGORIES[x.category]);}
    (x.w||[]).forEach(function(k){if(refKeyword(ctx.cls,k)){sc+=30;why.push(k);}else if(refKeyword(ctx.sbjt,k)){sc+=18;why.push(k);}else if(refKeyword(ctx.body,k)){sc+=5;why.push(k);}});
    if(sc>0 && role && x.f===role)sc+=20;
    return {sc:sc,why:Array.from(new Set(why))};
  }
  function normRefList(arr,defGrp,source){
    var counts=Object.create(null),out=[];source=source||'builtin';
    (Array.isArray(arr)?arr:[]).forEach(function(x){
      if(!x || typeof x!=='object')return;
      var name=String(x.refNm!==undefined?x.refNm:x.n||'');
      var content=x.refCont!==undefined?x.refCont:x.c;
      content=Array.isArray(content)?content.join('\n'):String(content||'');
      if(!content.trim())return;
      var f=Object.prototype.hasOwnProperty.call(REF_ROLES,x.f)?x.f:'';
      var category=refHas(REF_CATEGORIES,x.category)?x.category:(source==='builtin' && refHas(REF_CATEGORY_BY_NAME,name)?REF_CATEGORY_BY_NAME[name]:'')||'common';
      var stem=source+':'+(x.refCd || refHash((x.grp||x.g||defGrp||'')+'\u0001'+name+'\u0001'+content));
      var occurrence=counts[stem]||0;counts[stem]=occurrence+1;
      out.push({id:stem+':'+occurrence,refNm:name||'이름 없는 문구',refCont:source==='builtin'?refEnsureThanks(content,f):content,
        grp:String(x.grp||x.g||defGrp||''),f:f,category:category,w:Array.isArray(x.w)?x.w:[],source:source,mine:false,
        manualOnly:source==='builtin' && /^(거절 확정|진행하지 않음|연차유지료 납부·포기 통보)/.test(name)});
    });return out;
  }
  function refMineLoad(){
    RF.storageError=false;
    try{
      var raw=localStorage.getItem(REF_CFG.MINE_KEY), arr=raw?JSON.parse(raw):[];
      if(!Array.isArray(arr) || arr.some(function(x){return !x || typeof x!=='object' || typeof x.refCont!=='string';}))throw Error('저장 형식 확인 필요');
      var seen=Object.create(null);
      return arr.map(function(x){var copy=Object.assign({},x);var stem=copy.id || 'legacy:'+refHash(JSON.stringify([x.refNm,x.refCont,x.f,x.at]));var n=seen[stem]||0;seen[stem]=n+1;copy.id=n?stem+':'+n:stem;copy.category=refHas(REF_CATEGORIES,x.category)?x.category:'common';copy.f=refHas(REF_ROLES,x.f)?x.f:'';return copy;});
    }catch(e){RF.storageError=true;refNotice('내 문구를 읽지 못했습니다. 기존 저장 데이터는 보존했습니다.','error');return [];}
  }
  function refMineSave(arr){
    try{
      if(RF.storageError)return false;
      var raw=localStorage.getItem(REF_CFG.MINE_KEY);
      if(raw && !localStorage.getItem(REF_CFG.BACKUP_KEY))localStorage.setItem(REF_CFG.BACKUP_KEY,raw);
      localStorage.setItem(REF_CFG.MINE_KEY,JSON.stringify(arr));return true;
    }catch(e){refNotice('문구 저장에 실패했습니다. 저장 공간 또는 브라우저 설정을 확인해 주세요.','error');return false;}
  }
  function refMineList(){return refMineLoad().map(function(x){return Object.assign({},x,{mine:true,source:'mine',grp:'내 문구',w:Array.isArray(x.w)?x.w:[]});});}
  function refRecordEqual(a,b){return ['refNm','refCont','f','category'].every(function(k){return String(a[k]||'')===String(b[k]||'');});}
  function refSavePhrase(data,expected){
    var name=String(data.refNm||'').trim(), content=String(data.refCont||'').trim();
    if(!name || !content){refNotice('문구 이름과 내용을 모두 입력해 주세요.','error');return false;}
    if(!refHas(REF_CATEGORIES,data.category) || !refHas(REF_ROLES,data.f)){refNotice('전달 대상과 업무 분류를 선택해 주세요.','error');return false;}
    var arr=refMineLoad();if(RF.storageError)return false;
    var idx=data.id?arr.findIndex(function(x){return x.id===data.id;}):-1;
    if(data.id && (idx<0 || (expected && !refRecordEqual(arr[idx],expected)))){refNotice('다른 창에서 수정·삭제된 문구입니다. 복사 등록하거나 다시 선택해 주세요.','error');return false;}
    var rec={id:data.id || 'mine:'+Date.now().toString(36)+':'+Math.random().toString(36).slice(2,10),refNm:name,refCont:content,f:data.f,category:data.category,w:Array.isArray(data.w)?data.w:[],at:Date.now()};
    if(idx>=0)arr[idx]=rec;
    else{var same=arr.find(function(x){return refRecordEqual(x,rec);});if(same)return same;if(arr.length>=1000){refNotice('내 문구가 1,000개입니다. 정리한 뒤 등록해 주세요.','error');return false;}arr.unshift(rec);}
    return refMineSave(arr)?rec:false;
  }
  function refHiddenLoad(){try{var v=JSON.parse(localStorage.getItem(REF_CFG.HIDDEN_KEY)||'[]');if(!Array.isArray(v))throw Error();return v;}catch(e){refNotice('숨김 목록을 읽지 못했습니다. 저장 데이터를 확인해 주세요.','error');return null;}}
  function refHiddenSave(arr){try{localStorage.setItem(REF_CFG.HIDDEN_KEY,JSON.stringify(arr));return true;}catch(e){refNotice('숨김 설정을 저장하지 못했습니다.','error');return false;}}
  function refDeletePhrase(item){
    if(!item)return false;
    if(item.mine){
      var arr=refMineLoad();if(RF.storageError)return false;
      var idx=arr.findIndex(function(x){return x.id===item.id;});
      if(idx<0 || !refRecordEqual(arr[idx],item)){refNotice('문구가 다른 창에서 변경되었습니다. 다시 선택해 주세요.','error');return false;}
      var record=arr.splice(idx,1)[0];if(!refMineSave(arr))return false;
      RF.undo={kind:'mine',record:record,index:idx};
    }else{
      var hidden=refHiddenLoad();if(!hidden)return false;if(hidden.indexOf(item.id)<0)hidden.push(item.id);
      if(!refHiddenSave(hidden))return false;RF.undo={kind:'hidden',id:item.id};
    }return true;
  }
  function refUndoDelete(){
    var undo=RF.undo;if(!undo)return false;
    if(undo.kind==='mine'){
      var arr=refMineLoad();if(RF.storageError)return false;
      if(arr.some(function(x){return x.id===undo.record.id;})){refNotice('이미 복원되었거나 변경된 문구가 있습니다.','error');return false;}
      arr.splice(Math.min(undo.index,arr.length),0,undo.record);if(!refMineSave(arr))return false;
    }else{var hidden=refHiddenLoad();if(!hidden || !refHiddenSave(hidden.filter(function(id){return id!==undo.id;})))return false;}
    RF.undo=null;return true;
  }
  function refVisibleItems(items,filters,ctx){
    var tokens=refFold(filters.query).split(' ').filter(Boolean),hidden=filters.hidden||[];
    return items.filter(function(x){
      var isHidden=hidden.indexOf(x.id)>=0;if(filters.view==='hidden'?!isHidden:isHidden)return false;
      if(filters.view==='mine' && !x.mine)return false;
      if(filters.role==='' && x.f)return false;
      if(filters.role && filters.role!=='all' && x.f && x.f!==filters.role)return false;
      if(filters.category && filters.category!=='all' && x.category!==filters.category && x.category!=='common')return false;
      var hay=refFold([x.refNm,x.refCont,x.grp,refRoleNm(x.f),REF_CATEGORIES[x.category],(x.w||[]).join(' ')].join(' '));
      if(!tokens.every(function(k){return hay.indexOf(k)>=0;}))return false;
      return filters.view!=='recommended' || refScore(x,ctx,filters.role==='all'?'':filters.role).sc>0;
    }).sort(function(a,b){
      if(filters.view==='recommended'){var diff=refScore(b,ctx,filters.role).sc-refScore(a,ctx,filters.role).sc;if(diff)return diff;}
      return Number(b.mine)-Number(a.mine) || Object.keys(REF_CATEGORIES).indexOf(a.category)-Object.keys(REF_CATEGORIES).indexOf(b.category) || a.refNm.localeCompare(b.refNm,'ko');
    });
  }
  function loadRefList(onDone){
    if(!RF.local)RF.local=normRefList(REF_LOCAL,'기본 문구','builtin');
    if(!RF.cache)RF.cache=RF.local;
    if(RF.loaded || RF.loading || !REF_CFG.USE_SERVER){onDone();return;}
    RF.loading=true;
    postJson(REF_CFG.API,{q_refCd:'',q_refCont:''},function(res){
      var server=res && res.data;
      RF.cache=RF.local.concat(normRefList(Array.isArray(server)?server:[],REF_CFG.SERVER_GRP,'server'));
      RF.loading=false;RF.loaded=true;onDone();
    },function(){RF.loading=false;RF.loaded=true;onDone();refNotice('서버 문구함을 읽지 못해 기본 문구와 내 문구를 표시합니다.');});
  }

  function isRefEditable(el){
    if(!el || el.disabled || el.readOnly || el.isConnected===false)return false;
    if(el.tagName!=='TEXTAREA' && !(el.tagName==='INPUT' && /^(text|search|url|email|tel)$/.test(el.type||'text')))return false;
    if(el.getAttribute && el.getAttribute('readonly')!==null)return false;
    try{var css=window.getComputedStyle(el);if(css.display==='none' || css.visibility==='hidden' || !el.getClientRects().length)return false;}catch(e){}
    return true;
  }
  function attachRefButtons(){
    var n=0;REF_CFG.TARGETS.forEach(function(id){var el=document.getElementById(id);if(!isRefEditable(el))return;
      el.setAttribute('data-kriss-ref','1');if(!/Alt\+7/.test(el.title||''))el.title=(el.title?el.title+' / ':'')+'문구 삽입: Alt+7';n++;});return n;
  }
  function initRefPhrases(){
    injectRefStyle();bindRefHotkeys();var tries=0;
    var timer=setInterval(function(){if(attachRefButtons()>0 || ++tries>=REF_CFG.RETRY)clearInterval(timer);},400);
  }
  function refOptions(values,all){return (all?'<option value="all">'+all+'</option>':'')+Object.keys(values).map(function(k){return '<option value="'+k+'">'+values[k]+'</option>';}).join('');}
  function refEl(tag,cls,text){var el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
  function mountRefModal(){
    if(RF.mounted)return;injectRefStyle();
    var back=refEl('div','krf-back');back.setAttribute(MARK,'1');back.hidden=true;
    back.innerHTML='<section class="krf" role="dialog" aria-modal="true" aria-labelledby="krf-title">'+
      '<header class="krf-head"><div><b id="krf-title">업무 문구</b><span class="krf-context"></span></div><button type="button" class="krf-close" aria-label="문구 창 닫기">✕</button></header>'+
      '<div class="krf-tools"><label class="krf-search-label">검색<input class="krf-search" aria-label="문구 검색" placeholder="이름·내용·업무 키워드" autocomplete="off"></label>'+
      '<label>전달 대상<select class="krf-role-filter" aria-label="전달 대상 필터">'+refOptions(REF_ROLES,'모든 대상')+'</select></label>'+
      '<label>업무 분류<select class="krf-category-filter" aria-label="업무 분류 필터">'+refOptions(REF_CATEGORIES,'모든 업무')+'</select></label></div>'+
      '<div class="krf-bar"><nav aria-label="문구 목록"><button type="button" data-view="recommended">추천</button><button type="button" data-view="all">전체</button><button type="button" data-view="mine">내 문구</button><button type="button" data-view="hidden">숨김</button></nav><button type="button" class="krf-new">＋ 새 문구</button></div>'+
      '<div class="krf-body"><div class="krf-list" role="listbox" aria-label="문구 목록" tabindex="0"></div><div class="krf-editor">'+
      '<label>문구 이름<input class="krf-name" aria-label="문구 이름" title="이름 칸에서 Enter를 누르면 등록·저장합니다." placeholder="예: 등록결정 검토 요청"></label>'+
      '<div class="krf-fields"><label>이 문구의 전달 대상<select class="krf-role" aria-label="문구 전달 대상">'+refOptions(REF_ROLES)+'</select></label><label>이 문구의 업무 분류<select class="krf-category" aria-label="문구 업무 분류">'+refOptions(REF_CATEGORIES)+'</select></label></div>'+
      '<label class="krf-content-label">내용<textarea class="krf-edit" aria-label="문구 내용" spellcheck="false" placeholder="내용을 입력하세요. Shift+Enter로 줄바꿈합니다."></textarea></label>'+
      '<div class="krf-editinfo"><span class="krf-origin"></span><button type="button" class="krf-thanks">감사합니다. 추가</button></div>'+
      '<div class="krf-manage"><button type="button" class="krf-save">내 문구로 등록</button><button type="button" class="krf-copy">복사 등록</button><span></span><button type="button" class="krf-delete">숨기기</button></div>'+
      '<div class="krf-insert"><button type="button" class="krf-insert-btn">삽입 ↵</button><button type="button" class="krf-replace-btn">전체 교체</button><small>현재 입력칸에 반영합니다.</small></div></div></div>'+
      '<div class="krf-feedback"><span class="krf-status" role="status" aria-live="polite"></span><button type="button" class="krf-undo" hidden>삭제 되돌리기</button></div>'+
      '<footer class="krf-foot">검색·목록·내용: Enter 삽입 · Shift+Enter 줄바꿈 · Ctrl+Enter 전체 교체 · Ctrl+S 등록/저장 · Esc 닫기</footer></section>';
    document.body.appendChild(back);RF.back=back;
    function q(s){return back.querySelector(s);}
    RF.input=q('.krf-search');RF.list=q('.krf-list');RF.prev=q('.krf-edit');RF.name=q('.krf-name');RF.role=q('.krf-role');RF.category=q('.krf-category');
    RF.roleFilter=q('.krf-role-filter');RF.categoryFilter=q('.krf-category-filter');RF.status=q('.krf-status');RF.origin=q('.krf-origin');RF.bSave=q('.krf-save');RF.bDelete=q('.krf-delete');RF.bUndo=q('.krf-undo');RF.mounted=true;
    function filter(){refCaptureDraft();renderRefList();}
    RF.input.addEventListener('input',function(){if(RF.view==='recommended' && RF.input.value.trim())RF.view='all';filter();});
    RF.roleFilter.addEventListener('change',filter);RF.categoryFilter.addEventListener('change',filter);
    back.querySelectorAll('[data-view]').forEach(function(btn){btn.addEventListener('click',function(){RF.view=btn.getAttribute('data-view');if(RF.view==='mine'||RF.view==='hidden'){RF.roleFilter.value='all';RF.categoryFilter.value='all';}filter();});});
    [RF.name,RF.role,RF.category,RF.prev].forEach(function(el){function edit(){if(!RF.selected)RF.newDraft=true;refCaptureDraft();paintRefMod();}el.addEventListener('input',edit);el.addEventListener('change',edit);});
    RF.list.addEventListener('click',function(e){var row=e.target.closest('[data-ref-id]');if(!row)return;var x=RF.flat.find(function(it){return it.id===row.getAttribute('data-ref-id');});if(x){refCaptureDraft();refSelect(x);RF.list.focus();}});
    RF.list.addEventListener('dblclick',function(e){var row=e.target.closest('[data-ref-id]');if(row && RF.selected && row.getAttribute('data-ref-id')===RF.selected.id)applyRef(RF.selected,false);});
    q('.krf-close').addEventListener('click',function(){closeRefModal();});
    q('.krf-new').addEventListener('click',refNewPhrase);
    q('.krf-save').addEventListener('click',function(){refSaveEditor(false);});q('.krf-copy').addEventListener('click',function(){refSaveEditor(true);});
    q('.krf-delete').addEventListener('click',refDeleteSelected);
    q('.krf-undo').addEventListener('click',function(){if(refUndoDelete()){renderRefList();refNotice('문구를 복원했습니다.');RF.bUndo.hidden=true;}});
    q('.krf-thanks').addEventListener('click',function(){RF.prev.value=refEnsureThanks(RF.prev.value,'');if(!RF.selected)RF.newDraft=true;refCaptureDraft();paintRefMod();});
    q('.krf-insert-btn').addEventListener('click',function(){applyRef(RF.selected,false);});q('.krf-replace-btn').addEventListener('click',function(){applyRef(RF.selected,true);});
    back.addEventListener('mousedown',function(e){if(e.target===back)closeRefModal();});
    back.addEventListener('compositionstart',function(){RF.composing=true;});back.addEventListener('compositionend',function(){RF.composing=false;RF.compositionEnded=Date.now();});
  }
  function refEditorData(){return {refNm:RF.name.value,refCont:RF.prev.value,f:RF.role.value,category:RF.category.value,w:RF.selected && RF.selected.w || []};}
  function refCaptureDraft(){
    if(!RF.mounted)return;
    if(RF.selected){
      var id=RF.selected.id,data=refEditorData(),base=RF.drafts[id]?RF.drafts[id].base:(RF.editBase || RF.selected);
      if(refRecordEqual(base,data))delete RF.drafts[id];
      else RF.drafts[id]={data:data,base:Object.assign({},base)};
    }else if(RF.newDraft)RF.drafts.__new=refEditorData();
  }
  function paintRefMod(){
    var cur=RF.selected, data=refEditorData();
    RF.bSave.textContent=cur && cur.mine?'수정 저장':'내 문구로 등록';
    RF.bDelete.disabled=!cur;RF.bDelete.textContent=RF.view==='hidden'?'숨김 해제':cur && cur.mine?'삭제':'숨기기';
    RF.origin.textContent=(cur?(cur.mine?'내 문구':cur.source==='server'?'서버 문구':'기본 문구'):'새 문구')+((cur && !refRecordEqual(cur,data))?' · 수정 중':'');
    RF.bUndo.hidden=!RF.undo;
  }
  function refSelect(x){
    RF.selected=x;RF.newDraft=false;RF.sel=RF.flat.findIndex(function(it){return it.id===x.id;});
    var draft=RF.drafts[x.id],data=draft?draft.data:x;RF.editBase=Object.assign({},draft?draft.base:x);
    RF.name.value=data.refNm||'';RF.prev.value=data.refCont||'';RF.role.value=data.f||'';RF.category.value=data.category||'common';
    paintRefSel();paintRefMod();
  }
  function paintRefSel(){RF.list.querySelectorAll('[data-ref-id]').forEach(function(row){var on=RF.selected && row.getAttribute('data-ref-id')===RF.selected.id;row.classList.toggle('on',!!on);row.setAttribute('aria-selected',on?'true':'false');});}
  function refNewPhrase(){
    refCaptureDraft();RF.selected=null;RF.sel=-1;RF.newDraft=true;
    var data=RF.drafts.__new || {refNm:'',refCont:'',f:RF.roleFilter.value==='all'?'':RF.roleFilter.value,category:RF.categoryFilter.value==='all'?'common':RF.categoryFilter.value};
    RF.name.value=data.refNm;RF.prev.value=data.refCont;RF.role.value=data.f;RF.category.value=data.category;
    paintRefSel();paintRefMod();refNotice('이름·전달 대상·업무 분류를 정한 뒤 내용을 등록하세요.');RF.name.focus();
  }
  function refSaveEditor(copy){
    var cur=RF.selected,data=refEditorData();
    if(cur && cur.mine && !copy)data.id=cur.id;
    var saved=refSavePhrase(data,data.id?(RF.editBase || cur):null);if(!saved)return;
    if(cur)delete RF.drafts[cur.id];else delete RF.drafts.__new;
    RF.newDraft=false;RF.input.value='';RF.view='mine';RF.roleFilter.value='all';RF.categoryFilter.value='all';RF.selected=null;
    renderRefList(saved.id);refNotice((data.id?'수정 저장':'등록')+'했습니다: '+saved.refNm);
  }
  function refDeleteSelected(){
    var cur=RF.selected;if(!cur)return;
    if(RF.view==='hidden'){
      var hidden=refHiddenLoad();if(!hidden || !refHiddenSave(hidden.filter(function(id){return id!==cur.id;})))return;
      RF.selected=null;renderRefList();refNotice('숨김을 해제했습니다. 전체 목록에서 다시 선택할 수 있습니다.');return;
    }
    if(!refDeletePhrase(cur.mine?Object.assign({},cur,RF.editBase||{}):cur))return;
    delete RF.drafts[cur.id];RF.selected=null;RF.newDraft=false;renderRefList();
    refNotice(cur.mine?'내 문구를 삭제했습니다. 되돌리기로 복원할 수 있습니다.':'이 브라우저의 목록에서 숨겼습니다. 숨김 탭에서 복원할 수 있습니다.');
  }
  function renderRefList(preferredId){
    if(!RF.open)return;
    var all=refMineList().concat(RF.cache||RF.local||[]), hidden=refHiddenLoad()||[];
    var filters={query:RF.input.value,role:RF.roleFilter.value,category:RF.categoryFilter.value,view:RF.view,hidden:hidden};
    RF.flat=refVisibleItems(all,filters,RF.ctx);RF.list.textContent='';
    RF.back.querySelectorAll('[data-view]').forEach(function(btn){btn.setAttribute('aria-pressed',btn.getAttribute('data-view')===RF.view?'true':'false');});
    RF.flat.forEach(function(x){
      var row=refEl('div','krf-item');row.setAttribute('role','option');row.setAttribute('data-ref-id',x.id);
      row.appendChild(refEl('strong','',x.refNm));row.appendChild(refEl('small','',refRoleNm(x.f)+' · '+REF_CATEGORIES[x.category]+(x.mine?' · 내 문구':'')));
      row.appendChild(refEl('p','',x.refCont));RF.list.appendChild(row);
    });
    if(!RF.flat.length)RF.list.appendChild(refEl('div','krf-empty',RF.view==='recommended'?'현재 분류에서 추천할 문구가 없습니다. 전체 탭이나 새 문구를 이용하세요.':'조건에 맞는 문구가 없습니다. 필터를 바꾸거나 새 문구를 등록하세요.'));
    var chosen=RF.flat.find(function(x){return x.id===(preferredId || (RF.selected && RF.selected.id));});
    if(chosen){RF.sel=RF.flat.indexOf(chosen);if(preferredId || !RF.selected || !refRecordEqual(RF.selected,chosen))refSelect(chosen);else paintRefSel();}
    else if(!RF.newDraft){if(RF.flat.length)refSelect(RF.flat[0]);else{RF.selected=null;RF.sel=-1;RF.name.value='';RF.prev.value='';RF.role.value=RF.roleFilter.value==='all'?'':RF.roleFilter.value;RF.category.value=RF.categoryFilter.value==='all'?'common':RF.categoryFilter.value;}}
    paintRefMod();
  }
  function openRefModal(ta){
    if(RF.open){RF.input.focus();return;}
    if(!isRefEditable(ta) || (RF.back && RF.back.contains(ta)))return;
    if(document.querySelector('.pal-back.on')){toast('특허 검색 팔레트를 닫은 뒤 문구 창을 열어 주세요.','info');return;}
    mountRefModal();RF.ta=ta;RF.targetValue=ta.value;RF.range={start:ta.selectionStart,end:ta.selectionEnd};RF.ctx=refContext();RF.session++;
    RF.open=true;RF.newDraft=false;RF.selected=null;RF.sel=-1;RF.drafts={};RF.composing=false;
    RF.input.value='';RF.roleFilter.value=refRoleOf(ta)||'all';RF.categoryFilter.value=RF.ctx.category||'all';
    RF.view=RF.ctx.category || RF.ctx.cls || RF.ctx.sbjt.trim()?'recommended':'all';
    RF.back.hidden=false;RF.back.classList.add('on');
    RF.back.querySelector('.krf-context').textContent='입력칸: '+(refRoleNm(refRoleOf(ta)))+(RF.ctx.cls?' · '+RF.ctx.cls:'');
    RF.status.textContent='기본 문구는 대부분 감사합니다.로 끝납니다. 기존 내 문구와 서버 원문은 보존합니다.';
    var session=RF.session;loadRefList(function(){if(RF.open && RF.session===session)renderRefList();});renderRefList();RF.input.focus();
  }
  function closeRefModal(){
    if(!RF.back)return;RF.open=false;RF.session++;RF.back.classList.remove('on');RF.back.hidden=true;RF.composing=false;
    if(RF.ta && RF.ta.isConnected!==false)try{RF.ta.focus();}catch(e){}
  }
  function moveRef(delta){
    if(!RF.flat.length)return;refCaptureDraft();var n=RF.flat.length;var next=(RF.sel+delta+n)%n;
    refSelect(RF.flat[next]);var row=RF.list.querySelector('[aria-selected="true"]');if(row)row.scrollIntoView({block:'nearest'});
  }
  function applyRef(x,replaceAll){
    var text=String(RF.prev.value||'');
    if(!text.trim()){refNotice('삽입할 내용이 비어 있습니다. 내용을 입력하거나 문구를 선택하세요.','error');return false;}
    if(!isRefEditable(RF.ta)){refNotice('입력칸이 닫혔거나 읽기 전용으로 바뀌었습니다. 입력 가능한 칸에서 다시 열어 주세요.','error');return false;}
    if(RF.ta.value!==RF.targetValue){refNotice('문구 창을 연 뒤 원래 입력칸 내용이 변경되었습니다. 닫았다가 다시 열어 주세요.','error');return false;}
    if(!insertRefText(RF.ta,text,replaceAll,RF.range))return false;
    closeRefModal();return true;
  }
  function insertRefText(ta,text,replaceAll,range){
    if(!isRefEditable(ta))return false;
    var before=ta.value,s=replaceAll?0:range && typeof range.start==='number'?range.start:typeof ta.selectionStart==='number'?ta.selectionStart:before.length;
    var end=replaceAll?before.length:range && typeof range.end==='number'?range.end:typeof ta.selectionEnd==='number'?ta.selectionEnd:s;
    var next=before.slice(0,s)+text+before.slice(end);
    if(ta.maxLength>=0 && next.length>ta.maxLength){refNotice('입력칸의 최대 글자 수('+ta.maxLength+'자)를 넘습니다. 내용을 줄여 주세요.','error');return false;}
    ta.value=next;ta.dispatchEvent(new Event('input',{bubbles:true}));ta.dispatchEvent(new Event('change',{bubbles:true}));
    if(ta.value!==next){refNotice('화면에서 입력 내용을 다시 변경했습니다. 입력칸을 확인해 주세요.','error');return false;}
    ta.setAttribute('data-kriss-ref','1');try{ta.classList.remove('k-invalid');ta.focus();if(!selectNextPlaceholder(ta,s))ta.setSelectionRange(s+text.length,s+text.length);}catch(e){}
    return true;
  }
  function selectNextPlaceholder(ta,from){
    var value=ta.value||'',m=RF_PH.exec(value.slice(from));if(!m && from>0){m=RF_PH.exec(value);from=0;}if(!m)return false;
    try{ta.setSelectionRange(from+m.index,from+m.index+m[0].length);ta.focus();return true;}catch(e){return false;}
  }
  function onRefKey(e){
    var target=e.target,key=e.key,inside=RF.back && RF.back.contains(target);
    if(!inside)return;
    // Native composition keystrokes must reach the editor, not the underlying portal.
    if(e.isComposing || e.keyCode===229 || RF.composing){e.stopPropagation();return;}
    if(key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeRefModal();return;}
    if(e.repeat && (key==='Enter' || (key==='Delete' && target===RF.list))){e.preventDefault();e.stopImmediatePropagation();return;}
    if((e.ctrlKey || e.metaKey) && key.toLowerCase()==='s'){e.preventDefault();e.stopImmediatePropagation();refSaveEditor(false);return;}
    if(key==='Tab'){
      var focusable=Array.from(RF.back.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex="0"]')).filter(function(el){return !el.hidden && el.getClientRects().length;});
      var first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey && target===first){e.preventDefault();last.focus();}else if(!e.shiftKey && target===last){e.preventDefault();first.focus();}e.stopPropagation();return;
    }
    if(target===RF.input || target===RF.list){
      if(key==='ArrowDown'||key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();moveRef(key==='ArrowDown'?1:-1);return;}
      if(key==='Delete' && target===RF.list){e.preventDefault();e.stopImmediatePropagation();refDeleteSelected();return;}
    }
    if(key==='Enter'){
      if(Date.now()-(RF.compositionEnded||0)<80){e.preventDefault();e.stopImmediatePropagation();return;}
      if(target.tagName==='SELECT' || target.tagName==='BUTTON'){e.stopPropagation();return;}
      if(target===RF.prev && e.shiftKey && !e.ctrlKey && !e.metaKey){e.stopPropagation();return;}
      e.preventDefault();e.stopImmediatePropagation();
      if(target===RF.name)refSaveEditor(false);else applyRef(RF.selected,e.ctrlKey||e.metaKey);return;
    }
    // Editing shortcuts stay inside this dialog; prevent a second Ctrl+Space palette.
    if((e.ctrlKey || e.metaKey) && e.code==='Space'){e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.altKey && (e.code==='Digit7' || e.code==='KeyQ')){e.preventDefault();e.stopImmediatePropagation();RF.input.focus();return;}
    e.stopPropagation();
  }
  function bindRefHotkeys(){
    if(RF.bound)return;RF.bound=true;
    window.addEventListener('keydown',function(e){
      if(RF.open){onRefKey(e);return;}
      if(e.isComposing || e.keyCode===229 || e.repeat)return;
      var ae=document.activeElement;
      if(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code==='Digit7' || e.key==='7' || e.code==='KeyQ' || e.key.toLowerCase()==='q')){
        e.preventDefault();e.stopImmediatePropagation();if(isRefEditable(ae))openRefModal(ae);else toast('문구를 넣을 입력칸에 커서를 두고 Alt+7을 누르세요.','info');return;
      }
      if(e.key==='F8' && isRefEditable(ae) && ae.getAttribute('data-kriss-ref')==='1'){
        e.preventDefault();e.stopImmediatePropagation();selectNextPlaceholder(ae,ae.selectionEnd||0);
      }
    },true);
    window.addEventListener('storage',function(e){if(RF.open && (e.key===REF_CFG.MINE_KEY || e.key===REF_CFG.HIDDEN_KEY)){refCaptureDraft();renderRefList();refNotice('다른 창의 문구 변경을 반영했습니다. 편집 중 내용은 유지됩니다.');}});
  }
  function injectRefStyle(){
    if(document.getElementById('krissRefStyle110'))return;
    var style=document.createElement('style');style.id='krissRefStyle110';style.setAttribute(MARK,'1');
    style.textContent=`
      .krf-back[hidden]{display:none!important;pointer-events:none!important}
      .krf-back{position:fixed;inset:0;z-index:2147483500;background:rgba(24,31,43,.34);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
      .krf{width:min(1080px,96vw);max-height:94vh;display:flex;flex-direction:column;background:#fff;color:#202738;border:1px solid #d8dfe9;border-radius:16px;box-shadow:0 24px 90px #10213d45;overflow:hidden;font-family:'Malgun Gothic',sans-serif;font-size:13px;line-height:1.5}
      .krf *{box-sizing:border-box}.krf button,.krf input,.krf textarea,.krf select{font:inherit}
      .krf button{cursor:pointer;border:1px solid #d9dfea;border-radius:7px;padding:6px 10px;background:#fff;color:#39455d}.krf button:hover{background:#f1f5fa}.krf button:focus-visible{outline:2px solid #4b66cb;outline-offset:2px}.krf button:disabled{opacity:.45;cursor:default}
      .krf-head{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #e7ebf1}.krf-head b{font-size:18px}.krf-context{margin-left:14px;color:#67758b;font-size:12px}.krf-close{font-size:16px!important;border:0!important}
      .krf-tools{display:flex;gap:12px;padding:13px 20px;background:#fafbfe}.krf label{display:flex;flex-direction:column;gap:4px;color:#617087;font-size:11px;font-weight:600}.krf-search-label{flex:1;min-width:150px}
      .krf input,.krf select{height:34px;background:#fff;border:1px solid #d7dfeb;border-radius:6px;padding:5px 8px;color:#202738;font-size:13px;font-weight:400;min-width:0}.krf input:focus,.krf select:focus{outline:2px solid #a9b9eb;outline-offset:0}
      .krf-bar{display:flex;justify-content:space-between;align-items:center;padding:8px 20px;border-top:1px solid #e8edf4;border-bottom:1px solid #e0e6ef;gap:12px}.krf-bar nav{display:flex;gap:4px}.krf-bar [data-view]{border:0;color:#69758a}.krf-bar [aria-pressed=true]{background:#eaf0ff;color:#294ea7;font-weight:700}.krf-new{color:#294ea7!important}
      .krf-body{display:flex;min-height:0;height:min(56vh,510px)}.krf-list{width:41%;flex:none;overflow:auto;border-right:1px solid #e0e6ef;padding:8px;scrollbar-width:thin}.krf-list:focus{outline:0;box-shadow:inset 0 0 0 2px #cfdbf7}
      .krf-item{padding:10px 11px;margin:2px 0;border-radius:8px;cursor:pointer;border:1px solid transparent}.krf-item.on{background:#eef3ff;border-color:#b6c6eb}.krf-item strong{display:block;font-size:13px}.krf-item small{display:block;color:#64738c;font-size:10px;margin-top:3px}.krf-item p{font-size:11px;color:#8a94a6;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin:5px 0 0}.krf-empty{padding:28px 15px;color:#8490a3;line-height:1.8}
      .krf-editor{min-width:0;flex:1;display:flex;flex-direction:column;padding:13px 17px;gap:9px}.krf-fields{display:flex;gap:10px}.krf-fields label{flex:1;min-width:0}.krf-content-label{flex:1;min-height:90px}.krf-edit{flex:1;min-height:80px;width:100%;resize:none;border:1px solid #d7dfeb;border-radius:7px;padding:10px 12px;outline:0;color:#263349;background:#fff;font-size:13px!important;line-height:1.75!important;font-weight:400!important}.krf-edit:focus{border-color:#8098d9;box-shadow:0 0 0 1px #c4d2f3}
      .krf-editinfo{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;color:#8994a6}.krf-thanks{padding:3px 7px!important;color:#52668f!important;font-size:11px!important}.krf-manage{display:flex;gap:6px}.krf-manage>span{flex:1}.krf-save{background:#eaf5ef!important;color:#216746!important}.krf-delete{color:#9b4b4b!important}.krf-insert{display:flex;gap:7px;align-items:center;border-top:1px solid #e6eaf0;padding-top:10px}.krf-insert-btn{background:#355bb7!important;border-color:#355bb7!important;color:#fff!important;font-weight:700!important}.krf-insert small{margin-left:auto;color:#8b97aa;font-size:10px}
      .krf-feedback{min-height:37px;padding:7px 20px;border-top:1px solid #e7ecf3;display:flex;align-items:center;gap:12px;background:#fafbfe}.krf-status{flex:1;color:#64748b;font-size:11px}.krf-status[data-kind=error]{color:#ad3838}.krf-undo{font-size:11px!important;padding:3px 8px!important}.krf [hidden]{display:none!important}.krf-foot{padding:7px 20px 10px;color:#8390a4;font-size:10px;background:#fafbfe}
      @media(max-width:720px){.krf-context{display:block;margin:3px 0 0}.krf-tools{flex-wrap:wrap;padding:10px}.krf-search-label{flex-basis:100%}.krf-tools>label:not(.krf-search-label){flex:1}.krf-body{height:55vh}.krf-list{width:36%}.krf-editor{padding:10px;gap:6px}.krf-fields{gap:5px}.krf-item{padding:7px 5px}.krf-item small{font-size:9px}.krf-copy,.krf-insert small{display:none}.krf-foot{font-size:9px}.krf-bar{padding:6px 10px}}
    `;(document.head||document.documentElement).appendChild(style);
  }


  // ============================================================
  // 최종 부팅 (v1.8.11) — 모든 설정/함수 정의 완료 후 1회 실행
  // ============================================================
  function bootKrissHelper() {
    if (window.__krissHelperBooted) return;
    window.__krissHelperBooted = true;
    detectAndInit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootKrissHelper, { once: true });
  } else {
    bootKrissHelper();
  }
})();
