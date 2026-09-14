"""Exercise the userscript handoff block alone; never invoke the business workflow."""
import ast, shutil, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'programs/annualfee-files/kriss_annual_fee/workflow.py'
tree=ast.parse(SOURCE.read_bytes())
prepare=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='prepare')
start=next(i for i,n in enumerate(prepare.body) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='package_root' for t in n.targets))
block=compile(ast.Module(body=prepare.body[start:start+4],type_ignores=[]),str(SOURCE),'exec')

class PackagingTests(unittest.TestCase):
    def test_repository_and_legacy_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp);package=r/'programs/annualfee-files'
            module=package/'kriss_annual_fee/workflow.py';module.parent.mkdir(parents=True)
            canonical=r/'scripts/annualfee-expense.user.js';canonical.parent.mkdir()
            canonical.write_text('// synthetic current source')
            legacy=package/'tampermonkey/kriss_portal_automation.user.js';legacy.parent.mkdir()
            legacy.write_text('// synthetic legacy source')
            out=r/'out';out.mkdir()
            def execute():
                exec(block,{'Path':Path,'__file__':str(module),'auto_dir':out,'copy_file':shutil.copyfile})
                return (out/'kriss_portal_automation.user.js').read_text()
            self.assertEqual(execute(),canonical.read_text())
            canonical.unlink()
            self.assertEqual(execute(),legacy.read_text())
    def test_canonical_source_exists(self):
        self.assertTrue((SOURCE.parents[3]/'scripts/annualfee-expense.user.js').is_file())

if __name__=='__main__':unittest.main()
