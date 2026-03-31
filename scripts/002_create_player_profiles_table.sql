-- Create player_profiles table for persistent player data
CREATE TABLE IF NOT EXISTS player_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Player stats
  skill_rating INTEGER NOT NULL DEFAULT 1000,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  
  -- Move quality stats
  total_blunders INTEGER NOT NULL DEFAULT 0,
  total_mistakes INTEGER NOT NULL DEFAULT 0,
  total_inaccuracies INTEGER NOT NULL DEFAULT 0,
  total_good_moves INTEGER NOT NULL DEFAULT 0,
  total_excellent_moves INTEGER NOT NULL DEFAULT 0,
  total_brilliant_moves INTEGER NOT NULL DEFAULT 0,
  
  -- Performance
  average_accuracy DECIMAL(5,2) NOT NULL DEFAULT 70.00,
  current_streak INTEGER NOT NULL DEFAULT 0,
  
  -- Preferences
  preferred_color VARCHAR(1) DEFAULT 'w',
  initial_elo_set BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own profile" ON player_profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON player_profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON player_profiles 
  FOR UPDATE USING (auth.uid() = id);
