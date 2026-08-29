# python

엑셀·데이터 처리 자동화를 둡니다.

## 규칙

- 처음에는 **파일을 평평하게** 둡니다. `python/특허통계.py` 처럼.
- 한 프로그램이 여러 파일로 나뉘어 서로 import하기 시작하면 **그 프로그램만** 폴더로 승격합니다.
  ```
  python/
  ├─ 특허통계.py
  ├─ 엑셀대조.py
  └─ annual_fee/        ← 커져서 승격된 것만
     ├─ main.py
     ├─ excel.py
     └─ matcher.py
  ```
- 폴더를 미리 만들지 않습니다.

## 사내 시스템 접근

**Python이 사내 시스템에 직접 로그인하지 않습니다.** 인증은 브라우저(Tampermonkey) 세션에 맡깁니다.

```
Tampermonkey → 사내 API 조회 → 표준 JSON 파일로 내보내기
                                        ↓
                          Python이 그 JSON + 기존 Excel을 읽어 처리
```

이렇게 하면 세션·인증 문제를 Python 쪽으로 가져오지 않아도 됩니다.
localhost 서버로 직접 연결하는 방식은 회사 보안정책상 허용이 확인된 뒤에 검토합니다.

## 실행 결과물

생성된 Excel·CSV는 `.gitignore` 대상입니다. 저장소에 커밋하지 않습니다.
