-- Migration: add send_message RPC to enforce chat rules
-- Creates a function public.send_message(room_id uuid, player_id uuid, player_name text, content text, message_type text)
-- The function validates:
-- - Eliminated players cannot send messages
-- - During night: global chat disabled, role chat only for mafia
-- - During day: role chat disabled
-- System messages (player_id NULL) are allowed anytime

BEGIN;

CREATE OR REPLACE FUNCTION public.send_message(
  p_room_id uuid,
  p_player_id uuid,
  p_player_name text,
  p_content text,
  p_message_type text
)
RETURNS TABLE(
  id uuid,
  room_id uuid,
  player_id uuid,
  player_name text,
  content text,
  message_type text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
  v_phase text;
BEGIN
  -- If a player is provided, validate their permissions
  IF p_player_id IS NOT NULL THEN
    SELECT role, status INTO v_role, v_status
    FROM public.players
    WHERE id = p_player_id AND room_id = p_room_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Player not found in room';
    END IF;

    IF v_status = 'dead' THEN
      RAISE EXCEPTION 'Eliminated players cannot send messages';
    END IF;

    SELECT phase INTO v_phase FROM public.game_states WHERE room_id = p_room_id;
    IF v_phase IS NULL THEN
      v_phase := 'lobby';
    END IF;

    IF v_phase = 'night' THEN
      IF p_message_type = 'global' THEN
        RAISE EXCEPTION 'Global chat is disabled during night';
      ELSIF p_message_type = 'role' THEN
        IF v_role <> 'mafia' THEN
          RAISE EXCEPTION 'Only mafia can send role messages during night';
        END IF;
      END IF;
    ELSIF v_phase = 'day' THEN
      IF p_message_type = 'role' THEN
        RAISE EXCEPTION 'Role chat is disabled during day';
      END IF;
    END IF;
  END IF;

  RETURN QUERY
    INSERT INTO public.messages(room_id, player_id, player_name, content, message_type)
    VALUES (p_room_id, p_player_id, p_player_name, p_content, p_message_type)
    RETURNING id, room_id, player_id, player_name, content, message_type, created_at;
END;
$$;

COMMIT;
