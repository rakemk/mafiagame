-- Create enum types for game roles and phases
CREATE TYPE game_role AS ENUM ('mafia', 'doctor', 'police', 'citizen');
CREATE TYPE game_phase AS ENUM ('lobby', 'night', 'day', 'ended');
CREATE TYPE player_status AS ENUM ('alive', 'dead', 'spectator');

-- Rooms table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  creator_id UUID NOT NULL,
  max_players INTEGER NOT NULL CHECK (max_players >= 10),
  current_players INTEGER DEFAULT 0,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms"
  ON public.rooms FOR SELECT
  USING (true);

CREATE POLICY "Users can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Creator can update room"
  ON public.rooms FOR UPDATE
  USING (true);

-- Players table
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  role game_role,
  status player_status DEFAULT 'alive',
  is_ready BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, seat_number)
);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view players"
  ON public.players FOR SELECT
  USING (true);

CREATE POLICY "Anyone can join as player"
  ON public.players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Players can update themselves"
  ON public.players FOR UPDATE
  USING (true);

-- Game state table
CREATE TABLE public.game_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID UNIQUE REFERENCES public.rooms(id) ON DELETE CASCADE,
  phase game_phase DEFAULT 'lobby',
  round_number INTEGER DEFAULT 0,
  phase_end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view game state"
  ON public.game_states FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create game state"
  ON public.game_states FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update game state"
  ON public.game_states FOR UPDATE
  USING (true);

-- Votes table
CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, voter_id, round_number)
);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view votes"
  ON public.votes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create votes"
  ON public.votes FOR INSERT
  WITH CHECK (true);

-- Actions table (for night actions)
CREATE TABLE public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, actor_id, round_number)
);

ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view actions"
  ON public.actions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create actions"
  ON public.actions FOR INSERT
  WITH CHECK (true);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'global',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view messages"
  ON public.messages FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create messages"
  ON public.messages FOR INSERT
  WITH CHECK (true);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_states;
ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_states_updated_at
  BEFORE UPDATE ON public.game_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();