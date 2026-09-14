# 검증 자료와 사용법

현재 raw/golden은 미제공이다. ZIP에 있던 과거 산출물과 검증 결과를 이번 golden으로 채택하지 않았다.

```text
validation/
  catalog.json       프로그램/파일 출처와 현재 기준 해시
  cases.json         프로그램별 입력·기대결과·비교 규칙
  raw/<id>/         원본 입력, 수정하지 않음 (로컬)
  golden/<id>/      사용자가 지정한 기대 결과 (로컬)
  actual/<id>/      프로그램이 새로 만든 결과 (로컬)
  reports/<id>.json 비교 보고서 (로컬)
```

1. `python validation/run.py status` 또는 루트 `verify.cmd`: 준비 상태 확인.
2. 나중에 raw/golden을 받으면 프로그램과 기준기간에 맞춰 폴더에 넣고 cases.json을 채운다. 각 raw 파일의 SHA-256과 golden 파일의 SHA-256을 등록한다.
3. 대상 프로그램을 별도로 실행해 actual/<id>에 결과를 저장한다. 현재 도구는 프로그램 실행이나 Office 조작을 자동화하지 않는다.
4. `python validation/run.py compare patent-holdings`: 등록된 출력 전체를 비교한다.

준비된 케이스 형식 예시(설명용, 실제 자료가 아님):

```json
{
  "id": "patent-holdings", "status": "ready", "period": "사용자 확정 기준기간",
  "raw": [{"path": "input.xlsx", "sha256": "실제 파일 SHA256"}],
  "comparisons": [{"path": "report.xlsx", "golden_sha256": "기준 파일 SHA256",
    "sheets": {"분류": {"header_row": 1, "keys": ["관리번호"]}, "총괄표": {}}}]
}
```

CSV/TSV: 열 이름·값을 비교한다. `keys`가 있으면 키별 비교로 행 순서만 무시하며 빈/중복 키는 오류다. 키가 없으면 순서까지 비교한다. 인코딩은 기본 utf-8-sig이며 필요하면 encoding을 명시한다.

JSON: 구조·타입·값을 비교하고 중복 객체 키를 거부한다. 객체 배열에 keys를 지정할 수 있다.

XLSX: 모든 시트·시트 순서·셀 값을 비교한다. sheets를 지정하면 실제 모든 시트를 포함해야 한다. 키 설정된 시트만 키별 비교한다. 누락된 수식 캐시나 오류 셀은 실패한다. 스타일·인쇄 배치·수식 문자열의 동일성은 검사하지 않으므로 실제 Office 출력 검증과 구분한다.

그 밖의 파일은 SHA-256 바이트 일치 비교다. PDF/HWP의 내용·레이아웃 비교 기능은 아니다.

raw/golden 해시 불일치, 등록하지 않은 추가 출력, 키 중복은 오류다. 숫자는 허용 오차 없이 비교하며 텍스트의 공백·앞자리 0은 자동 제거하지 않는다. 결과 로그는 로컬에만 생성한다.

종료코드: status는 실행 결과를 검사하지 않아 항상 2다. compare 종료코드는 0=실제 비교 통과, 1=불일치 또는 입력 오류, 2=자료 준비 대기. 구조/테스트 CI 통과와 업무 통계 검증 통과는 별개다.

`python validation/diagnostics.py`: 초기 합성 28사례 진단. 현재 알려진 8개 불일치(5유형)를 재현한다. 이는 실제 자료의 오류율을 뜻하지 않는다. 순수 함수/응답 함수만 테스트하며 서버·Office·업무 원본을 실행하지 않는다.
