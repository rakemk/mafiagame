import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/utils";
import { isValidPlayerName } from "@/lib/utils";
import { Users, Copy } from "lucide-react";
import { getRoleDistribution } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Room {
  id: string;
  code: string;
  name: string;
  max_players: number;
  current_players: number;
}

interface Player {
  id: string;
  user_name: string;
  seat_number: number;
}

interface GameLobbyProps {
  room: Room;
  players: Player[];
  isCreator?: boolean;
  localPlayerName?: string | null;
}

const GameLobby = ({ room, players, isCreator = false, localPlayerName = null }: GameLobbyProps) => {
  const { toast } = useToast();
  const localName = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
  const [playerName, setPlayerName] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const copyRoomCode = () => {
    (async () => {
      const ok = await copyToClipboard(room.code);
      if (ok) {
        toast({
          title: "Copied!",
          description: "Room code copied to clipboard",
        });
      } else {
        toast({
          title: "Copy failed",
          description: "Could not copy the room code. Please copy it manually.",
          variant: "destructive",
        });
      }
    })();
  };

  const joinAsPlayer = async () => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
    if (!stored || !stored.trim()) {
      toast({ title: "Set Name", description: "Please set your Game Name first", variant: "destructive" });
      window.location.href = "/set-username";
      return;
    }

    if (!isValidPlayerName(stored)) {
      toast({ title: "Invalid Name", description: "Stored Game Name is invalid. Please update it.", variant: "destructive" });
      window.location.href = "/set-username";
      return;
    }

    if (players.length >= room.max_players) {
      toast({
        title: "Room Full",
        description: "This room has reached maximum capacity",
        variant: "destructive",
      });
      return;
    }

    setIsJoining(true);
    try {
      await supabase.from("players").insert({
        room_id: room.id,
        user_name: stored,
        seat_number: players.length,
        status: "alive",
      });

        try {
          // debug
          // eslint-disable-next-line no-console
          console.log('GameLobby.joinAsPlayer: inserted', { room_id: room.id, user_name: playerName, seat_number: players.length });
        } catch (_) {}

      await supabase
        .from("rooms")
        .update({ current_players: players.length + 1 })
        .eq("id", room.id);

      toast({
        title: "Joined!",
        description: "You have joined the game",
      });
      try {
        localStorage.setItem("playerName", stored);
      } catch (e) {
        // ignore localStorage errors
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to join game",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Players ({players.length}/{room.max_players})
            </span>
            <Badge variant={players.length >= 10 ? "default" : "secondary"}>
              {players.length >= 10 ? "Ready to Start" : "Waiting..."}
            </Badge>
          </CardTitle>
          <CardDescription>
            Minimum 10 players required to start
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
            {players.map((player, index) => (
              <Card key={player.id} className="bg-muted border-border p-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {player.user_name.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {player.user_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seat {index + 1}
                    </p>
                  </div>
                  {isCreator && (
                    <div className="ml-2">
                      <button
                        className="text-sm text-destructive underline"
                        onClick={async () => {
                          // Double-check authorization on client before attempting remove
                          if (!isCreator || !localName || localName.trim() !== (room as any).creator_id) {
                            toast({ title: "Not Authorized", description: "Only the room creator can remove players.", variant: "destructive" });
                            return;
                          }

                          const ok = window.confirm(`Remove ${player.user_name} from the room?`);
                          if (!ok) return;
                          try {
                            // Restrict delete to the specific room_id as an extra safety measure
                            await supabase.from("players").delete().eq("id", player.id).eq("room_id", room.id);
                            await supabase
                              .from("rooms")
                              .update({ current_players: Math.max(0, players.length - 1) })
                              .eq("id", room.id);
                          } catch (err) {
                            toast({ title: "Error", description: "Failed to remove player", variant: "destructive" });
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Room Code</CardTitle>
            <CardDescription>Share this code with your friends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={room.code}
                readOnly
                className="bg-muted text-foreground font-mono text-2xl text-center uppercase"
              />
              <Button
                onClick={copyRoomCode}
                variant="outline"
                size="icon"
                className="shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle>Role Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(() => {
              const dist = getRoleDistribution(room.max_players);
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mafia</span>
                    <Badge variant="destructive">{dist.mafia}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Doctor</span>
                    <Badge className="bg-doctor text-doctor-foreground">{dist.doctor}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Police</span>
                    <Badge className="bg-police text-police-foreground">{dist.police}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Citizens</span>
                    <Badge variant="secondary">{dist.citizens}</Badge>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GameLobby;
