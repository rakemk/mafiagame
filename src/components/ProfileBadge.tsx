import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  onEdit?: () => void;
}

const ProfileBadge: React.FC<Props> = ({ onEdit }) => {
  const name = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
  const gender = typeof window !== "undefined" ? localStorage.getItem("playerGender") : null;

  const initials = name && name.trim() ? name.trim().split(" ").map(s => s[0]).slice(0,2).join('').toUpperCase() : "G";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit?.()}
      onKeyDown={handleKeyDown}
      className="fixed left-4 top-4 z-50 flex items-center gap-3 bg-card/80 border border-border rounded-full px-3 py-2 shadow-sm backdrop-blur-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label={`Profile: ${name || 'Guest'}`}
    >
      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">{initials}</div>
      <div className="hidden sm:block">
        <div className="text-sm font-semibold">{name || 'Guest'}</div>
        <div className="text-xs text-muted-foreground">{gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : 'No Gender'}</div>
      </div>
    </div>
  );
};

export default ProfileBadge;
