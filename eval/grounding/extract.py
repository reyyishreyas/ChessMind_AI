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

PIECE_WORDS = r"(?:queen|rook|bishop|knight|king|pawn)"

# Motif mention, verb-first: "Bg5 pins the knight", "the move forks the
# queen". Inflected verb, then the nearest piece word in the next clause.
MOTIF_VERB_RE = re.compile(r"\b(pin|fork|skewer)(?:s|ed|ing)\s+", re.IGNORECASE)

# Subject-before: "the knight is pinned", "the bishop that gets pinned".
MOTIF_SUBJECT_RE = re.compile(
    r"\b(?:your\s+|the\s+)?(" + PIECE_WORDS + r")\s+(?:that\s+)?(?:is|was|gets?)\s+(pinned|forked|skewered)",
    re.IGNORECASE,
)

# Noun-with-subject: "a pin on the bishop", "the fork on your queen".
MOTIF_ON_RE = re.compile(
    r"\b(pin|fork|skewer)\b\s+on\s+(?:your\s+|the\s+)?(" + PIECE_WORDS + r")",
    re.IGNORECASE,
)

# Bare noun (no subject): "there's a pin", "a nice fork".
MOTIF_NOUN_RE = re.compile(r"\b(pin|fork|skewer)\b", re.IGNORECASE)

# Phrase motifs.
MOTIF_PHRASE_RE = re.compile(
    r"\b(discovered\s+attack|discovered\s+check|double\s+attack)\b", re.IGNORECASE
)

_FWD_PIECE_RE = re.compile(r"\b(" + PIECE_WORDS + r")\b(?!-)", re.IGNORECASE)

MOTIF_BY_WORD = {
    "discovered attack": "discovered",
    "discovered check": "discovered",
    "double attack": "fork",
}
_VERB_MAP = {
    "pin": "pin", "pins": "pin", "pinned": "pin", "pinning": "pin",
    "fork": "fork", "forks": "fork", "forked": "fork", "forking": "fork",
    "skewer": "skewer", "skewers": "skewer", "skewered": "skewer", "skewering": "skewer",
}
_SUBJECT_MAP = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n", "king": "k", "pawn": "p"}

_NEGATION_GUARD = re.compile(r"\b(?:no|not|avoid(?:ing)?|stop)\b", re.IGNORECASE)


def _short_window(text: str, match) -> str:
    return text[max(0, match.start() - 30) : match.end() + 8]


def extract_motif_claims(text: str) -> list[tuple[str, str | None]]:
    """Motif claims as (motif, subject) tuples, subject being None when the
    claim names no piece. Only claims that assert a motif actually happened
    are returned (negated mentions are dropped)."""
    claims: list[tuple[str, str | None]] = []

    def negated(m) -> bool:
        return bool(_NEGATION_GUARD.search(_short_window(text, m)))

    for match in MOTIF_VERB_RE.finditer(text):
        if negated(match):
            continue
        motif = _VERB_MAP[match.group(1).lower()]
        fwd = _FWD_PIECE_RE.search(text, match.end(), match.end() + 40)
        claims.append((motif, _SUBJECT_MAP.get(fwd.group(1).lower()) if fwd else None))

    for match in MOTIF_SUBJECT_RE.finditer(text):
        if negated(match):
            continue
        claims.append(({"pinned": "pin", "forked": "fork", "skewered": "skewer"}[match.group(2).lower()], _SUBJECT_MAP.get(match.group(1).lower())))

    for match in MOTIF_ON_RE.finditer(text):
        if negated(match):
            continue
        claims.append((match.group(1).lower(), _SUBJECT_MAP.get(match.group(2).lower())))

    for match in MOTIF_PHRASE_RE.finditer(text):
        if negated(match):
            continue
        claims.append((MOTIF_BY_WORD[match.group(1).lower()], None))

    seen = set()
    out = []
    for claim in claims:
        if claim in seen:
            continue
        seen.add(claim)
        out.append(claim)
    return out


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
        "motifs": [{"motif": m, "subject": s} for m, s in extract_motif_claims(text)],
    }