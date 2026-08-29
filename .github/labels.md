# Label

10개면 충분합니다. 늘리지 마세요.

| Label | 색 | 용도 |
|---|---|---|
| `tampermonkey` | `#1d76db` | 브라우저 스크립트 |
| `python` | `#0e8a16` | Python 자동화 |
| `dashboard` | `#5319e7` | 대시보드 |
| `ipms` | `#5319e7` | IPMS 관련 |
| `mail` | `#5319e7` | 메일 관련 |
| `excel` | `#5319e7` | 엑셀 처리 |
| `stats` | `#5319e7` | 통계/추출 |
| `feature` | `#a2eeef` | 새 기능·개선 |
| `bug` | `#d73a4a` | 오류 |
| `refactor` | `#fef2c0` | 동작 변경 없는 정리 |
| `needs-internal-test` | `#e99695` | **AI 작업 끝, 내부망 확인만 남음** |
| `security-sensitive` | `#b60205` | 반출 판단이 필요한 내용 포함 |

## 한 번에 만들기

GitHub CLI(`gh`)가 설치돼 있으면:

```bash
gh label create tampermonkey        --color 1d76db --description "브라우저 스크립트" --force
gh label create python              --color 0e8a16 --description "Python 자동화" --force
gh label create dashboard           --color 5319e7 --force
gh label create ipms                --color 5319e7 --force
gh label create mail                --color 5319e7 --force
gh label create excel               --color 5319e7 --force
gh label create stats               --color 5319e7 --force
gh label create feature             --color a2eeef --force
gh label create bug                 --color d73a4a --force
gh label create refactor            --color fef2c0 --force
gh label create needs-internal-test --color e99695 --description "내부망 실제 확인 필요" --force
gh label create security-sensitive  --color b60205 --description "반출 판단 필요" --force
```

없으면 GitHub 웹 → Issues → Labels 에서 직접 만들어도 5분이면 됩니다.
