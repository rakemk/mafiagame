import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CreateRoom from "./pages/CreateRoom";
import GameRoom from "./pages/GameRoom";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import SetUsername from "./pages/SetUsername";
import ProfileModal from "./components/ProfileModal";
import ProfileBadge from "./components/ProfileBadge";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

const AuthListener = ({ onSignedIn }: { onSignedIn: (user: any) => void }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      try {
        if (session?.user) {
          // store minimal user info for UI persistence
          localStorage.setItem("currentUser", JSON.stringify(session.user));
          if (event === "SIGNED_IN") {
            onSignedIn(session.user);
          }
        } else {
          localStorage.removeItem("currentUser");
        }

        // handle sign out by navigating to login
        if (event === "SIGNED_OUT" || event === "USER_DELETED") {
          navigate("/");
        }
      } catch (e) {
        // ignore
      }
    });

    return () => {
      try {
        (data as any)?.subscription?.unsubscribe?.();
      } catch (_) {}
    };
  }, [navigate, onSignedIn]);

  return null;
};

const AppRoot = () => {
  const [showProfileModal, setShowProfileModal] = useState(false);

  const handleSignedIn = async (user: any) => {
    try {
      // If a local player name already exists, no need to show the modal
      const localName = typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
      const localGender = typeof window !== "undefined" ? localStorage.getItem("playerGender") : null;
      if (localName && localName.trim().length > 0 && localGender && localGender.trim().length > 0) return;

      // Check profiles table for saved game_name for this user
      try {
        const { data, error } = await supabase.from("profiles").select("game_name, gender").eq("id", user.id).maybeSingle();
        if (!error && data && (data as any).game_name) {
          try {
            localStorage.setItem("playerName", (data as any).game_name);
            if ((data as any).gender) localStorage.setItem('playerGender', (data as any).gender);
          } catch (_) {}
          return;
        }
      } catch (e) {
        // table might not exist — fall back to prompting
      }

      // Don't show the modal while the user is on auth pages (sign-in / create-account UI)
      try {
        const p = typeof window !== "undefined" ? window.location.pathname : "";
        if (p === "/" || p.startsWith("/auth")) {
          return;
        }
      } catch (_) {}

      // Listen for custom event to open modal from badge
      setShowProfileModal(true);
    } catch (e) {
      // ignore
    }
  };

  // Allow other components to request opening the modal by dispatching 'openProfileModal'
  useEffect(() => {
    const handler = () => setShowProfileModal(true);
    window.addEventListener('openProfileModal', handler as EventListener);
    return () => window.removeEventListener('openProfileModal', handler as EventListener);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthListener onSignedIn={handleSignedIn} />
          <ProfileModal open={showProfileModal} onClose={() => setShowProfileModal(false)} />
          {
            /* Wrapper component to hide the profile badge on auth pages */
          }
          {/** Define wrapper inline so hooks are used inside Router */}
          <InnerProfileBadge />
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/home" element={<Index />} />
            <Route path="/create" element={<CreateRoom />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/set-username" element={<SetUsername />} />
            <Route path="/room/:roomId" element={<GameRoom />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

const InnerProfileBadge = () => {
  const location = useLocation();
  // Hide badge on sign-in and auth-related pages
  if (!location || !location.pathname) return null;
  const path = location.pathname;
  // Only show on the home page
  if (path !== "/home") return null;
  return <ProfileBadge onEdit={() => {
    // find a way to open modal via dispatching custom event or using global setter
    // for now use window to toggle localStorage flag that AppRoot reads: call a custom event
    const ev = new CustomEvent('openProfileModal');
    window.dispatchEvent(ev);
  }} />;
};

export default AppRoot;
