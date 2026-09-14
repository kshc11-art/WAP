import importlib.util, pathlib, re, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('guard',ROOT/'tools/guard.py')
g=importlib.util.module_from_spec(s);s.loader.exec_module(g)

class GuardTests(unittest.TestCase):
    def test_empty_is_not_pass(self):self.assertEqual(g.main([]),2)
    def test_fingerprint_counts_values(self):
        rx=re.compile(r'TEST\d+')
        self.assertEqual(g.fingerprint(rx,'TEST1 TEST2'),g.fingerprint(rx,'TEST2 TEST1'))
        self.assertNotEqual(g.fingerprint(rx,'TEST1'),g.fingerprint(rx,'TEST1 TEST1'))
        self.assertNotEqual(g.fingerprint(rx,'TEST1'),g.fingerprint(rx,'TEST2'))
    def test_credentials_cannot_be_business_baseline(self):
        for level,rx,desc in g.load_rules():
            if '토큰' in desc or '비밀번호' in desc or '세션' in desc:
                self.assertNotIn(desc,g.BUSINESS)

if __name__=='__main__':unittest.main()
