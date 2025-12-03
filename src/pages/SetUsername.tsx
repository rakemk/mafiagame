import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SetUsername = () => {
	const [name, setName] = useState("");
	const [age, setAge] = useState("");
	const [gender, setGender] = useState("");
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();
	const { toast } = useToast();

	const save = async () => {
		if (!name || name.trim().length < 2) {
			toast({ title: "Invalid name", description: "Name must be at least 2 characters", variant: "destructive" });
			return;
		}
		setLoading(true);
		try {
			const { data: userData } = await supabase.auth.getUser();
			const user = userData?.user;
			if (user) {
				try {
					await supabase.from("profiles").upsert({ id: user.id, email: user.email, game_name: name.trim(), age: age ? Number(age) : null, gender: gender || null });
				} catch (e) {
					// table may not exist — ignore
				}
			}
			try { localStorage.setItem("playerName", name.trim()); if (age) localStorage.setItem("playerAge", String(age)); if (gender) localStorage.setItem('playerGender', gender); } catch (_) {}
			toast({ title: "Saved", description: "Profile saved" });
			setTimeout(() => navigate("/home"), 800);
		} catch (e) {
			toast({ title: "Error", description: "Failed to save profile", variant: "destructive" });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<Card>
					<CardHeader>
						<CardTitle>Set Game Name</CardTitle>
						<CardDescription>Enter a display name and optional age</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<Label>Game Name</Label>
							<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nickname for the game" />
						</div>
						<div>
							<Label>Age (optional)</Label>
							<Input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" type="number" />
						</div>
						<Button onClick={save} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default SetUsername;
