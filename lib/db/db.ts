import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

/**
 * Fully-offline local database for a personal player-vs-bot match.
 *
 * One SQLite file per machine (data/local.db, gitignored) replaces the
 * Supabase instance the app previously depended on. The schema mirrors the
 * scripts/001-008 migrations so the rest of the app talks to the same shapes
 * (player_profiles, game_sessions, game_stats, game_moves, llm_calls).
 *
 * Local persona: every request acts as the same fixed "local-player" identity;
 * there is no auth server, login page flow, or Supabase dependency at all.
 */

export const LOCAL_USER_ID = "local-player"

const DATA_DIR = path.join(process.cwd(), "data")
const DB_PATH = path.join(DATA_DIR, "local.db")

// 007 adds the live skill-score columns; 008 adds game_moves. Folded in here
// so a fresh file is born complete.
const SCHEMA = `
create table if not exists player_profiles (
  id text primary key,
  skill_rating integer not null default 1000,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  total_blunders integer not null default 0,
  total_mistakes integer not null default 0,
  total_inaccuracies integer not null default 0,
  total_good_moves integer not null default 0,
  total_excellent_moves integer not null default 0,
  total_brilliant_moves integer not null default 0,
  average_accuracy real not null default 70,
  current_streak integer not null default 0,
  preferred_color text default 'w',
  initial_elo_set integer not null default 0,
  tactics_score integer not null default 50,
  position_score integer not null default 50,
  endgame_score integer not null default 50,
  current_bot_elo integer not null default 1000,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists game_sessions (
  id text primary key,
  user_id text not null,
  game_state text not null,
  game_history text not null default '[]',
  move_notations text not null default '[]',
  game_evaluations text not null default '[]',
  player_color text not null,
  current_difficulty integer not null default 5,
  history_index integer not null default 0,
  move_times text not null default '[]',
  bot_elo integer not null default 1000,
  bot_elo_history text not null default '[]',
  is_active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists game_stats (
  id text primary key,
  game_id text not null,
  user_id text not null,
  result real not null,
  player_color text not null,
  ai_elo integer not null,
  total_moves integer not null default 0,
  excellent_moves integer not null default 0,
  good_moves integer not null default 0,
  inaccurate_moves integer not null default 0,
  mistakes integer not null default 0,
  blunders integer not null default 0,
  ams real not null,
  std_deviation real not null,
  avg_time_per_move real,
  player_elo_before integer not null,
  player_elo_after integer not null,
  created_at text not null default (datetime('now'))
);

create table if not exists game_moves (
  id text primary key,
  user_id text not null,
  game_id text not null,
  move_no integer not null,
  square_from text not null,
  square_to text not null,
  piece text,
  grade text not null,
  centipawn_loss integer not null,
  is_capture integer not null default 0,
  is_check integer not null default 0,
  time_ms integer,
  created_at text not null default (datetime('now'))
);

create table if not exists llm_calls (
  id integer primary key autoincrement,
  ts text not null default (datetime('now')),
  provider text not null,
  model text not null,
  prompt_version text,
  status text not null,
  latency_ms integer,
  parse_count integer,
  error text,
  prompt text,
  metadata text not null default '{}',
  data text,
  meta text,
  created_at text not null default (datetime('now'))
);

create index if not exists idx_game_stats_user on game_stats(user_id);
create index if not exists idx_game_sessions_user_active on game_sessions(user_id, is_active);
create index if not exists idx_game_moves_user_game on game_moves(user_id, game_id);
create index if not exists idx_llm_calls_model on llm_calls(provider, model);
`

type DB = Database.Database

let cached: DB | null = null

export function getDb(): DB {
  if (cached) return cached
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.exec(SCHEMA)
  cached = db
  return db
}

export type ProfileRow = {
  id: string
  skill_rating: number
  games_played: number
  wins: number
  losses: number
  draws: number
  total_blunders: number
  total_mistakes: number
  total_inaccuracies: number
  total_good_moves: number
  total_excellent_moves: number
  total_brilliant_moves: number
  average_accuracy: number
  current_streak: number
  preferred_color: string
  initial_elo_set: number
  tactics_score: number
  position_score: number
  endgame_score: number
  current_bot_elo: number
  created_at: string
  updated_at: string
}

export type SessionRow = {
  id: string
  user_id: string
  game_state: string
  game_history: string
  move_notations: string
  game_evaluations: string
  player_color: string
  current_difficulty: number
  history_index: number
  move_times: string
  bot_elo: number
  bot_elo_history: string
  is_active: number
  created_at: string
  updated_at: string
}

export function getProfile(): ProfileRow {
  const db = getDb()
  let row = db.prepare("select * from player_profiles where id = ?").get(LOCAL_USER_ID) as
    | ProfileRow
    | undefined
  if (!row) {
    db.prepare(
      "insert into player_profiles (id) values (?) on conflict(id) do nothing"
    ).run(LOCAL_USER_ID)
    row = db.prepare("select * from player_profiles where id = ?").get(LOCAL_USER_ID) as ProfileRow
  }
  return row
}

export function updateProfile(patch: Partial<Omit<ProfileRow, "id" | "created_at" | "updated_at">>): ProfileRow {
  const db = getDb()
  const keys = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined)
  if (keys.length > 0) {
    const cols = keys.map((k) => `${k} = @${k}`).join(", ")
    db.prepare(`update player_profiles set ${cols}, updated_at = datetime('now') where id = @__id`).run({
      ...patch,
      __id: LOCAL_USER_ID,
    })
  }
  return getProfile()
}

export function getActiveSession(): SessionRow | null {
  const db = getDb()
  const row = db
    .prepare("select * from game_sessions where user_id = ? and is_active = 1 order by updated_at desc limit 1")
    .get(LOCAL_USER_ID) as SessionRow | undefined
  return row ?? null
}

export type SessionInput = {
  game_state: unknown
  game_history: unknown
  move_notations: string[]
  game_evaluations: unknown
  player_color: string
  current_difficulty: number
  history_index: number
  move_times: number[]
  bot_elo: number
  bot_elo_history: number[]
}

export function upsertSession(input: SessionInput): SessionRow {
  const db = getDb()
  const existing = getActiveSession()
  const row = {
    game_state: JSON.stringify(input.game_state),
    game_history: JSON.stringify(input.game_history),
    move_notations: JSON.stringify(input.move_notations),
    game_evaluations: JSON.stringify(input.game_evaluations),
    player_color: input.player_color,
    current_difficulty: input.current_difficulty,
    history_index: input.history_index,
    move_times: JSON.stringify(input.move_times),
    bot_elo: Math.round(input.bot_elo ?? 1000),
    bot_elo_history: JSON.stringify(input.bot_elo_history ?? []),
    updated_at: new Date().toISOString(),
  }
  if (existing) {
    db.prepare(
      `update game_sessions set
         game_state = @game_state, game_history = @game_history, move_notations = @move_notations,
         game_evaluations = @game_evaluations, player_color = @player_color,
         current_difficulty = @current_difficulty, history_index = @history_index,
         move_times = @move_times, bot_elo = @bot_elo, bot_elo_history = @bot_elo_history,
         updated_at = @updated_at
       where id = @id`
    ).run({ ...row, id: existing.id })
    return db.prepare("select * from game_sessions where id = ?").get(existing.id) as SessionRow
  }
  const id = randomUUID()
  db.prepare(
    `insert into game_sessions (id, user_id, game_state, game_history, move_notations, game_evaluations,
       player_color, current_difficulty, history_index, move_times, bot_elo, bot_elo_history, updated_at)
     values (@id, @user_id, @game_state, @game_history, @move_notations, @game_evaluations,
       @player_color, @current_difficulty, @history_index, @move_times, @bot_elo, @bot_elo_history, @updated_at)`
  ).run({ ...row, id, user_id: LOCAL_USER_ID })
  return db.prepare("select * from game_sessions where id = ?").get(id) as SessionRow
}

export function deactivateSession(): void {
  const db = getDb()
  db.prepare("update game_sessions set is_active = 0, updated_at = ? where user_id = ? and is_active = 1").run(
    new Date().toISOString(),
    LOCAL_USER_ID
  )
}

export type SaveGameInput = {
  result: number
  player_color: string
  ai_elo: number
  total_moves: number
  excellent_moves: number
  good_moves: number
  inaccurate_moves: number
  mistakes: number
  blunders: number
  ams: number
  std_deviation: number
  avg_time_per_move: number
  player_elo_before: number
  player_elo_after: number
  tactics_score: number
  position_score: number
  endgame_score: number
  current_bot_elo: number
  pattern_moves: {
    moveNo: number
    squareFrom: string
    squareTo: string
    piece: string | null
    grade: string
    centipawnLoss: number
    isCapture: boolean
    isCheck: boolean
    timeMs: number | null
  }[]
}

export function saveGame(input: SaveGameInput): void {
  const db = getDb()
  const tx = db.transaction(() => {
    const gameId = randomUUID()
    db.prepare(
      `insert into game_stats (id, game_id, user_id, result, player_color, ai_elo, total_moves,
         excellent_moves, good_moves, inaccurate_moves, mistakes, blunders, ams, std_deviation,
         avg_time_per_move, player_elo_before, player_elo_after)
       values (@id, @game_id, @user_id, @result, @player_color, @ai_elo, @total_moves,
         @excellent_moves, @good_moves, @inaccurate_moves, @mistakes, @blunders, @ams, @std_deviation,
         @avg_time_per_move, @player_elo_before, @player_elo_after)`
    ).run({
      id: gameId,
      game_id: gameId,
      user_id: LOCAL_USER_ID,
      result: input.result,
      player_color: input.player_color,
      ai_elo: Math.round(input.ai_elo),
      total_moves: input.total_moves,
      excellent_moves: input.excellent_moves,
      good_moves: input.good_moves,
      inaccurate_moves: input.inaccurate_moves,
      mistakes: input.mistakes,
      blunders: input.blunders,
      ams: input.ams,
      std_deviation: input.std_deviation,
      avg_time_per_move: input.avg_time_per_move,
      player_elo_before: Math.round(input.player_elo_before),
      player_elo_after: Math.round(input.player_elo_after),
    })

    const insertMove = db.prepare(
      `insert into game_moves (id, user_id, game_id, move_no, square_from, square_to, piece,
         grade, centipawn_loss, is_capture, is_check, time_ms)
       values (@id, @user_id, @game_id, @move_no, @square_from, @square_to, @piece,
         @grade, @centipawn_loss, @is_capture, @is_check, @time_ms)`
    )
    for (const m of input.pattern_moves ?? []) {
      insertMove.run({
        id: randomUUID(),
        user_id: LOCAL_USER_ID,
        game_id: gameId,
        move_no: m.moveNo,
        square_from: m.squareFrom,
        square_to: m.squareTo,
        piece: m.piece,
        grade: m.grade,
        centipawn_loss: Math.round(Number(m.centipawnLoss) || 0),
        is_capture: m.isCapture ? 1 : 0,
        is_check: m.isCheck ? 1 : 0,
        time_ms: m.timeMs,
      })
    }

    const profile = getProfile()
    updateProfile({
      skill_rating: Math.round(input.player_elo_after),
      current_bot_elo: Math.round(input.current_bot_elo || input.ai_elo),
      games_played: profile.games_played + 1,
      wins: profile.wins + (input.result === 1 ? 1 : 0),
      losses: profile.losses + (input.result === 0 ? 1 : 0),
      draws: profile.draws + (input.result === 0.5 ? 1 : 0),
      total_blunders: profile.total_blunders + input.blunders,
      total_mistakes: profile.total_mistakes + input.mistakes,
      total_inaccuracies: profile.total_inaccuracies + input.inaccurate_moves,
      total_excellent_moves: profile.total_excellent_moves + input.excellent_moves,
      tactics_score: clamp100(input.tactics_score),
      position_score: clamp100(input.position_score),
      endgame_score: clamp100(input.endgame_score),
      current_streak:
        input.result === 1
          ? Math.max(0, profile.current_streak) + 1
          : input.result === 0
            ? Math.min(0, profile.current_streak) - 1
            : 0,
    })
    deactivateSession()
  })
  tx()
}

export type LlmCallInput = {
  provider: string
  model: string
  prompt_version?: string
  status: string
  latency_ms?: number
  parse_count?: number
  error?: string
  prompt?: string
  data?: unknown
  meta?: unknown
}

export function insertLlmCall(input: LlmCallInput): void {
  const db = getDb()
  db.prepare(
    `insert into llm_calls (provider, model, prompt_version, status, latency_ms, parse_count, error, prompt, data, meta)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.provider,
    input.model,
    input.prompt_version ?? null,
    input.status,
    input.latency_ms ?? null,
    input.parse_count ?? null,
    input.error ?? null,
    input.prompt ?? null,
    input.data !== undefined ? JSON.stringify(input.data) : null,
    input.meta !== undefined ? JSON.stringify(input.meta) : null
  )
}

/** One player move as persisted in `game_moves` (camelCase mirrors the schema). */
export type SavedMoveRow = {
  gameId: string
  moveNo: number
  squareFrom: string
  squareTo: string
  piece: string | null
  grade: string
  centipawnLoss: number
  isCapture: number
  isCheck: number
  timeMs: number | null
}

/** Every saved player move across all finished games, oldest game first. */
export function getPlayerMoveHistory(): SavedMoveRow[] {
  const db = getDb()
  return db
    .prepare(
      `select game_id as gameId, move_no as moveNo, square_from as squareFrom, square_to as squareTo,
              piece, grade, centipawn_loss as centipawnLoss, is_capture as isCapture,
              is_check as isCheck, time_ms as timeMs
       from game_moves where user_id = ? order by game_id, move_no`
    )
    .all(LOCAL_USER_ID) as SavedMoveRow[]
}

/** One finished game as persisted in `game_stats` (camelCase mirror of the schema). */
export type GameHistoryRow = {
  id: string
  result: number
  playerColor: string
  aiElo: number
  totalMoves: number
  excellentMoves: number
  goodMoves: number
  inaccurateMoves: number
  mistakes: number
  blunders: number
  ams: number
  playerEloBefore: number
  playerEloAfter: number
  createdAt: string
}

/** Most recent finished games first. */
export function getGameHistory(limit = 20): GameHistoryRow[] {
  const db = getDb()
  return db
    .prepare(
      `select id, result, player_color as playerColor, ai_elo as aiElo, total_moves as totalMoves,
              excellent_moves as excellentMoves, good_moves as goodMoves,
              inaccurate_moves as inaccurateMoves, mistakes, blunders, ams,
              player_elo_before as playerEloBefore, player_elo_after as playerEloAfter,
              created_at as createdAt
       from game_stats where user_id = ? order by created_at desc limit ?`
    )
    .all(LOCAL_USER_ID, limit) as GameHistoryRow[]
}

export function resetLocalData(): void {
  const db = getDb()
  db.exec(
    `delete from game_moves; delete from game_stats; delete from game_sessions; delete from player_profiles; delete from llm_calls;`
  )
}

function clamp100(n: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 50)))
}

function randomUUID(): string {
  return crypto.randomUUID()
}