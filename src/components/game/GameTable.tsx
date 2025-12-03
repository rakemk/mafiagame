import { Card } from "@/components/ui/card";
import PlayerSeat from "./PlayerSeat";

interface Player {
  id: string;
  user_name: string;
  seat_number: number;
  role?: string;
  status: string;
}

interface GameState {
  phase: string;
  round_number: number;
}

interface GameTableProps {
  players: Player[];
  gameState: GameState | null;
  maxPlayers: number;
  localPlayerName?: string | null;
  localPlayerRole?: string | undefined | null;
  remainingSeconds?: number | null;
}

const GameTable = ({ players, gameState, maxPlayers, localPlayerName, localPlayerRole, remainingSeconds }: GameTableProps) => {
  const seats = Array.from({ length: maxPlayers }, (_, i) => {
    const player = players.find(p => p.seat_number === i);
    return player || null;
  });

  const getPhaseColor = () => {
    if (gameState?.phase === "night") return "from-primary/20 to-background";
    if (gameState?.phase === "day") return "from-secondary/20 to-background";
    return "from-muted to-background";
  };

  return (
    <Card className="bg-card border-border p-8">
      {/* Circle layout for large screens */}
      <div className="hidden lg:block relative w-full aspect-square max-w-4xl mx-auto">
        {/* Table background */}
        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${getPhaseColor()} border-4 border-border shadow-2xl`}>
          {/* Felt texture overlay */}
          <div className="absolute inset-0 rounded-full opacity-30 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/40 via-primary/20 to-transparent"></div>
          
          {/* Center info */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-bold text-foreground">
                {gameState?.phase === "night" ? "🌙 NIGHT" : "☀️ DAY"}
              </h2>
              <p className="text-xl text-muted-foreground">Round {gameState?.round_number || 0}</p>
              {typeof remainingSeconds === "number" && (
                <div className="mt-1">
                  <div className="text-2xl font-extrabold text-foreground">{remainingSeconds}s</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Player seats arranged in circle */}
        {seats.map((player, index) => {
          const angle = (index / maxPlayers) * 2 * Math.PI - Math.PI / 2;
          const radius = 42; // percentage
          const x = 50 + radius * Math.cos(angle);
          const y = 50 + radius * Math.sin(angle);

          return (
            <div
              key={index}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${x}%`,
                top: `${y}%`,
              }}
            >
              <PlayerSeat
                player={player}
                seatNumber={index}
                gameState={gameState}
                viewerName={localPlayerName}
                viewerRole={localPlayerRole}
              />
            </div>
          );
        })}
      </div>

      {/* Compact grid layout for small screens */}
      <div className="block lg:hidden">
        {typeof remainingSeconds === "number" && (
          <div className="text-center mb-2">
            <div className="text-lg font-bold">{remainingSeconds}s</div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          {seats.map((player, index) => (
            <div key={index} className="flex items-center justify-center">
              <PlayerSeat
                player={player}
                seatNumber={index}
                gameState={gameState}
                viewerName={localPlayerName}
                viewerRole={localPlayerRole}
              />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default GameTable;
