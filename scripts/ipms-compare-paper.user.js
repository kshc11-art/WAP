// ==UserScript==
// @name         KRISS 개인저작물 논문 대조 Helper
// @namespace    https://krisstar.kriss.re.kr/
// @version      1.1.1
// @description  개인저작물(논문) 첨부 PDF·DOCX·HWP·HWPX 대조/보기 — 출판사 어댑터 파싱, 한글 문서 렌더·하이라이트, 단축키
// @match        *://*.kriss.re.kr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
  1.1.1
    1) 개인저작물 첨부 버튼명을 지재권 Helper와 동일하게 '대조'로 통일.
    2) 단축키를 Alt+` 하나로 통일: 첫 '대조', 대조가 없으면 첫 '보기' 실행.

  1.1.0
    1) 지재권 대조 Helper와 동일한 첨부문서 코어 적용: PDF·DOCX·HWP·HWPX 로드/렌더/하이라이트 지원.
    2) 대조 규칙이 있는 첨부는 '대조'만 표시하고, 대조 규칙이 없는 경우에만 같은 파란색 '보기' 표시.
    3) 문서 표시 박스·분할 화면·뷰어 설정 UI를 지재권 Helper와 동일한 구조로 통일.
    4) 단축키 추가(1.1.1에서 Alt+` 하나로 통일).

  1.0.6 (오류 개선 — Elsevier pdf.js 저자 첫 행 결합 실패 재현·수정)
   1) pdf.js가 제목 마지막 줄과 첫 저자를 한 줄로 붙여 추출하는 경우를 복구한다.
      예: "X-ray beams Yun Ho Kim * , Chul-Young Yi ..."에서 첫 저자 Yun Ho Kim*이 탈락하던 문제 수정.
   2) 교신 이메일 뒤의 이니셜 표기 "(Y.H. Kim)"을 최우선으로 저자와 연결하고, 이메일 로컬파트의
      이니셜+성 조합까지 비교한다. 같은 성의 다른 저자(In Jung Kim)를 교신저자로 오인하던 문제 수정.
   3) Funding 코드 체계가 시스템 관리번호와 다른 경우에도 과제명이 직접/의미상 일치하면 partial로 표시한다.
      7번 논문의 [26011053] ↔ 시스템 GP2026-0008-02는 코드 일치로 단정하지 않고 과제명 근거를 함께 표시한다.
   4) 실제 7.pdf에서 실패 형태를 강제로 재현한 회귀 테스트(제목+첫 저자 동일 행)를 추가해 6명/교신 김윤호 복원을 확인했다.

 1.0.5 (오류 개선 — 실제 논문 1~7 구조 회귀검증 반영)
   1) Wiley 어댑터 추가: Advanced Science / Advanced Functional Materials의 권·호·eLocator·페이지를 인식한다.
      Wiley Online Library의 다운로드 꼬리말에서 Issue를, "n of N"에서 eLocator 페이지 범위를 복원한다.
   2) AIP 어댑터 보강: 표지 페이지가 별도인 PDF에서도 2페이지 Cite as/AFFILIATIONS를 읽어
      Journal of Applied Physics / Review of Scientific Instruments의 서지정보·저자·교신저자를 복원한다.
   3) 한국전자파학회(KJKIEES) 어댑터 추가: 10.5515 DOI, "2026 July; 37(7), 696~702" 형식,
      한·영 저자열(․ 구분), 공통 KRISS 소속, Corresponding Author를 인식한다.
   4) 저자 파서를 다중 구조로 개편: 한 줄 다수 저자, 저자 1명/행, 숫자·알파벳 소속마커,
      마커 없는 Wiley/Elsevier 저자열을 함께 평가해 가장 신뢰도 높은 블록을 선택한다.
   5) Wiley의 "이니셜 저자 목록 + 기관" 소속 블록을 보강해 J. H. Seo / J.-H. Kwon처럼
      축약된 이름을 본문 저자와 연결하고 KRISS 내부 소속을 판정한다.
   6) 공통 단일 소속 논문(Elsevier 등)은 마커가 없어도 헤더의 기관명을 공통 소속으로 인식한다.
   7) Funding 오탐 수정: Manuscript ID의 "ID No. 20260421-038"을 과제번호로 잡지 않으며,
      한국어 지원문·21-307-A00-013·[26011053]·2018R1A6A1A03026005 같은 코드를 Funding 문맥에서 인식한다.
   8) KRISS-GP/JP 접두 유무와 세부과제 접미 차이를 같은 계열 코드로 비교해 불필요한 needs_mapping을 줄인다.
   9) Unicode NFKC 정규화로 전각 숫자(１~９) 페이지를 동일하게 비교하고, eLocator만 입력된
      Elsevier 페이지(113835-113835)도 PDF 내부 113835-1~N 표기와 의미상 일치로 처리한다.
  10) 저널명 비교를 보강해 "Physica Medica - European Journal of Medical Physics"와
      "Physica Medica" 같은 본제/부제 표기를 동등하게 처리한다.
  11) Published Online / Available online은 학술지 발행일과 다를 수 있으므로 날짜가 다르면
      불일치(X) 대신 참고용 부분일치로 표시한다.

 1.0.4 (오류 개선 — BMC/SpringerOpen 실제 PDF 검증 반영)
   1) 소속을 "Author details"·"Author information" 절에서도 찾는다. BMC는 1페이지에
      "Full list of author information is available at the end of the article" 만 적고
      실제 소속 목록을 논문 말미에 두므로, 기존 탐색으로는 찾을 수 없었다.
   2) 2단 조판 대응: 한 줄에 우측 컬럼(참고문헌 등)이 붙는 경우 공백 6칸 이상에서 분리한다.
   3) KRISS 판정 완화: 컬럼 병합으로 "Korea"와 "Research Institute of Standards"가 끊겨도
      "Institute of Standards and Science"로 인식한다.
   4) Funding 코드에 "No. 101178074" 형태를 추가했다(줄바꿈으로 "Grant agreement"와 분리되는 경우).
   5) 소속 블록 탐색 길이를 확대했다(2단 조판은 원문 길이가 2~3배).

 1.0.3 (BMC/SpringerOpen(Nano Convergence) 실패 사례 반영)
   1) 순위(seqNo) 기준 저자 매칭. 대규모 공동저자 논문은 시스템에 KRISS 관련 저자만
      등록되므로(순위 1, 11, 31, 39, 40 …), 배열 순서가 아니라 순위로 PDF 저자와 대조한다.
      이전에는 전원 불일치로 표시되던 문제를 해결했다.
   2) 소속 블록을 1페이지 전체(+2페이지 앞부분)에서 찾는다. BMC는 초록 뒤에 소속을 두므로
      기존의 "제목~초록" 구간 탐색으로는 찾을 수 없었다.
   3) 저자를 못 찾으면 1페이지 전체로 범위를 넓혀 재시도한다.
   4) 날짜를 1~2페이지에서 못 찾으면 문서 전체에서 다시 찾는다(BMC는 말미에 표기).
   5) BMC/SpringerOpen 머리말 "Lee et al. Nano Convergence (2026) 13:34"에서 저널명을 추출한다.
      호 미표기 저널로 처리해 '추출 안 됨'이 아니라 참고로 표시한다.
   6) 소속마커를 3자리까지, 쉼표 없이 이어붙은 형태("39*")까지 인식하고 기여동등 표시(†‡)를 허용한다.
   7) 마커 오인 수정: "and"의 a 를 소속마커로 잡던 문제 제거(알파벳 마커 뒤 글자 금지).
   8) 이름에 라틴 확장 문자를 허용(Müller, Sørensen 등). 공동연구 논문에서 저자가 탈락하던 문제 해결.
   9) Funding 코드에 Horizon Europe "Grant agreement No." 와 "project number" 형태 추가.

 1.0.2 (Optica(Biomedical Optics Express) 실패 사례 반영)
   1) Optica Publishing Group 어댑터 추가. 러닝헤더 "Vol. 17, No. 8 / 1 Aug 2026 / 저널명 4420"에서
      권·호·학술지 발행일·저널명·시작쪽을 한 번에 추출한다.
   2) 스몰캡스 저자명 복원: Optica는 저자명을 스몰캡스로 조판해 첫 글자가 분리 추출된다
      ("H YUN -J I L EE" → "HYUN-JI LEE"). 이 때문에 저자 0명이던 문제를 해결했다.
   3) 저자 구간을 통합 스캔하는 방식을 추가해, 이름이 여러 줄에 걸쳐 끊긴 서식도 인식한다.
   4) 페이지를 러닝헤더 쪽번호 범위(4420-4440)로 추출한다. 파생값 대신 실측값을 쓴다.
   5) 소속 블록 시작을 "1 Nanobio Measurement Group..." 형태(마커+기관명 동일 행)까지 인식한다.
   6) 게재일은 학술지 발행일(러닝헤더)을 우선 사용하고, 온라인 공개일은 함께 표기한다.
   7) Funding 섹션이 "Funding." 처럼 마침표로 이어지는 서식을 인식한다.
      과제코드 패턴에 GTL24023-000 형태를 추가했다.
   8) 본문 장비 모델명(NI-USB-6363 등)이 과제코드로 오인되던 문제 제거:
      Funding 구간에서 코드를 찾지 못한 경우에만 문서 전체를 훑는다.
   9) 시스템 코드와 완전 일치가 없을 때 유사 코드(세부번호 상이)를 찾아 안내한다.
   10) "어댑터" 행 삭제. 출판사 미식별 시에만 경고 행으로 알린다.
   11) 성씨 로마자 표기 보강(백=beak/baeg, 허=her, 권=kweon).

 1.0.1 (실제 논문 3편·대조결과 4건 분석 반영)
   [파싱]
   1) 어댑터 판별 범위를 1페이지+러닝헤더로 제한. 참고문헌의 출판사명 때문에 ASM(10.1128) 논문이
      Elsevier로 오판되던 문제를 제거하고 ASM 어댑터를 추가했다.
   2) 저자 파싱을 "행 단위 후보 수" 방식으로 교체. 본문·표·저널명·제목이 저자로 잡히던 문제
      (예: "South Korea", "Parameter Value Description", "Microchemical Journa"+"l")를 제거했다.
   3) 소속마커에 알파벳(a,b,c)을 지원(Elsevier 서식). 마커 단독행·페이지 경계·워터마크 대응.
   4) 성씨 An·Ok·Cho 등이 불용어로 차단되던 문제를 수정(첫 토큰만 관사류 검사).
   5) Funding 문장 추출에 "supported/funded by" 요구 조건 추가("The working…" 오인 제거).
      Funding 표(Funder/Grant/Author)와 문서 전체 코드 스캔을 병행하고, 방법명(ID-UHPLC-MS)은 제외.
   6) 교신저자를 별표 외에 "Address correspondence to"·"Corresponding author"·이메일 아이디·
      지역 문맥의 이름으로 연결.
   7) 페이지는 논문번호+PDF 총 페이지 수로 파생(참고문헌의 pp. 표기 사용 금지).
   8) 조판 전 원고(ASM Volume 0/Issue 0), 호 없는 저널(Elsevier)은 불일치가 아니라 참고로 표시.
   [표시]
   9) 관련과제 = Funding 으로 통합. 열 이름 "PDF 실제 추출값" → "PDF".
   10) 저자 수·내부 인원·소속 목록을 한 행으로 통합. "직무발명 해당 여부" 행 삭제.
   11) 발표매체를 "국외논문 (Elsevier / 저널명 / 문서유형)" 형태로 표시하고 국내·국외를 대조.
   12) 저자 1:1 대조에 한글 성 ↔ 로마자 표기 검증 추가(백유진 ↔ Yujin Baek 등). 순위 기준 대조 유지.

 대조 항목
   서지정보(DOI·저널·발표매체·권·호·논문번호·페이지) · 날짜(투고·승인·게재) ·
   Funding(코드 ↔ 관련과제 그리드) · 저자(수·내부·교신·순위별 1:1)

 전제 조건
   - 화면: B_RES00002(개인저작물 신청). 시스템 구조 문서 §7 미기재 항목이며 DOM id는 실측 기반.
   - 최초 1회 "뷰어 설정"에서 pdf.min.js + pdf.worker.min.js 등록 필요.

 오류 가능 지점
   - 2단 조판 논문은 좌우 컬럼 텍스트가 한 줄로 섞여 Funding 원문이 잘릴 수 있다(코드는 문서 전체 스캔으로 보완).
   - 스캔 이미지 PDF는 텍스트가 없어 전 항목 미추출로 표시된다.
   - 논문 소속 표기와 시스템 고용구분(내부·외부)은 다를 수 있어, 인원 차이는 부분일치(△)로 표시한다.

 검증 방법
   - 대조 패널 > 추출 근거 콘솔 출력 → 필드별 값·원문·페이지·신뢰도 표.
   - 콘솔: KrissTets.parser().adapters / KrissTets.dump() / KrissTets.panic()
*/

(function () {
  'use strict';
  var TAG = '[KRISS-TETS]';
  var VER = '1.1.1';
  // ============================================================
  // [공통 코어 시작] — 두 스크립트에서 바이트 단위로 동일. 수정 시 양쪽 모두 교체할 것.
  // ============================================================
  var CACHE_LIB = 'kriss_pdfjs_lib';
  var CACHE_WORKER = 'kriss_pdfjs_worker';
  var CACHE_MAMMOTH = 'kriss_mammoth_lib';
  var CACHE_RHWP_MARK = 'kriss_rhwp_core_0_8_4_installed';
  var RHWP_DB_NAME = 'kriss_viewer_binary_libs';
  var RHWP_DB_STORE = 'libs';
  var RHWP_JS_KEY = 'rhwp_core_0_8_4_js';
  var RHWP_WASM_KEY = 'rhwp_core_0_8_4_wasm';
  var rhwpCorePromise = null;

  var KILLED = false;   // panic() 이후 재삽입·재바인딩을 막는 플래그

  // 안전 원칙(시스템 구조 문서 §11): 이 스크립트는 조회·표시만 한다.
  // 저장·접수·승인·반려 버튼(btnApvStatSave, btnRept, btnApprove, btnReject, btnSaveTab*)을
  // 자동 클릭하는 코드는 어떤 경우에도 추가하지 않는다.

  // ---------- 기본 유틸 ----------
  function getText(sel) { var el = document.querySelector(sel); return el ? el.textContent.trim() : ''; }
  function getElVal(sel) {
    var el = document.querySelector(sel);
    if (!el) return '';
    return (el.value !== undefined && el.value !== '' ? el.value : el.textContent).trim();
  }
  function getDropdownText(sel) {
    var el = document.querySelector(sel);
    if (!el) return '';
    var kw = el.closest ? el.closest('.k-widget') : null;
    if (kw) { var span = kw.querySelector('.k-input'); if (span) return span.textContent.trim(); }
    if (el.options && el.selectedIndex >= 0) return el.options[el.selectedIndex].text;
    return '';
  }
  function getDropdownVal(sel) { var el = document.querySelector(sel); return el ? (el.value || '') : ''; }
  function getRadioVal(name) {
    var c = document.querySelector('input[name="' + name + '"]:checked');
    return c ? c.value : '';
  }
  function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cleanText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function clipText(s, n) { var v = cleanText(s); n = n || 180; return v.length > n ? v.substring(0, n) + '…' : v; }
  function fmtMoney(val) {
    if (!val) return '0원';
    var n = String(val).replace(/[^0-9\-]/g, '');
    if (!n) return val;
    var num = parseInt(n, 10);
    return isNaN(num) ? val : num.toLocaleString('ko-KR') + '원';
  }
  function normalizeChars(t) {
    return String(t || '')
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/[\u2018\u2019\u201A\uFE10]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  }
  function normalizeHyphen(t) { return String(t || '').replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-'); }
  function compactText(s) { return normalizeChars(s).replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase(); }
  function normNameKor(s) { return normalizeChars(s || '').replace(/\s+/g, '').trim(); }
  function normNameEng(s) { return normalizeChars(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function escapeRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function extractDoiCore(s) {
    if (!s) return '';
    var m = String(s).match(/(10\.\d{4,}\/[A-Za-z0-9._\-()\/]+)/);
    return m ? m[1].replace(/\s+/g, '').replace(/[.,;)]+$/, '') : String(s).trim().replace(/[.,;)]+$/, '');
  }
  function combineTransform(m1, m2) {
    return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(function () { fbCopy(t); });
    } else fbCopy(t);
  }
  function fbCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  function showMsg(msg) {
    removeAll();
    var el = document.createElement('div');
    el.id = 'krissComparePanel';
    el.setAttribute('data-kriss-ui', '1');
    el.style.cssText = 'position:fixed;top:10px;right:10px;background:#333;color:#fff;padding:14px 20px;border-radius:8px;z-index:99999;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.3);max-width:520px;';
    el.textContent = TAG + ' ' + msg;
    document.body.appendChild(el);
  }
  function removeAll() { var el = document.getElementById('krissComparePanel'); if (el) el.remove(); }

  // 긴급 원상복구(시스템 구조 문서 §1)
  function panic() {
    KILLED = true;   // 이후 버튼 재삽입·다운로드 가로채기 모두 중지
    removeAll();
    Array.prototype.forEach.call(document.querySelectorAll('[data-kriss-ui]'), function (el) { el.remove(); });
    // data-kriss-dl 속성은 그대로 둔다(제거하면 관찰자가 다시 바인딩을 시도한다).
    console.log(TAG, '원상복구 완료 — 삽입 요소 제거, 기능 중지. 되살리려면 새로고침하세요.');
    return true;
  }

  // ---------- 날짜 ----------
  var MONTH_FULL = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parseDateString(str) {
    var months = {};
    for (var i = 1; i <= 12; i++) {
      months[MONTH_FULL[i].toLowerCase()] = ('0' + i).slice(-2);
      months[MONTH_ABBR[i].toLowerCase()] = ('0' + i).slice(-2);
    }
    var s = cleanText(str);
    var m = s.match(/(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})/);
    if (m) return m[3] + '-' + (months[m[2].toLowerCase()] || '00') + '-' + ('0' + m[1]).slice(-2);
    m = s.match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m) return m[3] + '-' + (months[m[1].toLowerCase()] || '00') + '-' + ('0' + m[2]).slice(-2);
    m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return s;
  }

  function dateParts(str) {
    var m = String(str || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) } : null;
  }

  // 국내·해외 문서에서 쓰이는 모든 표기형을 생성한다(역검색용)
  function dateForms(str) {
    var p = dateParts(str);
    if (!p) return str ? [String(str)] : [];
    var mo = ('0' + p.m).slice(-2), d = ('0' + p.d).slice(-2);
    return [
      p.y + '-' + mo + '-' + d, p.y + '.' + mo + '.' + d, p.y + '. ' + mo + '. ' + d,
      p.y + '/' + mo + '/' + d, mo + '/' + d + '/' + p.y, p.m + '/' + p.d + '/' + p.y,
      MONTH_FULL[p.m] + ' ' + p.d + ', ' + p.y, MONTH_ABBR[p.m] + ' ' + p.d + ', ' + p.y,
      p.d + ' ' + MONTH_FULL[p.m] + ' ' + p.y, p.d + ' ' + MONTH_ABBR[p.m] + ' ' + p.y,
      p.y + '년 ' + p.m + '월 ' + p.d + '일', p.y + '년 ' + mo + '월 ' + d + '일',
      p.y + '년' + p.m + '월' + p.d + '일'
    ];
  }

  function dateInPdf(dateStr, pdfCompact) {
    var forms = dateForms(dateStr);
    for (var i = 0; i < forms.length; i++) {
      var f = compactText(forms[i]);
      if (f.length >= 6 && pdfCompact.indexOf(f) >= 0) return true;
    }
    return false;
  }

  function addMonths(dateStr, n) {
    var p = dateParts(dateStr);
    if (!p) return '';
    var base = new Date(p.y, p.m - 1, 1);
    base.setMonth(base.getMonth() + n);
    var last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return base.getFullYear() + '-' + ('0' + (base.getMonth() + 1)).slice(-2) + '-' + ('0' + Math.min(p.d, last)).slice(-2);
  }

  // 긴 자유텍스트(발명의명칭 등): 완전일치 → 어절 다수일치(partial) → 불일치
  function longTextMatch(value, pdfCompact, pdfLower) {
    if (!value) return 'empty';
    var vc = compactText(value);
    if (vc.length >= 6 && pdfCompact.indexOf(vc) >= 0) return 'match';
    var tokens = normalizeChars(value).toLowerCase().split(/[^0-9a-z가-힣]+/).filter(function (w) { return w.length >= 3; });
    if (tokens.length < 3) return 'mismatch';
    var hit = 0;
    tokens.forEach(function (w) { if (pdfLower.indexOf(w) >= 0) hit++; });
    if (hit >= 4 && (hit / tokens.length) >= 0.75) return 'partial';
    return 'mismatch';
  }

  // ---------- 버튼 ----------
  function mkBtn(parent, text, bg, border, handler) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.setAttribute('data-kriss-ui', '1');
    b.style.cssText = ['margin-left:6px', 'background:' + bg, 'color:#fff', 'border:1px solid ' + border,
      'border-radius:4px', 'font-weight:bold', 'font-size:12px', 'padding:4px 14px', 'cursor:pointer',
      'vertical-align:middle', 'line-height:20px', 'font-family:Malgun Gothic,sans-serif'].join(';');
    b.addEventListener('click', handler);
    b.addEventListener('mouseenter', function () { b.style.opacity = '0.85'; });
    b.addEventListener('mouseleave', function () { b.style.opacity = '1'; });
    parent.appendChild(b);
    return b;
  }

  function mkInlineBtn(text, bg, handler) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'kriss-fbtn'; b.textContent = text;
    b.setAttribute('data-kriss-ui', '1');
    b.style.cssText = 'margin-left:4px;background:' + bg + ';color:#fff;border:none;padding:1px 8px;border-radius:3px;font-size:10px;cursor:pointer;font-weight:bold;vertical-align:middle;line-height:18px;';
    b.addEventListener('click', handler);
    return b;
  }

  // ---------- 첨부파일 다운로드 URL 후보 ----------
  function buildUrlCandidates(progrmId, docId, fileOrdr, rawSys, cntcAt, fileId) {
    var ca = cntcAt || 'R';
    var altCa = (ca === 'R') ? 'L' : 'R';
    var ep = '/com/cmm/fms/download/selectFileItem.json';
    var sysIsNull = (!rawSys || rawSys === 'null' || rawSys === 'undefined');
    var sysValues = sysIsNull ? ['', 'ESHOP', 'EKRISS'] : [rawSys, '', 'ESHOP'];
    var urls = [];
    [ca, altCa].forEach(function (c) {
      var base = '?progrmId=' + encodeURIComponent(progrmId) + '&docId=' + encodeURIComponent(docId) +
        '&fileOrdr=' + encodeURIComponent(fileOrdr) + '&cntcAt=' + c;
      sysValues.forEach(function (sv) { urls.push(ep + base + '&systemName=' + encodeURIComponent(sv)); });
    });
    var seen = {};
    urls = urls.filter(function (u) { if (seen[u]) return false; seen[u] = true; return true; });
    console.log(TAG, 'URL 후보', urls.length + '개 | cntcAt=' + ca + ' | rawSys=' + rawSys);
    return urls;
  }

  async function smartFetch(urls) {
    var jsonInfo = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var resp = await fetch(urls[i], { credentials: 'same-origin' });
        if (!resp.ok) { console.warn(TAG, '  → HTTP', resp.status); continue; }
        var buffer = await resp.arrayBuffer();
        var head = new Uint8Array(buffer.slice(0, 4));
        if (buffer.byteLength < 100) {
          var txt = new TextDecoder().decode(buffer);
          if (txt.indexOf('null') >= 0 || txt.indexOf('<html>') >= 0) { console.warn(TAG, '  → 빈 응답'); continue; }
        }
        if (head[0] === 0x7B || head[0] === 0x5B) {
          var jtxt = new TextDecoder().decode(buffer);
          try { jsonInfo = JSON.parse(jtxt); } catch (e) {}
          console.warn(TAG, '  → JSON 응답(파일 아님)');
          continue;
        }
        console.log(TAG, '다운로드 성공:', buffer.byteLength, 'bytes [' + (i + 1) + '/' + urls.length + ']');
        return buffer;
      } catch (e) { console.warn(TAG, '  → 네트워크 실패:', e.message); }
    }
    if (jsonInfo) {
      var fileId = jsonInfo.fileId || jsonInfo.atchFileId || jsonInfo.streFileNm ||
        (jsonInfo.data && (jsonInfo.data.fileId || jsonInfo.data.atchFileId));
      if (fileId) {
        var byId = [
          '/com/cmm/fms/download/selectFileItem.json?fileId=' + encodeURIComponent(fileId) + '&cntcAt=R',
          '/com/cmm/fms/FileDown.do?fileId=' + encodeURIComponent(fileId),
          '/cmm/fms/FileDown.do?atchFileId=' + encodeURIComponent(fileId)
        ];
        for (var k = 0; k < byId.length; k++) {
          try {
            var r2 = await fetch(byId[k], { credentials: 'same-origin' });
            if (!r2.ok) continue;
            var b2 = await r2.arrayBuffer();
            var h2 = new Uint8Array(b2.slice(0, 4));
            if (b2.byteLength < 100 || h2[0] === 0x7B || h2[0] === 0x5B) continue;
            console.log(TAG, 'fileId 재시도 성공:', b2.byteLength, 'bytes');
            return b2;
          } catch (e) {}
        }
      }
    }
    throw new Error('모든 다운로드 URL 실패 (' + urls.length + '개 시도)');
  }

  function urlsFromLink(a, fallbackProgrmId, fallbackDocId) {
    return buildUrlCandidates(
      a.getAttribute('data-progrm-id') || fallbackProgrmId || '',
      a.getAttribute('data-doc-id') || fallbackDocId || '',
      a.getAttribute('data-file-ordr') || '',
      a.getAttribute('data-system-name') || '',
      a.getAttribute('data-cntc-at') || '',
      a.getAttribute('data-file-id') || ''
    );
  }

  // ---------- 뷰어 라이브러리 ----------
  function hasPdfLib() { return !!localStorage.getItem(CACHE_LIB); }
  function hasDocxLib() { return !!localStorage.getItem(CACHE_MAMMOTH); }
  function hasRhwpLib() { return localStorage.getItem(CACHE_RHWP_MARK) === '1'; }

  function openViewerDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('이 브라우저에서 IndexedDB를 사용할 수 없습니다.')); return; }
      var req = indexedDB.open(RHWP_DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(RHWP_DB_STORE)) db.createObjectStore(RHWP_DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 열기 실패')); };
    });
  }

  async function viewerDbPut(key, value) {
    var db = await openViewerDb();
    try {
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(RHWP_DB_STORE, 'readwrite');
        tx.objectStore(RHWP_DB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB 저장 실패')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB 저장 중단')); };
      });
    } finally { db.close(); }
  }

  async function viewerDbGet(key) {
    var db = await openViewerDb();
    try {
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(RHWP_DB_STORE, 'readonly');
        var req = tx.objectStore(RHWP_DB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB 읽기 실패')); };
      });
    } finally { db.close(); }
  }

  function installRhwpTextMeasurer() {
    if (typeof globalThis.measureTextWidth === 'function') return;
    var cvs = document.createElement('canvas');
    var ctx = cvs.getContext('2d');
    globalThis.measureTextWidth = function (font, text) {
      var t = String(text == null ? '' : text);
      if (!ctx) return t.length * 8;
      try { ctx.font = String(font || '10pt sans-serif'); } catch (e) { ctx.font = '10pt sans-serif'; }
      return ctx.measureText(t).width;
    };
  }

  async function loadCachedRhwp() {
    if (window.__krissRhwpCore) return window.__krissRhwpCore;
    if (rhwpCorePromise) return rhwpCorePromise;

    rhwpCorePromise = (async function () {
      if (!hasRhwpLib()) throw new Error('rhwp.js + rhwp_bg.wasm이 등록되지 않았습니다. 뷰어 설정에서 먼저 등록하세요.');
      var jsCode = await viewerDbGet(RHWP_JS_KEY);
      var wasmBuffer = await viewerDbGet(RHWP_WASM_KEY);
      if (typeof jsCode !== 'string' || jsCode.indexOf('HwpDocument') < 0) throw new Error('저장된 rhwp.js가 올바르지 않습니다.');
      if (!(wasmBuffer instanceof ArrayBuffer) || wasmBuffer.byteLength < 8) throw new Error('저장된 rhwp_bg.wasm이 올바르지 않습니다.');

      installRhwpTextMeasurer();
      var moduleUrl = URL.createObjectURL(new Blob([jsCode], { type: 'text/javascript' }));
      try {
        var mod = await import(moduleUrl);
        if (!mod || typeof mod.default !== 'function' || !mod.HwpDocument) throw new Error('rhwp 모듈 export를 확인할 수 없습니다.');
        await mod.default({ module_or_path: wasmBuffer });
        window.__krissRhwpCore = mod;
        console.log(TAG, 'rhwp WASM 로드 완료');
        return mod;
      } catch (e) {
        throw new Error('rhwp WASM 로드 실패: ' + e.message + ' (사이트 CSP가 blob: 모듈 또는 WebAssembly를 차단하는지도 확인하세요)');
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    })();

    try { return await rhwpCorePromise; }
    catch (e) { rhwpCorePromise = null; throw e; }
  }

  function loadCachedPdfJs() {
    if (window.pdfjsLib) return true;
    var libCode = localStorage.getItem(CACHE_LIB), wkCode = localStorage.getItem(CACHE_WORKER);
    if (!libCode || !wkCode) return false;
    var sc = document.createElement('script');
    sc.textContent = libCode; document.head.appendChild(sc);
    if (!window.pdfjsLib) { console.error(TAG, 'pdf.js 로드 실패'); return false; }
    var blob = new Blob([wkCode], { type: 'application/javascript' });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    console.log(TAG, 'pdf.js 로드 완료');
    return true;
  }

  function loadCachedMammoth() {
    if (window.mammoth) return true;
    var code = localStorage.getItem(CACHE_MAMMOTH);
    if (!code) return false;
    var sc = document.createElement('script');
    sc.textContent = code; document.head.appendChild(sc);
    if (!window.mammoth) { console.error(TAG, 'mammoth.js 로드 실패'); return false; }
    console.log(TAG, 'mammoth.js 로드 완료');
    return true;
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('파일 읽기 실패: ' + file.name)); };
      r.readAsText(file);
    });
  }

  function readFileBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('파일 읽기 실패: ' + file.name)); };
      r.readAsArrayBuffer(file);
    });
  }

  function ensureViewerSetupButton() {
    if (hasPdfLib() && hasDocxLib() && hasRhwpLib()) return;
    var area = document.querySelector('.titlegroup3 .ft_right') || document.querySelector('.titlegroup3');
    if (area && !document.getElementById('krissViewerSetupBtn')) {
      var b = mkBtn(area, '뷰어 설정', '#4CAF50', '#388E3C', showSetupDialog);
      b.id = 'krissViewerSetupBtn';
    }
  }

  function showSetupDialog() {
    removeAll();
    var modal = document.createElement('div');
    modal.id = 'krissComparePanel';
    modal.setAttribute('data-kriss-ui', '1');
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid #1976D2;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.4);z-index:99999;width:620px;max-width:94vw;max-height:92vh;overflow:auto;font-family:Malgun Gothic,sans-serif;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#1565C0;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:bold;font-size:14px;';
    hdr.textContent = '뷰어 라이브러리 설정';
    modal.appendChild(hdr);
    var body = document.createElement('div');
    body.style.cssText = 'padding:16px;';
    var info = document.createElement('div');
    info.style.cssText = 'background:#E3F2FD;padding:10px;border-radius:4px;font-size:12px;margin-bottom:14px;line-height:1.6;';
    info.innerHTML = '내부망에서 CDN 접근이 차단되므로 라이브러리를 수동 등록합니다.<br><b>PDF:</b> pdf.min.js + pdf.worker.min.js (v3.11.174 권장)<br><b>DOCX:</b> mammoth.browser.min.js<br><b>HWP/HWPX:</b> @rhwp/core 0.8.4의 rhwp.js + rhwp_bg.wasm<br><span style="color:#666">HWP 엔진은 용량 때문에 localStorage가 아닌 IndexedDB에 저장됩니다.</span>';
    body.appendChild(info);
    var mkRow = function (label, installed, accept) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-bottom:10px;';
      var l = document.createElement('div');
      l.style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:4px;';
      l.textContent = label + (installed ? ' (등록됨)' : '');
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || '.js';
      row.appendChild(l); row.appendChild(inp); body.appendChild(row);
      return inp;
    };
    var inp1 = mkRow('1. pdf.min.js', hasPdfLib(), '.js');
    var inp2 = mkRow('2. pdf.worker.min.js', hasPdfLib(), '.js');
    var inp3 = mkRow('3. mammoth.browser.min.js', hasDocxLib(), '.js');
    var inp4 = mkRow('4. rhwp.js (@rhwp/core 0.8.4)', hasRhwpLib(), '.js');
    var inp5 = mkRow('5. rhwp_bg.wasm (@rhwp/core 0.8.4)', hasRhwpLib(), '.wasm,application/wasm');
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
    var save = document.createElement('button');
    save.type = 'button'; save.textContent = '저장';
    save.style.cssText = 'flex:1;background:#1565C0;color:#fff;border:none;padding:8px;border-radius:4px;font-size:13px;font-weight:bold;cursor:pointer;';
    save.addEventListener('click', async function () {
      var f1 = inp1.files[0], f2 = inp2.files[0], f3 = inp3.files[0], f4 = inp4.files[0], f5 = inp5.files[0];
      if (!f1 && !f2 && !f3 && !f4 && !f5) { alert('하나 이상의 파일을 선택하세요.'); return; }
      try {
        if (f1 && f2) {
          localStorage.setItem(CACHE_LIB, await readFile(f1));
          localStorage.setItem(CACHE_WORKER, await readFile(f2));
        } else if (f1 || f2) { alert('pdf.js는 두 파일이 모두 필요합니다.'); return; }
        if (f3) localStorage.setItem(CACHE_MAMMOTH, await readFile(f3));
        if (f4 && f5) {
          var rhwpJs = await readFile(f4);
          var rhwpWasm = await readFileBuffer(f5);
          if (rhwpJs.indexOf('HwpDocument') < 0) throw new Error('선택한 rhwp.js에서 HwpDocument를 찾지 못했습니다.');
          var wh = new Uint8Array(rhwpWasm.slice(0, 4));
          if (wh.length < 4 || wh[0] !== 0x00 || wh[1] !== 0x61 || wh[2] !== 0x73 || wh[3] !== 0x6D) throw new Error('선택한 파일이 WebAssembly(.wasm)가 아닙니다.');
          await viewerDbPut(RHWP_JS_KEY, rhwpJs);
          await viewerDbPut(RHWP_WASM_KEY, rhwpWasm);
          localStorage.setItem(CACHE_RHWP_MARK, '1');
          rhwpCorePromise = null;
          try { delete window.__krissRhwpCore; } catch (e) {}
        } else if (f4 || f5) { alert('HWP/HWPX는 rhwp.js와 rhwp_bg.wasm 두 파일이 모두 필요합니다.'); return; }
        alert('저장했습니다. 페이지를 새로고침하세요.');
        modal.remove();
      } catch (e) { alert('파일 읽기 실패: ' + e.message); }
    });
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = '취소';
    cancel.style.cssText = 'background:#eee;color:#333;border:1px solid #ccc;padding:8px 16px;border-radius:4px;font-size:13px;cursor:pointer;';
    cancel.addEventListener('click', function () { modal.remove(); });
    btnRow.appendChild(save); btnRow.appendChild(cancel);
    body.appendChild(btnRow); modal.appendChild(body);
    document.body.appendChild(modal);
  }

  // ---------- 첨부문서 로드 / 텍스트 추출 ----------
  function fileExt(fileName) {
    var n = String(fileName || '').toLowerCase();
    var p = n.lastIndexOf('.');
    return p >= 0 ? n.substring(p + 1).replace(/[^a-z0-9].*$/, '') : '';
  }

  function isPdfBuffer(buffer) {
    var b = new Uint8Array(buffer || 0);
    return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D;
  }

  function sniffHwpFormat(buffer, fileName) {
    var b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
    if (b.length >= 8 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0 &&
        b[4] === 0xA1 && b[5] === 0xB1 && b[6] === 0x1A && b[7] === 0xE1) return 'HWP';
    var ext = fileExt(fileName);
    if ((ext === 'hwp' || ext === 'hwpx') && b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B &&
        ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06) || (b[2] === 0x07 && b[3] === 0x08))) return 'HWPX';
    return '';
  }

  // y좌표 변화로 줄바꿈을 복원한다(pdf.js는 줄 정보를 잃기 쉬움).
  async function extractPdfText(pdf) {
    var pageTexts = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var tc = await page.getTextContent();
      var lastY = null, pageText = '';
      tc.items.forEach(function (item) {
        if (!item.str) return;
        var y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) pageText += '\n';
        else if (pageText && !/[\s\n]$/.test(pageText)) pageText += ' ';
        pageText += item.str;
        lastY = y;
      });
      pageTexts.push(pageText);
    }
    return { pageTexts: pageTexts, text: pageTexts.join('\n') };
  }

  function sanitizeDocxHtml(html) {
    var box = document.createElement('template');
    box.innerHTML = String(html || '');
    Array.prototype.forEach.call(box.content.querySelectorAll('script,iframe,object,embed,form,meta,link'), function (el) { el.remove(); });
    Array.prototype.forEach.call(box.content.querySelectorAll('*'), function (el) {
      Array.prototype.slice.call(el.attributes || []).forEach(function (a) {
        var n = a.name.toLowerCase(), v = String(a.value || '').trim();
        if (/^on/.test(n)) el.removeAttribute(a.name);
        if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^(?:javascript:|https?:|\/\/)/i.test(v)) el.removeAttribute(a.name);
      });
    });
    var holder = document.createElement('div');
    holder.appendChild(box.content.cloneNode(true));
    return holder.innerHTML;
  }

  function textFromHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = sanitizeDocxHtml(html);
    return d.textContent || '';
  }

  function textFromSvg(svg) {
    try {
      var xml = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
      return xml.documentElement ? (xml.documentElement.textContent || '') : '';
    } catch (e) { return ''; }
  }

  async function loadAttachmentFromLink(urls, fileName, msgPrefix) {
    showMsg((msgPrefix || '첨부문서') + ' 다운로드 중...');
    var buffer = await smartFetch(Array.isArray(urls) ? urls : [urls]);
    var ext = fileExt(fileName);

    if (isPdfBuffer(buffer)) {
      if (!loadCachedPdfJs()) throw new Error('pdf.js가 등록되지 않았습니다. 뷰어 설정에서 먼저 등록하세요.');
      showMsg('PDF 텍스트 추출 중...');
      var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      var ex = await extractPdfText(pdf);
      console.log(TAG, 'PDF 추출:', ex.text.length, '자 |', pdf.numPages, '페이지');
      return { kind: 'PDF', buffer: buffer, pdf: pdf, text: ex.text, pageTexts: ex.pageTexts, pageCount: pdf.numPages };
    }

    if (ext === 'docx') {
      if (!loadCachedMammoth()) throw new Error('mammoth.js가 등록되지 않았습니다. 뷰어 설정에서 먼저 등록하세요.');
      var dh = new Uint8Array(buffer.slice(0, 4));
      if (dh[0] !== 0x50 || dh[1] !== 0x4B) throw new Error('응답이 DOCX(ZIP)가 아닙니다.');
      showMsg('DOCX 텍스트 추출 중...');
      var htmlResult = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
      var rawText = '';
      if (typeof window.mammoth.extractRawText === 'function') {
        try { rawText = (await window.mammoth.extractRawText({ arrayBuffer: buffer })).value || ''; } catch (e) {}
      }
      if (!rawText) rawText = textFromHtml(htmlResult.value);
      return { kind: 'DOCX', buffer: buffer, html: sanitizeDocxHtml(htmlResult.value), text: rawText, pageTexts: [rawText], pageCount: 1 };
    }

    var format = sniffHwpFormat(buffer, fileName);
    if (format) {
      showMsg(format + ' 텍스트·페이지 추출 중...');
      var core = await loadCachedRhwp();
      var doc = null;
      try {
        var bytes = new Uint8Array(buffer);
        try {
          doc = new core.HwpDocument(bytes);
        } catch (firstErr) {
          var password = window.prompt('문서를 열지 못했습니다. 암호 문서라면 암호를 입력하세요.\n암호 문서가 아니면 취소하세요.\n\n' + firstErr.message, '');
          if (password === null || password === '') throw firstErr;
          if (typeof core.HwpDocument.openWithPassword !== 'function') throw new Error('이 rhwp 버전은 암호 열기 API를 제공하지 않습니다.');
          doc = core.HwpDocument.openWithPassword(bytes, password);
        }

        var count = doc.pageCount();
        if (!count || count < 1) throw new Error('표시할 페이지가 없습니다.');
        var pages = [], pageTexts = [];
        for (var i = 0; i < count; i++) {
          var svg = typeof doc.renderPageSvg === 'function' ? doc.renderPageSvg(i) : '';
          pages.push(svg);
          var pt = '';
          if (typeof doc.getPageText === 'function') {
            try { pt = String(doc.getPageText(i) || ''); } catch (e) {}
          }
          if (!pt && svg) pt = textFromSvg(svg);
          pageTexts.push(pt);
          if (i % 2 === 1) await new Promise(function (resolve) { requestAnimationFrame(resolve); });
        }
        var allText = pageTexts.join('\n');
        console.log(TAG, format + ' 추출:', allText.length, '자 |', count, '페이지');
        return { kind: format, buffer: buffer, pages: pages, text: allText, pageTexts: pageTexts, pageCount: count };
      } finally {
        if (doc) { try { doc.free(); } catch (e) {} }
      }
    }

    throw new Error('지원 형식을 판별하지 못했습니다: ' + (fileName || '(파일명 없음)'));
  }

  // ---------- 실제 문서 근거문구 찾기 ----------
  function compactMap(text) {
    var source = String(text || '');
    var compact = '', map = [];
    for (var i = 0; i < source.length; i++) {
      var ch = normalizeChars(source.charAt(i));
      if (/[0-9A-Za-z가-힣]/.test(ch)) {
        compact += ch.toLowerCase();
        map.push(i);
      }
    }
    return { source: source, compact: compact, map: map };
  }

  function evidenceContext(source, start, end) {
    var ls = source.lastIndexOf('\n', start - 1) + 1;
    var le = source.indexOf('\n', end);
    if (le < 0) le = source.length;
    if (le - ls > 190) {
      ls = Math.max(0, start - 70);
      le = Math.min(source.length, end + 90);
    }
    return cleanText((ls > 0 ? '…' : '') + source.slice(ls, le) + (le < source.length ? '…' : ''));
  }

  function findEvidence(text, candidates) {
    var source = String(text || '');
    var list = Array.isArray(candidates) ? candidates.slice() : [candidates];
    list = list.filter(function (v) { return v !== null && v !== undefined && String(v).trim() !== ''; });
    if (!source || !list.length) return { found: false, matched: '', context: '' };

    // 사람이 보는 원문 그대로의 일치를 먼저 찾는다(영문은 대소문자 무시).
    var lower = normalizeChars(source).toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var q = normalizeChars(String(list[i]).trim());
      if (!q) continue;
      var at = lower.indexOf(q.toLowerCase());
      if (at >= 0) {
        return { found: true, matched: source.slice(at, at + q.length), context: evidenceContext(source, at, at + q.length), candidate: list[i] };
      }
    }

    // 공백·점·하이픈·괄호 등이 달라도 찾고, compact 위치를 원문 위치로 되돌린다.
    var cm = compactMap(source);
    var normalized = list.map(function (v) { return { raw: v, clean: compactText(v) }; })
      .filter(function (x) { return x.clean.length >= 2; })
      .sort(function (a, b) { return b.clean.length - a.clean.length; });
    for (var j = 0; j < normalized.length; j++) {
      var idx = cm.compact.indexOf(normalized[j].clean);
      if (idx >= 0 && cm.map[idx] !== undefined && cm.map[idx + normalized[j].clean.length - 1] !== undefined) {
        var st = cm.map[idx], en = cm.map[idx + normalized[j].clean.length - 1] + 1;
        return { found: true, matched: source.slice(st, en), context: evidenceContext(source, st, en), candidate: normalized[j].raw };
      }
    }
    return { found: false, matched: '', context: '' };
  }

  function findPartialEvidence(text, value, minLen) {
    var tokens = normalizeChars(value || '').split(/[^0-9A-Za-z가-힣]+/)
      .filter(function (w) { return w.length >= (minLen || 3); })
      .sort(function (a, b) { return b.length - a.length; });
    var seen = {}, contexts = [];
    for (var i = 0; i < tokens.length && contexts.length < 2; i++) {
      var ev = findEvidence(text, tokens[i]);
      if (ev.found && !seen[ev.context]) { seen[ev.context] = 1; contexts.push(ev.context); }
    }
    return contexts.length ? { found: true, matched: '', context: contexts.join(' / '), partial: true } : { found: false, matched: '', context: '' };
  }

  function findRegexEvidence(text, re) {
    var source = String(text || '');
    if (!source) return { found: false, matched: '', context: '' };
    try {
      re.lastIndex = 0;
      var m = re.exec(source);
      re.lastIndex = 0;
      if (!m) return { found: false, matched: '', context: '' };
      return { found: true, matched: m[0], context: evidenceContext(source, m.index, m.index + m[0].length) };
    } catch (e) { return { found: false, matched: '', context: '' }; }
  }

  function evidenceText(ev, notFound) {
    return ev && ev.found ? ('“' + clipText(ev.context || ev.matched, 170) + '”') : (notFound || '첨부문서에서 미발견');
  }

  function evidenceForField(text, f) {
    if (!f || !f.value) return { found: false, matched: '', context: '' };
    var candidates = [f.value];
    if (f.isDate) candidates = dateForms(f.value);
    if (f.isMoney) {
      var digits = String(f.value).replace(/[^0-9]/g, '');
      if (digits) candidates.push(digits);
    }
    var ev = findEvidence(text, candidates);
    if (!ev.found && f.isLongText) ev = findPartialEvidence(text, f.value, 3);
    return ev;
  }

  // ---------- 하이라이트 ----------
  function matchSetBuilder() {
    var set = [], seen = {};
    return {
      add: function (val, label, opts) {
        if (!val) return;
        var v = String(val).trim();
        if (v.length < 2) return;
        var key = label + '|' + v.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        set.push({
          original: v, clean: compactText(v), label: label,
          isMoney: !!(opts && opts.isMoney)
        });
      },
      addDates: function (val, label) {
        var self = this;
        if (!val) return;
        dateForms(val).forEach(function (f) { self.add(f, label); });
      },
      addWords: function (val, label, minLen) {
        var self = this;
        if (!val) return;
        String(val).split(/\s+/).forEach(function (w) {
          var ww = w.replace(/[^가-힣A-Za-z0-9]/g, '');
          if (ww.length >= (minLen || 3)) self.add(ww, label);
        });
      },
      get: function () { return set; }
    };
  }

  function sortedHighlightNeedles(matchSet) {
    var seen = {};
    return (matchSet || []).map(function (m) { return { clean: m.clean || compactText(m.original), label: m.label || '' }; })
      .filter(function (m) {
        if (!m.clean || m.clean.length < 3 || seen[m.clean]) return false;
        seen[m.clean] = 1; return true;
      }).sort(function (a, b) { return b.clean.length - a.clean.length; });
  }

  // pdf.js는 한글 한 단어도 여러 text item으로 나눌 수 있다.
  // 같은 줄의 item을 x좌표 순으로 다시 결합한 뒤 compact 문자열에서 찾고, 해당 item들로 역매핑한다.
  function buildPdfHighlightMap(items, matchSet) {
    var lines = [], needles = sortedHighlightNeedles(matchSet), result = new Map();
    if (!needles.length) return result;
    (items || []).forEach(function (item, index) {
      if (!item || !item.str) return;
      var y = item.transform && item.transform.length > 5 ? item.transform[5] : 0;
      var x = item.transform && item.transform.length > 4 ? item.transform[4] : index;
      var line = null;
      for (var i = 0; i < lines.length; i++) {
        if (Math.abs(lines[i].y - y) <= 2.5) { line = lines[i]; break; }
      }
      if (!line) { line = { y: y, entries: [] }; lines.push(line); }
      line.entries.push({ item: item, index: index, x: x });
    });

    lines.forEach(function (line) {
      line.entries.sort(function (a, b) { return a.x - b.x; });
      var compact = '', charToEntry = [];
      line.entries.forEach(function (entry, entryIndex) {
        var c = compactText(entry.item.str);
        for (var k = 0; k < c.length; k++) { compact += c.charAt(k); charToEntry.push(entryIndex); }
      });
      needles.forEach(function (needle) {
        var from = 0, at;
        while ((at = compact.indexOf(needle.clean, from)) >= 0) {
          var end = at + needle.clean.length;
          var touched = {};
          for (var p = at; p < end; p++) touched[charToEntry[p]] = 1;
          Object.keys(touched).forEach(function (ei) {
            var ent = line.entries[Number(ei)];
            if (!ent) return;
            var labels = result.get(ent.item) || [];
            if (labels.indexOf(needle.label) < 0) labels.push(needle.label);
            result.set(ent.item, labels);
          });
          from = at + Math.max(1, needle.clean.length);
        }
      });
    });
    return result;
  }

  async function renderPdfPages(pdf, container, matchValues) {
    var containerWidth = Math.max(320, container.clientWidth - 16);
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var vp0 = page.getViewport({ scale: 1 });
      var scale = containerWidth / vp0.width;
      var vp = page.getViewport({ scale: scale });

      var pageBox = document.createElement('div');
      pageBox.style.cssText = 'position:relative;margin-bottom:8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      var canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.cssText = 'display:block;width:100%;';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      pageBox.appendChild(canvas);

      if (matchValues && matchValues.length) {
        var tc = await page.getTextContent();
        var hitMap = buildPdfHighlightMap(tc.items, matchValues);
        tc.items.forEach(function (item) {
          var labels = hitMap.get(item);
          if (!labels || !labels.length) return;
          var tx = combineTransform(vp.transform, item.transform);
          var fh = Math.hypot(tx[2], tx[3]);
          var hl = document.createElement('div');
          hl.style.cssText = 'position:absolute;pointer-events:none;border-radius:2px;background:rgba(255,235,59,0.42);border:1px solid rgba(249,168,37,0.75);box-sizing:border-box;';
          hl.style.left = (tx[4] / canvas.width * 100) + '%';
          hl.style.top = ((tx[5] - fh) / canvas.height * 100) + '%';
          hl.style.width = Math.max(0.15, item.width * scale / canvas.width * 100) + '%';
          hl.style.height = Math.max(0.2, fh * 1.25 / canvas.height * 100) + '%';
          hl.title = labels.join(', ');
          pageBox.appendChild(hl);
        });
      }

      container.appendChild(pageBox);
      if (pdf.numPages > 1) {
        var pn = document.createElement('div');
        pn.style.cssText = 'text-align:center;color:#fff;font-size:11px;padding:2px;';
        pn.textContent = i + ' / ' + pdf.numPages;
        container.appendChild(pn);
      }
    }
  }

  function highlightHtmlText(root, matchSet) {
    var needles = sortedHighlightNeedles(matchSet);
    if (!root || !needles.length) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.trim()) nodes.push(n);
    }
    var compact = '', charMap = [];
    nodes.forEach(function (node, ni) {
      var value = node.nodeValue || '';
      for (var i = 0; i < value.length; i++) {
        var ch = normalizeChars(value.charAt(i));
        if (/[0-9A-Za-z가-힣]/.test(ch)) { compact += ch.toLowerCase(); charMap.push({ ni: ni, off: i }); }
      }
    });
    var intervals = nodes.map(function () { return []; });
    needles.forEach(function (needle) {
      var from = 0, at;
      while ((at = compact.indexOf(needle.clean, from)) >= 0) {
        var end = at + needle.clean.length;
        var byNode = {};
        for (var p = at; p < end; p++) {
          var mp = charMap[p]; if (!mp) continue;
          if (!byNode[mp.ni]) byNode[mp.ni] = [mp.off, mp.off + 1];
          else byNode[mp.ni][1] = mp.off + 1;
        }
        Object.keys(byNode).forEach(function (k) { intervals[Number(k)].push(byNode[k]); });
        from = at + Math.max(1, needle.clean.length);
      }
    });
    intervals.forEach(function (arr, ni) {
      if (!arr.length) return;
      arr.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [];
      arr.forEach(function (r) {
        if (!merged.length || r[0] > merged[merged.length - 1][1]) merged.push(r.slice());
        else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
      });
      var base = nodes[ni];
      for (var j = merged.length - 1; j >= 0; j--) {
        if (!base.parentNode) break;
        var st = merged[j][0], en = merged[j][1];
        if (en > base.nodeValue.length) en = base.nodeValue.length;
        var after = base.splitText(en);
        var mid = base.splitText(st);
        var mark = document.createElement('mark');
        mark.style.cssText = 'background:#FFEB3B;color:inherit;padding:0 1px;border-radius:2px;';
        mid.parentNode.insertBefore(mark, after);
        mark.appendChild(mid);
      }
    });
  }

  function rhwpCssLength(v) {
    if (!v) return NaN;
    var m = String(v).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(px|pt|pc|mm|cm|in)?$/i);
    if (!m) return NaN;
    var n = Number(m[1]), u = (m[2] || 'px').toLowerCase();
    var k = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
    return n * k[u];
  }

  function rhwpSvgSize(svg) {
    try {
      var xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
      var root = xml.documentElement;
      if (!root || root.localName !== 'svg') throw new Error('SVG 아님');
      var vb = (root.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
      if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] };
      var w = rhwpCssLength(root.getAttribute('width')), h = rhwpCssLength(root.getAttribute('height'));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
    } catch (e) {}
    return { width: 794, height: 1123 };
  }

  function highlightRhwpSvg(svg, matchSet) {
    var needles = sortedHighlightNeedles(matchSet);
    if (!needles.length) return svg;
    try {
      var xml = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
      var root = xml.documentElement;
      if (!root || root.localName !== 'svg') return svg;
      var els = root.querySelectorAll('text, tspan');
      Array.prototype.forEach.call(els, function (el) {
        var c = compactText(el.textContent || '');
        if (!c) return;
        var hit = needles.some(function (n) { return c.indexOf(n.clean) >= 0 || (c.length >= 3 && n.clean.indexOf(c) >= 0); });
        if (hit) {
          var old = el.getAttribute('style') || '';
          el.setAttribute('style', old + ';paint-order:stroke fill;stroke:#FDD835;stroke-width:3px;stroke-opacity:.72;stroke-linejoin:round;');
        }
      });
      return new XMLSerializer().serializeToString(root);
    } catch (e) { return svg; }
  }

  function rhwpSafeSvgDoc(svg, width, height, scale, matchSet) {
    svg = highlightRhwpSvg(svg, matchSet);
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; font-src data:; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'">' +
      '<style>html,body{margin:0;padding:0;width:' + (width * scale) + 'px;height:' + (height * scale) + 'px;overflow:hidden;background:#fff}' +
      '#p{width:' + width + 'px;height:' + height + 'px;transform:scale(' + scale + ');transform-origin:0 0;line-height:normal}' +
      '#p>svg{display:block!important;width:' + width + 'px!important;height:' + height + 'px!important;max-width:none!important;max-height:none!important}</style>' +
      '</head><body><div id="p">' + svg + '</div></body></html>';
  }

  async function renderDocxDocument(doc, container, matchSet) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'padding:20px 0;min-height:100%;';
    var box = document.createElement('div');
    box.style.cssText = 'max-width:820px;width:90%;margin:0 auto;background:#fff;padding:40px 48px;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:Malgun Gothic,sans-serif;font-size:14px;line-height:1.8;color:#333;box-sizing:border-box;';
    box.innerHTML = doc.html || '';
    highlightHtmlText(box, matchSet);
    wrap.appendChild(box); container.appendChild(wrap);
  }

  async function renderRhwpDocument(doc, container, matchSet) {
    var maxWidth = Math.max(320, container.clientWidth - 24);
    for (var i = 0; i < (doc.pages || []).length; i++) {
      var svg = doc.pages[i];
      var sz = rhwpSvgSize(svg);
      var scale = Math.min(1.25, maxWidth / sz.width);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
      var pageBox = document.createElement('div');
      pageBox.style.cssText = 'margin:0 auto 10px auto;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);line-height:0;width:' + Math.ceil(sz.width * scale) + 'px;';
      var frame = document.createElement('iframe');
      frame.setAttribute('sandbox', '');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('title', doc.kind + ' ' + (i + 1) + '쪽');
      frame.style.cssText = 'display:block;border:0;background:#fff;width:' + Math.ceil(sz.width * scale) + 'px;height:' + Math.ceil(sz.height * scale) + 'px;max-width:none;';
      frame.srcdoc = rhwpSafeSvgDoc(svg, sz.width, sz.height, scale, matchSet);
      pageBox.appendChild(frame); container.appendChild(pageBox);
      if (doc.pageCount > 1) {
        var pn = document.createElement('div');
        pn.style.cssText = 'color:#fff;font-size:11px;padding:1px 0 8px;text-align:center;';
        pn.textContent = (i + 1) + ' / ' + doc.pageCount;
        container.appendChild(pn);
      }
      if (i % 2 === 1) await new Promise(function (resolve) { requestAnimationFrame(resolve); });
    }
  }

  async function renderAttachmentDocument(doc, container, matchSet) {
    if (doc.kind === 'PDF') return renderPdfPages(doc.pdf, container, matchSet);
    if (doc.kind === 'DOCX') return renderDocxDocument(doc, container, matchSet);
    if (doc.kind === 'HWP' || doc.kind === 'HWPX') return renderRhwpDocument(doc, container, matchSet);
    throw new Error('렌더링할 수 없는 문서 형식: ' + doc.kind);
  }

  // ---------- 오버레이 ----------
  function openOverlay(opt) {
    removeAll();
    var overlay = document.createElement('div');
    overlay.id = 'krissComparePanel';
    overlay.setAttribute('data-kriss-ui', '1');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#fff;z-index:99999;display:flex;flex-direction:column;';

    var header = document.createElement('div');
    header.style.cssText = 'background:' + opt.color + ';color:#fff;padding:6px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    var titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-weight:bold;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:12px;';
    titleEl.textContent = opt.title || '';
    var right = document.createElement('div');
    right.style.cssText = 'flex-shrink:0;';
    var hint = document.createElement('span');
    hint.style.cssText = 'font-size:11px;margin-right:10px;opacity:0.85;';
    hint.textContent = 'ESC 닫기';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.textContent = 'X 닫기';
    closeBtn.style.cssText = 'background:#fff;color:' + opt.color + ';border:none;padding:4px 14px;cursor:pointer;font-weight:bold;border-radius:4px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    right.appendChild(hint); right.appendChild(closeBtn);
    header.appendChild(titleEl); header.appendChild(right);
    overlay.appendChild(header);

    var body = document.createElement('div');
    body.style.cssText = 'flex:1;display:flex;overflow:hidden;';
    overlay.appendChild(body);
    document.body.appendChild(overlay);

    var escH = function (e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escH); }
    };
    document.addEventListener('keydown', escH);
    return { overlay: overlay, body: body };
  }

  // 좌: 첨부문서 렌더+하이라이트 / 우: 대조 결과
  function openSplitView(opt) {
    var o = openOverlay({ title: opt.title, color: opt.color });
    var left = document.createElement('div');
    left.style.cssText = 'width:' + (opt.leftWidth || '57%') + ';height:100%;overflow-y:auto;background:#888;padding:8px;box-sizing:border-box;';
    var right = document.createElement('div');
    right.style.cssText = 'flex:1;height:100%;overflow-y:auto;background:#fafafa;border-left:2px solid ' + opt.color + ';';
    o.body.appendChild(left); o.body.appendChild(right);
    right.appendChild(opt.rightNode);
    renderAttachmentDocument(opt.doc, left, opt.matchSet).catch(function (e) {
      console.error(TAG, '문서 렌더 실패:', e);
      var msg = document.createElement('div');
      msg.style.cssText = 'margin:20px;padding:14px;background:#fff;color:#b71c1c;border-radius:6px;';
      msg.textContent = '문서 표시 실패: ' + e.message + ' (오른쪽 대조 결과는 계속 사용할 수 있습니다.)';
      left.appendChild(msg);
    });
    return o;
  }

  // ---------- 결과표 (4개 화면이 공유하는 단일 렌더러) ----------
  var STATUS = {
    match:             { icon: 'O', color: '#4CAF50', bg: '#f0fff0', kind: 'ok' },
    partial:           { icon: '△', color: '#F9A825', bg: '#fffcf0', kind: 'warn' },
    derived:           { icon: '≈', color: '#7B1FA2', bg: '#f8f0ff', kind: 'warn' },
    mismatch:          { icon: 'X', color: '#F44336', bg: '#fff0f0', kind: 'bad' },
    needs_mapping:     { icon: '↔', color: '#FF9800', bg: '#fff8e1', kind: 'warn' },
    not_extracted:     { icon: '?', color: '#607D8B', bg: '#fffde7', kind: 'etc' },
    not_present:       { icon: 'Ø', color: '#607D8B', bg: '#fafafa', kind: 'etc' },
    external_required: { icon: 'i', color: '#2196F3', bg: '#f5f5ff', kind: 'etc' },
    info:              { icon: 'i', color: '#2196F3', bg: '#f5f5ff', kind: 'etc' },
    empty:             { icon: '-', color: '#999',    bg: '#fafafa', kind: 'etc' }
  };

  // opt = { color, groupBg, checks:[{group,label,tagA,tagB,a,b,status,note}], legendHtml, copyHeader, extraButtons }
  function buildResultPanel(opt) {
    var container = document.createElement('div');
    var checks = opt.checks || [];
    var color = opt.color || '#1565C0';
    var groupBg = opt.groupBg || '#E3F2FD';

    var cnt = { ok: 0, warn: 0, bad: 0, etc: 0 };
    checks.forEach(function (c) {
      var st = STATUS[c.status] || STATUS.empty;
      cnt[st.kind]++;
    });

    var summary = document.createElement('div');
    summary.style.cssText = 'padding:10px 14px;background:' + groupBg + ';font-size:13px;font-weight:bold;border-bottom:2px solid ' + color + ';';
    summary.innerHTML = '대조 결과: <span style="color:#4CAF50">일치 ' + cnt.ok +
      '</span> / <span style="color:#F9A825">부분·파생 ' + cnt.warn +
      '</span> / <span style="color:#F44336">불일치 ' + cnt.bad +
      '</span> / <span style="color:#607D8B">참고 ' + cnt.etc + '</span>';
    container.appendChild(summary);

    var legend = document.createElement('div');
    legend.style.cssText = 'padding:6px 14px;background:#fff3e0;font-size:11px;border-bottom:1px solid #ddd;line-height:1.7;';
    legend.innerHTML = opt.legendHtml ||
      ('<b style="color:#4CAF50">O</b> 일치 <b style="color:#F9A825">△</b> 부분일치 ' +
       '<b style="color:#7B1FA2">≈</b> 파생값 <b style="color:#F44336">X</b> 불일치 ' +
       '<b style="color:#FF9800">↔</b> 매핑 필요 <b style="color:#607D8B">?</b> 추출 안 됨 ' +
       '<b style="color:#2196F3">i</b> 참고 <span style="color:#999">-</span> 빈값');
    container.appendChild(legend);

    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    var currentGroup = '';
    checks.forEach(function (c) {
      if (c.group && c.group !== currentGroup) {
        currentGroup = c.group;
        var gr = document.createElement('tr'), gd = document.createElement('td');
        gd.colSpan = 4;
        gd.style.cssText = 'background:' + groupBg + ';padding:6px 10px;font-weight:bold;font-size:12px;color:' + color + ';';
        gd.textContent = currentGroup;
        gr.appendChild(gd); table.appendChild(gr);
      }
      var st = STATUS[c.status] || STATUS.empty;
      var tr = document.createElement('tr');
      tr.style.background = st.bg;

      var tdL = document.createElement('td');
      tdL.style.cssText = 'padding:4px 8px;border-bottom:1px solid #eee;color:#666;width:17%;vertical-align:top;';
      var warn = (c.status === 'mismatch' || c.status === 'partial' || c.status === 'needs_mapping');
      tdL.textContent = c.label + (c.note && warn ? ' ⚠' : '');
      if (c.note) tdL.title = c.note;

      var tdA = document.createElement('td');
      tdA.style.cssText = 'padding:4px 8px;border-bottom:1px solid #eee;width:31%;word-break:break-all;vertical-align:top;line-height:1.45;';
      tdA.innerHTML = '<span style="color:#1565C0;font-size:10px">' + escHtml(c.tagA || '시스템') + '</span><br>' + escHtml(c.a || '-');
      if (c.a) {
        tdA.style.cursor = 'pointer';
        tdA.title = '클릭하면 복사';
        (function (v, td) {
          td.addEventListener('click', function () {
            copyText(v);
            var old = td.style.background;
            td.style.background = '#C8E6C9';
            setTimeout(function () { td.style.background = old; }, 400);
          });
        })(c.a, tdA);
      }

      var tdB = document.createElement('td');
      tdB.style.cssText = 'padding:4px 8px;border-bottom:1px solid #eee;width:35%;word-break:break-all;vertical-align:top;line-height:1.45;';
      tdB.innerHTML = '<span style="color:#E65100;font-size:10px">' + escHtml(c.tagB || 'PDF') + '</span><br>' + escHtml(c.b || '-');

      var tdS = document.createElement('td');
      tdS.style.cssText = 'padding:4px 6px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;font-size:14px;width:28px;vertical-align:top;color:' + st.color + ';';
      tdS.textContent = st.icon;

      tr.appendChild(tdL); tr.appendChild(tdA); tr.appendChild(tdB); tr.appendChild(tdS);
      table.appendChild(tr);
    });
    container.appendChild(table);

    var btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'padding:10px 14px;border-top:2px solid #e0e0e0;display:flex;gap:6px;flex-wrap:wrap;';
    var cpAll = document.createElement('button');
    cpAll.type = 'button'; cpAll.textContent = '전체 복사';
    cpAll.style.cssText = 'flex:1;background:' + color + ';color:#fff;border:none;padding:6px 10px;cursor:pointer;border-radius:4px;font-size:12px;font-weight:bold;';
    cpAll.addEventListener('click', function () {
      var rows = checks.map(function (c) {
        return [c.group || '', c.label, c.a || '-', c.b || '-', c.status].join('\t');
      }).join('\n');
      copyText((opt.copyHeader || '그룹\t항목\t시스템값\t첨부문서\t결과') + '\n' + rows);
      cpAll.textContent = '복사 완료';
      setTimeout(function () { cpAll.textContent = '전체 복사'; }, 1000);
    });
    btnDiv.appendChild(cpAll);
    (opt.extraButtons || []).forEach(function (b) {
      var e = document.createElement('button');
      e.type = 'button'; e.textContent = b.text;
      e.style.cssText = 'background:' + b.bg + ';color:#fff;border:none;padding:6px 10px;cursor:pointer;border-radius:4px;font-size:12px;';
      e.addEventListener('click', function () {
        b.onClick();
        var t = e.textContent;
        e.textContent = '완료';
        setTimeout(function () { e.textContent = t; }, 1000);
      });
      btnDiv.appendChild(e);
    });
    container.appendChild(btnDiv);
    return container;
  }

  // ---------- 첨부파일 대조 / 보기 버튼 부착 ----------
  // 대조 규칙이 있으면 기존처럼 "대조"만 표시하고,
  // 대조 규칙이 없는 화면에서는 같은 색상의 "보기"를 표시한다.
  // "보기"는 파일을 저장하지 않고 현재 페이지의 전체화면 모달에서만 렌더링한다.
  async function startAttachmentView(urls, fileName) {
    try {
      var r = await loadAttachmentFromLink(urls, fileName, '첨부문서');
      var o = openOverlay({
        title: '보기 | ' + r.kind + ' | ' + (fileName || ''),
        color: '#1565C0'
      });
      o.body.style.cssText = 'flex:1;overflow-y:auto;background:#888;padding:8px;box-sizing:border-box;display:block;';

      var viewer = document.createElement('div');
      viewer.style.cssText = 'width:100%;min-height:100%;box-sizing:border-box;';
      o.body.appendChild(viewer);
      await renderAttachmentDocument(r, viewer, []);
    } catch (e) {
      console.error(TAG, '첨부문서 보기 실패:', e);
      showMsg('첨부문서 보기 실패: ' + e.message);
    }
  }

  function attachFileButtons(opt) {
    var scan = function () {
      if (KILLED) return;
      var links = document.querySelectorAll(opt.selectors);
      if (!links.length) return;
      Array.prototype.forEach.call(links, function (a) {
        if (a.parentNode.querySelector('.kriss-fbtn')) return;
        var fileName = (a.getAttribute('data-orginl-file-nm') || a.textContent).trim();
        var ext = fileExt(fileName);
        var isPdf = (ext === 'pdf'), isDocx = (ext === 'docx'), isHwp = (ext === 'hwp' || ext === 'hwpx');
        if (!isPdf && !isDocx && !isHwp) return;

        var hasCompare = !!(opt.compareLabel && opt.onCompare);
        var buttonLabel = hasCompare ? opt.compareLabel : '보기';
        var urls = urlsFromLink(a, opt.fallbackProgrmId, opt.fallbackDocId ? opt.fallbackDocId() : '');
        var sizeSpan = a.nextElementSibling;
        var anchor = (sizeSpan && sizeSpan.classList && sizeSpan.classList.contains('label-file-size')) ? sizeSpan : a;
        var bc = mkInlineBtn(buttonLabel, '#2196F3', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (isPdf && !loadCachedPdfJs()) { showMsg('pdf.js가 등록되지 않았습니다. 뷰어 설정을 먼저 진행하세요.'); return; }
          if (isDocx && !loadCachedMammoth()) { showMsg('mammoth.js가 등록되지 않았습니다. 뷰어 설정을 먼저 진행하세요.'); return; }
          if (isHwp && !hasRhwpLib()) { showMsg('rhwp.js + rhwp_bg.wasm이 등록되지 않았습니다. 뷰어 설정을 먼저 진행하세요.'); return; }

          if (hasCompare) opt.onCompare(urls, fileName);
          else startAttachmentView(urls, fileName);
        });
        anchor.parentNode.insertBefore(bc, anchor.nextSibling);
      });
    };
    scan();
    var t = null;
    new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(scan, 400);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---------- 다운로드 시 관리번호 접두 ----------
  function setupDownloadIntercept(prefixFn) {
    if (window.__krissDlIntercept) return;
    window.__krissDlIntercept = true;
    var bind = function () {
      if (KILLED) return;
      var cnt = 0;
      Array.prototype.forEach.call(document.querySelectorAll('a.download_file'), function (a) {
        if (a.getAttribute('data-kriss-dl') === '1') return;
        a.setAttribute('data-kriss-dl', '1');
        a.addEventListener('click', function (e) {
          if (KILLED) return;   // 원상복구 후에는 원래 다운로드 동작으로 되돌린다
          e.preventDefault(); e.stopPropagation();
          downloadWithPrefix(a, prefixFn);
        }, true);
        cnt++;
      });
      if (cnt) console.log(TAG, '다운로드 링크 바인딩:', cnt, '건');
    };
    bind();
    var t = null;
    new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(bind, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }

  async function downloadWithPrefix(a, prefixFn) {
    var origName = (a.getAttribute('data-orginl-file-nm') || a.textContent).trim();
    var prefix = '';
    try { prefix = prefixFn ? (prefixFn() || '') : ''; } catch (e) {}
    var finalName = (prefix + origName).replace(/[\\/:*?"<>|]/g, '_');
    showMsg('다운로드 중: ' + finalName);
    try {
      var buffer = await smartFetch(urlsFromLink(a, '', ''));
      var blobUrl = URL.createObjectURL(new Blob([buffer]));
      var tmp = document.createElement('a');
      tmp.href = blobUrl; tmp.download = finalName;
      document.body.appendChild(tmp); tmp.click(); tmp.remove();
      setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
      console.log(TAG, '다운로드 완료:', finalName);
      removeAll();
    } catch (e) {
      console.error(TAG, '다운로드 실패:', e);
      showMsg('다운로드 실패: ' + e.message);
    }
  }
  // ============================================================
  // [공통 코어 끝]
  // ============================================================
  // ---------- 논문 메타데이터 파서: 퍼블리셔 어댑터 (v1.0.1) ----------
  // 설계 원칙
  //  1) 어댑터 판별·서지정보·저자는 1페이지(+러닝헤더)만 본다. 참고문헌의 출판사명·권호가
  //     오판을 만들기 때문이다(예: ASM 논문이 참고문헌의 "Elsevier" 때문에 Elsevier로 판별됨).
  //  2) 저자 블록은 제목 다음 ~ 소속마커/ABSTRACT 이전 구간으로 한정한다.
  //  3) 소속마커는 숫자(1,2,3)와 알파벳(a,b,c) 모두 지원한다(Elsevier는 알파벳).
  //  4) 모든 추출값은 값·원문·페이지·신뢰도를 함께 반환한다.
  var KrissPaper = (function () {
    'use strict';
    var PTAG = '[KRISS-PAPER]';

    function nz(t) {
      var s = String(t || '');
      // NFKC가 의미 있는 조판 기호까지 바꾸기 전에 보존한다.
      // U+2024(․)는 국내 논문의 저자 구분자, U+24D2(ⓒ)는 copyright 표식이다.
      s = s.replace(/\u2024/g, ';').replace(/\u24D2/g, '©');
      // NFKC: 전각 숫자/영문, 호환문자, ligature(fi 등)를 비교 가능한 형태로 통일한다.
      try { if (s.normalize) s = s.normalize('NFKC'); } catch (e) {}
      return s
        .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
        .replace(/[\u2018\u2019\u201A\uFE10]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/\u00AD/g, '');
    }
    function cl(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    function cp(s, n) { var v = cl(s); n = n || 180; return v.length > n ? v.substring(0, n) + '…' : v; }
    function esc(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function cmpKey(s) { return nz(s).replace(/[^A-Za-z0-9가-힣]/g, '').toLowerCase(); }

    var MON = ['', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    function toIso(str) {
      var mm = {}, i;
      for (i = 1; i <= 12; i++) { mm[MON[i]] = ('0' + i).slice(-2); mm[MON[i].substring(0, 3)] = ('0' + i).slice(-2); }
      var s = cl(str), m;
      if ((m = s.match(/(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})/))) return m[3] + '-' + (mm[m[2].toLowerCase()] || '00') + '-' + ('0' + m[1]).slice(-2);
      if ((m = s.match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/))) return m[3] + '-' + (mm[m[1].toLowerCase()] || '00') + '-' + ('0' + m[2]).slice(-2);
      if ((m = s.match(/(\d{4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
      return s;
    }

    // DOI 접두 → 출판사·국내외 (발표매체 추론 근거)
    var DOI_PUB = {
      '10.1016': ['Elsevier', '국외'], '10.1128': ['American Society for Microbiology', '국외'],
      '10.1063': ['AIP Publishing', '국외'], '10.1007': ['Springer', '국외'], '10.1038': ['Nature Portfolio', '국외'],
      '10.1186': ['BMC', '국외'], '10.1109': ['IEEE', '국외'], '10.1021': ['ACS', '국외'],
      '10.1002': ['Wiley', '국외'], '10.1364': ['Optica', '국외'], '10.3390': ['MDPI', '국외'],
      '10.1088': ['IOP', '국외'], '10.1039': ['RSC', '국외'], '10.1103': ['APS', '국외'],
      '10.1080': ['Taylor & Francis', '국외'], '10.1093': ['Oxford University Press', '국외'],
      '10.1126': ['Science/AAAS', '국외'], '10.1073': ['PNAS', '국외'], '10.1371': ['PLOS', '국외'],
      '10.3389': ['Frontiers', '국외'], '10.1155': ['Wiley/Hindawi', '국외'], '10.1149': ['ECS', '국외'],
      '10.4014': ['한국미생물생명공학회', '국내'], '10.5012': ['대한화학회', '국내'],
      '10.5515': ['한국전자파학회', '국내'],
      '10.3365': ['대한금속·재료학회', '국내'], '10.9713': ['한국학술지', '국내'], '10.5307': ['한국학술지', '국내']
    };

    // ---------- 컨텍스트 ----------
    function buildContext(pageTexts, opts) {
      var pages = (pageTexts && pageTexts.length) ? pageTexts.map(nz) : [''];
      var full = pages.join('\n');
      var p1 = pages[0] || '';
      // 판별·서지정보용 범위: 1페이지 + 2페이지 앞부분(러닝헤더)
      var detect = p1 + '\n' + (pages[1] || '').substring(0, 400) + '\n' + (pages[1] || '').slice(-400);

      // 1페이지에서 제목·저자 구간(ABSTRACT/ARTICLE INFO/HIGHLIGHTS/소속 이전)
      var cutRe = /(A\s?B\s?S\s?T\s?R\s?A\s?C\s?T|A\s?R\s?T\s?I\s?C\s?L\s?E\s+I\s?N\s?F\s?O|H\s?I\s?G\s?H\s?L\s?I\s?G\s?H\s?T\s?S|AUTHOR\s+AFFILIATIONS|Keywords\s*:|KEYWORDS)/i;
      var cm = p1.match(cutRe);
      var head = cm ? p1.substring(0, cm.index) : p1.substring(0, 2500);

      return {
        pages: pages, numPages: (opts && opts.numPages) || pages.length,
        full: full, flat: full.replace(/\s+/g, ' '),
        stripped: nz(full).replace(/[\s\-]/g, '').toLowerCase(),
        p1: p1, detect: detect, head: head,
        textLength: full.replace(/\s/g, '').length,
        // 페이지 범위를 제한한 검색(참고문헌 오염 방지)
        findIn: function (maxPage, re) {
          var lim = Math.min(maxPage, this.pages.length);
          for (var i = 0; i < lim; i++) {
            var m = String(this.pages[i]).match(re);
            if (m) return { match: m, page: i + 1, raw: cl(m[0]) };
          }
          return null;
        },
        find: function (re) { return this.findIn(this.pages.length, re); },
        findAll: function (re) {
          var out = [];
          this.pages.forEach(function (pt, idx) {
            var r = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g'), m;
            while ((m = r.exec(String(pt))) !== null) out.push({ match: m, page: idx + 1, raw: cl(m[0]) });
          });
          return out;
        }
      };
    }

    function ev(value, found, source, conf) {
      if (!value) return null;
      return {
        value: String(value), raw: found ? found.raw : String(value),
        page: found ? found.page : '', source: source || '',
        confidence: (conf === undefined) ? 1 : conf
      };
    }

    // ---------- 소속 블록 파싱 (숫자·알파벳 마커, 마커 단독행 지원) ----------
    var INST_RE = /University|Universit|Institute|Department|Division|Group|College|School|Cent(?:er|re)|Laborator|Corp|Inc\b|Ltd\b|Hospital|Agency|Ministry|Academy|Faculty|Research|Metrology|KRISS/i;
    var STOP_SECTION = /^\s*(ABSTRACT|A B S T R A C T|A R T I C L E|ARTICLE INFO|Keywords|KEYWORDS|HIGHLIGHTS|H I G H L I G H T S|Correspondence|CORRESPONDENCE|AUTHOR ORCID|AUTHOR CONTRIBUTION|FUNDING|REFERENCES|ETHICS|ADDITIONAL)/i;
    var SKIP_LINE = /^\s*(Downloaded from|(?:[©ⓒ]\s*)?Copyright\s|https?:\/\/|Research Article\b|Month\s+[A-Z]|Journal of [A-Z])/i;

    function isKrissAffiliationText(t) {
      return /\bKRISS\b|Korea\s+Research\s+Institute\s+of\s+Standards\s+and\s+Science|Institute of Standards and Science|Standards\s+and\s+Science/i.test(String(t || ''));
    }

    function affInlineMatch(line) {
      // 숫자 소속은 AIP처럼 "1Department"로 붙기도 한다.
      // 알파벳 소속은 본문 단어 첫 글자(e.g. energy)를 마커로 오인하지 않도록
      // 공백 또는 a) / a. / a, 같은 구분자가 반드시 있어야 한다.
      var t = String(line || '');
      return t.match(/^(\d{1,3})[).,]\s*(\S.*)$/) ||
        t.match(/^(\d{1,3})\s+(\S.*)$/) ||
        t.match(/^(\d{1,2})([A-Z][A-Za-z].*)$/) ||
        t.match(/^([a-z])(?:[).,]\s*|\s+)(\S.*)$/);
    }

    function splitMarkedBlock(text) {
      var lines = String(text || '').split('\n');
      var out = [], cur = null, blanks = 0;
      var push = function () {
        var ct = cl(cur && cur.text);
        // 마커만 잡고 본문을 길게 흡수하는 오탐 방지: 기관어는 소속 앞부분에 있어야 한다.
        if (cur && ct.length >= 8 && INST_RE.test(ct.substring(0, 180))) {
          out.push({
            num: cur.num, text: cp(ct, 260),
            isKRISS: isKrissAffiliationText(ct)
          });
        }
        cur = null;
      };
      var nextLooksInstitution = function (idx) {
        var seen = 0;
        for (var j = idx + 1; j < lines.length && j <= idx + 4; j++) {
          var q = String(lines[j] || '').trim();
          if (!q) continue;
          if (SKIP_LINE.test(q)) continue;
          seen++;
          if (INST_RE.test(q)) return true;
          if (seen >= 2) break;
        }
        return false;
      };
      for (var i = 0; i < lines.length; i++) {
        var raw = lines[i];
        // 2단 조판에서 우측 컬럼(참고문헌 등)이 같은 줄에 붙는 경우 공백 6칸 이상에서 잘라낸다
        var colSplit = raw.split(/\s{6,}/);
        if (colSplit.length > 1 && colSplit[0].trim().length >= 2) raw = colSplit[0];
        var line = raw.trim();
        if (STOP_SECTION.test(line)) break;
        if (SKIP_LINE.test(line)) continue;
        if (!line) { blanks++; if (blanks >= 12) break; continue; }
        blanks = 0;
        var mAlone = line.match(/^(\d{1,3}|[a-z])[).,]?$/);
        var mInline = affInlineMatch(line);
        if (mAlone) {
          // 단독 숫자/문자는 본문 번호일 수 있으므로 뒤 1~2개 실내용 행에 기관어가 있을 때만 시작한다.
          if (!nextLooksInstitution(i)) continue;
          push(); cur = { num: mAlone[1], text: '' }; continue;
        }
        if (mInline && INST_RE.test(mInline[2])) { push(); cur = { num: mInline[1], text: mInline[2] }; continue; }
        // 새 마커처럼 보이지만 기관행이 아니면 기존 소속에 섞지 않는다.
        if (affInlineMatch(line) && !INST_RE.test(line)) {
          if (cur) push();
          continue;
        }
        if (cur) cur.text += ' ' + line;
      }
      push();
      return out;
    }

    function commonAffiliationFromHead(ctx) {
      var p = ctx.p1 || '';
      var cut = p.search(/A\s?R\s?T\s?I\s?C\s?L\s?E\s+I\s?N\s?F\s?O|A\s?B\s?S\s?T\s?R\s?A\s?C\s?T|(?:^|\n)\s*Abstract\b|(?:^|\n)\s*요\s*약\b/i);
      var front = (cut >= 0 ? p.substring(0, cut) : p.substring(0, 6500));
      var inst = front.split('\n').map(function (l) { return cl(l); }).filter(function (l) {
        if (!l || l.length > 320) return false;
        if (/journal homepage|Contents lists available|Copyright|https?:\/\/|^THE JOURNAL OF |^Journal of |Manuscript\s+received|Corresponding\s+Author|E-?mail/i.test(l)) return false;
        return INST_RE.test(l);
      });
      // 한 기관만 공통으로 적은 논문(Elsevier 단일소속, 국내학술지)만 all 소속으로 본다.
      // 여러 기관이 보이면 Wiley의 저자별 묶음 소속일 수 있으므로 여기서 전원 KRISS로 만들지 않는다.
      if (!inst.length || inst.length > 3) return null;
      var kr = inst.filter(isKrissAffiliationText);
      if (!kr.length) return null;
      var txt = inst.join(' ');
      return { num: 'all', text: cp(txt, 300), isKRISS: true };
    }

    function parseAffiliations(ctx) {
      var cands = [];
      // (1) AFFILIATIONS 표기 블록 — 논문 뒤쪽에 있는 경우(ASM 등) 포함해 전 페이지 탐색
      ctx.pages.forEach(function (pt, idx) {
        var re = /(?:AUTHOR\s+)?AFFILIATIONS?\b|Author\s+details\b|Author\s+information\b/ig, m;
        var nextPage = ctx.pages[idx + 1] || '';
        while ((m = re.exec(pt)) !== null) {
          var block = pt.substring(m.index + m[0].length, m.index + m[0].length + 20000) + '\n' + nextPage.substring(0, 4000);
          if (/See affiliation list/i.test(block.substring(0, 60))) continue;
          var got = splitMarkedBlock(block);
          if (got.length) cands.push({ affs: got, page: idx + 1, source: 'affiliations-block' });
        }
      });
      // (2) 1페이지 저자 다음 구간(Elsevier: 알파벳 마커가 단독행)
      var tail = ctx.head;
      var tailLines = tail.split('\n');
      var firstMarker = -1;
      for (var li = 0; li < tailLines.length; li++) {
        if (/^\s*(\d{1,2}|[a-z])[).,]?\s*$/.test(tailLines[li])) {
          // 뒤에 실제 기관행이 있는지 확인한다.
          var probe = tailLines.slice(li, li + 5).join('\n');
          if (INST_RE.test(probe)) { firstMarker = li; break; }
        }
        var im2 = affInlineMatch(tailLines[li].trim());
        if (li > 0 && im2 && INST_RE.test(im2[2])) { firstMarker = li; break; }
      }
      if (firstMarker >= 0) {
        var block2 = tailLines.slice(firstMarker).join('\n') +
          '\n' + ctx.p1.substring(ctx.head.length, ctx.head.length + 1600);
        var got2 = splitMarkedBlock(block2);
        if (got2.length) cands.push({ affs: got2, page: 1, source: 'page1-marker-block' });
      }
      // (3) 1페이지 전체 + 2페이지 앞부분 — BMC/SpringerOpen 은 초록 뒤에 소속을 둔다.
      //     단독 숫자 본문을 소속마커로 오인하지 않도록 기관어가 가까이 있는 경우만 시작한다.
      var wide = ctx.p1 + '\n' + (ctx.pages[1] || '').substring(0, 1200);
      var wLines = wide.split('\n');
      for (var wi = 0; wi < wLines.length; wi++) {
        var inline = affInlineMatch(wLines[wi].trim());
        var alone = /^\s*(\d{1,3}|[a-z])[).,]?\s*$/.test(wLines[wi]);
        var near = wLines.slice(wi, wi + 5).join(' ');
        if ((inline && INST_RE.test(inline[2])) || (alone && INST_RE.test(near))) {
          var got3 = splitMarkedBlock(wLines.slice(wi).join('\n'));
          if (got3.length) cands.push({ affs: got3, page: 1, source: 'page1-wide-block' });
          break;
        }
      }
      if (!cands.length) {
        var common = commonAffiliationFromHead(ctx);
        if (common) return { affs: [common], source: 'common-header-affiliation', page: 1 };
        return { affs: [], source: '' };
      }
      cands.sort(function (a, b) { return b.affs.length - a.affs.length; });
      return { affs: cands[0].affs, source: cands[0].source, page: cands[0].page };
    }

    // ---------- 저자 블록 파싱 ----------
    // 어느 토큰에든 나오면 저자명이 아님
    var HARD_STOP = /^(Downloaded|Copyright|Contents|Available|Received|Revised|Accepted|Published|Submitted|Volume|Issue|Month|Journal|Elsevier|Springer|Nature|Wiley|IEEE|AIP|ACS|Republic|Korea|South|North|Daejeon|Seoul|Busan|Gimhae|Ansung|Jeonju|Table|Figure|Fig|Abstract|Keywords|Corresponding|Correspondence|Address|Editor|Access|Creative|Commons|Check|Updates|Research|Article|Review|Letter|Highlights|Physics|Chemistry|Microbiology|Science|Sciences|Letters|Bulletin|Reports|Advances|Materials)$/i;
    // 첫 토큰에만 적용하는 관사·전치사류
    var SOFT_STOP = /^(and|the|this|that|we|of|for|with|by|from|see|our|all|both|these|其)$/i;

    // 저자 후보 토큰 추출: 이름 + 소속마커(숫자/알파벳/별표)
    // 알파벳 마커는 반드시 공백·쉼표로 분리돼 있어야 한다("Microchemical Journal" → Journa+l 오인 방지)
    var AUTHOR_TOKEN_RE = /([A-Z\u00C0-\u00D6\u00D8-\u00DE][A-Za-z\u00C0-\u00FF'\u2019.\-]*(?:[ \t]+[A-Z\u00C0-\u00D6\u00D8-\u00DE][A-Za-z\u00C0-\u00FF'\u2019.\-]*){0,5})([ \t]*,?[ \t]*)((?:(?:\d{1,3}|[a-z](?![a-z])|[*\u2020\u2021])\)?)(?:[ \t]*,?[ \t]*(?:(?:\d{1,3}|[a-z](?![a-z])|[*\u2020\u2021])\)?))*)(?![A-Za-z0-9])/g;

    function affiliationMarkSet(meta) {
      var set = {};
      (meta.affiliations || []).forEach(function (a) { set[String(a.num).toLowerCase()] = true; });
      return set;
    }

    function normalizeAuthorMarks(raw) {
      var out = [], m, re = /(\d{1,3}|[a-z](?![a-z])|[*\u2020\u2021])/g;
      while ((m = re.exec(String(raw || ''))) !== null) out.push(m[1]);
      return out;
    }

    function scanAuthorTokens(text, meta) {
      var jname = cmpKey(meta.journal || '');
      var known = affiliationMarkSet(meta);
      var out = [], m;
      AUTHOR_TOKEN_RE.lastIndex = 0;
      while ((m = AUTHOR_TOKEN_RE.exec(text)) !== null) {
        var name = cl(m[1]).replace(/^and\s+/i, '').replace(/[,\s]+$/, '');
        var sep = m[2] || '';
        var marks = normalizeAuthorMarks(m[3]);
        var toks = name.split(/\s+/);
        if (toks.length < 2) continue;
        if (SOFT_STOP.test(toks[0].replace(/[.,]/g, ''))) continue;
        if (toks.some(function (t) { return HARD_STOP.test(t.replace(/[.,]/g, '')); })) continue;
        if (INST_RE.test(name)) continue;
        var nkey = cmpKey(name);
        if (jname && (nkey === jname || (nkey.length >= 8 && jname.indexOf(nkey) === 0 && (jname.length - nkey.length) <= 3))) continue;
        // 알파벳 마커만 있고 실제 소속 목록에 없는 경우는 제목의 관사(a) 등일 가능성이 높다.
        var numericOrSymbol = marks.some(function (x) { return /^\d+$/.test(x) || /[*\u2020\u2021]/.test(x); });
        var knownAlpha = marks.some(function (x) { return /^[a-z]$/.test(x) && known[x]; });
        if (!numericOrSymbol && !knownAlpha) continue;
        // 알파벳 마커인데 이름과 붙어 있으면 단어의 마지막 글자를 마커로 오인한 것
        var firstMark = marks[0] || '';
        if (/^[a-z]$/.test(firstMark) && !/[\s,]/.test(sep) && !known[firstMark]) continue;
        out.push({ pos: m.index, name: name, marks: marks });
      }
      return out;
    }

    // Optica 등은 저자명을 스몰캡스로 조판해 첫 글자가 분리 추출된다.
    function repairSmallCaps(t) {
      var hits = (String(t).match(/(?:^|[\s\-,(])[A-Z\u00C0-\u00DE]\s+[A-Z\u00C0-\u00DE]/g) || []).length;
      if (hits < 3) return t;
      var out = String(t), prev;
      for (var i = 0; i < 5; i++) {
        prev = out;
        out = out.replace(/([A-Z])\s+-\s*([A-Z])/g, '$1-$2');
        out = out.replace(/(^|[\s\-,(])([A-Z])\s+([A-Z]+)/g, '$1$2$3');
        if (out === prev) break;
      }
      console.log(PTAG, '스몰캡스 저자명 복원 적용(' + hits + '건)');
      return out;
    }

    function isAuthorMetaLine(l) {
      var s = cl(l);
      if (!s) return true;
      if (/Contents lists available|journal homepage|Downloaded from|https?:\/\/|doi\.org|\u00a9|Copyright|ISSN|Cite\s+as\s*:|Submitted\s*:|Received\s*:|Accepted\s*:|Published\s+(?:Online|online)|Available online/i.test(s)) return true;
      if (/^\s*(?:RESEARCH|ORIGINAL|REVIEW|TECHNICAL)\s+(?:ARTICLE|NOTE)|^ARTICLE\s*$/i.test(s)) return true;
      if (/^\s*(?:요\s*약|서\s*론|결\s*론)\s*$/i.test(s)) return true;
      if (/Manuscript\s+received|Corresponding\s+Author|\bID\s+No\.?/i.test(s)) return true;
      if (/\b\d{1,4}\s*\(\d{4}\)\s*,?\s*[A-Za-z0-9-]{4,}\b/.test(s) && /\b(?:Phys|Sci|Mater|Chem|Instrum|Medica|Journal|Rev\.)\b/i.test(s)) return true;
      if (/^\s*\d+\s+of\s+\d+\s*$/i.test(s)) return true;
      return false;
    }

    function plausibleLatinName(s) {
      var name = cl(String(s || '').replace(/^and\s+/i, ''));
      if (name.length < 4 || name.length > 90 || /[0-9@]/.test(name) || INST_RE.test(name)) return false;
      var toks = name.split(/\s+/).filter(Boolean);
      if (toks.length < 2 || toks.length > 6) return false;
      if (SOFT_STOP.test(toks[0].replace(/[.,]/g, ''))) return false;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i].replace(/^[,;]+|[,;]+$/g, '');
        if (HARD_STOP.test(t.replace(/[.,]/g, ''))) return false;
        if (!/^[A-Z\u00C0-\u00DE][A-Za-z\u00C0-\u00FF'\u2019.\-]*$/.test(t)) return false;
      }
      return true;
    }

    function plausibleKoreanName(s) {
      return /^[가-힣]{2,4}$/.test(String(s || '').replace(/\s+/g, ''));
    }

    function cleanUnmarkedAuthorSegment(seg) {
      var raw = nz(seg || '').replace(/[\uE000-\uF8FF]/g, ' ').replace(/^\s*and\s+/i, '').trim();
      var corr = /[*\u2020\u2021]/.test(raw);
      raw = raw.replace(/[*\u2020\u2021]+/g, ' ');
      // 숫자/각주 마커가 끝에 붙은 경우 제거(예: Kim1,2 / Bae 1,6,a)).
      raw = raw.replace(/\s*(?:\d{1,3})(?:\s*,\s*(?:\d{1,3}|[a-z]\)?))*\s*\)?\s*$/g, '');
      raw = raw.replace(/\s+[a-z]\)?\s*$/g, '');
      raw = cl(raw.replace(/^[,;\u2024]+|[,;\u2024]+$/g, ''));
      return { name: raw, corr: corr };
    }

    // pdf.js가 제목 마지막 줄과 첫 저자를 같은 줄로 합치는 경우가 있다.
    // 예: "X-ray beams Yun Ho Kim * , Chul-Young Yi ...". 쉼표로 저자열임이 확인된
    // 상태에서만, 전체 세그먼트가 이름이 아니면 뒤쪽 2~6토큰 중 가장 긴 정상 이름을 복구한다.
    function salvageTrailingAuthor(seg) {
      var c = cleanUnmarkedAuthorSegment(seg);
      if (plausibleLatinName(c.name) || plausibleKoreanName(c.name)) return c;
      var toks = c.name.split(/\s+/).filter(Boolean);
      for (var n = Math.min(6, toks.length); n >= 2; n--) {
        var cand = toks.slice(toks.length - n).join(' ');
        if (plausibleLatinName(cand) || plausibleKoreanName(cand)) {
          return { name: cand, corr: c.corr, recovered: true };
        }
      }
      return null;
    }

    function splitUnmarkedAuthorLine(line) {
      // U+2024 ONE DOT LEADER는 NFKC에서 마침표로 바뀌므로 저자 구분자로 먼저 보존한다.
      var src = nz(String(line || '').replace(/\u2024/g, ';')).replace(/[\uE000-\uF8FF]/g, ' ');
      if (isAuthorMetaLine(src) || INST_RE.test(src)) return [];
      src = src.replace(/\s+and\s+/gi, ', ');
      var parts;
      if (/[;\u2024\u00B7]/.test(src)) parts = src.split(/[;\u2024\u00B7]+/);
      else {
        // a,b,* 같은 알파벳 소속마커가 있는 Elsevier 행은 쉼표 분할하지 않는다.
        if (/\b[a-z]\s*,\s*[a-z](?:\s*,\s*[*\u2020\u2021])?/i.test(src)) return [];
        if ((src.match(/,/g) || []).length < 1) return [];
        parts = src.split(/,/);
      }
      var out = [];
      parts.forEach(function (p) {
        var c = salvageTrailingAuthor(p);
        if (c) out.push(c);
      });
      return out;
    }

    function singleUnmarkedAuthor(line) {
      if (isAuthorMetaLine(line) || INST_RE.test(line)) return null;
      var c = cleanUnmarkedAuthorSegment(line);
      return (plausibleLatinName(c.name) || plausibleKoreanName(c.name)) ? c : null;
    }

    function frontZone(pt, maxChars) {
      var p = String(pt || '');
      var cut = p.search(/(?:^|\n)\s*(?:AFFILIATIONS?|A\s?B\s?S\s?T\s?R\s?A\s?C\s?T|ABSTRACT|A\s?R\s?T\s?I\s?C\s?L\s?E\s+I\s?N\s?F\s?O|ARTICLE INFO|HIGHLIGHTS|KEYWORDS|Keywords\s*:|요\s*약)\b/i);
      var lim = maxChars || 6000;
      if (cut >= 0 && cut > 120) return p.substring(0, cut);
      return p.substring(0, lim);
    }

    function authorObjectFromHit(h, meta, source, order) {
      var known = affiliationMarkSet(meta);
      var allKriss = !!known.all && (meta.affiliations || []).some(function (a) { return String(a.num).toLowerCase() === 'all' && a.isKRISS; });
      var affNums = (h.marks || []).filter(function (x) {
        var k = String(x).toLowerCase();
        if (/^\d{1,3}$/.test(k)) return !Object.keys(known).length || !!known[k];
        if (/^[a-z]$/.test(k)) return !!known[k];
        return false;
      });
      return {
        order: order, name: h.name,
        isCorresponding: (h.marks || []).some(function (x) { return /[*\u2020\u2021]/.test(x); }),
        correspondingEmail: '', affNums: affNums,
        isKriss: allKriss || affNums.some(function (n) { return (meta.affiliations || []).some(function (a) { return String(a.num).toLowerCase() === String(n).toLowerCase() && a.isKRISS; }); }),
        raw: h.name + ' ' + (h.marks || []).join(','), source: source
      };
    }

    function markerCandidate(zone, meta, source) {
      var lines = String(zone || '').split('\n');
      var stopIdx = lines.length;
      for (var i = 0; i < lines.length; i++) {
        if (/^\s*(\d{1,3}|[a-z])[).,]?\s*$/.test(lines[i])) {
          if (INST_RE.test(lines.slice(i, i + 5).join(' '))) { stopIdx = i; break; }
        }
        var im = affInlineMatch(lines[i].trim());
        if (i > 0 && im && INST_RE.test(im[2])) { stopIdx = i; break; }
      }
      var region = lines.slice(0, stopIdx).filter(function (l) { return !isAuthorMetaLine(l); });
      var hits = [];
      region.forEach(function (l) { scanAuthorTokens(l, meta).forEach(function (h) { hits.push(h); }); });
      var joinedHits = scanAuthorTokens(repairSmallCaps(region.join(' ')), meta);
      if (joinedHits.length > hits.length && joinedHits.length >= 2) hits = joinedHits;
      var out = [], seen = {};
      hits.forEach(function (h) {
        var k = cmpKey(h.name);
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push(authorObjectFromHit(h, meta, source, out.length + 1));
      });
      return out;
    }

    function bilingualAuthorAlternative(a, b) {
      if (!a || !b || a.length < 2 || a.length !== b.length) return false;
      var aKor = a.every(function (x) { return plausibleKoreanName(x.name); });
      var bKor = b.every(function (x) { return plausibleKoreanName(x.name); });
      var aLat = a.every(function (x) { return plausibleLatinName(x.name); });
      var bLat = b.every(function (x) { return plausibleLatinName(x.name); });
      return (aKor && bLat) || (aLat && bKor);
    }

    function unmarkedCandidate(zone, meta, source) {
      var lines = String(zone || '').split('\n');
      var parsed = lines.map(function (l) { return splitUnmarkedAuthorLine(l); });
      var candidates = [];
      for (var i = 0; i < lines.length; i++) {
        if (parsed[i].length < 2) continue;
        var a = i, b = i, names = parsed[i].slice();
        while (a > 0) {
          var p = parsed[a - 1];
          var one = singleUnmarkedAuthor(lines[a - 1]);
          if (p.length >= 2) { if (bilingualAuthorAlternative(p, names)) break; names = p.concat(names); a--; continue; }
          if (one) { names.unshift(one); a--; continue; }
          break;
        }
        while (b + 1 < lines.length) {
          var q = parsed[b + 1];
          var one2 = singleUnmarkedAuthor(lines[b + 1]);
          if (q.length >= 2) { if (bilingualAuthorAlternative(names, q)) break; names = names.concat(q); b++; continue; }
          if (one2) { names.push(one2); b++; continue; }
          break;
        }
        candidates.push({ a: a, b: b, names: names });
      }
      if (!candidates.length) return [];
      candidates.sort(function (x, y) {
        var xl = x.names.filter(function (n) { return plausibleLatinName(n.name); }).length;
        var yl = y.names.filter(function (n) { return plausibleLatinName(n.name); }).length;
        if (y.names.length !== x.names.length) return y.names.length - x.names.length;
        return yl - xl; // 한글·영문 저자열이 모두 있으면 영문을 우선한다.
      });
      var best = candidates[0], out = [], seen = {};
      var allKriss = (meta.affiliations || []).some(function (a) { return String(a.num).toLowerCase() === 'all' && a.isKRISS; });
      best.names.forEach(function (n) {
        var k = cmpKey(n.name);
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push({
          order: out.length + 1, name: n.name, isCorresponding: !!n.corr,
          correspondingEmail: '', affNums: allKriss ? ['all'] : [], isKriss: allKriss,
          raw: n.name, source: source
        });
      });
      return out;
    }

    function candidateScore(arr) {
      if (!arr || !arr.length) return 0;
      var withAff = arr.filter(function (a) { return a.affNums && a.affNums.length; }).length;
      var corr = arr.filter(function (a) { return a.isCorresponding; }).length;
      return arr.length * 100 + withAff * 12 + corr * 2;
    }

    function mergeAuthorEvidence(base, other) {
      if (!base || !other) return base || [];
      other.forEach(function (o) {
        var hit = null;
        base.forEach(function (b) { if (!hit && cmpKey(b.name) === cmpKey(o.name)) hit = b; });
        if (!hit) return;
        if ((!hit.affNums || !hit.affNums.length) && o.affNums && o.affNums.length) hit.affNums = o.affNums.slice();
        if (o.isKriss) hit.isKriss = true;
        if (o.isCorresponding) hit.isCorresponding = true;
        if (o.correspondingEmail && !hit.correspondingEmail) hit.correspondingEmail = o.correspondingEmail;
      });
      return base;
    }

    function parseAuthors(ctx, meta) {
      var zones = [
        { text: frontZone(ctx.p1, 7000), source: 'page1-front' }
      ];
      if (ctx.pages[1]) zones.push({ text: frontZone(ctx.pages[1], 6500), source: 'page2-front' });
      var cands = [];
      zones.forEach(function (z) {
        var m = markerCandidate(z.text, meta, z.source + '-marker');
        if (m.length) cands.push(m);
        var u = unmarkedCandidate(z.text, meta, z.source + '-unmarked');
        if (u.length) cands.push(u);
      });
      if (!cands.length) {
        var retry = markerCandidate(ctx.p1.substring(0, 10000), meta, 'page1-retry');
        if (retry.length) cands.push(retry);
      }
      if (!cands.length) { console.log(PTAG, '저자 파싱 결과: 0명'); return []; }
      cands.sort(function (a, b) { return candidateScore(b) - candidateScore(a); });
      var out = cands[0];
      for (var i = 1; i < cands.length; i++) mergeAuthorEvidence(out, cands[i]);
      out.forEach(function (a, idx) { a.order = idx + 1; });
      console.log(PTAG, '저자 파싱 결과:', out.length + '명', '|', out[0] ? out[0].source : '');
      return out;
    }

    function authorSignature(name) {
      var n = cl(nz(name || '').replace(/[.]/g, ' '));
      var parts = n.split(/[\s]+/).filter(Boolean);
      if (parts.length < 2) return null;
      var surname = parts[parts.length - 1].toLowerCase().replace(/[^a-z\u00c0-\u00ff'-]/g, '');
      var given = parts.slice(0, -1).join('-');
      var initials = (given.match(/[A-Z\u00C0-\u00DE]/g) || []).join('').toLowerCase();
      if (!initials) initials = given.split(/[-\s]+/).filter(Boolean).map(function (x) { return x.charAt(0).toLowerCase(); }).join('');
      return { surname: surname, initials: initials };
    }

    function abbrevSignature(name) {
      var n = cl(nz(name || ''));
      var sm = n.match(/([A-Z\u00C0-\u00DE][A-Za-z\u00C0-\u00FF'\-]+)\s*$/);
      if (!sm) return null;
      var surname = sm[1].toLowerCase();
      var pre = n.substring(0, sm.index);
      var initials = (pre.match(/[A-Z\u00C0-\u00DE]/g) || []).join('').toLowerCase();
      return initials ? { surname: surname, initials: initials } : null;
    }

    function parseAbbrevList(line) {
      if (INST_RE.test(line || '')) return [];
      var parts = String(line || '').split(/,/), out = [];
      parts.forEach(function (p) {
        var q = cl(p);
        if (abbrevSignature(q)) out.push(q);
      });
      return out.length >= 1 ? out : [];
    }

    // Wiley AFM처럼 "S. H. Song, ..." 저자축약행 다음에 기관이 나오는 서식에서
    // KRISS 기관 바로 앞 축약 저자명을 본문 전체 이름과 연결한다.
    function enrichGroupedAffiliations(ctx, meta) {
      if (!meta.authors || !meta.authors.length) return;
      // 축약 저자행 기반 소속 연결은 Wiley AFM류 전용이다. AIP/Elsevier 숫자 소속을 여기에
      // 다시 적용하면 인접 저자가 KRISS로 잘못 분류될 수 있다.
      if (meta.adapter !== 'wiley') return;
      var alreadyMarked = meta.authors.filter(function (a) { return a.affNums && a.affNums.length; }).length;
      if (alreadyMarked >= Math.ceil(meta.authors.length * 0.5)) return;
      var synth = 0;
      ctx.pages.slice(0, 2).forEach(function (pt) {
        var lines = String(pt || '').split('\n');
        for (var i = 0; i < lines.length; i++) {
          if (!isKrissAffiliationText(lines[i])) continue;
          var names = [], nameIdx = -1;
          for (var j = i - 1; j >= 0 && j >= i - 5; j--) {
            var ab = parseAbbrevList(lines[j]);
            if (ab.length) { names = ab; nameIdx = j; break; }
          }
          if (!names.length) continue;
          synth++;
          var mark = 'w' + synth;
          var text = cl(lines.slice(nameIdx + 1, Math.min(lines.length, i + 2)).join(' '));
          if (!(meta.affiliations || []).some(function (a) { return a.isKRISS && cmpKey(a.text) === cmpKey(text); })) {
            meta.affiliations.push({ num: mark, text: cp(text, 260), isKRISS: true });
          } else {
            var ex = (meta.affiliations || []).filter(function (a) { return a.isKRISS && cmpKey(a.text) === cmpKey(text); })[0];
            mark = ex ? ex.num : mark;
          }
          names.forEach(function (abn) {
            var as = abbrevSignature(abn);
            if (!as) return;
            meta.authors.forEach(function (a) {
              var fs = authorSignature(a.name);
              if (!fs || fs.surname !== as.surname) return;
              if (fs.initials.indexOf(as.initials) !== 0 && as.initials.indexOf(fs.initials) !== 0) return;
              if (a.affNums.indexOf(mark) < 0) a.affNums.push(mark);
              a.isKriss = true;
            });
          });
        }
      });
    }

    // 교신저자 보강: 별표 외에 교신 문맥의 이메일을 저자와 연결한다.
    // 2단 조판에서 좌우 컬럼 텍스트가 섞이므로 "문장 끝까지" 방식이 아니라 고정 창(window)을 쓴다.
    function enrichCorresponding(ctx, meta) {
      var authors = meta.authors || [];
      if (!authors.length) return;

      // 별표 표기 저자에 "* email" 형태의 이메일을 연결(Optica 등)
      var starMail = ctx.findIn(2, /(?:^|\n)\s*\*+\s*([\w.+\-]+\s*@\s*[\w.\-]+\.\s*[a-z]{2,4}(?:\.\s*[a-z]{2,3})?)/);
      if (starMail) {
        var sm = starMail.match[1].replace(/\s+/g, '');
        authors.forEach(function (a) {
          if (a.isCorresponding && !a.correspondingEmail) {
            a.correspondingEmail = sm;
            if (/@kriss\.re\.kr$/i.test(sm)) a.isKriss = true;
          }
        });
      }

      var windows = [];
      ctx.pages.slice(0, 2).forEach(function (pt) {
        var re = /(Address correspondence to|Corresponding author[s]?|Correspondence\s*:|E-?mail address(?:es)?|Author[s]? to whom correspondence)/ig, m;
        while ((m = re.exec(pt)) !== null) windows.push(pt.substring(m.index, m.index + 500));
      });
      if (!windows.length) return;


      var EMAIL = /[\w.+\-]+\s*@\s*[\w.\-]+\.\s*[a-z]{2,4}(?:\.\s*[a-z]{2,3})?/gi;
      var linked = [];
      windows.forEach(function (win) {
        var m;
        EMAIL.lastIndex = 0;
        while ((m = EMAIL.exec(win)) !== null) {
          var email = m[0].replace(/\s+/g, '');
          var local = email.split('@')[0].toLowerCase().replace(/[._\-+]/g, '');
          var localStem = local.replace(/\d+$/g, '');
          var near = win.substring(Math.max(0, m.index - 220), Math.min(win.length, m.index + 180));
          var post = win.substring(m.index, Math.min(win.length, m.index + 160));
          var par = post.match(/\(([A-Z][A-Za-z.\- ]{2,60})\)/);
          var parSig = par ? abbrevSignature(par[1]) : null;
          var surnameCount = {};
          authors.forEach(function (a) {
            var ts = a.name.split(/[\s\-]+/).filter(Boolean);
            var last = ts.length ? ts[ts.length - 1].toLowerCase().replace(/[^a-z\u00c0-\u00ff']/g, '') : '';
            if (last) surnameCount[last] = (surnameCount[last] || 0) + 1;
          });
          var ranked = [];
          authors.forEach(function (a) {
            var toks = a.name.split(/[\s\-]+/).map(function (t) { return t.toLowerCase().replace(/[^a-z\u00c0-\u00ff']/g, ''); }).filter(Boolean);
            var sur = toks[toks.length - 1] || '';
            var score = 0;
            var fs = authorSignature(a.name);
            // "email (Y.H. Kim)" 같은 명시 이니셜은 가장 강한 근거다.
            if (parSig && fs && fs.surname === parSig.surname &&
                (fs.initials === parSig.initials || fs.initials.indexOf(parSig.initials) === 0 || parSig.initials.indexOf(fs.initials) === 0)) score += 50;
            // 교신 문맥에 저자 전체 이름이 직접 나오면 강하게 연결한다.
            try { if (new RegExp('\\b' + a.name.split(/\s+/).map(esc).join('\\s+') + '\\b', 'i').test(near)) score += 20; } catch (e) {}
            // 이메일 로컬파트가 "yhkim24"처럼 이니셜+성 구조이면 같은 성의 다른 저자와 구분한다.
            if (fs && fs.surname && localStem.indexOf(fs.surname) >= 0) {
              var before = localStem.substring(0, localStem.indexOf(fs.surname));
              var after = localStem.substring(localStem.indexOf(fs.surname) + fs.surname.length);
              var rest = before || after;
              if (rest && fs.initials && (rest === fs.initials || rest.indexOf(fs.initials) === 0 || fs.initials.indexOf(rest) === 0)) score += 16;
              else if (surnameCount[fs.surname] === 1) score += 3;
            }
            // 성/이름 토큰 포함은 보조점수만 준다. 동성이 있으면 이것만으로 확정하지 않는다.
            if (sur.length >= 2 && local.indexOf(sur) >= 0) score += (surnameCount[sur] === 1 ? 3 : 1);
            toks.slice(0, -1).forEach(function (t) { if (t.length >= 3 && local.indexOf(t) >= 0) score += 2; });
            if (sur.length >= 3 && new RegExp('\\b' + esc(sur) + '\\b', 'i').test(near)) score += 2;
            if (score > 0) ranked.push({ a: a, score: score });
          });
          ranked.sort(function (x, y) { return y.score - x.score; });
          var best = ranked[0] || null;
          var tied = best && ranked[1] && ranked[1].score === best.score;
          if (best && (!tied || best.score >= 20)) {
            best.a.isCorresponding = true;
            best.a.correspondingEmail = email;
            if (/@kriss\.re\.kr$/i.test(email)) best.a.isKriss = true;
            linked.push(best.a.name + '<' + email + '>');
          }
        }
      });
      // 이메일이 하나도 저자에 연결되지 않은 경우에만 이름 문맥을 보조 근거로 쓴다.
      // 이메일 뒤 500자 전체를 보면 바로 뒤의 저자목록까지 모두 교신저자로 오인할 수 있다.
      if (!linked.length) {
        var joined = windows.join(' \n ');
        authors.forEach(function (a) {
          if (a.isCorresponding) return;
          var nm = a.name.replace(/\s+/g, '\\s+');
          try {
            if (new RegExp(nm, 'i').test(joined.substring(0, 260))) {
              a.isCorresponding = true;
              linked.push(a.name + '(이름 표기)');
            }
          } catch (e) {}
        });
      }
      if (linked.length) console.log(PTAG, '교신 연결:', linked.join(', '));
    }

    function sameSurname(a, b) {
      var pa = String(a).split(/[\s\-]+/), pb = String(b).split(/[\s\-]+/);
      return pa[pa.length - 1].toLowerCase() === pb[pb.length - 1].toLowerCase();
    }

    // 러닝헤더의 쪽번호로 페이지 범위를 구한다(연속 페이지 체계 저널)
    function pagesFromRunningHeader(ctx, meta, journal) {
      if (!journal) return false;
      var hits = ctx.findAll(new RegExp(esc(journal) + '\\s+(\\d{2,6})(?!\\d)'));
      if (hits.length < 2) return false;
      var nums = hits.map(function (h) { return parseInt(h.match[1], 10); })
        .filter(function (n) { return !isNaN(n) && n > 0; }).sort(function (x, y) { return x - y; });
      if (!nums.length || nums[0] === nums[nums.length - 1]) return false;
      meta.pages = nums[0] + '-' + nums[nums.length - 1];
      meta.pagesDerived = false;
      meta.evidence.pages = {
        value: meta.pages, raw: '러닝헤더 쪽번호 ' + nums[0] + '~' + nums[nums.length - 1],
        page: '1~' + ctx.numPages, source: 'running-header-range', confidence: 1
      };
      return true;
    }

    // ---------- 공통 추출기 ----------
    var Common = {
      doi: function (ctx, meta) {
        var f = ctx.findIn(2, /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi[\s:]*)?(10\.\d{4,}\/[A-Za-z0-9._\-()\/]+)/i);
        if (!f) {
          // PDF가 DOI 내부 구두점 주변에 공백/줄바꿈을 삽입하는 경우 대응.
          f = ctx.findIn(2, /(10\s*\.\s*\d{4,}\s*\/\s*[A-Za-z0-9]+(?:\s*[._\-()\/]\s*[A-Za-z0-9]+)+)/i);
        }
        if (!f) return;
        var raw = f.match[1] || f.match[0];
        var compact = nz(raw).replace(/\s+/g, '');
        var dm = compact.match(/10\.\d{4,}\/[A-Za-z0-9._\-()\/]+/i);
        if (!dm) return;
        meta.doi = dm[0].replace(/[.,;)]+$/, '');
        meta.evidence.doi = ev(meta.doi, f, 'doi', 1);
        var pre = meta.doi.split('/')[0];
        if (DOI_PUB[pre]) {
          meta.publisher = meta.publisher || DOI_PUB[pre][0];
          meta.mediumScope = DOI_PUB[pre][1];
        }
      },

      journalFromHeader: function (ctx, meta) {
        // "Microchemical Journal 227 (2026) 118548" 형태의 인용 헤더가 가장 신뢰도 높다
        var f = ctx.findIn(2, /(?:^|\n)\s*([A-Z][A-Za-z&:,'\-\. ]{3,60}?)\s+(\d{1,4})\s*\((\d{4})\)\s*([0-9\-]{1,9})/);
        if (f) {
          meta.journal = cl(f.match[1]);
          meta.volume = f.match[2]; meta.year = f.match[3]; meta.articleNo = f.match[4];
          meta.evidence.journal = ev(meta.journal, f, 'citation-header', 1);
          meta.evidence.volume = ev(meta.volume, f, 'citation-header', 1);
          meta.evidence.articleNo = ev(meta.articleNo, f, 'citation-header', 1);
          return true;
        }
        return false;
      },

      dates: function (ctx, meta) {
        var D = '(\\d{1,2}\\s+[A-Za-z]+\\.?,?\\s+\\d{4}|[A-Za-z]+\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}[.\\-/]\\s?\\d{1,2}[.\\-/]\\s?\\d{1,2})';
        [['submittedDate', '(Submitted|Received|Manuscript received)', 'submitted'],
         ['revisedDate', '(Revised|Received in revised form|Revision received)', 'revised'],
         ['acceptedDate', '(Accepted)', 'accepted'],
         ['publishedDate', '(Published\\s+Online|Available\\s+online|First\\s+published|Published|Version\\s+of\\s+Record)', 'published']
        ].forEach(function (row) {
          if (meta[row[0]]) return;
          var re = new RegExp('\\b' + row[1] + '\\s*:?\\s*' + D, 'i');
          var f = ctx.findIn(2, re) || ctx.find(re);   // BMC 등은 논문 말미에 날짜를 둔다
          if (!f) return;
          meta[row[0]] = toIso(f.match[2]);
          meta.evidence[row[0]] = ev(meta[row[0]], f, row[2], 1);
          if (row[0] === 'submittedDate') meta.submissionLabel = cl(f.match[1]);
          if (row[0] === 'publishedDate') meta.publishedLabel = cl(f.match[1]);
        });
        meta.receivedDate = meta.submittedDate;
        if (meta.evidence.submittedDate) meta.evidence.receivedDate = meta.evidence.submittedDate;
      },

      emails: function (ctx, meta) {
        var mailHead = ctx.pages.slice(0, 2).join('\n');
        var hits = mailHead.match(/[\w.+\-]+\s*@\s*[\w.\-]+\.\s*[a-z]{2,4}(?:\.\s*[a-z]{2,3})?/gi) || [];
        var seen = {}, out = [];
        hits.forEach(function (e) {
          var v = e.replace(/\s+/g, '');
          if (seen[v.toLowerCase()]) return;
          seen[v.toLowerCase()] = true; out.push(v);
        });
        meta.correspondingEmails = out.slice(0, 10);
        meta.krissCorrespEmail = out.some(function (e) { return /@kriss\.re\.kr$/i.test(e); });
        if (out.length) {
          var f = ctx.findIn(2, /[\w.+\-]+\s*@\s*[\w.\-]+\.\s*[a-z]{2,4}(?:\.\s*[a-z]{2,3})?/i);
          meta.evidence.correspondingEmail = ev(out.join(', '), f, 'page1-email', 1);
        }
      },

      funding: function (ctx, meta) {
        var strip = function (t) {
          return cl(String(t || '').split('\n').filter(function (l) {
            return !/^\s*(Downloaded from|Copyright|https?:\/\/)/i.test(l);
          }).join(' '));
        };
        // (a) 섹션 제목형
        var f = ctx.find(/(?:^|\n)[ \t]{0,200}(?:FUNDING|Funding|ACKNOWLEDGE?MENTS?|Acknowledge?ments?)[ \t]*(?:\n|:|\.[ \t])([\s\S]{0,2400}?)(?=\n[ \t]{0,200}(?:AUTHOR|Data availability|DATA AVAILABILITY|Declaration|Disclosure|Competing|Conflict|Appendix|REFERENCES|References|ETHICS|ADDITIONAL|Supporting|Supplementary|Supplemental)|$)/);
        // (b) 문장형
        var g = ctx.find(/((?:This work|This study|This research|The work|The present work|The authors)\b[\s\S]{0,100}?(?:supported|funded)\s+by[\s\S]{0,2000}?)(?=\n[ \t]{0,200}(?:Appendix|Declaration|Data availability|Supporting|References|REFERENCES)|$)/i);
        // (c) 국내학술지 지원문: "이 논문은 ... 재원으로 ... 지원을 받아 수행..."
        var kg = ctx.find(/((?:「|『|")?(?:이\s*논문|본\s*연구|이\s*연구)[\s\S]{0,900}?(?:지원|재원)[\s\S]{0,900}?)(?=(?:」|』|")|\n\s*(?:한국표준과학연구원|Manuscript|Corresponding|요\s*약|Abstract)|$)/i);
        var pick = null;
        if (f && strip(f.match[1]).length >= 20) pick = { f: f, text: strip(f.match[1]), src: 'funding-section' };
        if (g) {
          var gt = strip(g.match[1]);
          if (!pick) pick = { f: g, text: gt, src: 'funding-statement' };
        }
        if (kg) {
          var kt = strip(kg.match[1]);
          if (!pick || /지원|재원/.test(kt)) pick = { f: kg, text: kt, src: 'funding-statement-ko' };
        }
        if (pick) {
          meta.fundingText = pick.text;
          meta.evidence.funding = ev(meta.fundingText, pick.f, pick.src, 1);
        }

        var src = nz(meta.fundingText || '');
        // Funding 표(ASM 등)
        var tbl = ctx.find(/Funder\s+Grant\(s\)\s+Author\(s\)([\s\S]{0,1200})/i);
        if (tbl) {
          var tblText = strip(tbl.match[1]);
          src += ' ' + nz(tblText);
          if (!meta.fundingText || meta.fundingText.length < 30) {
            meta.fundingText = tblText;
            meta.evidence.funding = ev(meta.fundingText, tbl, 'funding-table', 1);
          }
        }

        var hy = '\\s*-\\s*';
        var STRUCT = [
          new RegExp('\\bRS' + hy + '\\d{4}' + hy + '[A-Za-z]{0,2}\\s*\\d{5,10}', 'g'),
          new RegExp('\\bNRF' + hy + '\\d{4}[A-Za-z0-9]{2,24}', 'g'),
          new RegExp('\\b[A-Z]{2}\\d{4}' + hy + '\\d{1,6}(?:' + hy + '\\d{1,3})?', 'g'),
          new RegExp('\\b[A-Z]{2}\\s*\\d{4}(?:' + hy + '[A-Za-z]{0,2}\\d{1,8}){1,2}', 'g'),
          new RegExp('\\b\\d{2}' + hy + '\\d{3}' + hy + '[A-Z]\\d{2}' + hy + '\\d{3}\\b', 'g'),
          new RegExp('\\b\\d{2}' + hy + '[A-Za-z]+' + hy + '\\d{1,4}', 'g'),
          new RegExp('\\b[A-Z]{2,6}\\d{4,6}' + hy + '\\d{2,4}\\b', 'g'),
          new RegExp('\\b[A-Z]{2,12}(?:' + hy + '[A-Z0-9]{2,16}){1,4}' + hy + '[A-Z0-9]{3,16}\\b', 'g'),
          /\b\d{4,6}[A-Z]\d[A-Z0-9]{5,20}\b/g
        ];
        var LOOSE = [
          /\bgrant\s*(?:no\.?|number)s?\s*[:\s]*([A-Z0-9][A-Z0-9\-]{5,30})\b/ig,
          /\bgrant\s+agreement\s+No\.?\s*([A-Z0-9\-]{6,30})\b/ig,
          /\bproject\s+number\s*[:\s]*([A-Z0-9\-]{6,30})\b/ig,
          /[\[(]\s*(\d{6,12})\s*[\])]/g,
          /\bNos?\.\s*([A-Z0-9][A-Z0-9\-]{5,30})\b/ig
        ];
        var scan = function (text, allowLoose) {
          var t = nz(text || ''), found = {}, out = [];
          var pats = STRUCT.concat(allowLoose ? LOOSE : []);
          pats.forEach(function (re) {
            re.lastIndex = 0;
            var m;
            while ((m = re.exec(t)) !== null) {
              var code = nz(m[1] || m[0]).replace(/\s*-\s*/g, '-').replace(/\s+/g, '').replace(/^[\[(]|[\])].*$/g, '');
              code = code.replace(/[.,;:)]+$/, '');
              if (code.length < 6) continue;
              var digits = (code.match(/\d/g) || []).length;
              if (digits < 4) continue;
              if (/^\d{4}-\d{4}$/.test(code)) continue;
              if (/^20\d{6}-\d{2,4}$/.test(code) && /(?:ID|Manuscript)\s*No\.?\s*$/i.test(t.substring(Math.max(0, m.index - 30), m.index))) continue;
              var k = code.toUpperCase();
              if (!found[k]) { found[k] = true; out.push(code); }
            }
          });
          return out.filter(function (c) {
            return !out.some(function (o) { return o !== c && o.toUpperCase().indexOf(c.toUpperCase()) >= 0; });
          });
        };

        var inFunding = scan(src, true);
        // Funding 구간에서 코드를 못 찾은 경우만 문서 전체를 구조화 코드 패턴으로 훑는다.
        var EQUIP = /USB|PMT|LSM|ACT\d|AX\d|BLM|DFG|MLS|FPC|CDFW|PFM|GVS|FF\d|EV\d|UPLSAPO|MS\d{4}/i;
        var inDoc = inFunding.length ? [] : scan(ctx.full, false).filter(function (c) {
          return inFunding.indexOf(c) < 0 && !EQUIP.test(c);
        });
        meta.projectCodes = inFunding.concat(inDoc);
        meta.codeSources = {};
        inFunding.forEach(function (c) { meta.codeSources[c] = 'Funding'; });
        inDoc.forEach(function (c) { meta.codeSources[c] = '문서 내'; });
      },

      // 페이지: 논문번호 + PDF 페이지 수로 파생. 참고문헌의 pp.는 쓰지 않는다.
      pagesRange: function (ctx, meta) {
        if (meta.articleNo) {
          var hits = ctx.findAll(new RegExp('\\b' + esc(meta.articleNo) + '-(\\d{1,3})\\b'));
          if (hits.length) {
            var nums = hits.map(function (h) { return parseInt(h.match[1], 10); }).filter(function (n) { return !isNaN(n); }).sort(function (a, b) { return a - b; });
            meta.pages = meta.articleNo + '-' + nums[0] + '-' + meta.articleNo + '-' + nums[nums.length - 1];
            meta.evidence.pages = { value: meta.pages, raw: meta.articleNo + '-' + nums[0] + ' … ' + meta.articleNo + '-' + nums[nums.length - 1], page: hits[0].page, source: 'article-footer-range', confidence: 1 };
            return;
          }
          // 꼬리말 표기가 없으면 PDF 페이지 수로 파생(Elsevier 등 논문번호 체계)
          meta.pages = meta.articleNo + '-1-' + meta.articleNo + '-' + ctx.numPages;
          meta.pagesDerived = true;
          meta.evidence.pages = { value: meta.pages, raw: 'PDF 총 ' + ctx.numPages + '페이지', page: '', source: 'derived-from-pdf-pagecount', confidence: 0.75 };
          return;
        }
        var f = ctx.findIn(1, /\bpp?\.\s*(\d{1,5})\s*[-–]\s*(\d{1,5})\b/i);
        if (f) { meta.pages = f.match[1] + '-' + f.match[2]; meta.evidence.pages = ev(meta.pages, f, 'pp-range', 0.85); return; }
        f = ctx.findIn(2, /Page\s+\d+\s+of\s+(\d+)/i);
        if (f) { meta.pages = '1-' + f.match[1]; meta.evidence.pages = ev(meta.pages, f, 'page-x-of-y', 0.7); return; }
        meta.pages = '1-' + ctx.numPages;
        meta.pagesDerived = true;
        meta.evidence.pages = { value: meta.pages, raw: 'PDF 총 ' + ctx.numPages + '페이지', page: '', source: 'derived-from-pdf-pagecount', confidence: 0.6 };
      }
    };

    // ---------- 어댑터 ----------
    function canonicalJournalName(j) {
      var c = cmpKey(j);
      if (/^(revsciinstrum|reviewofscientificinstruments)$/.test(c)) return 'Review of Scientific Instruments';
      if (/^(japplphys|journalofappliedphysics)$/.test(c)) return 'Journal of Applied Physics';
      if (/^(advfunctmater|advancedfunctionalmaterials)$/.test(c)) return 'Advanced Functional Materials';
      if (/^advancedscience$/.test(c)) return 'Advanced Science';
      return cl(j);
    }

    var ADAPTERS = [
      {
        id: 'aip', label: 'AIP Publishing',
        detect: function (c) {
          var s = 0;
          if (/AIP Publishing/i.test(c.detect)) s += 4;
          if (/pubs\.aip\.org/i.test(c.detect)) s += 3;
          if (/\bCite\s+as\s*:/i.test(c.detect)) s += 2;
          if (/10\.1063\//.test(c.detect)) s += 3;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = 'AIP Publishing'; meta.mediumScope = '국외';
          // 표지 페이지가 따로 있는 PDF는 실제 Cite as가 2페이지에 있다. 줄바꿈도 허용한다.
          var f = ctx.findIn(2, /Cite\s+as\s*:\s*([A-Za-z][A-Za-z0-9.&'\-\s]{2,100}?)\s+(\d{1,4})\s*,\s*([A-Za-z0-9-]+)\s*\((\d{4})\)/i);
          if (!f) {
            f = ctx.findIn(2, /(?:^|\n)\s*((?:Rev\.\s*Sci\.\s*Instrum\.|J\.\s*Appl\.\s*Phys\.|Applied\s+Physics\s+Letters|APL\s+Photonics))\s+(\d{1,4})\s*,\s*([A-Za-z0-9-]+)\s*\((\d{4})\)/i);
          }
          if (f) {
            meta.journal = canonicalJournalName(f.match[1]); meta.volume = f.match[2]; meta.articleNo = f.match[3]; meta.year = f.match[4];
            meta.evidence.journal = ev(meta.journal, f, 'cite-as', 1);
            meta.evidence.volume = ev(meta.volume, f, 'cite-as', 1);
            meta.evidence.articleNo = ev(meta.articleNo, f, 'cite-as', 1);
          }
          var jf = ctx.findIn(3, /\b(Applied\s+Physics\s+Letters|Journal\s+of\s+Applied\s+Physics|Review\s+of\s+Scientific\s+Instruments|APL\s+Photonics|Physics\s+of\s+Fluids|Journal\s+of\s+Chemical\s+Physics)\b/i);
          if (jf) { meta.journal = canonicalJournalName(jf.match[1]); meta.evidence.journal = ev(meta.journal, jf, 'journal-header', 1); }
          if (/^\d{6}$/.test(meta.articleNo || '')) {
            meta.issue = String(parseInt(meta.articleNo.substring(0, 2), 10));
            meta.issueDerived = true;
            meta.evidence.issue = { value: meta.issue, raw: meta.articleNo, page: f ? f.page : 1, source: 'derived-from-aip-article-number', confidence: 0.8 };
          }
        }
      },
      {
        id: 'kjkiees', label: '한국전자파학회(KJKIEES)',
        detect: function (c) {
          var s = 0;
          if (/10\.5515\/KJKIEES/i.test(c.detect)) s += 6;
          if (/THE JOURNAL OF KOREAN INSTITUTE OF ELECTROMAGNETIC ENGINEERING AND SCIENCE/i.test(c.detect)) s += 6;
          if (/KJKIEES/i.test(c.detect)) s += 2;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = 'Korean Institute of Electromagnetic Engineering and Science'; meta.mediumScope = '국내';
          meta.journal = 'The Journal of Korean Institute of Electromagnetic Engineering and Science';
          meta.evidence.journal = { value: meta.journal, raw: meta.journal, page: 1, source: 'kjkiees-header', confidence: 1 };
          var f = ctx.findIn(1, /THE\s+JOURNAL\s+OF\s+KOREAN\s+INSTITUTE\s+OF\s+ELECTROMAGNETIC\s+ENGINEERING\s+AND\s+SCIENCE\.?\s*(\d{4})\s+([A-Za-z]+)\s*;\s*(\d{1,4})\s*\(\s*(\d{1,3})\s*\)\s*,\s*(\d{1,5})\s*[~∼\-–]\s*(\d{1,5})/i);
          if (f) {
            meta.year = f.match[1]; meta.volume = f.match[3]; meta.issue = f.match[4];
            meta.pages = f.match[5] + '-' + f.match[6]; meta.pagesDerived = false;
            meta.issueDate = toIso('1 ' + f.match[2] + ' ' + f.match[1]);
            meta.evidence.volume = ev(meta.volume, f, 'kjkiees-header', 1);
            meta.evidence.issue = ev(meta.issue, f, 'kjkiees-header', 1);
            meta.evidence.pages = ev(meta.pages, f, 'kjkiees-header', 1);
            meta.evidence.issueDate = ev(meta.issueDate, f, 'kjkiees-issue-month', 0.9);
          }
        }
      },
      {
        id: 'asm', label: 'American Society for Microbiology',
        detect: function (c) {
          var s = 0;
          if (/journals\.asm\.org/i.test(c.detect)) s += 4;
          if (/10\.1128\//.test(c.detect)) s += 4;
          if (/American Society for Microbiology/i.test(c.detect)) s += 2;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = 'American Society for Microbiology'; meta.mediumScope = '국외';
          var jf = ctx.find(/Research Article\s+(Journal of [A-Z][A-Za-z ]{3,40})/) ||
                   ctx.find(/\b(Journal of Clinical Microbiology|Journal of Bacteriology|Journal of Virology|Applied and Environmental Microbiology|mBio|mSphere|mSystems|Antimicrobial Agents and Chemotherapy|Microbiology Spectrum)\b/);
          if (jf) { meta.journal = cl(jf.match[1]); meta.evidence.journal = ev(meta.journal, jf, 'running-header', 0.95); }
          var vf = ctx.findIn(2, /(Month\s+[A-Z]+|[A-Z][a-z]+)\s+Volume\s+(\d+)\s+Issue\s+(\d+)/);
          if (vf) {
            meta.volume = vf.match[2]; meta.issue = vf.match[3];
            var pre = (meta.volume === '0' || meta.issue === '0');
            meta.prePagination = pre;
            meta.evidence.volume = ev(meta.volume, vf, pre ? 'asm-prepub-header' : 'asm-header', pre ? 0.3 : 0.95);
            meta.evidence.issue = ev(meta.issue, vf, pre ? 'asm-prepub-header' : 'asm-header', pre ? 0.3 : 0.95);
            if (pre) meta.warnings.push('첨부 PDF가 조판 전 원고(Volume 0 / Issue 0)입니다. 권·호·페이지는 PDF로 확인할 수 없습니다.');
          }
          if (meta.prePagination) { meta.volume = ''; meta.issue = ''; meta.pages = ''; }
        }
      },
      {
        id: 'elsevier', label: 'Elsevier / ScienceDirect',
        detect: function (c) {
          var s = 0;
          if (/Contents lists available at ScienceDirect/i.test(c.detect)) s += 5;
          if (/journal homepage:\s*www\.elsevier\.com/i.test(c.detect)) s += 4;
          if (/10\.1016\//.test(c.detect)) s += 3;
          if (/©\s*\d{4}\s*Elsevier/i.test(c.detect)) s += 2;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = 'Elsevier'; meta.mediumScope = '국외';
          if (!Common.journalFromHeader(ctx, meta)) {
            var jf = ctx.findIn(1, /Contents lists available at ScienceDirect\s*\n+\s*([A-Z][A-Za-z&:,'\-\. ]{3,60})/i);
            if (jf) { meta.journal = cl(jf.match[1]); meta.evidence.journal = ev(meta.journal, jf, 'masthead', 0.9); }
          }
          if (!meta.journal) {
            var sf = ctx.findIn(1, /journal homepage:\s*www\.elsevier\.com\/locate\/([a-z]+)/i);
            if (sf) { meta.journal = sf.match[1]; meta.evidence.journal = ev(meta.journal, sf, 'homepage-slug', 0.5); }
          }
          meta.noIssueSystem = true;   // Elsevier 다수 저널은 호 표기 없이 논문번호 사용
        }
      },
      {
        id: 'wiley', label: 'Wiley / Wiley-VCH',
        detect: function (c) {
          var s = 0;
          if (/10\.1002\//.test(c.detect)) s += 5;
          if (/Wiley-VCH|Wiley Online Library|onlinelibrary\.wiley\.com/i.test(c.detect)) s += 4;
          if (/advancedscience\.com|afm-journal\.de|advancedsciencenews\.com/i.test(c.detect)) s += 2;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = 'Wiley'; meta.mediumScope = '국외';
          // Advanced Science: "Advanced Science, 2026; 13:e24375"
          var f = ctx.findIn(2, /(?:^|\n)\s*(Advanced\s+Science)\s*,?\s*(\d{4})\s*;\s*(\d{1,4})\s*:\s*([A-Za-z]?\d{4,10})/i);
          // Advanced Functional Materials: "Adv. Funct. Mater. 2025, 35, 2424823"
          if (!f) f = ctx.findIn(2, /(?:^|\n)\s*(Adv\.\s*Funct\.\s*Mater\.|Advanced\s+Functional\s+Materials)\s+(\d{4})\s*,\s*(\d{1,4})\s*,\s*([A-Za-z]?\d{5,10})/i);
          if (f) {
            meta.journal = canonicalJournalName(f.match[1]); meta.year = f.match[2]; meta.volume = f.match[3]; meta.articleNo = f.match[4];
            meta.evidence.journal = ev(meta.journal, f, 'wiley-citation-footer', 1);
            meta.evidence.volume = ev(meta.volume, f, 'wiley-citation-footer', 1);
            meta.evidence.articleNo = ev(meta.articleNo, f, 'wiley-citation-footer', 1);
          } else {
            var jh = ctx.findIn(2, /\b(Advanced\s+Science|Advanced\s+Functional\s+Materials)\b/i);
            if (jh) { meta.journal = canonicalJournalName(jh.match[1]); meta.evidence.journal = ev(meta.journal, jh, 'wiley-header', 0.95); }
          }
          // 다운로드 꼬리말: "21983844, 2026, 38, Downloaded from ..." (마지막 수가 issue)
          var isf = ctx.findIn(3, /\b\d{8}\s*,\s*(\d{4})\s*,\s*(\d{1,3})\s*,\s*Downloaded\s+from\b/i);
          if (isf) {
            meta.issue = isf.match[2];
            meta.evidence.issue = ev(meta.issue, isf, 'wiley-download-footer', 0.95);
          }
          // eLocator + "n of N" 페이지 체계
          if (meta.articleNo) {
            var ph = ctx.findAll(/\b(\d{1,3})\s+of\s+(\d{1,3})\b/i);
            if (ph.length) {
              var total = 0;
              ph.forEach(function (h) { total = Math.max(total, parseInt(h.match[2], 10) || 0); });
              if (total > 0) {
                meta.pages = meta.articleNo + '-1-' + meta.articleNo + '-' + total;
                meta.pagesDerived = false;
                meta.evidence.pages = { value: meta.pages, raw: meta.articleNo + ' (1 of ' + total + ')', page: ph[0].page, source: 'wiley-elocator-page-range', confidence: 1 };
              }
            }
          }
        }
      },
      {
        id: 'optica', label: 'Optica Publishing Group',
        detect: function (c) {
          var s = 0;
          if (/Optica Publishing Group/i.test(c.detect)) s += 5;
          if (/10\.1364\//.test(c.detect)) s += 4;
          if (/\b(Biomedical Optics Express|Optics Express|Optics Letters|Applied Optics|Photonics Research|Biomed\. Opt\. Express|Opt\. Express|Opt\. Lett\.)\b/i.test(c.detect)) s += 3;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = 'Optica Publishing Group'; meta.mediumScope = '국외';
          // 러닝헤더: "Vol. 17, No. 8 / 1 Aug 2026 / Biomedical Optics Express   4420"
          var f = ctx.findIn(3, /Vol\.\s*(\d{1,4}),?\s*No\.\s*(\d{1,4})\s*\/\s*(\d{1,2}\s+[A-Za-z]+\.?\s+\d{4})\s*\/\s*([A-Za-z][A-Za-z&:,'.\- ]{3,60}?)\s\s*(\d{2,6})(?!\d)/);
          if (f) {
            meta.volume = f.match[1]; meta.issue = f.match[2];
            meta.issueDate = toIso(f.match[3]);
            meta.journal = cl(f.match[4]);
            meta.evidence.volume = ev(meta.volume, f, 'optica-running-header', 1);
            meta.evidence.issue = ev(meta.issue, f, 'optica-running-header', 1);
            meta.evidence.journal = ev(meta.journal, f, 'optica-running-header', 1);
            meta.evidence.issueDate = ev(meta.issueDate, f, 'optica-running-header', 1);
            pagesFromRunningHeader(ctx, meta, meta.journal);
          }
        }
      },
      {
        id: 'springer', label: 'Springer Nature / BMC',
        detect: function (c) {
          var s = 0;
          if (/Springer\s*Nature|SpringerOpen|BioMed Central|link\.springer\.com/i.test(c.detect)) s += 4;
          if (/10\.1186\/|10\.1038\/|10\.1007\//.test(c.detect)) s += 3;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = meta.publisher || 'Springer Nature'; meta.mediumScope = '국외';
          var f = ctx.findIn(2, /\((\d{4})\)\s*(\d{1,4})\s*:\s*(\d{1,6})/);
          if (f) {
            meta.year = f.match[1]; meta.volume = f.match[2]; meta.articleNo = f.match[3];
            meta.evidence.volume = ev(meta.volume, f, 'springer-citation', 0.95);
            meta.evidence.articleNo = ev(meta.articleNo, f, 'springer-citation', 0.95);
          }
          // BMC/SpringerOpen 머리말: "Lee et al. Nano Convergence (2026) 13:34"
          var jf = ctx.findIn(2, /(?:et al\.?|and\s+\w+)\s+([A-Z][A-Za-z&:,'.\- ]{3,60}?)\s*\(\d{4}\)\s*\d{1,4}\s*:\s*\d{1,6}/) ||
                   ctx.findIn(2, /(?:^|\n)\s*([A-Z][A-Za-z&:,'.\- ]{3,60}?)\s*\(\d{4}\)\s*\d{1,4}\s*:\s*\d{1,6}/);
          if (jf) { meta.journal = cl(jf.match[1]); meta.evidence.journal = ev(meta.journal, jf, 'springer-header', 0.95); }
          if (!meta.journal) Common.journalFromHeader(ctx, meta);
          meta.noIssueSystem = true;   // BMC/SpringerOpen 다수는 호 없이 논문번호를 사용
        }
      },
      {
        id: 'ieee', label: 'IEEE',
        detect: function (c) {
          var s = 0;
          if (/IEEE TRANSACTIONS|IEEE Access|IEEE Journal|ieeexplore/i.test(c.detect)) s += 4;
          if (/10\.1109\//.test(c.detect)) s += 3;
          return s;
        },
        parse: function (ctx, meta) {
          meta.publisher = 'IEEE'; meta.mediumScope = '국외';
          var f = ctx.findIn(2, /VOL\.\s*(\d{1,3})\s*,\s*NO\.\s*(\d{1,3})/i);
          if (f) {
            meta.volume = f.match[1]; meta.issue = f.match[2];
            meta.evidence.volume = ev(meta.volume, f, 'ieee-header', 1);
            meta.evidence.issue = ev(meta.issue, f, 'ieee-header', 1);
          }
          var jf = ctx.findIn(2, /(IEEE\s+[A-Z][A-Za-z ]{4,60})/);
          if (jf) { meta.journal = cl(jf.match[1]); meta.evidence.journal = ev(meta.journal, jf, 'ieee-header', 0.85); }
        }
      },
      {
        id: 'generic', label: '범용(출판사 미식별)',
        detect: function () { return 1; },
        parse: function (ctx, meta) {
          if (Common.journalFromHeader(ctx, meta)) return;
          var lines = ctx.head.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
          for (var i = 0; i < Math.min(10, lines.length); i++) {
            var l = lines[i];
            if (l.length < 3 || l.length > 60 || !/[A-Za-z]/.test(l) || /^\d/.test(l)) continue;
            if (/^(RESEARCH|Open Access|ARTICLE|LETTER|REVIEW|Abstract|https?|Cite as|Submitted|Received|Published|Downloaded)/i.test(l)) continue;
            if (l.split(' ').length > 8) continue;
            meta.journal = l;
            meta.evidence.journal = { value: l, raw: l, page: 1, source: 'head-line-heuristic', confidence: 0.4 };
            break;
          }
          var vf = ctx.findIn(2, /\bVol(?:ume)?\.?\s*(\d{1,4})\b/i);
          if (vf) { meta.volume = vf.match[1]; meta.evidence.volume = ev(meta.volume, vf, 'volume-label', 0.7); }
          var nf = ctx.findIn(2, /\b(?:No\.|Issue)\s*(\d{1,3})\b/i);
          if (nf) { meta.issue = nf.match[1]; meta.evidence.issue = ev(meta.issue, nf, 'issue-label', 0.7); }
        }
      }
    ];

    // ---------- 진입점 ----------
    function emptyMeta() {
      return {
        adapter: '', adapterLabel: '', adapterScores: {},
        doi: '', journal: '', publisher: '', articleType: '', mediumScope: '',
        volume: '', issue: '', issueDerived: false, prePagination: false, noIssueSystem: false,
        pages: '', pagesDerived: false, articleNo: '', year: '',
        submittedDate: '', receivedDate: '', revisedDate: '', acceptedDate: '', publishedDate: '',
        submissionLabel: '', publishedLabel: '', issueDate: '',
        authors: [], affiliations: [], affiliationSource: '',
        correspondingEmails: [], krissCorrespEmail: false,
        fundingText: '', projectCodes: [], warnings: [], evidence: {}
      };
    }

    function parse(pageTexts, opts) {
      var ctx = buildContext(pageTexts, opts);
      var meta = emptyMeta();

      if (ctx.textLength < 200) {
        var srcKind = (opts && opts.kind) ? opts.kind : '첨부문서';
        meta.warnings.push('추출 텍스트가 ' + ctx.textLength + '자입니다. ' +
          (srcKind === 'PDF' ? '스캔 이미지 PDF일 수 있어 ' : '문서 텍스트 추출이 충분하지 않아 ') +
          '자동 대조 결과를 신뢰하기 어렵습니다.');
      }

      var best = null;
      ADAPTERS.forEach(function (ad) {
        var sc = 0;
        try { sc = ad.detect(ctx) || 0; } catch (e) { sc = 0; }
        meta.adapterScores[ad.id] = sc;
        if (!best || sc > best.score) best = { ad: ad, score: sc };
      });
      meta.adapter = best.ad.id; meta.adapterLabel = best.ad.label;

      Common.doi(ctx, meta);
      Common.dates(ctx, meta);
      Common.emails(ctx, meta);
      Common.funding(ctx, meta);

      var tf = ctx.findIn(1, /\b(RESEARCH ARTICLE|Research Article|ORIGINAL ARTICLE|REVIEW ARTICLE|COMMUNICATION|LETTER)\b/);
      if (tf) { meta.articleType = tf.match[1].toUpperCase(); meta.evidence.articleType = ev(meta.articleType, tf, 'document-type', 0.9); }

      try { best.ad.parse(ctx, meta); }
      catch (e) {
        meta.warnings.push('어댑터(' + best.ad.id + ') 파싱 오류: ' + e.message);
        try { ADAPTERS[ADAPTERS.length - 1].parse(ctx, meta); } catch (e2) {}
      }

      var af = parseAffiliations(ctx);
      meta.affiliations = af.affs; meta.affiliationSource = af.source;
      meta.authors = parseAuthors(ctx, meta);
      enrichGroupedAffiliations(ctx, meta);
      enrichCorresponding(ctx, meta);
      if (!meta.pages) Common.pagesRange(ctx, meta);

      // 발표매체 추론
      if (!meta.mediumScope) {
        if (/[가-힣]/.test(meta.journal || '')) meta.mediumScope = '국내';
      }
      meta.mediumLabel = meta.mediumScope ? (meta.mediumScope + '논문') : '';

      if (meta.adapter === 'generic') {
        meta.warnings.push('출판사를 식별하지 못해 범용 규칙으로 파싱했습니다. 서지정보 추출 신뢰도가 낮습니다.');
      }
      var withAff = meta.authors.filter(function (a) { return a.affNums && a.affNums.length; }).length;
      meta.authorsConfidence = meta.authors.length ? (withAff / meta.authors.length) : 0;
      if (meta.authors.length && !meta.affiliations.length) {
        meta.warnings.push('소속 목록을 추출하지 못했습니다. 내부·외부 판정은 수동 확인이 필요합니다.');
      }

      meta.fullText = ctx.full; meta.fullTextNorm = ctx.flat;
      meta.fullTextStripped = ctx.stripped; meta.pageTexts = ctx.pages;
      meta.numPages = ctx.numPages;

      console.log(PTAG, '어댑터:', meta.adapter, JSON.stringify(meta.adapterScores));
      console.log(PTAG, '요약:', JSON.stringify({
        doi: meta.doi, journal: meta.journal, vol: meta.volume, issue: meta.issue,
        artNo: meta.articleNo, pages: meta.pages, sub: meta.submittedDate, acc: meta.acceptedDate,
        pub: meta.publishedDate, authors: meta.authors.length,
        kriss: meta.authors.filter(function (a) { return a.isKriss; }).length,
        corr: meta.authors.filter(function (a) { return a.isCorresponding; }).length,
        affs: meta.affiliations.length, codes: meta.projectCodes
      }));
      if (meta.warnings.length) console.warn(PTAG, '경고:', meta.warnings.join(' / '));
      return meta;
    }

    // ---------- 비교 규칙 ----------
    function dateEq(a, b) { return String(a || '').replace(/\D/g, '') === String(b || '').replace(/\D/g, ''); }
    function doiCore(s) {
      var m = String(s || '').match(/(10\.\d{4,}\/[A-Za-z0-9._\-()\/]+)/);
      return m ? m[1].replace(/\s+/g, '').replace(/[.,;)]+$/, '').toLowerCase() : cmpKey(s);
    }
    function journalEq(a, b) {
      var ka = cmpKey(a), kb = cmpKey(b);
      var sp = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean); };
      var aa = sp(a), bb = sp(b);
      if (!aa.length || !bb.length) return false;
      if (ka === kb) return true;
      // 시스템은 정식명+부제, PDF는 짧은 저널명을 쓰는 경우가 있다.
      // 예: "PHYSICA MEDICA-EUROPEAN JOURNAL OF MEDICAL PHYSICS" ↔ "Physica Medica".
      if (Math.min(ka.length, kb.length) >= 10 && (ka.indexOf(kb) === 0 || kb.indexOf(ka) === 0)) return true;
      if (aa.length !== bb.length) {
        // 불용어 제거 후 재비교 (of, and, the)
        var st = { of: 1, and: 1, the: 1, fur: 1 };
        aa = aa.filter(function (w) { return !st[w]; }); bb = bb.filter(function (w) { return !st[w]; });
        if (aa.length !== bb.length) return false;
      }
      for (var i = 0; i < aa.length; i++) {
        if (aa[i] === bb[i]) continue;
        if (aa[i].indexOf(bb[i]) === 0 || bb[i].indexOf(aa[i]) === 0) continue;
        if (aa[i].length >= 4 && bb[i].length >= 4 && aa[i].substring(0, 4) === bb[i].substring(0, 4)) continue;
        return false;
      }
      return true;
    }

    function pageEq(a, b, meta) {
      var tidy = function (s) { return nz(s).replace(/[~∼–—]/g, '-').replace(/\s+/g, ''); };
      var aa = tidy(a), bb = tidy(b);
      if (!aa || !bb) return false;
      if (aa.toLowerCase() === bb.toLowerCase()) return true;
      var art = cmpKey(meta && meta.articleNo);
      if (!art) return false;
      var ap = aa.split('-').filter(Boolean), bp = bb.split('-').filter(Boolean);
      // Elsevier/Wiley eLocator: 시스템이 113835-113835, PDF가 113835-1-113835-11처럼
      // 논문번호+PDF 내부쪽을 함께 표기해도 같은 논문 페이지 의미로 본다.
      var sysLocatorOnly = (ap.length === 2 && cmpKey(ap[0]) === art && cmpKey(ap[1]) === art) ||
        (ap.length === 1 && cmpKey(ap[0]) === art);
      var pdfLocatorRange = bp.length >= 4 && cmpKey(bp[0]) === art && cmpKey(bp[bp.length - 2]) === art;
      return !!(sysLocatorOnly && pdfLocatorRange);
    }

    var FIELD_RULES = [
      { group: '서지정보', label: 'DOI', sys: function (p) { return p.doi; }, paper: function (m) { return m.doi; }, evKey: 'doi', eq: function (a, b) { return doiCore(a) === doiCore(b); } },
      { group: '서지정보', label: '수록지명(저널)', sys: function (p) { return p.journalName; }, paper: function (m) { return m.journal; }, evKey: 'journal', eq: journalEq },
      { group: '서지정보', label: '발표매체', sys: function (p) { return p.ancmMedm; }, paper: function (m) { return m.mediumLabel; }, eq: function (a, b) { return !!a && !!b && cmpKey(a).indexOf(cmpKey(b)) >= 0; },
        render: function (m) {
          var det = [m.publisher, m.journal, m.articleType].filter(Boolean).join(' / ');
          return m.mediumLabel ? (m.mediumLabel + (det ? ' (' + det + ')' : '')) : (det || '');
        } },
      { group: '서지정보', label: '권(Volume)', sys: function (p) { return p.volume; }, paper: function (m) { return m.volume; }, evKey: 'volume' },
      { group: '서지정보', label: '호(Issue)', sys: function (p) { return p.issue; }, paper: function (m) { return m.issue; }, evKey: 'issue', derivedKey: 'issueDerived' },
      { group: '서지정보', label: '논문번호', sys: function (p) { return p.eid; }, paper: function (m) { return m.articleNo; }, evKey: 'articleNo' },
      { group: '서지정보', label: '페이지', sys: function (p) { return (p.startPage || p.endPage) ? (p.startPage || '?') + '-' + (p.endPage || '?') : ''; }, paper: function (m) { return m.pages; }, evKey: 'pages', derivedKey: 'pagesDerived', eq: pageEq },
      { group: '날짜', label: '투고일', sys: function (p) { return p.submitDate; }, paper: function (m) { return m.submittedDate; }, evKey: 'submittedDate', eq: dateEq },
      { group: '날짜', label: '승인일(Accepted)', sys: function () { return ''; }, paper: function (m) { return m.acceptedDate; }, evKey: 'acceptedDate', infoOnly: true },
      { group: '날짜', label: '게재일', sys: function (p) { return p.pubDate; },
        paper: function (m) { return m.issueDate || m.publishedDate; },
        evKey: 'issueDate', eq: dateEq,
        render: function (m) {
          if (m.issueDate) return m.issueDate + ' [학술지 발행일]' + (m.publishedDate && m.publishedDate !== m.issueDate ? ' · 온라인 ' + m.publishedDate : '');
          return m.publishedDate ? (m.publishedDate + (m.publishedLabel ? ' [' + m.publishedLabel + ']' : '')) : '';
        } },
      { group: '외부확인', label: '발표구분(SCI등급)', sys: function (p) { return p.ancmCls; }, paper: function () { return ''; }, external: 'JCR 등급은 PDF에 없음 — 외부 데이터 필요' }
    ];

    function evaluate(rule, page, meta) {
      var sysVal = rule.sys(page) || '';
      var paperVal = rule.paper(meta) || '';
      var evd = rule.evKey ? (meta.evidence[rule.evKey] || null) : null;
      if (rule.label === '게재일' && !evd) evd = meta.evidence.publishedDate || null;
      var status, note = rule.external || '';

      if (rule.external) status = 'external_required';
      else if (rule.infoOnly) status = paperVal ? 'info' : 'not_extracted';
      else if (!sysVal) status = paperVal ? 'info' : 'empty';
      else if (!paperVal) status = 'not_extracted';
      else {
        var eq = rule.eq || function (a, b) { return cmpKey(a) === cmpKey(b); };
        if (eq(sysVal, paperVal, meta)) status = (rule.derivedKey && meta[rule.derivedKey]) ? 'derived' : 'match';
        else status = 'mismatch';
      }

      // 조판 전 원고·Elsevier 호 미표기 등 구조적 사유는 불일치가 아니라 참고로 표시
      if (rule.label === '권(Volume)' && meta.prePagination && status !== 'match') { status = 'info'; note = '조판 전 원고(Volume 0)'; }
      if (rule.label === '호(Issue)') {
        if (meta.prePagination && status !== 'match') { status = 'info'; note = '조판 전 원고(Issue 0)'; }
        else if (meta.noIssueSystem && !paperVal) {
          status = 'info';
          note = (sysVal && meta.articleNo && cmpKey(sysVal) === cmpKey(meta.articleNo))
            ? '이 출판사는 호 표기가 없으며, 시스템 호 필드에 논문번호가 입력되어 있음'
            : '이 출판사는 호 없이 논문번호를 사용';
        }
        else if (rule.derivedKey && meta[rule.derivedKey]) note = '논문번호에서 파생';
      }
      if (rule.label === '페이지' && meta.pagesDerived && status !== 'match') note = 'PDF 총 페이지 수 기반 파생값';
      if (rule.label === '페이지' && status === 'match' && nz(sysVal).replace(/\s+/g, '') !== nz(paperVal).replace(/\s+/g, '')) {
        note = 'eLocator 논문번호 페이지와 PDF 내부 페이지 범위를 동일 의미로 처리';
      }
      // Published Online / Available online은 권·호의 공식 발행일과 다를 수 있으므로 불일치로 단정하지 않는다.
      if (rule.label === '게재일' && status === 'mismatch' && /Published\s+Online|Available\s+online|First\s+published|Version\s+of\s+Record/i.test(meta.publishedLabel || '')) {
        status = 'partial';
        note = 'PDF는 온라인 공개일 — 시스템 학술지 발행일과 다를 수 있음';
      }
      if (rule.label === '논문번호' && !sysVal && paperVal) note = '시스템 미입력';

      return {
        group: rule.group, label: rule.label, sysVal: sysVal,
        paperVal: rule.render ? rule.render(meta) : paperVal,
        rawPaperVal: paperVal, evidence: evd, status: status, note: note
      };
    }

    function compare(page, meta) {
      return FIELD_RULES.map(function (r) { return evaluate(r, page, meta); });
    }

    function selfTest(pageTexts, opts) {
      var meta = parse(pageTexts, opts);
      var rows = Object.keys(meta.evidence).map(function (k) {
        var e = meta.evidence[k];
        return { 필드: k, 값: e ? e.value : '', 근거: e ? cp(e.raw, 60) : '', 페이지: e ? e.page : '', 출처: e ? e.source : '', 신뢰도: e ? e.confidence : '' };
      });
      if (console.table) console.table(rows); else console.log(rows);
      console.log(PTAG, '저자:', meta.authors.map(function (a) {
        return a.order + '.' + a.name + (a.isCorresponding ? '*' : '') + (a.isKriss ? '[K]' : '') + '(' + a.affNums.join('') + ')';
      }).join(' | '));
      console.log(PTAG, '소속(' + meta.affiliationSource + '):', meta.affiliations.map(function (a) { return a.num + '=' + cp(a.text, 40) + (a.isKRISS ? '[KRISS]' : ''); }).join(' | '));
      return meta;
    }

    return {
      version: '1.1.0', parse: parse, compare: compare, selfTest: selfTest,
      adapters: ADAPTERS.map(function (a) { return { id: a.id, label: a.label }; }),
      FIELD_RULES: FIELD_RULES,
      util: { normalize: nz, toIso: toIso, journalEq: journalEq, doiCore: doiCore, cmpKey: cmpKey }
    };
  })();

  // ============================================================
  // 개인저작물(논문) 화면 모듈 — B_RES00002
  //   주의: 이 화면번호는 시스템 구조 문서 §7 팝업 계약에 없다(미확인 항목).
  //         DOM id 는 실측 기반이므로 화면 개편 시 재확인이 필요하다.
  // ============================================================
  var isTetsPage = /B_RES00002/.test(location.href);

  function tetsPrefix() {
    var bk = getElVal('#bizKey') || getElVal('#tetsRqstNo');
    return bk ? bk.trim() + '_' : '';
  }

  // ---------- 단축키 ----------
  // 지재권 Helper와 동일: Alt+` → 첫 대조, 대조가 없으면 첫 보기
  function setupTetsShortcuts() {
    if (window.__krissTetsShortcuts) return;
    window.__krissTetsShortcuts = true;

    var isTyping = function (el) {
      if (!el) return false;
      var tag = String(el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
    };
    var visible = function (el) {
      if (!el || el.disabled) return false;
      var st = window.getComputedStyle ? window.getComputedStyle(el) : null;
      return !st || (st.display !== 'none' && st.visibility !== 'hidden');
    };
    var firstActionButton = function (word) {
      var btns = document.querySelectorAll('button.kriss-fbtn');
      for (var i = 0; i < btns.length; i++) {
        if (visible(btns[i]) && String(btns[i].textContent || '').trim() === word) return btns[i];
      }
      return null;
    };

    document.addEventListener('keydown', function (e) {
      if (KILLED || e.repeat || !e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if ((e.code || '') !== 'Backquote' && e.key !== '`') return;
      if (document.getElementById('krissComparePanel')) return;

      var btn = firstActionButton('대조') || firstActionButton('보기');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      btn.click();
    }, true);
    console.log(TAG, '단축키 활성화: Alt+` → 대조 (대조 없으면 보기) / Esc 닫기');
  }

  function boot() {
    if (!isTetsPage) return;
    setupTetsShortcuts();
    var n = 0, t = setInterval(function () {
      n++;
      var el = document.getElementById('bizKey');
      if ((el && el.value && el.value.trim()) || n >= 60) {
        clearInterval(t);
        console.log(TAG, 'v' + VER, '| 개인저작물 | bizKey:', el ? el.value : '(없음)', '| 대기', n * 500, 'ms');
        ensureViewerSetupButton();
        setupDownloadIntercept(tetsPrefix);
        attachFileButtons({
          selectors: '#uploader1 a.download_file, .uploader a.download_file',
          compareLabel: '대조', onCompare: startPaperCompare, fallbackProgrmId: 'Tets.do'
        });
      }
    }, 500);
  }

  // ---------- 시스템 입력값 ----------
  function getTetsPageData() {
    return {
      bizKey: getElVal('#bizKey') || getElVal('#tetsRqstNo'),
      title: getElVal('#sbjtKor'),
      ancmMedm: getDropdownText('#ancmMedm'), ancmMedmVal: getDropdownVal('#ancmMedm'),
      ancmCls: getDropdownText('#ancmCls'), ancmClsVal: getDropdownVal('#ancmCls'),
      journalCode: getElVal('#scitCd'), journalName: getElVal('#scitNm'),
      issn: getElVal('#issn'), totalCites: getElVal('#totalCity'),
      countryCode: getElVal('#ntnCd'), countryName: getElVal('#ntnNm'),
      citationIndex: getElVal('#qutStd'),
      techField: getDropdownText('#stvDevlStg'), researchStage: getDropdownText('#sixTechFld'),
      pubDate: getElVal('#ancmDt'), submitDate: getElVal('#subDt'),
      doi: getElVal('#plc'), eid: getElVal('#eid'),
      volume: getElVal('#vol'), issue: getElVal('#num'),
      startPage: getElVal('#strPage'), endPage: getElVal('#endPage'),
      psnEvalYn: getRadioVal('psnEvalYn'), rwOwnerYn: getRadioVal('rwOwnerYn'),
      applicant: getText('#rqstEmpNm'), applyDate: getText('#rqstDtSpan'),
      projects: getProjectGrid(), authors: getAuthorGrid()
    };
  }

  function getProjectGrid() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#grid1 tbody tr[data-uid]'), function (tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 5) return;
      var t = function (i) { return (tds[i].getAttribute('title') || '').trim(); };
      if (t(1)) out.push({ code: t(1), degree: t(2), rate: t(3), name: t(4) });
    });
    return out;
  }

  // 저자 그리드 — td 절대 인덱스 기준(실측)
  // [1]순위 [2]구분(I/O) [4]고유번호 [5]성명 [6]정규직여부 [8]소속 [11]교신chk [12]참여율
  function getAuthorGrid() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#grid2 tbody tr[data-uid]'), function (tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 13) return;
      var t = function (i) { return tds[i] ? (tds[i].getAttribute('title') || '').trim() : ''; };
      var empNo = t(4);
      if (!empNo && tds[4]) {
        var sp = tds[4].querySelector('.t_left');
        if (sp) empNo = sp.textContent.trim();
      }
      var isCorr = false;
      if (tds[11]) {
        var chk = tds[11].querySelector('input[name="resEdtorYn"]');
        isCorr = chk ? chk.checked : false;
      }
      if (t(5)) {
        out.push({
          seqNo: t(1), empCls: t(2), empNo: empNo, name: t(5), dept: t(8),
          isCorresponding: isCorr, partiRate: t(12), isRegular: t(6) === '1'
        });
      }
    });
    console.log(TAG, 'grid2 저자 추출:', out.length, '명');
    return out;
  }

  // ---------- 한글 성 ↔ 로마자 (한/영 저자 대조 근거) ----------
  var SURNAME_ROM = {
    '김': ['kim', 'gim'], '이': ['lee', 'yi', 'rhee', 'ri', 'lie'], '박': ['park', 'pak', 'bak'],
    '최': ['choi', 'choe'], '정': ['jung', 'jeong', 'chung', 'cheong'], '강': ['kang', 'gang'],
    '조': ['cho', 'jo', 'joe'], '윤': ['yoon', 'yun'], '장': ['jang', 'chang'], '임': ['lim', 'im', 'rim'],
    '한': ['han'], '오': ['oh', 'o'], '서': ['seo', 'suh', 'sur'], '신': ['shin', 'sin'],
    '권': ['kwon', 'gwon', 'kweon'], '황': ['hwang'], '안': ['ahn', 'an'], '송': ['song'],
    '류': ['ryu', 'lyu', 'yu'], '유': ['yu', 'yoo', 'you', 'ryu'], '전': ['jeon', 'jun', 'chun', 'cheon'],
    '홍': ['hong'], '고': ['ko', 'koh', 'go', 'koo'], '문': ['moon', 'mun'], '양': ['yang'],
    '손': ['son', 'sohn'], '배': ['bae', 'pae'], '백': ['baek', 'back', 'beak', 'paik', 'baik', 'baeg'],
    '허': ['heo', 'hur', 'huh', 'her'], '남': ['nam'], '심': ['sim', 'shim'], '노': ['noh', 'no', 'roh'],
    '하': ['ha'], '곽': ['kwak', 'gwak'], '성': ['sung', 'seong'], '차': ['cha'],
    '주': ['joo', 'ju', 'choo'], '우': ['woo', 'wu'], '구': ['koo', 'ku', 'gu', 'goo'],
    '민': ['min'], '진': ['jin', 'chin'], '지': ['ji', 'jee'], '엄': ['eom', 'um'],
    '채': ['chae', 'chai'], '원': ['won', 'weon'], '천': ['chun', 'cheon'], '방': ['bang', 'pang'],
    '공': ['kong', 'gong'], '현': ['hyun', 'hyeon'], '함': ['ham'], '변': ['byun', 'byeon'],
    '염': ['yeom', 'yum'], '여': ['yeo'], '추': ['choo', 'chu'], '도': ['do', 'doh'],
    '소': ['so', 'soh'], '석': ['seok', 'suk'], '선': ['sun', 'seon'], '설': ['seol', 'sul'],
    '마': ['ma'], '길': ['gil', 'kil'], '연': ['yeon', 'youn'], '위': ['wi', 'wee'], '표': ['pyo'],
    '명': ['myung', 'myong'], '기': ['ki', 'gi'], '반': ['ban', 'bahn'], '라': ['ra', 'na'],
    '왕': ['wang'], '금': ['keum', 'geum'], '옥': ['ok', 'ock'], '육': ['yook', 'yuk'],
    '인': ['in'], '용': ['yong'], '탁': ['tak'], '국': ['kook', 'kuk'], '경': ['kyung', 'gyeong'],
    '봉': ['bong'], '두': ['doo', 'du'], '감': ['kam', 'gam'], '나': ['na', 'ra'], '사': ['sa'],
    '남궁': ['namgung', 'namkung'], '황보': ['hwangbo'], '선우': ['sunwoo', 'seonwoo'],
    '독고': ['dokgo'], '서문': ['seomun'], '사공': ['sagong'], '제갈': ['jegal']
  };

  function korSurnameRoms(korName) {
    var nm = String(korName || '').replace(/\s+/g, '');
    if (!/^[가-힣]/.test(nm)) return null;
    if (nm.length >= 3 && SURNAME_ROM[nm.substring(0, 2)]) return SURNAME_ROM[nm.substring(0, 2)];
    return SURNAME_ROM[nm.charAt(0)] || null;
  }

  // 한글 성명 ↔ 영문 성명 대조: 성의 로마자 표기가 일치하면 동일인으로 본다
  function nameLikelySame(korName, engName) {
    if (!korName || !engName) return false;
    var kn = String(korName).replace(/\s+/g, ''), en = String(engName).toLowerCase();
    if (!/[가-힣]/.test(kn)) {
      return compactText(kn) === compactText(en);   // 양쪽 모두 영문이면 단순 비교
    }
    var roms = korSurnameRoms(kn);
    if (!roms) return false;
    var toks = en.split(/[\s\-.,]+/).filter(Boolean);
    for (var i = 0; i < toks.length; i++) {
      for (var j = 0; j < roms.length; j++) {
        if (toks[i] === roms[j]) return true;
      }
    }
    return false;
  }

  // ---------- 근거 표시 ----------
  function formatEvidence(value, evidence, note) {
    if (!value) return '(추출되지 않음)';
    var parts = [String(value)];
    if (note) parts.push(note);
    if (evidence && evidence.page) parts.push('p.' + evidence.page);
    if (evidence && evidence.confidence !== undefined && evidence.confidence < 0.7) {
      parts.push('신뢰도 ' + Math.round(evidence.confidence * 100) + '%');
    }
    if (evidence && evidence.raw) {
      var raw = clipText(evidence.raw, 120);
      if (raw.toLowerCase() !== cleanText(value).toLowerCase()) parts.push('원문: ' + raw);
    }
    return parts.join(' · ');
  }

  // ---------- 하이라이트 집합 ----------
  function buildPaperMatchSet(page, meta) {
    var b = matchSetBuilder();
    var core = extractDoiCore(page.doi);
    if (core) {
      b.add(core, 'DOI');
      var slash = core.indexOf('/');
      if (slash > 0) b.add(core.substring(slash + 1), 'DOI');
    }
    b.add(page.journalName, '저널명');
    b.add(page.issn, 'ISSN');
    b.add(page.eid, '논문번호');
    b.addDates(page.submitDate, '투고일');
    b.addDates(page.pubDate, '게재일');
    (page.projects || []).forEach(function (p) {
      if (!p.code) return;
      b.add(p.code, '과제번호');
      var parts = p.code.split('-');
      if (parts.length >= 2) b.add(parts.slice(0, 2).join('-'), '과제번호');
    });
    (meta.projectCodes || []).forEach(function (c) { b.add(c, 'Funding 코드'); });
    (meta.authors || []).forEach(function (a) { b.add(a.name, '저자'); });
    return b.get();
  }

  // ---------- Funding(=관련과제) 대조 ----------
  function compareFunding(page, meta) {
    var G = 'Funding(관련과제)';
    var out = [];
    var codes = meta.projectCodes || [];
    var srcOf = function (c) { return (meta.codeSources && meta.codeSources[c]) ? meta.codeSources[c] : 'PDF'; };
    var strip = function (s) { return normalizeHyphen(s).replace(/[-\s]/g, '').toUpperCase(); };
    var nsCode = function (s) { return normalizeHyphen(s).replace(/\s+/g, '').toUpperCase().replace(/^KRISS-/, ''); };
    var coreProject = function (s) {
      var n = nsCode(s), m = n.match(/^((?:GP|JP|IP|NP)\d{4}-\d{4})(?:-\d{1,3})?$/);
      return m ? m[1] : n;
    };
    var norm = codes.map(function (c) { return normalizeHyphen(c).toUpperCase(); });
    var stripped = codes.map(strip);
    var namespaced = codes.map(nsCode);
    var cores = codes.map(coreProject);
    var allCodes = codes.length
      ? codes.map(function (c) { return c + '(' + srcOf(c) + ')'; }).join(', ')
      : '코드 없음';
    var origin = meta.fundingText ? ' · 원문: ' + clipText(meta.fundingText, 150) : '';
    // 코드 체계가 서로 달라도 과제명이 같은 연구를 가리키는 경우가 있다.
    // 코드 불일치를 match로 승격하지 않고, 제목 근거가 충분할 때만 partial로 표시한다.
    var projectNameRelation = function (projName, fundingText) {
      var pn = String(projName || '').replace(/^\s*\d+(?:-\d+)*[.]?\s*/, '').toLowerCase();
      var ft = String(fundingText || '').toLowerCase();
      if (!pn || !ft) return null;
      var stop = { project:1, research:1, development:1, group:1, program:1, study:1, korea:1, kriss:1 };
      var toks = (pn.match(/[a-z]{4,}/g) || []).filter(function (w) { return !stop[w]; });
      var hit = 0;
      toks.forEach(function (w) { if (ft.indexOf(w) >= 0) hit++; });
      if (toks.length >= 2 && hit >= 2 && hit / toks.length >= 0.5) return { how: '과제명 직접 공통어', score: hit };

      var pairs = [
        { ko: /방사선/, en: /\b(?:ionizing\s+)?radiation\b|\bradiation\b/ },
        { ko: /측정/, en: /\bmeasurement(?:s)?\b|\bmetrolog(?:y|ical)\b/ },
        { ko: /표준/, en: /\bstandards?\b|\bstandardi[sz](?:e|ed|ation)\b/ },
        { ko: /확립|개발|구축/, en: /\bdevelopment\b|\bestablish(?:ment|ed)?\b|\bbuild(?:ing)?\b/ }
      ];
      var possible = 0, mapped = 0;
      pairs.forEach(function (x) {
        if (x.ko.test(pn)) { possible++; if (x.en.test(ft)) mapped++; }
      });
      return (possible >= 3 && mapped >= 3) ? { how: '과제명 의미 일치', score: mapped } : null;
    };

    if (!page.projects || !page.projects.length) {
      out.push({ group: G, label: '관련과제', a: '(시스템 미등록)', b: allCodes + origin,
        status: (codes.length || meta.fundingText) ? 'info' : 'not_present' });
      return out;
    }

    var used = {};
    page.projects.forEach(function (proj, i) {
      var cn = normalizeHyphen(proj.code || '').toUpperCase();
      var cs = strip(proj.code || '');
      var hit = '', how = '';
      var ei = norm.indexOf(cn);
      if (ei >= 0) { hit = codes[ei]; how = '완전일치'; }
      if (!hit && cs.length >= 6) {
        var si = stripped.indexOf(cs);
        if (si >= 0) { hit = codes[si]; how = '하이픈 차이'; }
      }
      if (!hit) {
        var ns = nsCode(proj.code || '');
        var ni = namespaced.indexOf(ns);
        if (ni >= 0) { hit = codes[ni]; how = 'KRISS 접두어 차이'; }
      }
      if (!hit) {
        var core = coreProject(proj.code || '');
        for (var ci = 0; ci < cores.length; ci++) {
          if (core && core === cores[ci] && nsCode(proj.code || '') !== namespaced[ci]) {
            hit = codes[ci]; how = '세부번호 생략·차이'; break;
          }
        }
      }
      if (!hit && cs.length >= 6) {
        // 연차·세부 접미가 다른 경우(GP2026-0007-02 ↔ GP2026-0007-1) 앞부분 일치 확인
        for (var k = 0; k < stripped.length; k++) {
          var a = stripped[k], bb = cs, minLen = Math.min(a.length, bb.length);
          if (minLen >= 8 && a.substring(0, minLen - 1) === bb.substring(0, minLen - 1)) { hit = codes[k]; how = '접미(연차·세부) 차이'; break; }
        }
      }
      var nameRel = !hit ? projectNameRelation(proj.name || '', meta.fundingText || '') : null;
      var titleMappedCode = (!hit && nameRel && codes.length === 1) ? codes[0] : '';
      if (titleMappedCode) used[titleMappedCode] = true;

      // 완전·부분 일치가 없으면 유사 코드(앞부분 공통, 세부번호 상이)를 찾아 안내한다
      var similar = '';
      if (!hit && cs.length >= 6) {
        var headKey = cs.substring(0, Math.max(6, cs.length - 3));
        for (var s = 0; s < stripped.length; s++) {
          if (stripped[s].indexOf(headKey) >= 0) { similar = codes[s]; break; }
        }
      }
      if (hit) used[hit] = true;
      out.push({
        group: G, label: '과제 ' + (i + 1),
        a: proj.code + (proj.rate ? ' (' + proj.rate + '%)' : ''),
        b: hit ? (hit + ' [' + srcOf(hit) + '·' + how + ']' + origin)
          : (nameRel ? ((titleMappedCode ? titleMappedCode + '(' + srcOf(titleMappedCode) + ') · ' : '') + nameRel.how + origin)
            : ((similar ? '유사 코드: ' + similar + ' (세부번호 상이) · ' : '') + allCodes + origin)),
        status: hit ? ((how === '완전일치' || how === 'KRISS 접두어 차이') ? 'match' : 'partial')
          : (nameRel ? 'partial' : ((codes.length || meta.fundingText) ? 'needs_mapping' : 'not_present')),
        note: hit ? (how !== '완전일치' ? how : '')
          : (nameRel ? (nameRel.how + ' — 시스템 관리번호와 PDF 프로젝트 식별자는 직접 일치하지 않음')
            : (similar ? '유사 코드 ' + similar + ' 확인 필요' : ''))
      });
    });

    var extra = codes.filter(function (c) { return !used[c]; });
    if (extra.length) {
      out.push({
        group: G, label: '첨부 추가 코드', a: '(시스템 미등록)',
        b: extra.map(function (c) { return c + '(' + srcOf(c) + ')'; }).join(', '),
        status: 'info'
      });
    }
    return out;
  }

  // ---------- 저자 대조 ----------
  function compareAuthors(page, meta) {
    var G = '저자';
    var out = [];
    var gAll = (page.authors || []).slice().sort(function (a, b) {
      return (parseInt(a.seqNo, 10) || 999) - (parseInt(b.seqNo, 10) || 999);
    });
    var pAll = meta.authors || [];
    var affKnown = !!(meta.affiliations && meta.affiliations.length);

    var gIn = gAll.filter(function (a) { return a.empCls === 'I'; }).length;
    var gCorr = gAll.filter(function (a) { return a.isCorresponding; });
    var pIn = pAll.filter(function (a) { return a.isKriss; }).length;
    var pCorr = pAll.filter(function (a) { return a.isCorresponding; });

    // 시스템 순위(seqNo)는 논문 내 저자 순번이다. 대규모 공동저자 논문은 시스템에
    // KRISS 관련 저자만 등록되므로(순위 1, 11, 31 …), 배열 순서가 아니라 순위로 매칭한다.
    var seqs = gAll.map(function (a) { return parseInt(a.seqNo, 10); }).filter(function (n) { return !isNaN(n); });
    var maxSeq = seqs.length ? Math.max.apply(null, seqs) : gAll.length;
    var partialReg = maxSeq > gAll.length;   // 일부 저자만 등록된 상태

    // 저자 수 · 내부 인원 · 소속 목록을 한 행으로 통합
    var affList = affKnown
      ? meta.affiliations.map(function (a) { return a.num + '=' + clipText(a.text, 30) + (a.isKRISS ? '[KRISS]' : ''); }).join(' / ')
      : '소속 목록 추출 실패';
    var cntStatus;
    if (partialReg) cntStatus = (maxSeq <= pAll.length) ? 'info' : 'mismatch';
    else if (gAll.length !== pAll.length) cntStatus = 'mismatch';
    else cntStatus = (!affKnown ? 'info' : (gIn === pIn ? 'match' : 'partial'));
    out.push({
      group: G, label: '저자 수',
      a: gAll.length + '명 (내부 ' + gIn + '명, 교신 ' + gCorr.length + '명)' +
        (partialReg ? ' · 등록 순위 ' + seqs.join(',') : ''),
      b: pAll.length + '명 (내부 ' + (affKnown ? pIn + '명' : '판정 불가') + ', 교신 ' + pCorr.length + '명) · 소속: ' + affList,
      status: cntStatus,
      note: partialReg ? '시스템에 일부 저자만 등록됨 — 순위 기준으로 대조'
        : (cntStatus === 'partial' ? '첨부문서 소속 표기와 시스템 고용구분(내부·외부)이 다를 수 있음' : '')
    });

    // 교신저자 명단
    out.push({
      group: G, label: '교신저자',
      a: gCorr.length ? gCorr.map(function (a) { return a.name; }).join(', ') : '없음',
      b: pCorr.length ? pCorr.map(function (a) {
        return a.name + (a.correspondingEmail ? ' <' + a.correspondingEmail + '>' : '');
      }).join(', ') : '표기 없음',
      status: (function () {
        if (!gCorr.length && !pCorr.length) return 'info';
        if (gCorr.length !== pCorr.length) return 'mismatch';
        var ok = gCorr.every(function (ga) { return pCorr.some(function (pa) { return nameLikelySame(ga.name, pa.name); }); });
        return ok ? 'match' : 'mismatch';
      })()
    });

    // KRISS 교신 이메일
    var emails = meta.correspondingEmails || [];
    var krissEmails = emails.filter(function (e) { return /@kriss\.re\.kr$/i.test(e); });
    var gKrissCorr = gCorr.filter(function (a) { return a.empCls === 'I'; });
    out.push({
      group: G, label: 'KRISS 교신이메일',
      a: gKrissCorr.length ? gKrissCorr.map(function (a) { return a.name; }).join(', ') : '없음',
      b: krissEmails.length ? krissEmails.join(', ')
        : (emails.length ? '타기관만: ' + emails.slice(0, 3).join(', ') : '이메일 표기 없음'),
      status: (gKrissCorr.length > 0) === (krissEmails.length > 0) ? 'match' : 'mismatch'
    });

    var empLabel = function (c) { return c === 'I' ? '내부' : '외부'; };
    var affLabel = function (a) {
      if (!a) return '';
      if (a.isKriss) return ' [내부]';
      if (affKnown && a.affNums && a.affNums.length) return ' [외부]';
      return '';
    };
    var mkRow = function (ga, pa, label) {
      var status = 'info', notes = [];
      if (!ga || !pa) status = 'mismatch';
      else {
        var sameName = nameLikelySame(ga.name, pa.name);
        status = sameName ? 'match' : 'mismatch';
        if (sameName && /[가-힣]/.test(ga.name || '')) notes.push('한글 성 ↔ 로마자 성 대응');
        if (ga.isCorresponding !== pa.isCorresponding) { status = 'mismatch'; notes.push('교신 표기 불일치'); }
        if (affKnown && pa.affNums && pa.affNums.length && (ga.empCls === 'I') !== pa.isKriss) {
          // 첨부문서 소속(KRISS 여부)과 시스템 고용구분은 개념이 달라 이름이 맞으면 참고성 부분일치로 둔다.
          if (status === 'match') status = 'partial';
          notes.push('첨부문서 소속과 시스템 고용구분 차이');
        }
      }
      return {
        group: G, label: '저자 ' + label,
        a: ga ? (ga.seqNo + '. ' + ga.name + (ga.isCorresponding ? '*' : '') + ' [' + empLabel(ga.empCls) + (ga.isRegular ? ',정규직' : '') + ']') : '(시스템 미등록)',
        b: pa ? (pa.order + '. ' + pa.name + (pa.isCorresponding ? '*' : '') + affLabel(pa) + (pa.affNums.length ? ' {' + pa.affNums.join(',') + '}' : '')) : '(첨부문서에서 해당 순위 저자 없음)',
        status: status, note: notes.join(' / ')
      };
    };

    var mapped = {};
    gAll.forEach(function (ga) {
      var n = parseInt(ga.seqNo, 10);
      var pa = (!isNaN(n) && n >= 1 && n <= pAll.length) ? pAll[n - 1] : null;
      if (pa) mapped[n - 1] = true;
      out.push(mkRow(ga, pa, ga.seqNo || '?'));
    });
    // 시스템에 없는 PDF 저자는 전원 등록이 원칙인 경우에만 개별 표시한다
    if (!partialReg) {
      pAll.forEach(function (pa, i) { if (!mapped[i]) out.push(mkRow(null, pa, pa.order)); });
    }
    return out;
  }

  // ---------- 대조 실행 ----------
  async function startPaperCompare(urls, fileName) {
    try {
      var r = await loadAttachmentFromLink(urls, fileName, '논문 첨부');
      var meta = KrissPaper.parse(r.pageTexts, { numPages: r.pageCount, kind: r.kind });
      var page = getTetsPageData();
      console.log(TAG, '시스템 저자:', page.authors.map(function (a) {
        return a.seqNo + '.' + a.name + (a.isCorresponding ? '*' : '') + '[' + a.empCls + ']';
      }).join(' | '));

      var checks = [];
      (meta.warnings || []).forEach(function (w) {
        checks.push({ group: '경고', label: '자동 대조 신뢰도', a: '주의', b: w, status: 'not_extracted' });
      });

      KrissPaper.compare(page, meta).forEach(function (row) {
        checks.push({
          group: row.group, label: row.label,
          a: row.sysVal || '(미입력)',
          b: row.status === 'external_required' ? row.note
            : (row.paperVal ? formatEvidence(row.paperVal, row.evidence, row.note) : '(첨부문서에서 추출 안 됨)'),
          status: row.status, note: row.note
        });
      });
      compareFunding(page, meta).forEach(function (c) { checks.push(c); });
      compareAuthors(page, meta).forEach(function (c) { checks.push(c); });

      // 결과표 오른쪽 열 명칭도 실제 첨부 형식으로 맞춘다.
      checks.forEach(function (c) {
        if (!c.tagA) c.tagA = '시스템';
        if (!c.tagB) c.tagB = '첨부 ' + r.kind;
      });

      var ORDER = ['경고', '서지정보', '날짜', '외부확인', 'Funding(관련과제)', '저자'];
      checks = checks.map(function (c, i) { return { c: c, i: i, g: ORDER.indexOf(c.group) }; })
        .sort(function (x, y) {
          var gx = x.g < 0 ? ORDER.length : x.g, gy = y.g < 0 ? ORDER.length : y.g;
          return gx !== gy ? gx - gy : x.i - y.i;
        }).map(function (o) { return o.c; });

      openSplitView({
        title: '논문대조 | ' + (page.bizKey || '') + ' | ' + r.kind + ' | ' + clipText(page.title, 40),
        color: '#BF360C', leftWidth: '55%', doc: r,
        matchSet: buildPaperMatchSet(page, meta),
        rightNode: buildResultPanel({
          color: '#BF360C', groupBg: '#FBE9E7', checks: checks,
          copyHeader: '그룹	항목	시스템값	첨부문서	결과',
          extraButtons: [
            { text: 'Funding 원문 복사', bg: '#FF9800', onClick: function () { copyText(meta.fundingText || '(추출되지 않음)'); } },
            { text: '추출 근거 콘솔 출력', bg: '#607D8B', onClick: function () { KrissPaper.selfTest(r.pageTexts, { numPages: r.pageCount, kind: r.kind }); } }
          ]
        })
      });
    } catch (e) {
      console.error(TAG, '논문 대조 실패:', e);
      showMsg('논문 대조 실패: ' + e.message);
    }
  }

  window.KrissTets = {
    version: VER, panic: panic, setup: showSetupDialog,
    parser: function () { return KrissPaper; },
    dump: function () { return getTetsPageData(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();