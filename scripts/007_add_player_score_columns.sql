-- 007: persist live skill scores on player_profiles.
-- Previously tactics_score/position_score/endgame_score were in-memory
-- placeholders (always 50). They are now measured per move by
-- lib/pattern-profile.ts (scoresFromEvents) and stored here so they survive.
alter table public.player_profiles
  add column if not exists tactics_score integer not null default 50,
  add column if not exists position_score integer not null default 50,
  add column if not exists endgame_score integer not null default 50;