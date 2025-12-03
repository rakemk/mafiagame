import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Send, MessageCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  player_name: string;
  content: string;
  message_type: string;
  created_at: string;
  player_id?: string | null;
}

interface GameState {
  phase: string;
}

interface ChatPanelProps {
  roomId: string;
  gameState: GameState | null;
  viewerName?: string | null;
  viewerRole?: string | undefined | null;
  viewerStatus?: string | null;
  viewerId?: string | null;
}

const ChatPanel = ({ roomId, gameState, viewerName, viewerRole, viewerStatus, viewerId }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [playerName] = useState(viewerName ?? (typeof window !== "undefined" ? localStorage.getItem("playerName") || "Player" : "Player"));
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadMessages();

    const messagesChannel: RealtimeChannel = supabase
      .channel(`messages:${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (!error && data) {
      setMessages(data);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageType = gameState?.phase === "night" ? "role" : "global";

    // Prevent non-mafia from sending role messages during night
    if (viewerStatus === "dead") {
      toast({ title: "Eliminated", description: "You are eliminated and cannot send messages.", variant: "destructive" });
      return;
    }

    if (messageType === "role" && viewerRole !== "mafia") {
      toast({ title: "Not allowed", description: "Only mafia players can send in role chat during night.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.rpc("send_message", {
        p_room_id: roomId,
        p_player_id: viewerId ?? null,
        p_player_name: playerName,
        p_content: newMessage,
        p_message_type: messageType,
      });
      if (error) throw error;

      // Append the inserted message locally for immediate visibility
      try {
        const inserted = Array.isArray(data) ? data[0] : data;
        if (inserted) setMessages((prev) => [...prev, inserted as Message]);
      } catch (_) {}
      setNewMessage("");
    } catch (err: any) {
      const msg = err?.message || String(err || "");
      if (msg.includes("Could not find the function") || msg.includes("send_message")) {
        // Fallback to direct insert when RPC missing
        try {
          const { data: inserted, error: insertErr } = await supabase
            .from("messages")
            .insert({ room_id: roomId, player_id: viewerId ?? null, player_name: playerName, content: newMessage, message_type: messageType })
            .select()
            .single();
          if (!insertErr && inserted) setMessages((prev) => [...prev, inserted as Message]);
          setNewMessage("");
          toast({ title: "Fallback", description: "send_message RPC not found — message sent directly.", variant: "warning" });
        } catch (ie) {
          toast({ title: "Send failed", description: "RPC not found and direct insert failed.", variant: "destructive" });
        }
        return;
      }

      toast({ title: "Send failed", description: msg, variant: "destructive" });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ChatPanel is the role chat — only render during the night phase.
  if (gameState?.phase !== "night") return null;

  return (
    <Card className="bg-card border-border flex-1 min-h-0 flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          {gameState?.phase === "night" ? "Role Chat" : "Discussion"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 p-4 min-h-0">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-3">
            {(() => {
              // Role chat content shown only during night (ChatPanel only renders in night)
              // If viewer is police, show inspect results targeted to them
              if (viewerRole === "police") {
                return (
                  <>
                    <div className="text-sm text-muted-foreground">Role chat is active — mafia chat visible to mafia only. Below are your inspect results.</div>
                    {messages
                      .filter((m) => m.message_type === "inspect" && m.player_id === viewerId)
                      .map((message) => (
                        <div key={message.id} className="bg-muted rounded-lg p-3 animate-fade-in">
                          <div className="flex items-start gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-primary">{message.player_name.substring(0, 2).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-semibold text-foreground">{message.player_name}</span>
                                <span className="text-xs text-muted-foreground">{new Date(message.created_at).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-sm text-foreground mt-1 break-words">{message.content}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </>
                );
              }

              // Mafia see role messages
              if (viewerRole === "mafia") {
                return messages
                  .filter((m) => m.message_type === "role")
                  .map((message) => (
                    <div key={message.id} className="bg-muted rounded-lg p-3 animate-fade-in">
                      <div className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">{message.player_name.substring(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-foreground">{message.player_name}</span>
                            <span className="text-xs text-muted-foreground">{new Date(message.created_at).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-sm text-foreground mt-1 break-words">{message.content}</p>
                        </div>
                      </div>
                    </div>
                  ));
              }

              // Non-mafia non-police see a notice
              return <div className="text-sm text-muted-foreground">Role chat is active — visible to mafia only.</div>;
            })()}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={gameState?.phase === "night" ? (viewerRole === "mafia" ? "Type a role message..." : "Role chat active — mafia only") : "Type a message..."}
            className="bg-input border-border text-foreground"
            disabled={viewerStatus === "dead" || (gameState?.phase === "night" && viewerRole !== "mafia")}
          />
          <Button
            onClick={sendMessage}
            size="icon"
            className="bg-accent hover:bg-accent/90 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatPanel;
