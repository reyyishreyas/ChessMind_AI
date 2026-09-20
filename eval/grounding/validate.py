"""Validator — check extracted claims against the real position (python-chess).

A 'proposed' move claim is grounded if it is legal in the current position.
A 'past' claim ("You played x") is grounded in the position BEFORE that move
when `fen_before` is available. A capture claim is grounded if some legal move
captures an enemy piece onto that square.
"""

import chess

from eval.grounding.extract import extract_capture_claims, extract_moves, is_uci


def _move_is_legal(board: chess.Board, token: str) -> bool:
    try:
        if is_uci(token):
            return chess.Move.from_uci(token[:4]) in board.legal_moves
        return board.parse_san(token) in board.legal_moves
    except ValueError:
        return False


def _capture_is_legal(board: chess.Board, square: str) -> bool:
    target = chess.parse_square(square)
    return any(m.to_square == target and board.is_capture(m) for m in board.legal_moves)


def validate_fen(fen: str, explanation: str, fen_before: str | None = None) -> dict:
    """Return per-claim verdicts + aggregates for an explanation at a position."""
    board = chess.Board(fen)
    board_before = chess.Board(fen_before) if fen_before else None

    capture_claims = extract_capture_claims(explanation)
    capture_squares = {sq for _, sq in capture_claims}

    move_verdicts: dict[str, bool] = {}
    for token, context in extract_moves(explanation):
        if len(token) == 2 and token in capture_squares:
            continue  # judged by the capture claim instead
        legal = _move_is_legal(board_before, token) if context == "past" and board_before else _move_is_legal(board, token)
        move_verdicts[f"{'past' if context == 'past' else 'proposed'}:{token}"] = legal

    capture_verdicts: dict[str, bool] = {}
    for piece, sq in capture_claims:
        capture_verdicts[f"capture-on-{sq}"] = _capture_is_legal(board, sq)

    claims = {**move_verdicts, **capture_verdicts}
    total = len(claims)
    passed = sum(claims.values())

    return {
        "fen": fen,
        "move_claims": move_verdicts,
        "capture_claims": capture_verdicts,
        "n_total": total,
        "n_passed": passed,
        "grounded": (passed / total) if total else None,
    }


def validate_explanation(fen: str, explanation: str, fen_before: str | None = None) -> dict:
    """Aggregate form used by run.py."""
    result = validate_fen(fen, explanation, fen_before)
    return {
        "n_total": result["n_total"],
        "n_passed": result["n_passed"],
        "grounded": result["grounded"],
        "illegal_moves": [t for t, ok in result["move_claims"].items() if not ok],
        "false_captures": [c for c, ok in result["capture_claims"].items() if not ok],
    }


def claimed_moves(fen: str, explanation: str) -> list[str]:
    """Claims an explanation references (used by coverage checks)."""
    from eval.grounding.extract import extract_explanation_claims

    extracted = extract_explanation_claims(explanation)
    return extracted["moves_past"] + extracted["moves_proposed"]