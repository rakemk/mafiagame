import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Plus, LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { isValidPlayerName } from "@/lib/utils";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createRoom = async () => {
    const code = generateRoomCode();
    navigate(`/create?code=${code}`);
  };

  const joinRoom = async () => {
    if (!roomCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter a room code",
        variant: "destructive",
      });
      return;
    }

    // Use stored playerName from profile/localStorage
    const storedName = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
    if (!storedName || !storedName.trim()) {
      toast({ title: "Set Name", description: "Please set your Game Name first", variant: "destructive" });
      navigate("/set-username");
      return;
    }

    if (!isValidPlayerName(storedName)) {
      toast({ title: "Invalid Name", description: "Stored Game Name is invalid. Please update it.", variant: "destructive" });
      navigate("/set-username");
      return;
    }

    setIsJoining(true);
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode.toUpperCase())
        .single();

      if (error || !data) {
        toast({
          title: "Room not found",
          description: "Please check the room code and try again",
          variant: "destructive",
        });
        return;
      }

      // Prevent joining another room if this client already joined one (local) or the account is already in a room (server)
      try {
        // local check: explicit currentRoomId key
        const localCurrent = typeof window !== "undefined" ? localStorage.getItem("currentRoomId") : null;
        if (localCurrent && localCurrent !== data.id) {
          toast({ title: "Already In Room", description: "You are already in another room. Leave it before joining a different room.", variant: "destructive" });
          setIsJoining(false);
          navigate(`/room/${localCurrent}`);
          return;
        }

        // local check: any stored playerId_{roomId} key
        try {
          if (typeof window !== "undefined") {
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith("playerId_")) {
                const rid = k.substring("playerId_".length);
                if (rid && rid !== data.id && localStorage.getItem(k)) {
                  toast({ title: "Already In Room", description: "You are already in another room. Leave it before joining a different room.", variant: "destructive" });
                  setIsJoining(false);
                  navigate(`/room/${rid}`);
                  return;
                }
              }
            }
          }
        } catch (_) {}

        // server check: if authenticated, ensure account not already in another room
        try {
          const { data: userData } = await supabase.auth.getUser();
          const me = userData?.user ?? null;
          if (me && me.id) {
            const { data: other, error: otherErr } = await supabase
              .from("players")
              .select("room_id")
              .eq("user_id", me.id)
              .neq("room_id", data.id)
              .limit(1)
              .maybeSingle();
            if (!otherErr && other && (other as any).room_id) {
              toast({ title: "Already In Room", description: "Your account is already in another room. Leave it before joining a different room.", variant: "destructive" });
              setIsJoining(false);
              navigate(`/room/${(other as any).room_id}`);
              return;
            }
          }
        } catch (_) {}
      } catch (_) {}

      // Check capacity
      if (data.current_players >= data.max_players) {
        toast({
          title: "Room Full",
          description: "This room has reached maximum capacity",
          variant: "destructive",
        });
        return;
      }


      // Add player to players table
      // If this signed-in account already has a player in this room, avoid attaching the same user_id
      // so multiple players can play from the same email/account (e.g., local testing or siblings).
      let insertPayload: any = {
        room_id: data.id,
        user_name: storedName.trim(),
        seat_number: data.current_players,
        status: "alive",
      };

      // Detect whether `players.user_id` exists in the schema. Some deployments may not have this column,
      // so probe with a harmless select and fallback if it errors.
      let canAttachUserId = false;
      if (authUser) {
        try {
          const { data: check, error: checkErr } = await (supabase as any)
            .from('players')
            .select('user_id')
            .limit(1)
            .maybeSingle();
          if (!checkErr) {
            canAttachUserId = true;
          }
        } catch (e) {
          // schema likely missing `user_id` — we'll proceed without attaching it.
          canAttachUserId = false;
        }

        if (canAttachUserId) {
          try {
            const existing = await supabase
              .from('players')
              .select('id')
              .eq('room_id', data.id)
              .eq('user_id', authUser.id)
              .limit(1)
              .maybeSingle();
            // If no existing player found for this account in the same room, attach user_id
            if (!existing || (existing && !existing.data)) {
              insertPayload.user_id = authUser.id;
            } else {
              // warn user they are creating an additional guest player
              toast({ title: 'Note', description: 'Creating a guest player (same account already in room).', variant: 'default' });
            }
          } catch (e) {
            // if check fails, fall back to not attaching user_id to avoid blocking
            console.warn('Failed to check existing players for user_id:', e);
            canAttachUserId = false;
          }
        } else {
          try {
            // eslint-disable-next-line no-console
            console.log('players table missing `user_id` column; skipping user_id attach');
          } catch (_) {}
        }
      }

      // Insert and select the inserted row so we can pass it optimistically to the room view
      const { data: inserted, error: insertErr } = await supabase
        .from("players")
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) {
        toast({ title: 'Join Failed', description: (insertErr as any)?.message || String(insertErr), variant: 'destructive' });
        return;
      }

      try {
        // debug
        // eslint-disable-next-line no-console
        console.log('joinRoom: inserted player', inserted);
      } catch (_) {}

      // Increment current_players
      await supabase
        .from("rooms")
        .update({ current_players: data.current_players + 1 })
        .eq("id", data.id);

      try {
        localStorage.setItem("playerName", storedName.trim());
      } catch (e) {
        // ignore storage errors
      }

      // Fetch latest players + room and dispatch in-page events so other open tabs update immediately
      try {
        const { data: latestPlayers } = await (supabase as any)
          .from("players")
          .select("id,user_name,seat_number,status,user_id")
          .eq("room_id", data.id)
          .order("seat_number");

        const { data: latestRoom } = await supabase.from("rooms").select("*").eq("id", data.id).single();

        try {
          window.dispatchEvent(new CustomEvent("players:updated", { detail: { roomId: data.id, players: latestPlayers } }));
        } catch (_) {}
        try {
          window.dispatchEvent(new CustomEvent("room:updated", { detail: { room: latestRoom } }));
        } catch (_) {}
      } catch (e) {
        try {
          // eslint-disable-next-line no-console
          console.warn('joinRoom: failed to fetch latest players/room', e);
        } catch (_) {}
      }

      // Persist current room id locally so client won't join other rooms without leaving
      try {
        if (data && data.id) {
          try {
            localStorage.setItem("currentRoomId", data.id);
          } catch (_) {}
        }
        if (inserted && inserted.id && data && data.id) {
          try {
            localStorage.setItem(`playerId_${data.id}`, String(inserted.id));
          } catch (_) {}
        }
      } catch (_) {}

      // Navigate to room and pass the inserted player so the room can show it immediately
      try {
        navigate(`/room/${data.id}`, { state: { optimisticPlayer: inserted } as any });
      } catch (_) {
        // fallback
        navigate(`/room/${data.id}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to join room",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  const refreshAuthUser = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      setAuthUser(data?.user ?? null);
    } catch (e) {
      setAuthUser(null);
    }
  };

  const signInWithProvider = async (provider: string) => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        toast({ title: "Login error", description: error.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Login error", description: err?.message || "Failed to start OAuth", variant: "destructive" });
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "Signed out" });
      setAuthUser(null);
      navigate('/');
    } catch (e) {
      toast({ title: "Error", description: "Failed to sign out", variant: "destructive" });
    }
  };

  useEffect(() => {
    refreshAuthUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, _session) => {
      refreshAuthUser();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // If user signed in, prefill player name with explicit display name fields only (do NOT use email)
  useEffect(() => {
    if (!authUser) return;
    if (playerName && playerName.trim().length > 0) return;
    // Prefer explicit name fields from provider metadata; do not fall back to email or id
    const meta = authUser.user_metadata || authUser.user_metadata || {};
    const name = (meta.full_name || meta.name || meta.given_name || '').trim();
    if (name) {
      const short = (name as string).split('@')[0];
      setPlayerName(short);
    }
  }, [authUser]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-8 animate-fade-in">
        <div className="text-center space-y-4 pl-16 sm:pl-0">
          <div className="flex items-center justify-center">
            <h1 className="text-4xl sm:text-6xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
            MAFIA
            </h1>
            {authUser && (
              <div className="ml-4">
                <Button size="sm" variant="ghost" onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </Button>
              </div>
            )}
          </div>
          <p className="text-xl text-muted-foreground">
            The Ultimate Social Deduction Game
          </p>
        </div>

        {/* Provider sign-in removed per request */}

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-card border-border hover:border-primary transition-all duration-300 hover:shadow-lg hover:shadow-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create Room
              </CardTitle>
              <CardDescription>
                Start a new game and invite your friends
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={createRoom} 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                size="lg"
              >
                Create New Game
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border hover:border-accent transition-all duration-300 hover:shadow-lg hover:shadow-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Join Room
              </CardTitle>
              <CardDescription>
                Enter a room code to join an existing game
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="uppercase bg-input border-border text-foreground"
                maxLength={6}
              />
              <Button 
                onClick={joinRoom} 
                disabled={isJoining}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                size="lg"
              >
                {isJoining ? "Joining..." : "Join Game"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              How to Play
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p><strong className="text-foreground">Night Phase:</strong> Mafia chooses a victim, Doctor saves someone, Police investigates a player</p>
            <p><strong className="text-foreground">Day Phase:</strong> All players discuss and vote to eliminate a suspect</p>
            <p><strong className="text-foreground">Win Condition:</strong> Eliminate all Mafia or survive as Mafia when you equal other players</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
