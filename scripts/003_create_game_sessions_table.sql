-- Create game_sessions table to persist game state
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Game state (JSON)
  game_state JSONB NOT NULL,
  game_history JSONB NOT NULL DEFAULT '[]',
  move_notations TEXT[] NOT NULL DEFAULT '{}',
  game_evaluations JSONB NOT NULL DEFAULT '[]',
  
  -- Session info
  player_color VARCHAR(1) NOT NULL,
  current_difficulty INTEGER NOT NULL DEFAULT 5,
  history_index INTEGER NOT NULL DEFAULT 0,
  
  -- Move timing
  move_times DECIMAL[] NOT NULL DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for active sessions
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_active ON game_sessions(user_id, is_active);

-- Enable RLS
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions" ON game_sessions 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions" ON game_sessions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON game_sessions 
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" ON game_sessions 
  FOR DELETE USING (auth.uid() = user_id);
