import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  user_name: string;
  seat_number: number;
  status: string;
}

interface Props {
  roomId: string;
  gameRound: number;
  role?: string | null;
  localPlayerId?: string | null;
  players: Player[];
}

const NightActions = ({ roomId, gameRound, role, localPlayerId, players }: Props) => {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasActed, setHasActed] = useState(false);

  // determine local player's status from players list so eliminated players cannot act
  const localPlayer = localPlayerId ? players.find((p) => p.id === localPlayerId) : undefined;
  const localStatus = localPlayer?.status ?? null;

  useEffect(() => {
    // Check if action already exists for this actor/round
    if (!localPlayerId) return;
    (async () => {
      const { data, error } = await supabase
        .from("actions")
        .select("*")
        .eq("actor_id", localPlayerId)
        .eq("round_number", gameRound)
        .eq("room_id", roomId)
        .limit(1)
        .single();
      if (data) {
        setSelectedId((data as any).target_id ?? null);
        setHasActed(true);
      }
    })();
  }, [localPlayerId, gameRound, roomId]);

  const submitAction = async (targetId: string | null) => {
    if (!localPlayerId) return;
    if (hasActed) return;
    if (!targetId) return;

    let action_type = "";
    if (role === "mafia") action_type = "kill";
    if (role === "doctor") action_type = "save";
    if (role === "police") action_type = "inspect";
    if (!action_type) return;

    const { error } = await supabase.from("actions").insert({
      room_id: roomId,
      actor_id: localPlayerId,
      round_number: gameRound,
      action_type,
      target_id: targetId,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setSelectedId(targetId);
    setHasActed(true);

    // Do not reveal inspect result immediately; resolution happens at night end.
  };

  if (!role) return null;

  // If the local player is dead, show a disabled card explaining they can't act
  if (localStatus === "dead") {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Night Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">You are eliminated and cannot perform night actions.</div>
        </CardContent>
      </Card>
    );
  }

  if (role === "citizen") {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Night Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No night action for citizens.</div>
        </CardContent>
      </Card>
    );
  }

  // List possible targets (alive players except self)
  const targets = players.filter((p) => p.status !== "dead" && p.id !== localPlayerId);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Night Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-sm text-muted-foreground">Role: <span className="font-semibold">{role}</span></div>
        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto mb-2">
          {targets.map((t) => (
            <Button
              key={t.id}
              onClick={() => submitAction(t.id)}
              disabled={hasActed}
              variant={selectedId === t.id ? "secondary" : "ghost"}
            >
              {t.user_name}
            </Button>
          ))}
        </div>
        {hasActed ? <div className="text-sm text-muted-foreground">Action submitted. You cannot change it.</div> : <div className="text-sm text-muted-foreground">Choose a target for your night action.</div>}
      </CardContent>
    </Card>
  );
};

export default NightActions;
