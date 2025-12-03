import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skull, Shield, Search, User } from "lucide-react";

interface Player {
  id: string;
  user_name: string;
  role?: string;
  status: string;
}

interface GameState {
  phase: string;
}

interface PlayerSeatProps {
  player: Player | null;
  seatNumber: number;
  gameState: GameState | null;
  viewerName?: string | null;
  viewerRole?: string | undefined | null;
}

const PlayerSeat = ({ player, seatNumber, gameState, viewerName, viewerRole }: PlayerSeatProps) => {
  const getRoleIcon = (role?: string) => {
    switch (role) {
      case "mafia":
        return <Skull className="h-4 w-4 text-destructive" />;
      case "doctor":
        return <Shield className="h-4 w-4 text-doctor" />;
      case "police":
        return <Search className="h-4 w-4 text-police" />;
      case "citizen":
        return <User className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getRoleColor = (role?: string) => {
    switch (role) {
      case "mafia":
        return "border-destructive shadow-destructive/50";
      case "doctor":
        return "border-doctor shadow-doctor/50";
      case "police":
        return "border-police shadow-police/50";
      default:
        return "border-border";
    }
  };

  if (!player) {
    return (
      <Card className="w-24 h-24 bg-muted/30 border-dashed border-2 border-border flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Seat {seatNumber + 1}</p>
      </Card>
    );
  }

  // Determine viewer visibility: viewer can see their own role; mafia viewers see other mafia
  const isViewer = viewerName && player.user_name === viewerName;
  const viewerIsMafia = viewerRole === "mafia";

  const displayedRole = (isViewer || (viewerIsMafia && player.role === "mafia")) ? player.role : undefined;

  const isDead = player.status === "dead";

  return (
    <Card className={`w-28 h-28 bg-card border-2 ${getRoleColor(displayedRole)} shadow-lg transition-all duration-300 hover:scale-105 ${isDead ? "opacity-50 grayscale" : ""}`}>
      <div className="p-2 h-full flex flex-col items-center justify-center gap-2">
        <Avatar className="h-12 w-12 border-2 border-border">
          <AvatarFallback className="bg-primary/20 text-primary-foreground">
            {player.user_name.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold text-foreground truncate max-w-full">
            {player.user_name}
          </p>
          
          {displayedRole && (
            <Badge variant="outline" className="text-xs gap-1">
              {getRoleIcon(displayedRole)}
              {displayedRole}
            </Badge>
          )}
          
          {isDead && (
            <Badge variant="destructive" className="text-xs">
              <Skull className="h-3 w-3 mr-1" />
              Dead
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
};

export default PlayerSeat;
