from __future__ import annotations

import argparse
import json
from pathlib import Path

from kriss_annual_fee.bridge import BridgeServer
from kriss_annual_fee.workflow import automation_dir_for, finalize, preflight, prepare


def main():
    p = argparse.ArgumentParser(description="KRISS 연차유지료 파일/포털 자동화")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="파일 생성 없이 매핑/합계 사전검사")
    c.add_argument("--input", required=True, type=Path)
    c.add_argument("--history", type=Path, default=None)
    c.add_argument("--budget-master", type=Path, default=None, help="사용자 확정 예산 master XLSX 파일 또는 폴더(외부 확정/사후 예산변경 반영)")

    a = sub.add_parser("prepare", help="청구/조사 파일을 읽어 PDF/XLSX/폴더/manifest 생성")
    a.add_argument("--input", required=True, type=Path, help="이번 분기 6개 파일이 있는 폴더")
    a.add_argument("--history", type=Path, default=None, help="과거 분기 조사 XLSX 폴더(재귀 탐색)")
    a.add_argument("--output", required=True, type=Path, help="작업 결과 상위 폴더")
    a.add_argument("--allow-missing", action="store_true", help="조사파일 어디에도 없는 매핑 누락이 있어도 부분 산출(권장하지 않음)")
    a.add_argument("--allow-unassigned", action="store_true", help="조사파일에는 있으나 예산이 빈 보류 건을 제외하고 부분 산출")
    a.add_argument("--profile", choices=["q2-current", "q1-legacy"], default="q2-current")
    a.add_argument("--budget-master", type=Path, default=None, help="사용자 확정 예산 master XLSX 파일 또는 폴더(외부 확정/사후 예산변경 반영)")
    a.add_argument("--excel-backend", choices=["auto", "native", "portable-legacy"], default="auto",
                   help="업무 XLSX 출력 엔진. auto/native는 Windows Microsoft Excel을 사용하며 자동 fallback하지 않음")
    a.add_argument("--excel-visible", action="store_true", help="Excel Native 처리 중 Excel 창을 표시(문제 진단용)")
    a.add_argument("--no-excel-reopen-validation", action="store_true", help="저장 후 Excel 자체 재오픈 검증 생략(권장하지 않음)")

    s = sub.add_parser("serve", help="Tampermonkey용 localhost bridge 실행")
    s.add_argument("--run", required=True, type=Path, help="prepare가 만든 run 폴더")
    s.add_argument("--port", type=int, default=8765)

    f = sub.add_parser("finalize", help="포털 완료상태를 반영하여 _(완료) 폴더명 + 최종 ZIP 생성")
    f.add_argument("--run", required=True, type=Path)
    f.add_argument("--zip", type=Path, default=None)

    args = p.parse_args()
    if args.cmd == "check":
        print(json.dumps(preflight(args.input, args.history, args.budget_master), ensure_ascii=False, indent=2))
    elif args.cmd == "prepare":
        def progress(stage: str, pct: int, detail: str):
            print(f"[{pct:3d}%] {stage}: {detail}")
        run_dir = prepare(
            args.input, args.output, args.history,
            allow_missing=args.allow_missing,
            allow_unassigned=args.allow_unassigned,
            budget_master=args.budget_master,
            profile=args.profile,
            excel_backend=args.excel_backend,
            excel_visible=args.excel_visible,
            excel_validate_reopen=not args.no_excel_reopen_validation,
            progress=progress,
        )
        print(f"완료: {run_dir}")
        print(f"검증: {automation_dir_for(run_dir) / 'validation.json'}")
        print(f"Manifest: {automation_dir_for(run_dir) / 'manifest.json'}")
    elif args.cmd == "serve":
        BridgeServer(args.run, port=args.port).serve()
    elif args.cmd == "finalize":
        z = finalize(args.run, args.zip)
        print(f"ZIP: {z}")


if __name__ == "__main__":
    main()
