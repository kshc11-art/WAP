from pathlib import Path
import json, subprocess, sys
ROOT=Path(__file__).resolve().parent
def main():
    failed=False
    for args in ([sys.executable,'-X','utf8',str(ROOT/'diagnose_holdings.py')],['node',str(ROOT/'diagnose_response.cjs')]):
        try:
            r=subprocess.run(args,cwd=ROOT.parent,check=False)
            failed=failed or r.returncode!=0
        except OSError as e:
            print('Diagnostic tool unavailable:',e);failed=True
    print('Diagnostics incomplete/known failures remain' if failed else 'All synthetic diagnostic cases passed; business data comparison still separate')
    return 1 if failed else 0
if __name__=='__main__':sys.exit(main())
