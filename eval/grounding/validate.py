"""Validator — check extracted claims against the real position (python-chess).

A 'proposed' move claim is grounded if it is legal in the current position.
A 'past' claim ("You played x") is grounded in the position BEFORE that move
when `fen_before` is available. A capture claim is grounded if some legal move
captures an enemy piece onto that square.

A piece-named token that matches a piece ALREADY on that square in the current
position ("Bg5" with a bishop on g5) is a position reference, not a proposal:
it is verified by mere presence.
"""

import re

import chess

from eval.grounding.extract import extract_capture_claims, extract_moves, is_uci

# Piece-letter + destination square, tolerating x/+ and disambiguation digits.
PIECE_REF_RE = re.compile(r"([KQRBN])(?:x)?([a-h][1-8])(?:[+#])?$")

# Words that mark a sentence as suggesting a move rather than describing one.
PROPOSE_HINT_RE = re.compile(
    r"\b(?:should|instead|better|try|consider|miss(?:ed)?|would|suggest|recommend|play|"
    r"go(?:es)?\s+to|move(?:s)?\s+to)\b(?:\s+\w+){0,5}\s*$",
    re.IGNORECASE,
)

# "the queen goes to h4" — subject-aware bare-square claim.
SUBJECT_MOVE_RE = re.compile(
    r"\b(?:the\s+)?(?:queen|rook|bishop|knight|king)\b(?:\s+\w+){0,3}?\s+"
    r"(?:go(?:es)?|move(?:s)?)\s+to\s+([a-h][1-8])",
    re.IGNORECASE,
)

SUBJECT_LETTER = {
    "queen": "Q",
    "rook": "R",
    "bishop": "B",
    "knight": "N",
    "king": "K",
}


def _is_position_reference(board: chess.Board, token: str, text: str) -> bool:
    """A piece-named token is a reference when that piece already sits on the
    square AND the sentence is not framed as a suggestion (e.g. "Ng5 is a
    strong move" describes the move just played, but "You should play Nb1"
    proposes a move from an occupied square)."""
    match = PIECE_REF_RE.match(token)
    if not match:
        return False
    preceded_by_propose = bool(PROPOSE_HINT_RE.search(text[: max(0, text.index(token))]))
    if preceded_by_propose:
        return False
    piece_type = match.group(1)
    square = chess.parse_square(match.group(2))
    piece = board.piece_at(square)
    return piece is not None and piece.symbol().upper() == piece_type


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
        if context == "proposed" and _is_position_reference(board, token, explanation):
            move_verdicts[f"position:{token}"] = True
            continue
        if context == "proposed" and len(token) == 2:
            subject = SUBJECT_MOVE_RE.search(explanation)
            if subject and subject.group(1) == token:
                subject_word = next((w for w in subject.group(0).split() if w.lower() in SUBJECT_LETTER), None)
                letter = SUBJECT_LETTER.get(subject_word.lower()) if subject_word else None
                if letter:
                    legal = _move_is_legal(board, f"{letter}{token}")
                    move_verdicts[f"subject:{letter}{token}"] = legal
                    continue
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