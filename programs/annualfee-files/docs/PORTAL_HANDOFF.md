# 포털 자동화 연결 상태 — v0.6.3

실제 KRISS MIS 신규/완료 발의 DOM과 전자세금계산서 조회 DOM을 확보했으므로 v0.3의 "selector skeleton" 단계는 종료되었다.

현재 대상:

```text
https://krisstar.kriss.re.kr/mis/acc/popup/S_ACC_01020100.do?popupAt=popup
```

## 구현됨

- `특허 출원/등록/연차료` Kendo 선택
- 예산코드 입력 후 portal lookup 대기/검증
- 비목 `55630 / 지식재산권출원등록비` 입력/검증
- 금액/적요 입력
- 연차 원금 및 송금수수료: `기타(10) / VAT 없음(9) / 계좌입금(1)`
- Markpro 상호/사업자번호/거래처코드/은행/계좌 입력
- 국내/해외 마크프로 납부수수료: `전자세금계산서(14)` 조회창 연결
- 전자세금계산서 공급자 + 품명 + 예상총액 후보 추천
- 정확히 1건이면 체크/강조, 승인번호를 사람이 확인
- 예산별 PDF/XLSX 첨부 queue 로직
- 공식 `행추가` 버튼 사용 및 grid 증가 확인
- 저장 후 발의번호를 bridge manifest에 completed로 기록

## 안전 기본값

- 최종 portal `저장`: 수동
- 전자세금계산서 popup `선택`: 수동
- 후보 복수: 자동선택 금지
- e-tax 총액 불일치: 중단

## 아직 LIVE 확인이 필요한 두 핵심

1. `kriss.ui.uploader`/Dropzone에 File 두 개를 programmatic queue한 뒤 **실제 저장 후 첨부가 남는지**
2. 실제 Kendo build에서 receipt `select` event emulation이 **전자세금계산서 popup을 정확히 한 번** 여는지

전체 selector/event 계약과 장애대응은 `PORTAL_AUTOMATION_SPEC.md`를 먼저 읽는다.

기계판독 facts: `PORTAL_DOM_FACTS.json`

snapshot 검증: `PORTAL_SNAPSHOT_VALIDATION_2026-08-14.json`
