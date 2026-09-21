"""Grounding suite — how often the coach says things that aren't true on the board.

Runs over:
  1. hand-labeled fixtures (real + deliberately hallucinated explanations)
  2. logged analyze-move calls (.llm-calls.ndjson) with a recorded FEN

Writes eval/results/grounding_results.json.
"""

import json
import pathlib
import re
import subprocess
import sys

import chess

from eval.grounding.validate import validate_explanation

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
HERE = pathlib.Path(__file__).resolve().parent
RESULTS_DIR = ROOT / "eval" / "results"
LOG_PATH = ROOT / ".llm-calls.ndjson"
FIXTURES = HERE / "fixtures" / "fixtures.json"
ORACLE_CLI = HERE / "motifs.mjs"

PROMPT_FEN_RE = re.compile(
    r"Position before player move \(FEN\):\s*([\w/]+ [+-] [A-Ha-hKQkq-]+ \d+ \d+)\s*\n"
    r"Position after player move \(FEN\):\s*([\w/]+ [+-] [A-Ha-hKQkq-]+ \d+ \d+)"
)


def motif_oracle(pairs: list[tuple[str, str]]) -> dict[str, dict]:
    """motifs for (fen_before, fen_after) pairs, via the SAME tactics engine
    the app uses (lib/tactics.ts through eval/grounding/motifs.mjs). Returns a
    {pair_key: {"move": {...} | None, "motifs": [...]}} dict. Pair key is the
    tuple repr in a stable per-run space; callers use json-formatted key."""
    if not pairs:
        return {}
    key = lambda pair: json.dumps(pair)
    payload = "\n".join(json.dumps({"fenBefore": b, "fenAfter": a}) for b, a in pairs)
    try:
        proc = subprocess.run(
            ["node", str(ORACLE_CLI)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return {}
    if proc.returncode != 0:
        return {}
    out: dict[str, dict] = {}
    for line, pair in zip(proc.stdout.splitlines(), pairs):
        if not line.strip():
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        out[key(pair)] = {
            "fenBefore": pair[0],
            "fenAfter": pair[1],
            "move": data.get("move"),
            "motifs": data.get("motifs") or [],
        }
    return out


def _fens_from_record(record: dict) -> tuple[str | None, str | None]:
    """(fen_after, fen_before) from a logged call."""
    meta = record.get("meta") or {}
    if isinstance(meta, dict) and meta.get("fen"):
        return str(meta["fen"]), (str(meta["fenBefore"]) if meta.get("fenBefore") else None)
    prompt = record.get("prompt")
    if isinstance(prompt, str):
        match = PROMPT_FEN_RE.search(prompt)
        if match:
            return match.group(2), match.group(1)
    return None, None


def run_fixtures() -> dict:
    data = json.loads(FIXTURES.read_text())
    per = []
    coverage_ok = True

    pairs = [
        (fix.get("fen_before") or fix["fen"], fix["fen"])
        for fix in data["fixtures"]
    ]
    oracles = motif_oracle([p for p in pairs if p[0] != p[1]])

    for fix in data["fixtures"]:
        fen_before = fix.get("fen_before") or fix["fen"]
        oracle = oracles.get(json.dumps([fen_before, fix["fen"]]))
        try:
            verdict = validate_explanation(fix["fen"], fix["analysis"], fen_before, oracle)
        except ValueError as err:
            coverage_ok = False
            per.append({"id": fix["id"], "error": str(err), "grounded": None})
            continue

        # extractor coverage check: expected claims must have been detected
        from eval.grounding.extract import extract_explanation_claims, extract_motif_claims

        extracted = extract_explanation_claims(fix["analysis"])
        found_moves = extracted["moves_past"] + extracted["moves_proposed"]
        missing_moves = [m for m in fix.get("expect_moves", []) if m not in found_moves]
        missing_captures = [c for c in fix.get("expect_captures", []) if c not in extracted["captures"]]
        found_motifs = {m for m, _ in extract_motif_claims(fix["analysis"])}
        missing_motifs = [
            m for m in fix.get("expect_motifs", [])
            if (m["motif"] not in found_motifs)
        ]
        if missing_moves or missing_captures or missing_motifs:
            coverage_ok = False
            print(
                f"!! extractor missed claims in {fix['id']}:"
                f" moves={missing_moves} captures={missing_captures} motifs={missing_motifs}"
            )

        per.append({"id": fix["id"], "bad": fix["bad"], **verdict})

    grounded = [v["grounded"] for v in per if v.get("grounded") is not None]
    good_grounded = [v["grounded"] for v in per if not v.get("bad") and v.get("grounded") is not None]
    return {
        "per_fixture": per,
        "fixture_groundedness": round(sum(grounded) / len(grounded), 3) if grounded else None,
        "good_fixture_groundedness": round(sum(good_grounded) / len(good_grounded), 3) if good_grounded else None,
        "coverage_ok": coverage_ok,
    }


def run_log_replay() -> dict:
    if not LOG_PATH.exists():
        return {"records": 0, "note": "no .llm-calls.ndjson yet — play a game or hit /api/analyze-move"}

    records = []
    for line in LOG_PATH.read_text().splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        if not record.get("promptVersion", "").startswith("analyze-move"):
            continue
        data = record.get("data")
        analysis = (data or {}).get("analysis") if isinstance(data, dict) else None
        fen_after, fen_before = _fens_from_record(record)
        records.append((record, analysis, fen_after, fen_before))

    scored_pairs = [
        (b, a) for _, analysis, a, b in records if analysis and a and b and b != a
    ]
    oracles = motif_oracle(sorted(set(scored_pairs)))

    by_model: dict[str, dict] = {}
    total_calls = 0
    total_scored = 0

    for record, analysis, fen_after, fen_before in records:
        total_calls += 1
        key = f"{record.get('provider')}/{record.get('model')}" if record.get("model") else "unknown"

        stats = by_model.setdefault(key, {"calls": 0, "scored": 0, "n_total": 0, "n_passed": 0, "illegal": 0, "false_captures": 0, "false_motifs": 0, "parse_errors": 0})
        stats["calls"] += 1
        if record.get("status") == "parse_error":
            stats["parse_errors"] += 1

        if not analysis or not fen_after:
            continue
        oracle = oracles.get(json.dumps([fen_before, fen_after])) if fen_before else None
        try:
            verdict = validate_explanation(fen_after, analysis, fen_before, oracle)
        except ValueError:
            continue

        stats["scored"] += 1
        stats["n_total"] += verdict["n_total"]
        stats["n_passed"] += verdict["n_passed"]
        stats["illegal"] += len(verdict["illegal_moves"])
        stats["false_captures"] += len(verdict["false_captures"])
        stats["false_motifs"] += len(verdict["false_motifs"])
        total_scored += 1

    for key, stats in by_model.items():
        claims = stats["n_total"]
        stats["groundedness"] = round(stats["n_passed"] / claims, 3) if claims else None
        stats["rejection_rate"] = round((stats["illegal"] + stats["false_captures"] + stats["false_motifs"]) / claims, 3) if claims else None

    return {"records": total_calls, "scored_explanations": total_scored, "by_model": by_model}


def main() -> int:
    fixtures = run_fixtures()
    live = run_log_replay()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / "grounding_results.json"
    aggregate = {
        "fixtures": fixtures,
        "live_replay": live,
    }
    out.write_text(json.dumps(aggregate, indent=2))

    print("\n=== GROUNDING SUITE ===")
    print(f"\nFixtures ({len(fixtures['per_fixture'])}) — groundedness: {fixtures['fixture_groundedness']} (good-only: {fixtures['good_fixture_groundedness']})")
    for v in fixtures["per_fixture"]:
        g = v.get("grounded")
        print(f"  {v['id']:28s} grounded={str(g):5s} illegal={v.get('illegal_moves')} false_cap={v.get('false_captures')} false_motifs={v.get('false_motifs')}")

    print(f"\nLive replay: {live.get('records', 0)} analyzed calls, {live.get('scored_explanations', 0)} scored")
    for key, stats in sorted(live.get("by_model", {}).items()):
        print(f"  {key:32s} calls={stats['calls']:3d} scored={stats['scored']:3d} claims={stats['n_total']:3d} grounded={stats.get('groundedness')} rejection={stats.get('rejection_rate')} parse_errors={stats['parse_errors']}")

    print(f"\nWrote {out}")
    if not fixtures["coverage_ok"]:
        print("FAIL: extractor missed expected claims on fixtures")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())