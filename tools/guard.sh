#!/usr/bin/env bash
# 업무 데이터·인증정보가 저장소에 들어가는 것을 막는 가드.
#
#   tools/guard.sh <파일...>     지정한 파일 검사
#   tools/guard.sh --all         추적 중인 전체 파일 검사
#
# .gitignore가 1차 방어선이고, 이 스크립트는 `git add -f` 등으로 뚫렸을 때의 2차 방어선입니다.
# 오탐이면 커밋 시 --no-verify 로 넘길 수 있지만, 넘기기 전에 정말 괜찮은지 확인하세요.

set -uo pipefail

FAIL=0

# 내용 검사에서 제외 (가드 자신과 규칙 문서는 패턴 문자열을 포함할 수 있음)
skip_scan() {
  case "$1" in
    tools/*|.githooks/*|.github/workflows/*) return 0 ;;
    *) return 1 ;;
  esac
}

# 1) 확장자로 차단 — 업무 산출물 / 캡처 / 압축본
BLOCKED_EXT='xlsx|xlsm|xlsb|xls|csv|tsv|har|zip|7z|rar|hwp|hwpx|msg|eml|pcap|pdf'
# 2) 파일명으로 차단 — 자격증명
BLOCKED_NAME='(^|/)(\.env($|\..*)|id_rsa.*|.*\.(pem|key|p12|pfx|jks))$'

# 3) 내용으로 차단 — 인증정보 / 개인정보
declare -a PATTERNS=(
  '(Bearer|Basic)[[:space:]]+[A-Za-z0-9._~+/=-]{16,}'
  '[Ss]et-[Cc]ookie[[:space:]]*:'
  'JSESSIONID[[:space:]]*=[[:space:]]*[A-Za-z0-9]{8,}'
  '(sk-ant-|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{16,}'
  'AKIA[0-9A-Z]{16}'
  '(password|passwd|pwd)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{4,}["'"'"']'
  '[0-9]{6}-[1-4][0-9]{6}'
)
declare -a REASONS=(
  '인증 헤더로 보이는 값'
  '쿠키 헤더'
  '세션 ID'
  'API 키/토큰'
  'AWS 액세스 키'
  '하드코딩된 비밀번호'
  '주민등록번호 형식'
)

if [ "${1:-}" = "--all" ]; then
  mapfile -t FILES < <(git ls-files)
else
  FILES=("$@")
fi

for f in "${FILES[@]:-}"; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue

  if [[ "$f" =~ \.($BLOCKED_EXT)$ ]]; then
    echo "차단  $f"
    echo "      업무 산출물/캡처/압축 파일은 커밋하지 않습니다. 필요하면 익명화해서"
    echo "      tests/fixtures/sanitized/ 에 넣으세요."
    FAIL=1
    continue
  fi

  if [[ "$f" =~ $BLOCKED_NAME ]]; then
    echo "차단  $f"
    echo "      자격증명 파일로 보입니다."
    FAIL=1
    continue
  fi

  skip_scan "$f" && continue

  for i in "${!PATTERNS[@]}"; do
    if hit=$(grep -InE -m1 "${PATTERNS[$i]}" "$f" 2>/dev/null); then
      echo "차단  $f:${hit%%:*}"
      echo "      ${REASONS[$i]}이(가) 포함된 것 같습니다."
      FAIL=1
    fi
  done
done

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "→ ENGINEERING_RULES.md §1 (절대 commit 금지) 확인"
  echo "→ 오탐이 확실하면: git commit --no-verify"
fi

exit $FAIL
