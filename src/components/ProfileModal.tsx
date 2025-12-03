import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<Props> = ({ open, onClose }) => {
  const { toast } = useToast();
  const [gameName, setGameName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        // Prefill from localStorage
        const local = localStorage.getItem("playerName");
        const localAge = localStorage.getItem("playerAge");
        const localGender = localStorage.getItem("playerGender");
        if (local) setGameName(local);
        if (localAge) setAge(localAge);
        if (localGender) setGender(localGender);

        // If signed in and profiles table exists, try to load
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (user) {
            try {
            const { data } = await supabase.from("profiles").select("game_name, age, gender").eq("id", user.id).maybeSingle();
            if (data) {
              if ((data as any).game_name) setGameName((data as any).game_name);
              if ((data as any).age) setAge(String((data as any).age));
              if ((data as any).gender) setGender((data as any).gender);
              // If profile exists and has a game_name, close automatically
              if ((data as any).game_name) {
                try {
                  localStorage.setItem("playerName", (data as any).game_name);
                } catch (_) {}
                if ((data as any).gender) {
                  try { localStorage.setItem('playerGender', (data as any).gender); } catch (_) {}
                }
                onClose();
              }
            }
          } catch (e) {
            // table may not exist
          }
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [open, onClose]);

  const save = async () => {
    if (!gameName || gameName.trim().length < 2) {
      toast({ title: "Invalid name", description: "Game Name must be at least 2 characters.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (user) {
        try {
          await supabase.from("profiles").upsert({ id: user.id, email: user.email, game_name: gameName.trim(), age: age ? Number(age) : null, gender: gender || null });
        } catch (e) {
          // ignore upsert failures (table may not exist)
        }
      }

      try {
        localStorage.setItem("playerName", gameName.trim());
        if (age) localStorage.setItem("playerAge", String(age));
        if (gender) localStorage.setItem("playerGender", gender);
      } catch (_) {}

      toast({ title: "Saved", description: "Profile saved" });
      onClose();
    } catch (e) {
      toast({ title: "Error", description: "Failed to save profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set your Game Name</DialogTitle>
          <DialogDescription>Please enter a display name and your age (optional).</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label>Game Name</Label>
            <Input value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="Nickname for the game" />
          </div>
          <div>
            <Label>Age (optional)</Label>
            <Input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Your age" type="number" />
          </div>
          <div>
            <Label>Gender</Label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-input border-border p-2">
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
        </DialogFooter>

        <DialogClose />
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal;
