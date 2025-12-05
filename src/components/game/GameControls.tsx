import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getRoleDistribution } from "@/lib/utils";
import { Play } from "lucide-react";

interface Room {
  id: string;
  max_players: number;
}

interface GameState {
  phase: string;
  round_number: number;
}

interface Player {
  id: string;
  role?: string;
}

interface GameControlsProps {
  room: Room;
  gameState: GameState | null;
  players: Player[];
}

const GameControls = ({ room, gameState, players }: GameControlsProps) => {
  const { toast } = useToast();

  // Determine whether the current client is the room creator.
  // We persist the user's chosen name in localStorage at create/join time.
  const localPlayerName = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
  const roomCreatorRaw = (room as any)?.creator_id;
  const roomCreator = typeof roomCreatorRaw === "string" ? roomCreatorRaw.trim() : roomCreatorRaw;
  const localNameTrimmed = typeof localPlayerName === "string" ? localPlayerName.trim() : localPlayerName;
  const isCreator = Boolean(roomCreator && localNameTrimmed && roomCreator === localNameTrimmed);

  const assignRoles = (playersList: Player[]) => {
      const dist = getRoleDistribution(room.max_players);
      const roles = [
        ...Array(dist.mafia).fill("mafia"),
        ...Array(dist.doctor).fill("doctor"),
        ...Array(dist.police).fill("police"),
        ...Array(dist.citizens).fill("citizen"),
      ];

    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return playersList.map((player, index) => ({
      ...player,
      role: roles[index],
    }));
  };

  const startGame = async () => {
    if (!isCreator) {
      toast({
        title: "Not Authorized",
        description: "Only the room creator can start the game (you are not the creator)",
        variant: "destructive",
      });
      console.warn("StartGame blocked: creator=", roomCreator, "local=", localNameTrimmed);
      return;
    }
    if (players.length < 10) {
      toast({
        title: "Not Enough Players",
        description: "Need at least 10 players to start",
        variant: "destructive",
      });
      return;
    }

    try {
      // Assign roles
      const playersWithRoles = assignRoles(players);

      for (const player of playersWithRoles) {
        const { error: updateErr } = await supabase
          .from("players")
          .update({ role: player.role })
          .eq("id", player.id);
        if (updateErr) throw updateErr;
      }

        // Upsert game state to initial DAY phase (30s). Use upsert so a missing row is created.
        const { data: gsData, error: gsErr } = await supabase
          .from("game_states")
          .upsert([
            {
              room_id: room.id,
              phase: "night",
              round_number: 1,
              // Night duration: 15 seconds (game starts at night)
              phase_end_time: new Date(Date.now() + 15000).toISOString(),
            },
          ], { onConflict: 'room_id' });

      if (gsErr) throw gsErr;

      try {
        // log the upsert result to help diagnose missing game_state rows
        // eslint-disable-next-line no-console
        console.log("startGame upsert result:", gsData);
      } catch (_) {}

      // Update room status
      const { error: roomErr } = await supabase
        .from("rooms")
        .update({ status: "in_progress" })
        .eq("id", room.id);
      if (roomErr) throw roomErr;

      toast({ title: "Game Started!", description: "Night phase has begun (15s)" });
    } catch (error) {
      console.error("Error starting game:", error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to start game",
        variant: "destructive",
      });
    }
  };

  // Reset/restart concept removed: games cannot be reset from client controls.

  return (
    <div className="flex gap-2">
      {gameState?.phase === "lobby" && isCreator && (
        <Button
          onClick={startGame}
          className="bg-primary hover:bg-primary/90"
          size="lg"
        >
          <Play className="mr-2 h-4 w-4" />
          Start Game
        </Button>
      )}
      {gameState?.phase === "lobby" && !isCreator && (
        <div className="flex items-center px-3 py-2 text-sm text-muted-foreground">Waiting for creator to start</div>
      )}
      
      {/* No reset button: removing restart concept per request */}
    </div>
  );
};

export default GameControls;
