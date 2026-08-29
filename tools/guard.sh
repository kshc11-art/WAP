#!/usr/bin/env bash
# tools/guard.py 의 래퍼. 실제 검사 로직은 전부 guard.py 에 있다.
#
#   tools/guard.sh <파일...>   지정한 파일 검사
#   tools/guard.sh --all       추적 중인 전체 파일 검사
#
# python3 가 없으면 "검사를 건너뛰고 통과"시키지 않는다. 그것이 이 가드가
# 이 저장소에서 한 번 무력화됐던 이유다. 없으면 실패한다.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 를 찾을 수 없어 보안 검사를 수행할 수 없습니다." >&2
  echo "검사를 건너뛰는 것은 통과가 아닙니다. python3 를 설치하거나," >&2
  echo "이 커밋이 안전하다고 직접 확인했다면 git commit --no-verify 를 쓰세요." >&2
  exit 2
fi

exec python3 "$ROOT/tools/guard.py" "$@"
