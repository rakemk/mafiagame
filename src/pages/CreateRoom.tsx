import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { isValidPlayerName } from "@/lib/utils";
import { ArrowLeft, Users } from "lucide-react";
import { getRoleDistribution } from "@/lib/utils";

const CreateRoom = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [gameName, setGameName] = useState("Mafia Night");
  const [playerName, setPlayerName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [isCreating, setIsCreating] = useState(false);

  const roomCode = searchParams.get("code") || "";

  const handleCreate = async () => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
    if (!stored || !stored.trim()) {
      toast({ title: "Set Name", description: "Please set your Game Name first", variant: "destructive" });
      navigate('/set-username');
      return;
    }

    if (!isValidPlayerName(stored)) {
      toast({ title: "Invalid Name", description: "Stored Game Name is invalid. Please update it.", variant: "destructive" });
      navigate('/set-username');
      return;
    }

    if (maxPlayers < 10) {
      toast({
        title: "Error",
        description: "Minimum 10 players required",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      // Create room
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert({
          code: roomCode,
          name: gameName,
          creator_id: stored,
          max_players: maxPlayers,
          current_players: 1,
          status: "waiting",
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Create game state
      await supabase.from("game_states").insert({
        room_id: room.id,
        phase: "lobby",
        round_number: 0,
      });

      // Add creator as first player
      await supabase.from("players").insert({
        room_id: room.id,
        user_name: stored,
        seat_number: 0,
        status: "alive",
      });

      // Persist local player name so the client knows who created / joined
      try {
        localStorage.setItem("playerName", stored);
      } catch (e) {
        // ignore localStorage errors (e.g., SSR or disabled storage)
      }
      toast({
        title: "Room Created!",
        description: `Room code: ${roomCode}`,
      });

      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error("Error creating room:", error);
      toast({
        title: "Error",
        description: "Failed to create room",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <Button
          variant="ghost"
          onClick={() => navigate("/home")}
          className="mb-6 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-3xl">Create New Game</CardTitle>
            <CardDescription>Set up your Mafia game room</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Room Code</Label>
              <Input
                value={roomCode}
                readOnly
                className="bg-muted text-foreground font-mono text-lg text-center uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label>Game Name</Label>
              <Input
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="Enter game name"
                className="bg-input border-border text-foreground"
              />
            </div>

            {/* Name is handled via profile popup on sign-in; no inline change allowed here */}

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Maximum Players (min: 10)
              </Label>
              <Input
                type="number"
                min={10}
                max={20}
                value={maxPlayers}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isNaN(v)) {
                    setMaxPlayers(10);
                    return;
                  }
                  // Clamp to 10-20
                  setMaxPlayers(Math.max(10, Math.min(20, v)));
                }}
                className="bg-input border-border text-foreground"
              />
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const dist = getRoleDistribution(maxPlayers);
                  return `Roles: ${dist.mafia} Mafia, ${dist.doctor} Doctor, ${dist.police} Police, ${dist.citizens} Citizens`;
                })()}
              </p>
            </div>

            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
            >
              {isCreating ? "Creating..." : "Create Room"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateRoom;
