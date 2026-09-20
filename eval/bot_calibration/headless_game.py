"""Play a single headless game between two bots and report the result.

Score is from White's perspective: 1 = White wins, 0.5 = draw, 0 = Black wins.
"""

import chess


def play_game(white, black, max_plies: int = 300) -> dict:
    board = chess.Board()
    game = {"white": white.name, "black": black.name, "score": None, "moves": 0}

    for ply in range(max_plies):
        bot = white if board.turn == chess.WHITE else black
        move = bot.play(board)
        if move is None:
            break
        board.push(move)
        if board.is_game_over():
            break

    game["moves"] = board.fullmove_number
    game["fen"] = board.fen()

    if board.is_checkmate():
        game["score"] = 1.0 if board.turn == chess.BLACK else 0.0
    elif board.is_game_over():
        game["score"] = 0.5
    else:
        # Ran out of moves: count it as a draw (50-move-like truncation)
        game["score"] = 0.5

    return game