#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
special_patents_history.py  v1.0  (2026-07-15)

특허 연차유지 조사도구(patent_annuity_tool)의 검토 리포트에서 '특별관리 대상' 특허를
추출하여 분기별 히스토리를 누적 관리한다. **내부망(오프라인) 전용 설계**:
파이썬 표준 라이브러리만 사용한다(openpyxl/pandas 등 외부 패키지 불필요).

■ 사용법 (분기마다 1회)
    python special_patents_history.py 2026Q3_review_report.xlsx
    python special_patents_history.py 2026Q1_review_report.xlsx 2026Q2_*.xlsx   # 복수/와일드카드 가능
    python special_patents_history.py --show P160119FI                          # 특정 특허 타임라인 조회
    python special_patents_history.py 2026Q4_review_report.xlsx --dry-run       # 쓰기 없이 결과만 확인

■ 파일 (스크립트와 같은 폴더, 경로는 옵션으로 변경 가능)
  - special_patents_history.csv    : 누적 히스토리(본 스크립트가 생성·갱신). UTF-8(BOM) → 엑셀에서 바로 열림
  - special_patents_history.csv.bak: 직전 버전 자동 백업(갱신 직전 1회 복사)
  - special_patents_watchlist.csv  : 수동 지정 목록(담당자가 직접 편집). 열: 관리번호,지정사유,메모,등록일

■ 특별관리 판정 규칙 (아래 4개 중 하나라도 해당하면 그 분기 히스토리에 기록)
  1) 수동지정      : watchlist에 관리번호 존재
  2) 기업납부유지  : 분류가 '조사대상 아님(기업납부...)' — 기업이 유지해야 하는 건, 포기여부 감시 필요
  3) 패밀리유지주의: 리포트 사유가 '패밀리 유지주의'로 시작 — 패밀리 내 진행중 계약 존재, 포기 주의
  4) 예외적용      : 리포트 사유가 '예외 목록 적용'으로 시작 — 담당자 재량으로 분류를 강제한 건

■ 갱신 규칙 (무결성)
  - 키 = (관리번호, 분기). 같은 분기를 다시 넣으면 중복 없이 해당 행을 '갱신'한다(멱등).
  - 쓰기 전 기존 파일을 .bak 로 백업. 정렬: 관리번호 → 분기.

■ 입력 리포트 의존 구조 (도구 v1.4 / 엔진 v1.3 기준 — 명세서 §5.3, §12 참조)
  - '0.실행정보'      : A열 항목명 / B열 값. '분기 라벨', '도구 버전' 사용
  - '1.구분값(시트2)' : 1행 헤더. '고객관리번호','3.연차료 납부 조사 대상','4.등록 후 연차',
                        '국가','납부기한일','발명의명칭' 열을 **헤더 이름으로** 탐색(열 위치 변경에 견딤)
  - '2.검토필요'      : 1행 헤더. '고객관리번호','사유' 열 사용
  - '3.스마트등급'    : (있을 때만) '관리번호' 헤더 행 아래에서 관리번호(1열)·스마트등급(6열)

유지보수 메모(다른 AI/개발자용): xlsx는 ZIP+XML이므로 zipfile+ElementTree로 직접 읽는다.
지원 범위는 '본 도구가 ExcelJS로 생성한 리포트'로 한정한다(sharedStrings/inlineStr/숫자/수식결과).
날짜 셀은 도구가 문자열로 기록하므로 시리얼 변환이 필요 없다. 임의의 외부 엑셀 파일 범용 리더가 아니다.
"""

import argparse
import csv
import datetime
import glob
import os
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET

# ------------------------------------------------------------------ 상수/기본값
NS_MAIN = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'
NS_ODOC = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

DEFAULT_HISTORY = 'special_patents_history.csv'
DEFAULT_WATCHLIST = 'special_patents_watchlist.csv'

HISTORY_HEADER = ['관리번호', '분기', '분류', '등록후연차', '국가', '납부기한일',
                  '스마트등급', '특별관리사유', '지정메모', '검토사유', '발명의명칭',
                  '기록일시', '도구버전']

SHEET_INFO = '0.실행정보'
SHEET_S2 = '1.구분값(시트2)'
SHEET_REVIEW = '2.검토필요'
SHEET_GRADE = '3.스마트등급'

TAG_MANUAL = '수동지정'
TAG_CORP = '기업납부유지'
TAG_FAMILY = '패밀리유지주의'
TAG_EXCEPTION = '예외적용'

REASON_FAMILY_PREFIX = '패밀리 유지주의'
REASON_EXCEPTION_PREFIX = '예외 목록 적용'
F_CORP_KEYWORD = '조사대상 아님'


# ------------------------------------------------------------------ 최소 xlsx 리더 (표준 라이브러리)
def _col_ref_to_idx(ref):
    """'BC12' → 열 번호 55 (1-기준). 행 숫자는 무시."""
    n = 0
    for ch in ref:
        if ch.isdigit():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n


def read_xlsx(path):
    """xlsx → {시트명: {행번호(int): {열번호(int): 문자열값}}}.
    ExcelJS 산출물 기준: sharedStrings / inlineStr / 숫자 / 수식결과(t="str") 지원."""
    z = zipfile.ZipFile(path)
    names = set(z.namelist())

    shared = []
    if 'xl/sharedStrings.xml' in names:
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall(NS_MAIN + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS_MAIN + 't')))

    # 시트명 → 파일 경로 (workbook.xml의 r:id ↔ rels의 Target)
    wb_root = ET.fromstring(z.read('xl/workbook.xml'))
    rels_root = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid_to_target = {r.get('Id'): r.get('Target') for r in rels_root.findall(NS_REL + 'Relationship')}
    sheet_files = {}
    for sh in wb_root.find(NS_MAIN + 'sheets').findall(NS_MAIN + 'sheet'):
        target = rid_to_target.get(sh.get(NS_ODOC + 'id'), '')
        if target.startswith('/'):
            target = target.lstrip('/')
        elif not target.startswith('xl/'):
            target = 'xl/' + target
        sheet_files[sh.get('name')] = target

    def cell_value(c):
        t = c.get('t')
        v = c.find(NS_MAIN + 'v')
        if t == 's':
            return shared[int(v.text)] if v is not None and v.text is not None else ''
        if t == 'inlineStr':
            is_el = c.find(NS_MAIN + 'is')
            return ''.join(tt.text or '' for tt in is_el.iter(NS_MAIN + 't')) if is_el is not None else ''
        if v is not None and v.text is not None:
            return v.text  # 숫자·수식결과(t="str")·불리언은 원문 문자열 그대로
        return ''

    book = {}
    for name, target in sheet_files.items():
        if target not in names:
            continue
        root = ET.fromstring(z.read(target))
        rows = {}
        for row in root.iter(NS_MAIN + 'row'):
            r = int(row.get('r'))
            cells = {}
            for c in row.findall(NS_MAIN + 'c'):
                idx = _col_ref_to_idx(c.get('r', ''))
                if idx:
                    cells[idx] = (cell_value(c) or '').strip()
            if cells:
                rows[r] = cells
        book[name] = rows
    return book


def sheet_cell(rows, r, c):
    return rows.get(r, {}).get(c, '')


def header_map(rows, header_row=1):
    """헤더 행의 '이름(개행·공백 정리) → 열번호' 매핑."""
    out = {}
    for c, v in rows.get(header_row, {}).items():
        key = ' '.join(v.split())
        if key and key not in out:
            out[key] = c
    return out


def find_header_col(hmap, exact, contains=None):
    if exact in hmap:
        return hmap[exact]
    if contains:
        for k, c in hmap.items():
            if contains in k:
                return c
    return None


# ------------------------------------------------------------------ 리포트 파싱
def parse_report(path):
    """검토 리포트 1개 → (분기, 도구버전, 행목록[dict], 사유맵, 등급맵)"""
    book = read_xlsx(path)
    for required in (SHEET_INFO, SHEET_S2, SHEET_REVIEW):
        if required not in book:
            raise ValueError('%s: 필수 시트 없음 [%s] — 검토 리포트 파일이 맞는지 확인' % (path, required))

    info = {}
    for r in sorted(book[SHEET_INFO]):
        k = sheet_cell(book[SHEET_INFO], r, 1)
        if k:
            info[k] = sheet_cell(book[SHEET_INFO], r, 2)
    quarter = info.get('분기 라벨', '').strip()
    toolver = info.get('도구 버전', '').strip()
    if not quarter:
        raise ValueError('%s: 실행정보에 분기 라벨 없음' % path)

    s2 = book[SHEET_S2]
    h = header_map(s2)
    c_mgmt = find_header_col(h, '고객관리번호', '고객관리번호')
    c_f = find_header_col(h, '3.연차료 납부 조사 대상', '조사 대상')
    c_g = find_header_col(h, '4.등록 후 연차', '등록 후 연차')
    c_cc = find_header_col(h, '국가', '국가')
    c_due = find_header_col(h, '납부기한일', '납부기한')
    c_title = find_header_col(h, '발명의명칭', '발명의명칭')
    if not (c_mgmt and c_f):
        raise ValueError('%s: 구분값 시트에서 고객관리번호/조사대상 열을 찾지 못함' % path)
    rows = []
    for r in sorted(s2):
        if r == 1:
            continue
        mgmt = sheet_cell(s2, r, c_mgmt)
        if not mgmt:
            continue
        rows.append({
            'mgmt': mgmt,
            'F': sheet_cell(s2, r, c_f),
            'G': sheet_cell(s2, r, c_g) if c_g else '',
            'cc': sheet_cell(s2, r, c_cc) if c_cc else '',
            'due': sheet_cell(s2, r, c_due) if c_due else '',
            'title': sheet_cell(s2, r, c_title) if c_title else '',
        })

    rv = book[SHEET_REVIEW]
    hv = header_map(rv)
    c_rm = find_header_col(hv, '고객관리번호', '관리번호') or 2
    c_reason = find_header_col(hv, '사유', '사유') or 5
    reasons = {}
    for r in sorted(rv):
        if r == 1:
            continue
        mg = sheet_cell(rv, r, c_rm)
        rs = sheet_cell(rv, r, c_reason)
        if mg and rs:
            reasons.setdefault(mg, []).append(rs)

    grades = {}
    if SHEET_GRADE in book:
        gs = book[SHEET_GRADE]
        hdr_row = None
        for r in sorted(gs):
            if sheet_cell(gs, r, 1) == '관리번호':
                hdr_row = r
                break
        if hdr_row:
            for r in sorted(gs):
                if r <= hdr_row:
                    continue
                mg = sheet_cell(gs, r, 1)
                if mg and mg != '':
                    g = sheet_cell(gs, r, 6)
                    if g and g != '(미매칭)':
                        grades[mg] = g

    return quarter, toolver, rows, reasons, grades


# ------------------------------------------------------------------ 특별관리 판정
def load_watchlist(path):
    watch = {}
    if not os.path.exists(path):
        return watch
    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            mg = (row.get('관리번호') or '').strip()
            if mg:
                watch[mg] = {'reason': (row.get('지정사유') or '').strip(),
                             'memo': (row.get('메모') or '').strip()}
    return watch


def decide_special(row, row_reasons, watch):
    """(태그목록, 지정메모) 반환. 태그가 비어있으면 특별관리 대상 아님."""
    tags, memo = [], ''
    if row['mgmt'] in watch:
        tags.append(TAG_MANUAL)
        w = watch[row['mgmt']]
        memo = (w['reason'] + (' — ' + w['memo'] if w['memo'] else '')).strip(' —')
    if F_CORP_KEYWORD in row['F']:
        tags.append(TAG_CORP)
    if any(r.startswith(REASON_FAMILY_PREFIX) for r in row_reasons):
        tags.append(TAG_FAMILY)
    if any(r.startswith(REASON_EXCEPTION_PREFIX) for r in row_reasons):
        tags.append(TAG_EXCEPTION)
    return tags, memo


# ------------------------------------------------------------------ 히스토리 입출력
def load_history(path):
    records = {}
    if not os.path.exists(path):
        return records
    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            key = ((row.get('관리번호') or '').strip(), (row.get('분기') or '').strip())
            if key[0] and key[1]:
                records[key] = {k: (row.get(k) or '') for k in HISTORY_HEADER}
    return records


def save_history(path, records):
    if os.path.exists(path):
        shutil.copy2(path, path + '.bak')  # 갱신 직전 1회 백업
    rows = sorted(records.values(), key=lambda x: (x['관리번호'], x['분기']))
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=HISTORY_HEADER)
        w.writeheader()
        w.writerows(rows)


# ------------------------------------------------------------------ 메인 처리
def process_report(path, records, watch):
    quarter, toolver, rows, reasons, grades = parse_report(path)
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    added, updated, tag_count = 0, 0, {}
    for row in rows:
        rr = reasons.get(row['mgmt'], [])
        tags, memo = decide_special(row, rr, watch)
        if not tags:
            continue
        for t in tags:
            tag_count[t] = tag_count.get(t, 0) + 1
        key = (row['mgmt'], quarter)
        rec = {
            '관리번호': row['mgmt'], '분기': quarter, '분류': row['F'],
            '등록후연차': row['G'], '국가': row['cc'], '납부기한일': row['due'],
            '스마트등급': grades.get(row['mgmt'], ''),
            '특별관리사유': ';'.join(tags), '지정메모': memo,
            '검토사유': ' | '.join(rr), '발명의명칭': row['title'],
            '기록일시': now, '도구버전': toolver,
        }
        if key in records:
            updated += 1
        else:
            added += 1
        records[key] = rec
    return quarter, added, updated, tag_count


def show_timeline(records, mgmt):
    rows = sorted((v for (m, _), v in records.items() if m == mgmt), key=lambda x: x['분기'])
    if not rows:
        print('이력 없음: %s' % mgmt)
        return
    print('=== %s 특별관리 이력 (%d개 분기) ===' % (mgmt, len(rows)))
    for r in rows:
        print('  [%s] 분류=%s | 연차=%s | 등급=%s | 사유=%s%s' % (
            r['분기'], r['분류'], r['등록후연차'], r['스마트등급'] or '-',
            r['특별관리사유'], (' | 메모=' + r['지정메모']) if r['지정메모'] else ''))
        if r['검토사유']:
            print('        검토: %s' % r['검토사유'])


def main(argv=None):
    ap = argparse.ArgumentParser(description='특별관리 특허 히스토리 관리 (오프라인·표준 라이브러리 전용)')
    ap.add_argument('reports', nargs='*', help='검토 리포트 xlsx (복수/와일드카드 가능)')
    ap.add_argument('--history', default=DEFAULT_HISTORY, help='히스토리 CSV 경로 (기본: %(default)s)')
    ap.add_argument('--watchlist', default=DEFAULT_WATCHLIST, help='수동 지정 목록 CSV (기본: %(default)s)')
    ap.add_argument('--show', metavar='관리번호', help='해당 특허의 타임라인 출력 후 종료')
    ap.add_argument('--dry-run', action='store_true', help='파일에 쓰지 않고 결과만 출력')
    args = ap.parse_args(argv)

    records = load_history(args.history)

    if args.show:
        show_timeline(records, args.show.strip())
        return 0

    paths = []
    for p in args.reports:
        hit = sorted(glob.glob(p))
        paths.extend(hit if hit else [p])
    if not paths:
        ap.print_help()
        return 1

    watch = load_watchlist(args.watchlist)
    print('수동 지정(watchlist): %d건 (%s)' % (len(watch), args.watchlist if os.path.exists(args.watchlist) else '파일 없음 — 자동 규칙만 적용'))

    total_added = total_updated = 0
    for p in paths:
        if not os.path.exists(p):
            print('[건너뜀] 파일 없음: %s' % p)
            continue
        quarter, added, updated, tag_count = process_report(p, records, watch)
        total_added += added
        total_updated += updated
        detail = ', '.join('%s %d' % (k, v) for k, v in sorted(tag_count.items()))
        print('[%s] %s → 특별관리 %d건 (신규 %d / 갱신 %d) [%s]' % (
            quarter, os.path.basename(p), added + updated, added, updated, detail or '-'))

    specials = sorted({m for (m, _) in records})
    print('누적: 이력 %d행 / 특별관리 특허 %d건' % (len(records), len(specials)))
    if args.dry_run:
        print('(dry-run: 저장하지 않음)')
        return 0
    save_history(args.history, records)
    print('저장: %s (직전본 백업: %s)' % (args.history, args.history + '.bak' if os.path.exists(args.history + '.bak') else '없음·최초 생성'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
