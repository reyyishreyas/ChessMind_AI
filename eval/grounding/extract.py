"""Claim extractor — pull squares, piece/SAN moves, and capture claims out of
coach explanations so they can be checked against the real position.

Deliberately regex-based (no LLM dependency): the extractor is what makes the
grounding metric reproducible. It errors toward finding MORE claims; the
validator decides legality.
"""

import re

SAN_MOVE_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:O-O-O|O-O|[KQRBN]?[a-h1-8]{0,2}x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![A-Za-z0-9])"
)

# A bare square counts as a proposed move claim only when it follows an
# explicit play-verb ("should play e4", "goes to h4"). Otherwise it is a
# square reference ("Black's e5 pawn", "on f7") and gets no verdict.
PROPOSE_VERB_RE = re.compile(
    r"\b(?:you\s+)?(?:should\s+)?(?:play(?:s|ed|ing)?|go(?:es)?\s+to|move(?:s)?\s+to|try\s+)\s+([a-h][1-8])\b",
    re.IGNORECASE,
)

# "You played <move>" / "Playing <move>" describe the move JUST MADE: they
# are grounded in the position BEFORE that move, not the current one.
PLAYED_RE = re.compile(
    r"\b(?:you\s+)?(?:just\s+)?(?:played?|playing)\s+"
    r"(O-O-O|O-O|[KQRBN]?[a-h1-8]{0,2}x?[a-h][1-8](?:=[QRBN])?[+#]?)\b",
    re.IGNORECASE,
)

SQUARE_RE = re.compile(r"\b[a-h][1-8]\b")

CAPTURE_RE = re.compile(
    r"(?:captur(?:e|es|ed|ing)|grab(?:s|bed)?|win(?:s)?|take(?:s)?)\s+(?:the\s+)?"
    r"(?:(?:(?:the\s+|an?\s+)?(pawn|knight|bishop|rook|queen|king))\s+)?"
    r"(?:on|onto)\s+([a-h][1-8])",
    re.IGNORECASE,
)

UCI_RE = re.compile(r"[a-h][1-8][a-h][1-8](?:[qrbn])?")


def is_uci(token: str) -> bool:
    """True if a token looks like UCI (e2e4 / e7e8q) rather than SAN."""
    return bool(UCI_RE.fullmatch(token))


def _is_move_shaped(token: str) -> bool:
    """A token that can only be a move, never a bare square reference."""
    if token.startswith("O-O"):
        return True
    if re.search(r"[KQRBNx=+#]", token):
        return True
    return is_uci(token)


def extract_moves(text: str) -> list[tuple[str, str]]:
    """Move claims as (token, context) where context is 'past' or 'proposed'.

    'past' claims name the move the player just made ("You played e4"):
    grounded in the position before it. 'proposed' claims are suggestions
    ("you should play d4") grounded in the current position.
    """
    proposed: set[str] = set()
    for token in SAN_MOVE_RE.findall(text):
        if _is_move_shaped(token):
            proposed.add(token)
    for match in PROPOSE_VERB_RE.finditer(text):
        proposed.add(match.group(1))

    past: set[str] = set()
    for match in PLAYED_RE.finditer(text):
        past.add(match.group(1))

    return sorted((t, "past") for t in past) + sorted((t, "proposed") for t in proposed - past)


def extract_squares(text: str) -> list[str]:
    """All square mentions [a-h][1-8]."""
    return list(SQUARE_RE.findall(text))


def extract_capture_claims(text: str) -> list[tuple[str, str]]:
    """"(piece, square)" claims like ('knight', 'e6') from 'captured the knight on e6'."""
    claims: list[tuple[str, str]] = []
    for match in CAPTURE_RE.finditer(text):
        piece = (match.group(1) or "").lower()
        claims.append((piece, match.group(2)))
    return claims


def extract_explanation_claims(text: str) -> dict:
    moves = extract_moves(text)
    captures = extract_capture_claims(text)
    return {
        "moves_past": sorted(t for t, _ in moves if _ == "past"),
        "moves_proposed": sorted(t for t, _ in moves if _ == "proposed"),
        "squares": sorted(set(extract_squares(text))),
        "captures": sorted({sq for _, sq in captures}),
    }