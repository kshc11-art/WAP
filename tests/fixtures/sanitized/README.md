# sanitized fixtures

**익명화된 샘플 데이터만** 둡니다. 실제 응답을 그대로 저장하지 않습니다.

## 익명화 규칙

| 실제 | fixture |
|---|---|
| 관리번호 (대문자1+숫자6+국가코드2) | `TEST0001KR` |
| 실명 | `USER_A` |
| 사번 | `EMP001` |
| 요청번호 | `REQ001` |
| 금액 | 임의 값 |
| 날짜 | 유지 가능 (개인 식별과 무관할 때) |
| 부서·조직명 | `DEPT_A` |

**필드 이름과 자료 구조는 실제와 같게 유지**해야 테스트가 의미 있습니다.
바꾸는 것은 값뿐입니다.

## 예

`task_list.sample.json`
```json
{
  "list": [
    { "intellMngNo": "TEST0001KR", "rqstNo": "REQ001", "apvStat": "04", "cmplNeedDt": "20260910" },
    { "intellMngNo": "TEST0002KR", "rqstNo": "REQ002", "apvStat": "01", "cmplNeedDt": "" }
  ]
}
```

빈 값, `null`, 빈 배열, 예상치 못한 상태 코드 같은 **비정상 케이스를 반드시 포함**하세요.
그런 입력에서 조용히 종료되는지가 이 저장소에서 가장 중요한 테스트입니다.
