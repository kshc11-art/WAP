# python/

엑셀·데이터 처리 자동화. **이 저장소에서 아직 비어 있는 절반이다.**

실측상 Tampermonkey 쪽에는 이미 Python과 주고받는 계약이 구현되어 매일 돌고 있는데
(`annualfee-expense`의 결과 폴더·manifest·localhost 브리지),
**그 상대편인 생산자 코드가 저장소에 없다.** 여기가 그 자리다.

```
python/
├─ bridge/     manifest.json 생산자 + 로컬 브리지 참조 구현
└─ reports/    xlsx 생성 · 연도별 보고서 · 적요 분류
```

## 데이터 흐름 — Python이 만들고 Tampermonkey가 읽는다

```
Python  →  <결과폴더>/템퍼몽키용/manifest.json + 첨부파일
                    ↓  (File System Access API)
        Tampermonkey  →  포털 화면에 입력
```

반대 방향(웹이 조회한 원자료를 Python이 받아 가공)도 같은 폴더 규약을 쓴다.
**새 통신 방식을 만들지 않는다.** 스키마의 유일한 원본은 `contracts/bridge/manifest.schema.json`이다.

| 등급 | 방식 |
|---|---|
| 1순위 | 결과 폴더 경유 (서버 없음) |
| 2순위 | 다운로드 폴더에 놓고 읽기 |
| 3순위 | localhost 브리지 (`127.0.0.1:8765`) — 기존 것은 유지, **신규 확장만 사전 확인** |

## 어디까지 Python이 하는가

| 웹에서 | Python에서 |
|---|---|
| 한 화면·한 API 집계, 건수·합계·D-day | 여러 소스 매칭, 퍼지 매칭, 다중 시트 |
| 목록 표시, CSV·클립보드 내보내기 | 비용 대사, 보고서, **서식 있는 xlsx 생성** |

**xlsx는 Python이 만든다.** 브라우저에서 굽지 않는다 — 그것이 외부 CDN 의존을 만든 원인이다.
분류 규칙은 `rules/*.json` 한 벌을 JS와 함께 읽는다. Python 쪽에 따로 두지 않는다.

## 규칙

- Python이 사내 시스템에 직접 로그인하지 않는다. 인증은 브라우저 세션에 맡긴다.
- 파일은 평평하게 둔다. 한 프로그램이 여러 파일로 커지면 **그것만** 폴더로 승격한다.
- 생성된 Excel·CSV는 `.gitignore` 대상이다.
