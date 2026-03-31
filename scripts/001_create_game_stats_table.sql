-- Create game_stats table to store player game statistics
CREATE TABLE IF NOT EXISTS game_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Game result
  result DECIMAL(2,1) NOT NULL, -- 1 for win, 0 for loss, 0.5 for draw
  player_color VARCHAR(1) NOT NULL, -- 'w' or 'b'
  ai_elo INTEGER NOT NULL,
  
  -- Move statistics
  total_moves INTEGER NOT NULL DEFAULT 0,
  excellent_moves INTEGER NOT NULL DEFAULT 0,
  good_moves INTEGER NOT NULL DEFAULT 0,
  inaccurate_moves INTEGER NOT NULL DEFAULT 0,
  mistakes INTEGER NOT NULL DEFAULT 0,
  blunders INTEGER NOT NULL DEFAULT 0,
  
  -- Performance metrics
  ams DECIMAL(4,3) NOT NULL, -- Average Move Score (0-1)
  std_deviation DECIMAL(5,3) NOT NULL, -- Standard deviation of move scores
  avg_time_per_move DECIMAL(10,2), -- Average time per move in seconds
  
  -- ELO changes
  player_elo_before INTEGER NOT NULL,
  player_elo_after INTEGER NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for user queries
CREATE INDEX IF NOT EXISTS idx_game_stats_user_id ON game_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_game_stats_created_at ON game_stats(created_at);

-- Enable RLS
ALTER TABLE game_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own game stats" ON game_stats 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own game stats" ON game_stats 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own game stats" ON game_stats 
  FOR UPDATE USING (auth.uid() = user_id);
