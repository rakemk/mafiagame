import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const finishAuth = async () => {
      try {
        // This processes the OAuth redirect and stores session in localStorage
        const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
        if (error) {
          console.error('getSessionFromUrl error', error);
          // Common cause: provider not enabled or redirect URI mismatch. Give actionable guidance.
          const msg = (error as any)?.message || String(error);
          let suggestion = 'Check Supabase Auth providers and Google Console redirect URIs.';
          if (msg.toLowerCase().includes('provider is not enabled') || msg.toLowerCase().includes('validation_failed')) {
            suggestion = 'Enable Google provider in Supabase Auth and ensure Redirect URI is set in Google Console.';
          }
          toast({ title: "Authentication failed", description: `${msg} — ${suggestion}`, variant: "destructive" });
        } else if (data?.session) {
          toast({ title: "Signed in", description: "You have been signed in successfully." });
          // Attempt to create a profile row for OAuth users if your DB has a `profiles` table.
          try {
            const user = data.session.user;
            if (user) {
              try {
                await (supabase as any).from('profiles').upsert({ id: user.id, email: user.email ?? null, created_at: new Date().toISOString() }, { onConflict: 'id' });
              } catch (e) {
                // ignore if profiles table doesn't exist
              }

              // If the user doesn't have a stored game name, navigate to the profile setup first
              try {
                const { data: profile } = await (supabase as any).from('profiles').select('game_name, gender').eq('id', user.id).maybeSingle();
                if (profile && (profile as any).game_name) {
                  try { localStorage.setItem('playerName', (profile as any).game_name); } catch (_) {}
                  if ((profile as any).gender) {
                    try { localStorage.setItem('playerGender', (profile as any).gender); } catch (_) {}
                  }
                  navigate('/home');
                  return;
                }
              } catch (e) {
                // profiles table may not exist or select failed — fall through to set-username
              }

              // If we got here the profile is missing critical fields — send user to set-username before home
              navigate('/set-username');
              return;
            }
          } catch (e) {}
        }
      } catch (err: any) {
        toast({ title: "Authentication error", description: err?.message || String(err), variant: "destructive" });
        navigate('/');
        return;
      }
      // If we reach here and no session/profile routing happened, fall back to home
      navigate('/home');
    };

    finishAuth();
  }, [navigate, toast]);

  return null;
};

export default AuthCallback;
