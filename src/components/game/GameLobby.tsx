import { useState } from "react";
import { useNavigate } from "react-router-dom";
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

  const navigate = useNavigate();

  const leaveRoom = async () => {
    try {
      // find local player id: prefer stored playerId_{roomId}, otherwise lookup by name
      let pid: string | null = null;
      try {
        pid = typeof window !== "undefined" ? localStorage.getItem(`playerId_${room.id}`) : null;
      } catch (_) {
        pid = null;
      }

      if (!pid) {
        const name = localPlayerName ?? (typeof window !== "undefined" ? localStorage.getItem("playerName") : null);
        if (name) {
          const found = players.find((p) => (p.user_name || "").trim().toLowerCase() === name.trim().toLowerCase());
          if (found) pid = found.id;
        }
      }

      if (!pid) {
        toast({ title: "Not Found", description: "Could not find your player in this room.", variant: "destructive" });
        return;
      }

      const ok = window.confirm("Are you sure you want to leave the room? This will remove you from the lobby.");
      if (!ok) return;

      // delete player row
      const { error: delErr } = await supabase.from("players").delete().eq("id", pid).eq("room_id", room.id);
      if (delErr) {
        toast({ title: "Error", description: delErr.message || "Failed to leave room", variant: "destructive" });
        return;
      }

      // decrement room count (best-effort)
      try {
        await supabase.from("rooms").update({ current_players: Math.max(0, players.length - 1) }).eq("id", room.id);
      } catch (_) {}

      // clear local storage keys for this room
      try {
        localStorage.removeItem(`playerId_${room.id}`);
        const cur = localStorage.getItem("currentRoomId");
        if (cur === room.id) localStorage.removeItem("currentRoomId");
      } catch (_) {}

      // fetch latest players + room and dispatch events
      try {
        const { data: latestPlayers } = await (supabase as any)
          .from("players")
          .select("id,user_name,seat_number,status,user_id")
          .eq("room_id", room.id)
          .order("seat_number");
        const { data: latestRoom } = await supabase.from("rooms").select("*").eq("id", room.id).single();
        try { window.dispatchEvent(new CustomEvent("players:updated", { detail: { roomId: room.id, players: latestPlayers } })); } catch (_) {}
        try { window.dispatchEvent(new CustomEvent("room:updated", { detail: { room: latestRoom } })); } catch (_) {}
      } catch (_) {}

      toast({ title: "Left Room", description: "You have left the room." });
      navigate("/");
    } catch (e) {
      toast({ title: "Error", description: "Failed to leave room", variant: "destructive" });
    }
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
      // Prevent joining another room if this client already has a player in a different room
      try {
        const localCurrent = typeof window !== "undefined" ? localStorage.getItem("currentRoomId") : null;
        if (localCurrent && localCurrent !== room.id) {
          toast({ title: "Already In Room", description: "You are already in another room. Leave it before joining a different room.", variant: "destructive" });
          setIsJoining(false);
          return;
        }

        if (typeof window !== "undefined") {
          for (const k of Object.keys(localStorage)) {
            if (k.startsWith("playerId_")) {
              const rid = k.substring("playerId_".length);
              if (rid && rid !== room.id && localStorage.getItem(k)) {
                toast({ title: "Already In Room", description: "You are already in another room. Leave it before joining a different room.", variant: "destructive" });
                setIsJoining(false);
                return;
              }
            }
          }
        }

        // server-side check for authenticated users
        try {
          const { data: userData } = await supabase.auth.getUser();
          const me = userData?.user ?? null;
          if (me && me.id) {
            const { data: other, error: otherErr } = await supabase
              .from("players")
              .select("room_id")
              .eq("user_id", me.id)
              .neq("room_id", room.id)
              .limit(1)
              .maybeSingle();
            if (!otherErr && other && (other as any).room_id) {
              toast({ title: "Already In Room", description: "Your account is already in another room. Leave it before joining a different room.", variant: "destructive" });
              setIsJoining(false);
              return;
            }
          }
        } catch (_) {}
      } catch (_) {}

      const nameTrim = (stored || "").trim();
      const seatNumber = typeof room.current_players === "number" ? room.current_players : players.length;

      const { data: inserted, error: insertErr } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          user_name: nameTrim,
          seat_number: seatNumber,
          status: "alive",
        })
        .select()
        .single();

      if (insertErr) {
        const msg = (insertErr as any)?.message || String(insertErr);
        toast({ title: "Join Failed", description: msg, variant: "destructive" });
        setIsJoining(false);
        return;
      }

      try {
        // eslint-disable-next-line no-console
        console.log("GameLobby.joinAsPlayer: inserted", inserted);
      } catch (_) {}

      // optimistic UI: immediately notify parent with appended player so joiner sees their name
      try {
        const optimistic = [...players, inserted];
        try {
          // eslint-disable-next-line no-console
          console.log('GameLobby.joinAsPlayer: dispatch optimistic players', optimistic);
        } catch (_) {}
        window.dispatchEvent(new CustomEvent("players:updated", { detail: { roomId: room.id, players: optimistic } }));
      } catch (_) {}

      // best-effort: update room current players count
      try {
        await supabase
          .from("rooms")
          .update({ current_players: (seatNumber || 0) + 1 })
          .eq("id", room.id);
      } catch (_) {}

      // fetch latest players + room and dispatch in-page events so parent updates immediately
      try {
        const { data: latestPlayers } = await (supabase as any)
          .from("players")
          .select("id,user_name,seat_number,status,user_id")
          .eq("room_id", room.id)
          .order("seat_number");

        const { data: latestRoom } = await supabase.from("rooms").select("*").eq("id", room.id).single();

        try {
          window.dispatchEvent(new CustomEvent("players:updated", { detail: { roomId: room.id, players: latestPlayers } }));
        } catch (_) {}
        try {
          window.dispatchEvent(new CustomEvent("room:updated", { detail: { room: latestRoom } }));
        } catch (_) {}

        try {
          // eslint-disable-next-line no-console
          console.log('GameLobby.joinAsPlayer: latestPlayers', latestPlayers);
        } catch (_) {}
      } catch (fetchErr) {
        try {
          // eslint-disable-next-line no-console
          console.warn('GameLobby.joinAsPlayer: failed to fetch latest players/room', fetchErr);
        } catch (_) {}
      }

      toast({ title: "Joined!", description: `You joined as ${inserted?.user_name ?? stored}` });
      try {
        localStorage.setItem("playerName", nameTrim);
      } catch (e) {
        // ignore localStorage errors
      }

      try {
        if (inserted && inserted.id) {
          try { localStorage.setItem(`playerId_${room.id}`, String(inserted.id)); } catch (_) {}
        }
        try { localStorage.setItem('currentRoomId', room.id); } catch (_) {}
      } catch (_) {}
    } catch (error: any) {
      const msg = error?.message || String(error || "Failed to join");
      toast({ title: "Error", description: msg, variant: "destructive" });
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

        {/* Leave room (only for non-creators) */}
        {!isCreator && (
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle>Leave Room</CardTitle>
              <CardDescription>Remove yourself from the lobby and return to home</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-start">
                <Button variant="destructive" onClick={leaveRoom}>Exit Room</Button>
              </div>
            </CardContent>
          </Card>
        )}

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
