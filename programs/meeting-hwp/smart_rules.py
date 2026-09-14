# NOTE v0.4.0: This module is retained for compatibility/tests. The production merge path does NOT use it to delete/rebuild HWP content.
# -*- coding: utf-8 -*-
"""Offline cell-aware smart merge rules for HWP meeting materials v0.3.5.

Document structure fixed in v0.3.5:
- There are eight INDEPENDENT HWP table cells.
- Each cell's first paragraph is its bracketed heading, e.g.
  [특허권리화/컨설팅].
- A field key is permanently bound to one physical table cell.
- Content is NEVER reclassified or moved to another field key.

No document content is sent to an external service.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Dict, List, Tuple


FIELD_ORDER = [
    "past_patent",
    "future_patent",
    "past_transfer",
    "future_transfer",
    "past_startup",
    "future_startup",
    "past_other",
    "future_other",
]

FIELD_PAIRS = [
    ("past_patent", "future_patent"),
    ("past_transfer", "future_transfer"),
    ("past_startup", "future_startup"),
    ("past_other", "future_other"),
]

OUTPUT_BULLET = "ㅇ"
TOP_BULLET_CAPTURE_RE = re.compile(r"^\s*([◦○ㅇ])\s*(.+?)\s*$")
TOP_BULLET_RE = re.compile(r"^\s*[◦○ㅇ]\s*")

FULL_DATE_RE = re.compile(
    r"(?<!\d)"
    r"(?P<y>\d{4})\s*"
    r"(?P<sep1>/|\.)\s*"
    r"(?P<m>1[0-2]|0?[1-9])\s*"
    r"(?P<sep2>/|\.)\s*"
    r"(?P<d>3[01]|[12]\d|0?[1-9])"
    r"(?P<trail>\s*\.?)"
)

DATE_RE = re.compile(
    r"(?<![\d.])"
    r"(?P<m>1[0-2]|0?[1-9])\s*"
    r"(?P<sep>/|\.)\s*"
    r"(?P<d>3[01]|[12]\d|0?[1-9])"
    r"(?P<trail>\s*\.?)"
)

WEEKDAY_GAP_RE = re.compile(
    r"(\b(?:[1-9]|1[0-2])\.(?:[1-9]|[12]\d|3[01])\.)\s+\(([월화수목금토일])\)"
)

TABLE_WORDS = {
    "번호",
    "기술명",
    "책임자",
    "진행사항",
    "기업명",
    "연구자",
    "대표",
    "계약체결",
    "신청서",
    "위치",
    "선급",
    "경상",
}


@dataclass
class SmartOptions:
    dedupe: bool = True
    group_topics: bool = True
    normalize_dates: bool = True
    normalize_layout: bool = True
    line_spacing: int = 160
    similarity_threshold: float = 1.0  # compatibility only; fuzzy merge disabled


@dataclass
class TopicBlock:
    title: str
    body: List[str]
    source_index: int
    source_path: str
    original_index: int
    source_search_text: str
    source_search_occurrence: int
    source_next_search_text: str = ""

    def render(self) -> str:
        first = f"{OUTPUT_BULLET} {self.title.strip()}"
        if not self.body:
            return first
        return first + "\n" + "\n".join(
            line.rstrip() for line in self.body if line.strip()
        )


def _normalized_date_for_match(match: re.Match, original: str) -> str:
    end = match.end()
    next_char = original[end:end + 1]

    if next_char:
        if next_char == "%" or next_char.isalpha():
            return match.group(0)
        if next_char in "μ㎜㎝㎡㎥℃":
            return match.group(0)

    month = int(match.group("m"))
    day = int(match.group("d"))
    return f"{month}.{day}."


def normalize_date_notation(text: str) -> str:
    original = text

    def full_repl(match: re.Match) -> str:
        year = int(match.group("y"))
        month = int(match.group("m"))
        day = int(match.group("d"))
        return f"{year}.{month}.{day}."

    # Normalize full Y.M.D first.
    out = FULL_DATE_RE.sub(full_repl, text)

    # Then normalize standalone M.D using the updated text as context.
    standalone_original = out

    def repl(match: re.Match) -> str:
        return _normalized_date_for_match(
            match,
            standalone_original,
        )

    out = DATE_RE.sub(repl, out)
    out = WEEKDAY_GAP_RE.sub(r"\1(\2)", out)
    return out


def date_replacement_pairs(text: str) -> List[Tuple[str, str]]:
    original = text or ""
    pairs: List[Tuple[str, str]] = []
    seen = set()

    for match in DATE_RE.finditer(original):
        src = match.group(0)
        dst = _normalized_date_for_match(match, original)
        if src == dst:
            continue

        key = (src, dst)
        if key not in seen:
            seen.add(key)
            pairs.append(key)

    pairs.sort(key=lambda pair: len(pair[0]), reverse=True)
    return pairs


def normalize_line(line: str, normalize_dates: bool) -> str:
    line = line.replace("\t", " ").rstrip()

    if normalize_dates:
        line = normalize_date_notation(line)

    line = re.sub(r"[ \u00a0]{2,}", " ", line)
    return line.strip()


def canonical_body(text: str) -> str:
    """Loose normalization for duplicate subordinate body lines."""
    text = normalize_date_notation(text)
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def canonical_title(title: str) -> str:
    """Strict title key.

    Different top-level titles stay separate. We normalize only whitespace,
    case, and requested date notation; punctuation is NOT stripped.
    """
    title = normalize_date_notation(title or "").strip().lower()
    return re.sub(r"\s+", " ", title)


def parse_blocks(
    payload: str,
    source_index: int,
    source_path: str,
    normalize_dates: bool,
) -> List[TopicBlock]:
    raw_lines = (
        (payload or "")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .split("\n")
    )

    blocks: List[TopicBlock] = []
    current: TopicBlock | None = None
    title_occurrence: Dict[str, int] = {}
    original_index = 0

    for raw in raw_lines:
        raw = raw.rstrip()

        if not raw.strip():
            continue

        match = TOP_BULLET_CAPTURE_RE.match(raw)

        if match:
            if current is not None:
                blocks.append(current)

            raw_title = match.group(2).strip()
            title = (
                normalize_date_notation(raw_title)
                if normalize_dates
                else raw_title
            )

            # Preserve the literal source line for rich-block search.
            search_text = raw.strip()
            occurrence = title_occurrence.get(search_text, 0) + 1
            title_occurrence[search_text] = occurrence

            current = TopicBlock(
                title=title,
                body=[],
                source_index=source_index,
                source_path=source_path,
                original_index=original_index,
                source_search_text=search_text,
                source_search_occurrence=occurrence,
            )
            original_index += 1
            continue

        line = normalize_line(raw, normalize_dates)

        if not line:
            continue

        if current is None:
            # Preserve malformed/unbulleted source rather than silently losing it.
            search_text = raw.strip()
            occurrence = title_occurrence.get(search_text, 0) + 1
            title_occurrence[search_text] = occurrence

            current = TopicBlock(
                title=line,
                body=[],
                source_index=source_index,
                source_path=source_path,
                original_index=original_index,
                source_search_text=search_text,
                source_search_occurrence=occurrence,
            )
            original_index += 1
        else:
            current.body.append(line)

    if current is not None:
        blocks.append(current)

    for idx, block in enumerate(blocks):
        if idx + 1 < len(blocks):
            block.source_next_search_text = blocks[idx + 1].source_search_text

    return blocks


def table_score(block: TopicBlock) -> int:
    text = block.render()

    word_hits = sum(
        1 for word in TABLE_WORDS
        if word in text
    )

    standalone_numbers = sum(
        1
        for line in text.splitlines()
        if re.fullmatch(r"\s*\d{1,3}\s*", line)
    )

    score = word_hits * 4 + min(standalone_numbers, 8)

    if word_hits >= 3:
        score += 20
    elif word_hits >= 2 and standalone_numbers >= 2:
        score += 12

    return score


def is_rich_block(block: TopicBlock) -> bool:
    """Table-like topic blocks are copied from the original HWP as rich blocks."""
    return table_score(block) >= 20


def _unique_body_lines(
    blocks: List[TopicBlock],
    seed: List[str] | None = None,
) -> List[str]:
    out = list(seed or [])
    seen = {
        canonical_body(line)
        for line in out
        if canonical_body(line)
    }

    for block in blocks:
        for line in block.body:
            key = canonical_body(line)
            if key and key not in seen:
                out.append(line)
                seen.add(key)

    return out


def merge_field_blocks(
    blocks: List[TopicBlock],
    dedupe: bool,
) -> List[dict]:
    """Merge exact-title topics INSIDE ONE FIXED CELL ONLY."""
    groups: Dict[str, List[TopicBlock]] = {}
    order: List[str] = []

    for block in blocks:
        key = canonical_title(block.title)

        if not key:
            continue

        if key not in groups:
            groups[key] = []
            order.append(key)

        groups[key].append(block)

    items: List[dict] = []

    for key in order:
        group = groups[key]
        first = group[0]
        rich_candidates = [
            block for block in group
            if is_rich_block(block)
        ]

        if rich_candidates:
            # Preserve one richest HWP block (usually the actual nested table).
            # Other rich candidates are NOT flattened into text.
            rich = max(rich_candidates, key=table_score)
            rich_ids = {id(block) for block in rich_candidates}

            rich_seen = {
                canonical_body(line)
                for line in rich.body
                if canonical_body(line)
            }

            supplements: List[str] = []
            supplement_seen = set(rich_seen)

            for block in group:
                if id(block) in rich_ids:
                    continue

                for line in block.body:
                    line_key = canonical_body(line)

                    if not line_key:
                        continue

                    if dedupe and line_key in supplement_seen:
                        continue

                    supplements.append(line)
                    supplement_seen.add(line_key)

            items.append({
                "type": "rich",
                "title": first.title,
                "source": rich.source_path,
                "source_search_text": rich.source_search_text,
                "source_search_occurrence": rich.source_search_occurrence,
                "source_next_search_text": rich.source_next_search_text,
                "supplement_body": supplements,
                "rich_candidate_count": len(rich_candidates),
            })
            continue

        if dedupe:
            body = _unique_body_lines(group)
        else:
            body = [
                line
                for block in group
                for line in block.body
            ]

        items.append({
            "type": "text",
            "title": first.title,
            "body": body,
        })

    return items


def align_exact_topic_order(
    left: List[dict],
    right: List[dict],
) -> Tuple[List[dict], List[dict]]:
    """Use the same order only for EXACTLY matching topic titles.

    Titles are never moved between cells/columns.
    """
    order: Dict[str, int] = {}
    max_len = max(len(left), len(right), 0)

    for i in range(max_len):
        for side in (left, right):
            if i >= len(side):
                continue

            key = canonical_title(
                str(side[i].get("title", ""))
            )

            if key not in order:
                order[key] = len(order)

    def sort_key(item: dict):
        return order.get(
            canonical_title(str(item.get("title", ""))),
            10000,
        )

    return (
        sorted(left, key=sort_key),
        sorted(right, key=sort_key),
    )


def build_smart_plan(
    extracted: List[dict],
    header_map: Dict[str, str],
    options: SmartOptions,
) -> Tuple[dict, dict]:
    """Build an eight-independent-cell merge plan.

    There is no content-based department/category reassignment.
    A source field_name can only contribute to the SAME destination field_name.
    """
    per_field_blocks: Dict[str, List[TopicBlock]] = {
        name: []
        for name in header_map
    }

    global_cleanup: List[Tuple[str, str]] = [
        ("◦", OUTPUT_BULLET),
        ("○", OUTPUT_BULLET),
    ]
    cleanup_seen = set(global_cleanup)

    for source_index, item in enumerate(extracted):
        source_path = str(item.get("source", ""))
        fields = item.get("fields", {}) or {}

        for field_name in header_map:
            # HARD BOUNDARY: field_name never changes here.
            payload = str(
                fields.get(field_name, "") or ""
            )

            if not payload.strip():
                continue

            if options.normalize_dates:
                for src, dst in date_replacement_pairs(payload):
                    pair = (src, dst)

                    if (
                        src != dst
                        and pair not in cleanup_seen
                    ):
                        global_cleanup.append(pair)
                        cleanup_seen.add(pair)

            blocks = parse_blocks(
                payload,
                source_index=source_index,
                source_path=source_path,
                normalize_dates=options.normalize_dates,
            )

            per_field_blocks[field_name].extend(blocks)

    fields = {
        field_name: merge_field_blocks(
            blocks,
            dedupe=options.dedupe,
        )
        for field_name, blocks in per_field_blocks.items()
    }

    if options.group_topics:
        for past_name, future_name in FIELD_PAIRS:
            past, future = align_exact_topic_order(
                fields[past_name],
                fields[future_name],
            )
            fields[past_name] = past
            fields[future_name] = future

    rich_fields = sorted(
        field_name
        for field_name, items in fields.items()
        if any(
            item.get("type") == "rich"
            for item in items
        )
    )

    plan = {
        "fields": fields,
        "global_cleanup": [
            [src, dst]
            for src, dst in global_cleanup
            if src and src != dst
        ],
        "line_spacing": max(
            80,
            min(300, int(options.line_spacing)),
        ),
        "normalize_layout": bool(options.normalize_layout),
    }

    stats = {
        "safe_fields": rich_fields,
        "smart_fields": sorted(fields),
        "rich_fields": rich_fields,
        "text_item_count": sum(
            1
            for items in fields.values()
            for item in items
            if item.get("type") == "text"
        ),
        "rich_item_count": sum(
            1
            for items in fields.values()
            for item in items
            if item.get("type") == "rich"
        ),
    }

    return plan, stats
