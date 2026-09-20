"""Run every suite in the harness and write results to eval/results/."""

import argparse
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def run_suite(label: str, argv: list[str]) -> bool:
    print(f"\n=== {label} ===")
    try:
        subprocess.run([sys.executable, *argv], cwd=ROOT.parent, check=True)
        return True
    except FileNotFoundError:
        print(f"  SKIP: {argv[0]} not found")
        return False
    except subprocess.CalledProcessError as e:
        print(f"  FAIL: {e}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="run fast smoke versions")
    args = parser.parse_args()

    quick = ["--quick"] if args.quick else []

    statuses = {
        "bot calibration": run_suite(
            "bot calibration",
            ["-m", "eval.bot_calibration.run_calibration", *quick],
        ),
    }

    if statuses["bot calibration"]:
        statuses["elo fit"] = run_suite("elo fit", ["-m", "eval.bot_calibration.fit_elo"])

    statuses["elo_model"] = run_suite("elo_model", ["-m", "eval.elo_model.run"]) if (ROOT / "elo_model" / "run.py").exists() else False
    statuses["grounding"] = run_suite("grounding", ["-m", "eval.grounding.run"]) if (ROOT / "grounding" / "run.py").exists() else False

    print("\n=== SUMMARY ===")
    for name, ok in statuses.items():
        print(f"  {'PASS' if ok else 'pending/absent'}  {name}")

    sys.exit(0 if all(statuses.values()) else 1)