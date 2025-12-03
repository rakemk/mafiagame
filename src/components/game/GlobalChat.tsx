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
}

interface GameState {
  phase: string;
}

interface GlobalChatProps {
  roomId: string;
  gameState: GameState | null;
  viewerName?: string | null;
  viewerStatus?: string | null;
  viewerId?: string | null;
}

const GlobalChat = ({ roomId, gameState, viewerName, viewerStatus, viewerId }: GlobalChatProps) => {
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
          const m = payload.new as Message;
          if (m.message_type === "global") setMessages((prev) => [...prev, m]);
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
      .limit(100);

    if (!error && data) {
      setMessages((data as Message[]).filter((m) => m.message_type === "global"));
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    // Global chat is always allowed, except eliminated players cannot send
    if (viewerStatus === "dead") {
      toast({ title: "Eliminated", description: "You are eliminated and cannot send messages.", variant: "destructive" });
      return;
    }

    // If it's night, global discussion chat is disabled
    if (gameState?.phase === "night") {
      toast({ title: "Night", description: "Global discussion is disabled during night.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.rpc("send_message", {
        p_room_id: roomId,
        p_player_id: viewerId ?? null,
        p_player_name: playerName,
        p_content: newMessage,
        p_message_type: "global",
      });
      if (error) throw error;
      // RPC returns the inserted row (or rows). Append it locally so sender sees it immediately.
      try {
        const inserted = Array.isArray(data) ? data[0] : data;
        if (inserted) setMessages((prev) => [...prev, inserted as Message]);
      } catch (_) {}
      setNewMessage("");
    } catch (err: any) {
      const msg = err?.message || String(err || "");
      // If RPC isn't available on the database (migration not applied), fall back to direct insert
      if (msg.includes("Could not find the function") || msg.includes("send_message")) {
        try {
          const { data: inserted, error: insertErr } = await supabase.from("messages").insert({
            room_id: roomId,
            player_id: viewerId ?? null,
            player_name: playerName,
            content: newMessage,
            message_type: "global",
          }).select().single();
          if (!insertErr && inserted) setMessages((prev) => [...prev, inserted as Message]);
          setNewMessage("");
          toast({ title: "Fallback", description: "send_message RPC not found — message sent directly.", variant: "warning" });
        } catch (ie) {
          toast({ title: "Error", description: "Failed to send message (RPC missing and direct insert failed)", variant: "destructive" });
        }
        return;
      }

      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Card className="bg-card border-border flex flex-col h-[260px] sm:h-[240px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Global Chat
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col gap-4 p-4">
        <ScrollArea className="flex-1 overflow-auto pr-4">
          <div className="space-y-3">
            {messages.map((message) => (
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
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="flex gap-2 mt-2">
              <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={"Talk with everyone..."}
                className="bg-input border-border text-foreground"
                disabled={viewerStatus === "dead" || gameState?.phase === "night"}
          />
          <Button onClick={sendMessage} size="icon" className="bg-accent hover:bg-accent/90 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default GlobalChat;
