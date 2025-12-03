import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  user_name: string;
  status: string;
}

interface Props {
  roomId: string;
  roundNumber: number;
  viewerId?: string | null;
  viewerStatus?: string | null;
  players: Player[];
}

const VotingPanel = ({ roomId, roundNumber, viewerId, viewerStatus, players }: Props) => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    if (!viewerId) return;
    (async () => {
      const { data } = await supabase
        .from("votes")
        .select("target_id")
        .eq("room_id", roomId)
        .eq("voter_id", viewerId)
        .eq("round_number", roundNumber)
        .limit(1)
        .single();
      if (data) {
        setSelected((data as any).target_id ?? null);
        setHasVoted(true);
      }
    })();
  }, [viewerId, roomId, roundNumber]);

  const submitVote = async () => {
    if (!viewerId) return;
    if (!selected) {
      toast({ title: "Choose a player", description: "Select a player to vote for." });
      return;
    }
    if (viewerStatus === "dead") {
      toast({ title: "Eliminated", description: "Eliminated players cannot vote.", variant: "destructive" });
      return;
    }

    try {
      // delete previous vote then insert
      await supabase.from("votes").delete().eq("room_id", roomId).eq("voter_id", viewerId).eq("round_number", roundNumber);
      await supabase.from("votes").insert({ room_id: roomId, voter_id: viewerId, target_id: selected, round_number: roundNumber });
      setHasVoted(true);
      toast({ title: "Vote submitted" });
    } catch (err) {
      console.error("Vote error", err);
      toast({ title: "Error", description: "Failed to submit vote", variant: "destructive" });
    }
  };

  const alivePlayers = players.filter((p) => p.status !== "dead" && p.id !== viewerId);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Vote (Day)</CardTitle>
      </CardHeader>
      <CardContent>
        {viewerStatus === "dead" ? (
          <div className="text-sm text-muted-foreground">You are eliminated and cannot vote.</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
              {alivePlayers.map((p) => (
                <label key={p.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted">
                  <input type="radio" name="vote" checked={selected === p.id} onChange={() => setSelected(p.id)} />
                  <span className="text-sm">{p.user_name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={submitVote} disabled={hasVoted || viewerStatus === "dead"}>Submit Vote</Button>
              {hasVoted && <div className="text-sm text-muted-foreground">Vote recorded</div>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VotingPanel;
