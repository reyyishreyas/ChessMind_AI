-- 008: persist per-move pattern events for cross-game profiling.
-- The profile lives in lib/pattern-profile.ts (scoresFromEvents / summarizePatterns);
-- this table stores the raw moves a game summary is reduced from.
create table if not exists game_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid references game_stats(id) on delete cascade,
  move_no integer not null,
  square_from text not null,
  square_to text not null,
  piece text not null,
  grade text not null,
  centipawn_loss integer not null,
  is_capture boolean not null default false,
  is_check boolean not null default false,
  time_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_moves_user_game on game_moves(user_id, game_id);

alter table game_moves enable row level security;

create policy "Users view own game moves" on game_moves
  for select using (auth.uid() = user_id);
create policy "Users insert own game moves" on game_moves
  for insert with check (auth.uid() = user_id);