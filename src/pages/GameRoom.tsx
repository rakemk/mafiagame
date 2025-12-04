import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import GameTable from "@/components/game/GameTable";
import GameLobby from "@/components/game/GameLobby";
import NightActions from "@/components/game/NightActions";
import GlobalChat from "@/components/game/GlobalChat";
import VotingPanel from "@/components/game/VotingPanel";
import GameControls from "@/components/game/GameControls";
import ChatPanel from "@/components/game/ChatPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { Skull, Shield, Search, User } from "lucide-react";
import { RealtimeChannel } from "@supabase/supabase-js";

interface Room {
  id: string;
  code: string;
  name: string;
  max_players: number;
  current_players: number;
  status: string;
}

interface Player {
  id: string;
  user_name: string;
  seat_number: number;
  role?: string;
  status: string;
  user_id?: string | null;
}

interface GameState {
  phase: string;
  round_number: number;
  phase_end_time?: string;
}

const GameRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { toast } = useToast();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [localPlayerName, setLocalPlayerName] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("playerName") : null
  );
  const [localPlayerRole, setLocalPlayerRole] = useState<string | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [localPlayerStatus, setLocalPlayerStatus] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [revealedPlayers, setRevealedPlayers] = useState<Player[] | null>(null);
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Generate a simple victory image as a PNG blob (client-side) to allow sharing to statuses
  const generateVictoryImageBlob = async (): Promise<Blob | null> => {
    try {
      const width = 1200;
      const height = 630;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // background
      ctx.fillStyle = "#0f172a"; // slate-900
      ctx.fillRect(0, 0, width, height);

      // banner
      ctx.fillStyle = "#10b981"; // emerald
      ctx.fillRect(0, 0, width, 140);

      // Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 48px Inter, system-ui, -apple-system";
      const title = winner ? `${winner.toUpperCase()} WIN!` : "GAME OVER";
      ctx.fillText(title, 40, 90);

      // Room code
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "28px Inter, system-ui, -apple-system";
      const roomText = `Room: ${room?.code ?? ""}`;
      ctx.fillText(roomText, 40, 160);

      // Timestamp
      ctx.fillStyle = "#94a3b8";
      ctx.font = "18px Inter, system-ui, -apple-system";
      ctx.fillText(new Date().toLocaleString(), 40, 190);

      // Small list of top players (first 6) initials
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px Inter, system-ui, -apple-system";
      const list = (revealedPlayers ?? []).slice(0, 6).map((p) => `${p.user_name} (${p.role ?? '—'}) ${p.status === 'dead' ? '✖' : '✔'}`);
      let y = 240;
      for (const l of list) {
        ctx.fillText('- ' + l, 40, y);
        y += 34;
      }

      return await new Promise<Blob | null>((res) => {
        canvas.toBlob((b) => res(b), "image/png");
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('generateVictoryImageBlob failed', e);
      return null;
    }
  };

  const handleDownloadVictoryImage = async () => {
    const blob = await generateVictoryImageBlob();
    if (!blob) {
      alert('Could not generate image');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `victory_${room?.code ?? 'game'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleNativeShare = async () => {
    try {
      if (!navigator.share) {
        // fallback to download
        await handleDownloadVictoryImage();
        return;
      }
      const blob = await generateVictoryImageBlob();
      if (!blob) {
        await handleDownloadVictoryImage();
        return;
      }
      const file = new File([blob], `victory_${room?.code ?? 'game'}.png`, { type: 'image/png' });
      const shareData: any = {
        title: 'Game Result',
        text: `${winner ? winner + ' win! ' : 'Game Over! '}Join: ${window.location.origin + (room?.code ? `/room/${room.code}` : '')}`,
        files: [file],
      };
      // @ts-ignore navigator.share types may not allow files in all environments
      await navigator.share(shareData);
    } catch (e) {
      try {
        await handleDownloadVictoryImage();
      } catch (_) {}
    }
  };

  useEffect(() => {
    if (!roomId) return;

    // If we were navigated here with an optimisticPlayer (e.g., from Join form), append it immediately
    try {
      const stateAny: any = (location && (location as any).state) || null;
      const optimistic = stateAny?.optimisticPlayer ?? null;
      if (optimistic && optimistic.room_id === roomId) {
        setPlayers((prev) => {
          // avoid duplicates
          const exists = (prev || []).some((p) => p.id === optimistic.id || p.user_name === optimistic.user_name);
          if (exists) return prev;
          return [...(prev || []), optimistic];
        });
        try {
          const name = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
          if (name) {
            const lookup = name.trim().toLowerCase();
            const found = optimistic && (optimistic.user_name || "").trim().toLowerCase() === lookup ? optimistic : null;
            setLocalPlayerId(found?.id ?? null);
            setLocalPlayerStatus(found?.status ?? null);
          }
        } catch (_) {}

        // remove optimistic state from history so it doesn't reapply on back/forward
        try {
          if (window && window.history && window.history.replaceState) {
            const newState = { ...(window.history.state || {}), usr: undefined };
            window.history.replaceState(newState, "");
          }
        } catch (_) {}
      }

    } catch (_) {}

    loadRoomData();
    
    // Set up realtime subscriptions
    const roomChannel: RealtimeChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => loadRoomData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => {
          try {
            // debug log realtime payload
            // eslint-disable-next-line no-console
            console.log("realtime players event:", payload);
          } catch (_) {}
          loadPlayers();
          loadLocalRole();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_states", filter: `room_id=eq.${roomId}` },
        () => loadGameState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests", filter: `room_id=eq.${roomId}` },
        () => loadCurrentUserAndRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [roomId]);

  // Listen for in-page updates dispatched by child components (immediate refresh)
  useEffect(() => {
    const onPlayersUpdated = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail;
        if (!detail) return;
        if (detail.roomId && detail.roomId !== roomId) return;
        if (detail.players) {
          setPlayers(detail.players);
          try {
            const name = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
            if (name) {
              const lookup = name.trim().toLowerCase();
              const found = (detail.players || []).find((p: any) => (p.user_name || "").trim().toLowerCase() === lookup);
              setLocalPlayerId(found?.id ?? null);
              setLocalPlayerStatus(found?.status ?? null);
            }
          } catch (_) {}
        } else {
          loadPlayers();
        }
      } catch (_) {}
    };

    const onRoomUpdated = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail;
        if (!detail) return;
        const incoming = detail.room;
        if (!incoming) {
          loadRoomData();
          return;
        }
        if (incoming.id && incoming.id !== roomId) return;
        setRoom(incoming);
      } catch (_) {}
    };

    window.addEventListener("players:updated", onPlayersUpdated as EventListener);
    window.addEventListener("room:updated", onRoomUpdated as EventListener);
    return () => {
      window.removeEventListener("players:updated", onPlayersUpdated as EventListener);
      window.removeEventListener("room:updated", onRoomUpdated as EventListener);
    };
  }, [roomId]);

  // derive local player id from players list
  useEffect(() => {
    if (!localPlayerName) return;
    const found = players.find((p) => p.user_name === localPlayerName);
    setLocalPlayerId(found?.id ?? null);
    setLocalPlayerStatus(found?.status ?? null);
  }, [players, localPlayerName]);

  // Countdown timer for phase_end_time
  useEffect(() => {
    if (!gameState?.phase_end_time) {
      setRemainingSeconds(null);
      return;
    }

    const update = () => {
      const end = Date.parse(gameState.phase_end_time || "");
      const secs = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemainingSeconds(secs);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [gameState]);

  // When day countdown reaches zero, the creator tallies votes and moves to night
  useEffect(() => {
    if (remainingSeconds !== 0) return;
    if (!gameState || gameState.phase !== "day") return;
    // Allow any client to perform resolution, but make DB updates conditional on the current phase

    const resolveDay = async () => {
      try {
        // double-check authoritative game_state before resolving to avoid races
        try {
          // eslint-disable-next-line no-console
          console.log("resolveDay triggered; verifying current game_state before proceeding...");
        } catch (_) {}
        const { data: latest, error: latestErr } = await supabase.from("game_states").select("*").eq("room_id", room?.id).single();
        if (latestErr) {
          // eslint-disable-next-line no-console
          console.warn("Could not fetch latest game_state before day resolution:", latestErr);
        } else {
          const latestPhase = ((latest as any)?.phase || "").toString().trim().toLowerCase();
          const latestEnd = Date.parse((latest as any)?.phase_end_time || "");
          // If another client already changed the phase or the end time is still in the future, abort.
          if (latestPhase !== "day") {
            // eslint-disable-next-line no-console
            console.log("Aborting day resolution: latest phase is", latestPhase);
            return;
          }
          if (latestEnd > Date.now() + 500) {
            // another client has updated the end time; abort to avoid racing
            // eslint-disable-next-line no-console
            console.log("Aborting day resolution: latest phase_end_time is still in the future", new Date(latestEnd).toISOString());
            return;
          }
        }

      const round = gameState.round_number;
        // tally votes for the round
        const { data: votesData, error: votesErr } = await supabase
          .from("votes")
          .select("*")
          .eq("room_id", room?.id)
          .eq("round_number", round);
        if (votesErr) throw votesErr;

        const votes = (votesData as any[]) || [];
        const count: Record<string, number> = {};
        for (const v of votes) {
          if (!v.target_id) continue;
          count[v.target_id] = (count[v.target_id] || 0) + 1;
        }

        // determine top vote
        let topId: string | null = null;
        let topCount = 0;
        let tie = false;
        for (const tid in count) {
          if (count[tid] > topCount) {
            topCount = count[tid];
            topId = tid;
            tie = false;
          } else if (count[tid] === topCount) {
            tie = true;
          }
        }

        // if no tie and someone has votes, eliminate
        if (topId && !tie) {
          await supabase.from("players").update({ status: "dead" }).eq("id", topId);
          const { data: victimData } = await supabase.from("players").select("user_name").eq("id", topId).single();
          const victimName = (victimData as any)?.user_name ?? "A player";
          await supabase.from("messages").insert({ room_id: room?.id, player_id: null, player_name: "System", content: `${victimName} was voted out.`, message_type: "global" });
        } else {
          // no elimination (tie or no votes)
          await supabase.from("messages").insert({ room_id: room?.id, player_id: null, player_name: "System", content: `No player received majority votes. No elimination.`, message_type: "global" });
        }

        // clear votes for round
        await supabase.from("votes").delete().eq("room_id", room?.id).eq("round_number", round);
        // After elimination, check win condition (if no mafia remain)
        const endedAfterDay = await checkWinCondition();
        if (endedAfterDay) return;

        // transition to night (15s). Use conditional update so only one client flips the phase.
        const { data: toNightData, error: toNightErr } = await supabase
          .from("game_states")
          .update({ phase: "night", phase_end_time: new Date(Date.now() + 15000).toISOString() })
          .eq("room_id", room?.id)
          .eq("phase", "day")
          .select();
        if (toNightErr) {
          throw toNightErr;
        } else {
          try {
            // eslint-disable-next-line no-console
            console.log("Day->Night update result:", toNightData);
          } catch (_) {}
        }
        // broadcast phase event (optional): insert a small system message so clients have an event stream
        try {
          await supabase.from("messages").insert({ room_id: room?.id, player_id: null, player_name: "System", content: "phase:night", message_type: "phase" });
        } catch (_) {}
      } catch (err) {
        console.error("Day resolution failed:", err);
      }
    };

    resolveDay();
  }, [remainingSeconds, gameState, localPlayerName, room]);

  // Night resolution: when night countdown ends, creator resolves actions
  useEffect(() => {
    if (remainingSeconds !== 0) return;
    if (!gameState || gameState.phase !== "night") return;
    // Allow any client to perform resolution, but make DB updates conditional on the current phase

    const resolveNight = async () => {
      try {
        try {
          // eslint-disable-next-line no-console
          console.log("resolveNight triggered; verifying current game_state before proceeding...");
        } catch (_) {}
        const { data: latest, error: latestErr } = await supabase.from("game_states").select("*").eq("room_id", room?.id).single();
        if (latestErr) {
          // eslint-disable-next-line no-console
          console.warn("Could not fetch latest game_state before night resolution:", latestErr);
        } else {
          const latestPhase = ((latest as any)?.phase || "").toString().trim().toLowerCase();
          const latestEnd = Date.parse((latest as any)?.phase_end_time || "");
          if (latestPhase !== "night") {
            // eslint-disable-next-line no-console
            console.log("Aborting night resolution: latest phase is", latestPhase);
            return;
          }
          if (latestEnd > Date.now() + 500) {
            // another client has updated the end time; abort to avoid racing
            // eslint-disable-next-line no-console
            console.log("Aborting night resolution: latest phase_end_time is still in the future", new Date(latestEnd).toISOString());
            return;
          }
        }

      const round = gameState.round_number;
        const { data: actionsData, error: actionsErr } = await supabase
          .from("actions")
          .select("*")
          .eq("room_id", room?.id)
          .eq("round_number", round);
        if (actionsErr) throw actionsErr;

        const actions = (actionsData as any[]) || [];
        // compute kill target by plurality among kill actions
        const killActions = actions.filter((a) => a.action_type === "kill");
        const killCount: Record<string, number> = {};
        for (const k of killActions) {
          if (!k.target_id) continue;
          killCount[k.target_id] = (killCount[k.target_id] || 0) + 1;
        }
        let killTarget: string | null = null;
        let maxCount = 0;
        for (const tid in killCount) {
          if (killCount[tid] > maxCount) {
            maxCount = killCount[tid];
            killTarget = tid;
          } else if (killCount[tid] === maxCount) {
            // tie -> no kill
            killTarget = null;
          }
        }

        // doctor saves
        const saveActions = actions.filter((a) => a.action_type === "save");
        const savedTargets = saveActions.map((s) => s.target_id).filter(Boolean as any);

        // determine final victim
        let victimId: string | null = null;
        if (killTarget && !savedTargets.includes(killTarget)) {
          victimId = killTarget;
        }

        // Apply elimination
        if (victimId) {
          // mark player dead
          await supabase.from("players").update({ status: "dead" }).eq("id", victimId);

          // post system message
          const { data: victimData } = await supabase.from("players").select("user_name").eq("id", victimId).single();
          const victimName = (victimData as any)?.user_name ?? "A player";
          await supabase.from("messages").insert({ room_id: room?.id, player_id: null, player_name: "System", content: `${victimName} was eliminated during the night.`, message_type: "global" });
        }

        // After night elimination, check win condition
        const endedAfterNight = await checkWinCondition();
        if (endedAfterNight) return;

        // Handle police inspect results: send inspect message targeted to the inspector
        const inspectActions = actions.filter((a) => a.action_type === "inspect");
        for (const inspect of inspectActions) {
            try {
              const { data: targetData } = await supabase.from("players").select("role,user_name").eq("id", inspect.target_id).single();
              const isMafia = (targetData as any)?.role === "mafia";
              const targetName = (targetData as any)?.user_name ?? "Player";
              // Use RPC to insert inspect message (player_id here used as recipient/associated inspector)
              const { data: rpcData, error: rpcErr } = await supabase.rpc("send_message", {
                p_room_id: room?.id,
                p_player_id: inspect.actor_id,
                p_player_name: "System",
                p_content: isMafia ? `YES (${targetName})` : `NO (${targetName})`,
                p_message_type: "inspect",
              });
              if (rpcErr) {
                const msg = rpcErr?.message || String(rpcErr || "");
                console.warn("Inspect RPC error:", rpcErr);
                if (msg.includes("Could not find the function") || msg.includes("send_message")) {
                  // fallback to direct insert
                  try {
                    await supabase.from("messages").insert({
                      room_id: room?.id,
                      player_id: inspect.actor_id,
                      player_name: "System",
                      content: isMafia ? `YES (${targetName})` : `NO (${targetName})`,
                      message_type: "inspect",
                    });
                  } catch (ie) {
                    console.warn("Failed to insert inspect result fallback", ie);
                  }
                }
              } else {
                // rpcData returned, nothing else to do
              }
            } catch (e) {
              console.warn("Failed to insert inspect result", e);
            }
        }

        // increment round and go to day/discussion period. Make update conditional on current phase to avoid races.
        const { data: toDayData, error: toDayErr } = await supabase
          .from("game_states")
          .update({ phase: "day", round_number: (gameState.round_number || 1) + 1, phase_end_time: new Date(Date.now() + 30000).toISOString() })
          .eq("room_id", room?.id)
          .eq("phase", "night")
          .select();
        if (toDayErr) {
          throw toDayErr;
        } else {
          try {
            // eslint-disable-next-line no-console
            console.log("Night->Day update result:", toDayData);
          } catch (_) {}
        }

      } catch (err) {
        console.error("Night resolution failed:", err);
      }
    };

    resolveNight();
  }, [remainingSeconds, gameState, localPlayerName, room]);

  const loadRoomData = async () => {
    if (!roomId) return;

    try {
      // fetch room info so we can render header and control components
      const { data: roomData, error: roomErr } = await supabase.from("rooms").select("*").eq("id", roomId).single();
      if (!roomErr && roomData) setRoom(roomData as Room);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("loadRoomData: failed to fetch room", e);
    }

    // Load game state, players and local role to ensure UI can render immediately
    try {
      await loadGameState();
    } catch (e) {
      // ignore
    }

    try {
      await loadPlayers();
    } catch (e) {
      // ignore
    }

    try {
      await loadLocalRole();
    } catch (e) {
      // ignore
    }

    // allow render
    setLoading(false);
  };

  const loadPlayers = async () => {
    if (!roomId) return;
    // Try selecting user_id if the column exists; otherwise fall back to basic public fields.
    try {
      const { data, error } = await (supabase as any)
        .from("players")
        .select("id,user_name,seat_number,status,user_id")
        .eq("room_id", roomId)
        .order("seat_number");

      if (!error && data) {
        setPlayers(data as any);
        try {
          const name = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
          if (name) {
            const lookup = name.trim().toLowerCase();
            const found = (data as any[]).find((p) => (p.user_name || "").trim().toLowerCase() === lookup);
            setLocalPlayerId(found?.id ?? null);
            setLocalPlayerStatus(found?.status ?? null);
          }
        } catch (_) {}
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('players select with user_id failed, falling back:', err);
    }

    // Fallback: select only public fields present in all schemas
    try {
      const { data: data2, error: error2 } = await supabase
        .from("players")
        .select("id,user_name,seat_number,status")
        .eq("room_id", roomId)
        .order("seat_number");

      if (!error2 && data2) {
        setPlayers(data2 as Player[]);
        try {
          const name = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
          if (name) {
            const lookup = name.trim().toLowerCase();
            const found = (data2 as any[]).find((p) => (p.user_name || "").trim().toLowerCase() === lookup);
            setLocalPlayerId(found?.id ?? null);
            setLocalPlayerStatus(found?.status ?? null);
          }
        } catch (_) {}
      } else if (error2) {
        // eslint-disable-next-line no-console
        console.error('Failed to load players:', error2);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load players (fallback):', err);
    }
  };

  const loadCurrentUserAndRequests = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      setCurrentUserId(user?.id ?? null);

      if (user?.id) {
        // load incoming requests
        const { data: inReq } = await (supabase as any).from('friend_requests').select('*').eq('to_user_id', user.id).order('created_at', { ascending: false });
        setIncomingRequests(inReq || []);
        const { data: outReq } = await (supabase as any).from('friend_requests').select('*').eq('from_user_id', user.id).order('created_at', { ascending: false });
        setOutgoingRequests(outReq || []);
      }
    } catch (e) {
      // ignore
    }
  };

  const sendFriendRequest = async (toPlayer: Player) => {
    try {
      const { data } = await supabase.auth.getUser();
      const me = data?.user ?? null;
      if (!me) {
        toast({ title: 'Sign in required', description: 'Please sign in to send friend requests', variant: 'destructive' });
        return;
      }

      // prevent sending to self
      if (toPlayer.user_id && toPlayer.user_id === me.id) {
        toast({ title: 'Invalid', description: 'Cannot send friend request to yourself', variant: 'destructive' });
        return;
      }

      // create request
      const payload: any = {
        from_user_id: me.id,
        to_user_id: toPlayer.user_id ?? null,
        from_player_name: localPlayerName ?? (me.user_metadata?.full_name || me.email || ''),
        to_player_name: toPlayer.user_name,
        room_id: roomId,
        status: 'pending',
      };

      const { error } = await (supabase as any).from('friend_requests').insert(payload);
      if (error) throw error;
      toast({ title: 'Request sent', description: `Friend request sent to ${toPlayer.user_name}` });
      await loadCurrentUserAndRequests();
    } catch (err: any) {
      console.error('sendFriendRequest error', err);
      toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const acceptFriendRequest = async (reqId: string) => {
    try {
      // mark request accepted
      const { error } = await (supabase as any).from('friend_requests').update({ status: 'accepted' }).eq('id', reqId);
      if (error) throw error;
      // optional: insert into friends table if exists
      try {
        const { data } = await (supabase as any).from('friend_requests').select('*').eq('id', reqId).single();
        const r = data as any;
        if (r?.from_user_id && r?.to_user_id) {
          await (supabase as any).from('friends').insert({ user_a: r.from_user_id, user_b: r.to_user_id }).maybeSingle();
        }
      } catch (_) {}
      toast({ title: 'Friend added' });
      await loadCurrentUserAndRequests();
    } catch (err: any) {
      console.error('acceptFriendRequest error', err);
      toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const rejectFriendRequest = async (reqId: string) => {
    try {
      const { error } = await (supabase as any).from('friend_requests').update({ status: 'rejected' }).eq('id', reqId);
      if (error) throw error;
      toast({ title: 'Request rejected' });
      await loadCurrentUserAndRequests();
    } catch (err: any) {
      console.error('rejectFriendRequest error', err);
      toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const loadLocalRole = async () => {
    if (!roomId) return;
    const name = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
    setLocalPlayerName(name);
    if (!name) {
      setLocalPlayerRole(null);
      return;
    }

    const { data, error } = await supabase
      .from("players")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_name", name)
      .single();

    if (!error && data) {
      setLocalPlayerRole(data.role ?? null);
    }
  };

  const loadGameState = async () => {
    if (!roomId) return;

    const { data, error } = await supabase
      .from("game_states")
      .select("*")
      .eq("room_id", roomId)
      .single();

    if (!error && data) {
      // normalize phase string to avoid mismatches like extra whitespace or casing
      try {
        const normalized = { ...data, phase: (data.phase || "").toString().trim().toLowerCase() };
        setGameState(normalized as GameState);
      } catch (_) {
        setGameState(data);
      }
      try {
        // Debug log to help diagnose missing day phase
        // eslint-disable-next-line no-console
        console.log("loadGameState:", data);
      } catch (_) {}
    }
  };

  // Log when gameState changes for easier debugging
  useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.log("gameState changed:", gameState);
    } catch (_) {}
  }, [gameState]);

  // Check win condition: returns 'citizens'|'mafia'|null. Also sets game state to ended and announces winner when found.
  const checkWinCondition = async (): Promise<string | null> => {
    if (!roomId) return null;
    try {
      // count alive mafia
      const { data: mafiaData, error: mafiaErr } = await supabase
        .from("players")
        .select("id")
        .eq("room_id", roomId)
        .eq("role", "mafia")
        .neq("status", "dead");
      if (mafiaErr) {
        // eslint-disable-next-line no-console
        console.warn("checkWinCondition: could not query mafia players:", mafiaErr);
        return null;
      }
      const mafiaAlive = (mafiaData as any[]).length;

      // count alive non-mafia
      const { data: nonMafiaData, error: nonMafiaErr } = await supabase
        .from("players")
        .select("id")
        .eq("room_id", roomId)
        .neq("role", "mafia")
        .neq("status", "dead");
      if (nonMafiaErr) {
        // eslint-disable-next-line no-console
        console.warn("checkWinCondition: could not query non-mafia players:", nonMafiaErr);
        return null;
      }
      const nonMafiaAlive = (nonMafiaData as any[]).length;

      // Citizens win when no mafia remain
      if (mafiaAlive === 0) {
        const winnerLabel = "citizens";
        try {
          await supabase.from("game_states").update({ phase: "ended", phase_end_time: null }).eq("room_id", roomId);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("checkWinCondition: failed to set phase ended", e);
        }
        try {
          await supabase.from("messages").insert({ room_id: roomId, player_id: null, player_name: "System", content: "Game Over — Citizens win!", message_type: "global" });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("checkWinCondition: failed to insert end message", e);
        }
        setWinner("Citizens");
        return winnerLabel;
      }

      // Mafia win when mafia alive >= non-mafia alive (they control the vote)
      if (mafiaAlive >= nonMafiaAlive) {
        const winnerLabel = "mafia";
        try {
          await supabase.from("game_states").update({ phase: "ended", phase_end_time: null }).eq("room_id", roomId);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("checkWinCondition: failed to set phase ended", e);
        }
        try {
          await supabase.from("messages").insert({ room_id: roomId, player_id: null, player_name: "System", content: "Game Over — Mafia win!", message_type: "global" });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("checkWinCondition: failed to insert end message", e);
        }
        setWinner("Mafia");
        return winnerLabel;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("checkWinCondition error", err);
    }
    return null;
  };

  const loadLastResult = async () => {
    if (!roomId) return;
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("content,created_at")
        .eq("room_id", roomId)
        .eq("message_type", "result")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!error && data) {
        setResultMessage((data as any).content ?? null);
      } else {
        setResultMessage(null);
      }
    } catch (e) {
      setResultMessage(null);
    }
  };

  // When in RESULT phase, load the last result message for display
  useEffect(() => {
    if (gameState?.phase === "result") {
      loadLastResult();
    } else {
      setResultMessage(null);
    }
  }, [gameState?.phase, roomId]);

  // If the game is already ended when loading the page, compute and display the winner label
  useEffect(() => {
    if (gameState?.phase === "ended") {
      (async () => {
        try {
          // try to infer winner from messages first
          const { data: msgData } = await supabase
            .from("messages")
            .select("content")
            .eq("room_id", roomId)
            .ilike("content", "%Game Over%")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          const content = (msgData as any)?.content ?? "";
          if (content.includes("Citizens")) setWinner("Citizens");
          else if (content.includes("Mafia")) setWinner("Mafia");
          else {
            // fallback: run checkWinCondition to compute winner
            await checkWinCondition();
          }
        } catch (e) {
          await checkWinCondition();
        }

        // load all players with roles so we can reveal them
        try {
          const { data: pData } = await supabase
            .from("players")
            .select("id,user_name,role,status,seat_number")
            .eq("room_id", roomId)
            .order("seat_number");
          if (pData) setRevealedPlayers(pData as Player[]);
        } catch (e) {
          // ignore
        }

        // show modal to everyone
        setShowEndModal(true);
      })();
    }
  }, [gameState?.phase, roomId]);

  // When RESULT countdown reaches zero, move to next DAY and increment round
  useEffect(() => {
    if (remainingSeconds !== 0) return;
    if (!gameState || gameState.phase !== "result") return;

    const finishResult = async () => {
      try {
        // increment round and start DAY (30s)
        const { error } = await supabase
          .from("game_states")
          .update({ phase: "day", round_number: (gameState.round_number || 1) + 1, phase_end_time: new Date(Date.now() + 30000).toISOString() })
          .eq("room_id", room?.id)
          .eq("phase", "result");
        if (error) throw error;
        // broadcast phase event
        try {
          await supabase.from("messages").insert({ room_id: room?.id, player_id: null, player_name: "System", content: "phase:day", message_type: "phase" });
        } catch (_) {}
      } catch (err) {
        console.error("Result finish failed:", err);
      }
    };

    finishResult();
  }, [remainingSeconds, gameState, room]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-pulse-glow">
            <h2 className="text-4xl font-bold text-primary">Loading...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-destructive">Room not found</h2>
        </div>
      </div>
    );
  }

  const isLobby = gameState?.phase === "lobby";

  const localNameTrimmed = typeof localPlayerName === "string" ? localPlayerName.trim() : localPlayerName;
  const roomCreatorRaw = (room as any)?.creator_id;
  const roomCreator = typeof roomCreatorRaw === "string" ? roomCreatorRaw.trim() : roomCreatorRaw;
  const isCreator = Boolean(roomCreator && localNameTrimmed && roomCreator === localNameTrimmed);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{room.name}</h1>
            <p className="text-muted-foreground flex items-center gap-2">Room Code:
              <span className="font-mono text-lg text-secondary">{room.code}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  const ok = await copyToClipboard(room.code);
                  if (ok) {
                    // use toast from above
                    // If toast not available here, we silently succeed
                    try {
                      const { toast } = await import("@/hooks/use-toast");
                    } catch (_) {}
                  }
                }}
                className="ml-2"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </p>
          </div>
          <GameControls room={room} gameState={gameState} players={players} />
        </div>

        {/* Debug panel removed from UI; logs still printed to console for diagnostics */}

        {/* Prominent phase banner to make day/night obvious */}
        {gameState?.phase && (
          <div className="my-4">
            <div
              className={`rounded-md p-3 text-center text-white font-semibold ${
                gameState.phase === "day" ? "bg-emerald-600" : gameState.phase === "night" ? "bg-violet-700" : "bg-slate-600"
              }`}
            >
              {gameState.phase === "day" && "DAY — Discussion (30s)"}
              {gameState.phase === "night" && "NIGHT — Night actions (15s)"}
              {gameState.phase === "result" && "RESULT — Night results"}
              {gameState.phase === "lobby" && "LOBBY — Waiting to start"}
              {gameState.phase === "ended" && "GAME OVER"}
            </div>
          </div>
        )}

        {/* Show result overlay when in RESULT phase */}
        {gameState?.phase === "result" && resultMessage && (
          <div className="my-4">
            <div className="bg-card border-border rounded-md p-4 text-center">
              <div className="text-lg font-semibold">Night Results</div>
              <div className="text-sm text-muted-foreground mt-2">{resultMessage}</div>
            </div>
          </div>
        )}

        {/* Show game over overlay when game ended */}
        {gameState?.phase === "ended" && (
          <div className="my-4">
            <div className="bg-card border-border rounded-md p-6 text-center">
              <div className="text-2xl font-bold">Game Over</div>
              <div className="text-lg mt-2 text-muted-foreground">{winner ? `${winner} win!` : "Winner decided"}</div>
            </div>
          </div>
        )}

        {/* End-game modal (popup) — reveals roles and winner, visible to all when showEndModal is true */}
        {showEndModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-3xl bg-card border-border rounded-lg p-6 mx-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">Game Over</div>
                  <div className="text-sm text-muted-foreground">{winner ? `${winner} win!` : "Winner decided"}</div>
                </div>
                <div>
                  <button
                    className="text-sm px-3 py-1 rounded bg-muted hover:bg-muted/80"
                    onClick={() => {
                      // exit to home
                      navigate("/home");
                    }}
                  >
                    Exit
                  </button>
                </div>
              </div>

              {/* Social share row */}
              <div className="mt-3 flex items-center gap-3">
                <div className="text-sm text-muted-foreground mr-2">Share results:</div>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Share on WhatsApp"
                    title="Share on WhatsApp"
                    className="p-2 rounded bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      try {
                        const text = `${winner ? winner + ' win! ' : 'Game Over! '}Join the game: ${room?.code ?? ''}`;
                        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                        window.open(url, "_blank");
                      } catch (_) {}
                    }}
                  >
                    {/* WhatsApp SVG */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M20.52 3.48A11.94 11.94 0 0012 .5 11.95 11.95 0 001.5 11.94c0 2.11.55 4.15 1.6 5.95L.5 23.5l6.01-2.01A11.95 11.95 0 0012 23.5c6.62 0 12-5.38 12-12 0-3.22-1.26-6.24-3.48-8.02zM12 21.5c-1.63 0-3.23-.42-4.63-1.21l-.33-.19-3.57 1.19 1.19-3.48-.2-.36A9.46 9.46 0 012.5 11.94 9.5 9.5 0 1112 21.5z"/>
                      <path d="M17.53 14.53c-.29-.15-1.7-.84-1.96-.94-.26-.11-.45-.16-.64.16-.19.31-.73.94-.9 1.13-.17.19-.33.22-.61.07-.28-.15-1.18-.43-2.24-1.37-.83-.74-1.39-1.66-1.55-1.94-.16-.28-.02-.43.12-.58.12-.12.28-.31.42-.47.14-.16.19-.27.29-.45.1-.18.05-.34-.02-.48-.07-.15-.64-1.54-.88-2.12-.23-.56-.47-.48-.64-.49-.16-.01-.35-.01-.54-.01-.19 0-.5.07-.76.34-.26.29-.99.98-.99 2.39 0 1.4 1.01 2.76 1.15 2.95.14.2 1.99 3.22 4.82 4.52 2.37 1.11 2.84 1.03 3.37.97.53-.06 1.7-.69 1.94-1.36.24-.66.24-1.22.17-1.34-.07-.11-.26-.18-.55-.33z"/>
                    </svg>
                  </button>

                  <button
                    aria-label="Share on Twitter"
                    title="Share on Twitter"
                    className="p-2 rounded bg-sky-500 hover:bg-sky-600 text-white"
                    onClick={() => {
                      try {
                        const text = `${winner ? winner + ' win! ' : 'Game Over! '}Join the game: ${room?.code ?? ''}`;
                        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                        window.open(url, "_blank");
                      } catch (_) {}
                    }}
                  >
                    {/* Twitter */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M22.46 6c-.77.35-1.6.58-2.46.69a4.3 4.3 0 001.88-2.37 8.59 8.59 0 01-2.72 1.04 4.28 4.28 0 00-7.3 3.9A12.13 12.13 0 013 4.8a4.28 4.28 0 001.33 5.71 4.24 4.24 0 01-1.94-.54v.05a4.28 4.28 0 003.44 4.2 4.3 4.3 0 01-1.93.07 4.28 4.28 0 003.99 2.97A8.6 8.6 0 012 19.54a12.14 12.14 0 006.56 1.92c7.88 0 12.2-6.53 12.2-12.2 0-.19 0-.39-.01-.58A8.72 8.72 0 0022.46 6z"/>
                    </svg>
                  </button>

                  <button
                    aria-label="Copy share text"
                    title="Copy share text"
                    className="p-2 rounded bg-gray-600 hover:bg-gray-700 text-white"
                    onClick={async () => {
                      try {
                        const text = `${winner ? winner + ' win! ' : 'Game Over! '}Join the game: ${room?.code ?? ''}`;
                        await navigator.clipboard.writeText(text);
                        try { /* toast hook not directly here, but available via hook earlier */ }
                        catch (_) {}
                        alert('Share text copied to clipboard');
                      } catch (e) {
                        alert('Copy failed');
                      }
                    }}
                  >
                    {/* Copy icon (simple) */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M16 1H4a2 2 0 00-2 2v12h2V3h12V1z"/>
                      <path d="M20 5H8a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h12v14z"/>
                    </svg>
                  </button>
                </div>
              </div>

                <div className="mt-4">
                <div className="text-sm text-muted-foreground mb-2">Player roles (revealed)</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(revealedPlayers ?? []).map((p) => (
                    <div key={p.id} className="bg-muted rounded p-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">{(p.user_name || "?").substring(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{p.user_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">{p.role ?? "Unknown"} {p.status === "dead" ? "(dead)" : "(alive)"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 text-sm text-muted-foreground">You can download or share an image of the victory to your status.</div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 justify-end">
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded bg-emerald-600 text-white"
                    onClick={handleNativeShare}
                  >
                    Share (native)
                  </button>
                  <button
                    className="px-3 py-2 rounded bg-gray-600 text-white"
                    onClick={handleDownloadVictoryImage}
                  >
                    Download Image
                  </button>
                </div>

                <div className="flex justify-end gap-2">
                <button
                  className="px-4 py-2 rounded bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  onClick={() => {
                    // Back to room: close modal so players return to the room view
                    setShowEndModal(false);
                  }}
                >
                  Back to Room
                </button>
                <button
                  className="px-4 py-2 rounded bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  onClick={() => {
                    navigate("/home");
                  }}
                >
                  Exit (Home)
                </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLobby ? (
          <GameLobby room={room} players={players} isCreator={isCreator} localPlayerName={localPlayerName} />
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              {/* Countdown during current phase (night or day) */}
              {remainingSeconds !== null && (
                <div className="mb-4">
                  <div className="text-sm text-muted-foreground">{gameState?.phase === "night" ? "Night Time Remaining" : "Discussion Time Remaining"}</div>
                  <div className="text-3xl font-bold">{remainingSeconds}s</div>
                </div>
              )}

              {/* Pass local player info so the table can selectively reveal roles */}
              <GameTable
                players={players}
                gameState={gameState}
                maxPlayers={room.max_players}
                localPlayerName={localPlayerName}
                localPlayerRole={localPlayerRole ?? undefined}
                remainingSeconds={remainingSeconds}
              />
            </div>
            <div className="lg:col-span-1 flex flex-col">
              <div className="flex flex-col gap-4 h-full min-h-0">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle>Your Role</CardTitle>
                    <CardDescription>Only you can see this role</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {localPlayerRole ? (
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">
                            {localPlayerRole === "mafia" && <Skull className="text-destructive" />}
                            {localPlayerRole === "doctor" && <Shield className="text-doctor" />}
                            {localPlayerRole === "police" && <Search className="text-police" />}
                            {localPlayerRole === "citizen" && <User className="text-muted-foreground" />}
                          </div>
                          <div>
                            <div className="text-lg font-semibold text-foreground capitalize">{localPlayerRole}</div>
                            <div className="text-sm text-muted-foreground">
                              {localPlayerRole === "mafia" && "You are Mafia. Coordinate with other mafia to eliminate targets at night."}
                              {localPlayerRole === "doctor" && "You are the Doctor. You can save one player each night."}
                              {localPlayerRole === "police" && "You are the Police. You can investigate one player each night."}
                              {localPlayerRole === "citizen" && "You are a Citizen. Discuss during day and vote to eliminate suspects."}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Role not assigned or not available yet.</div>
                    )}
                  </CardContent>
                </Card>

                  <div className="flex flex-col gap-4 flex-1 min-h-0">
                    {/* NightActions during night allow mafia/doctor/police to submit targets */}
                    {gameState?.phase === "night" && (
                      <NightActions
                        roomId={roomId!}
                        gameRound={gameState?.round_number || 1}
                        role={localPlayerRole}
                        localPlayerId={localPlayerId}
                        players={players}
                      />
                    )}

                    {/* Voting panel during day */}
                    {gameState?.phase === "day" && (
                      <>
                        <VotingPanel roomId={roomId!} roundNumber={gameState?.round_number || 1} viewerId={localPlayerId} viewerStatus={localPlayerStatus} players={players} />
                      </>
                    )}

                    {/* Global chat section where everyone talks during discussion/day */}
                    <GlobalChat roomId={roomId!} gameState={gameState} viewerName={localPlayerName} viewerStatus={localPlayerStatus} viewerId={localPlayerId} />

                    {/* Role-specific chat / discussion (ChatPanel handles role chat when night) */}
                    <ChatPanel roomId={roomId!} gameState={gameState} viewerName={localPlayerName} viewerRole={localPlayerRole ?? undefined} viewerStatus={localPlayerStatus} viewerId={localPlayerId} />
                  </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameRoom;
