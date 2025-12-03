import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
	const navigate = useNavigate();
	const { toast } = useToast();
	const [mode, setMode] = useState<'signin'|'signup'>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [remember, setRemember] = useState(true);
	const [lastError, setLastError] = useState<string | null>(null);

	// If the env var is not set, default to enabling Google so the button is usable in dev.
	const rawEnabled = ((import.meta.env.VITE_ENABLED_OAUTH_PROVIDERS as string) || "google");
	const enabledProviders = new Set(rawEnabled.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

	useEffect(() => {
		// If already signed in, go to home
		const check = async () => {
			try {
				const { data } = await supabase.auth.getUser();
				if (data?.user) navigate('/home');
			} catch (e) {
				// ignore
			}
		};
		check();
		// Prefill email if user asked to be remembered
		try {
			const rememberedEmail = localStorage.getItem('rememberedEmail');
			const remembered = localStorage.getItem('rememberMe');
			if (rememberedEmail) setEmail(rememberedEmail);
			if (remembered === 'false') setRemember(false);
		} catch (_) {}
	}, [navigate]);

	const handleEmailAuth = async () => {
		if (!email || !password) {
			toast({ title: 'Missing fields', description: 'Email and password are required', variant: 'destructive' });
			return;
		}
		setLoading(true);
		try {
			if (mode === 'signin') {
				const res = await supabase.auth.signInWithPassword({ email, password });
				console.log('signInWithPassword response', res);
				if (res.error) {
					setLastError(JSON.stringify(res.error));
					throw res.error;
				}
				setLastError(null);
				toast({ title: 'Signed in', description: 'Welcome back!' });
				try {
					if (remember) localStorage.setItem('rememberedEmail', email);
					else localStorage.removeItem('rememberedEmail');
					localStorage.setItem('rememberMe', remember ? 'true' : 'false');
				} catch (_) {}
				navigate('/home');
			} else {
				const res = await supabase.auth.signUp({ email, password });
				console.log('signUp response', res);
				if (res.error) {
					setLastError(JSON.stringify(res.error));
					throw res.error;
				}
				setLastError(null);

				// If Supabase returned a session, the user is signed in immediately.
				if ((res as any)?.data?.session) {
					toast({ title: 'Signed in', description: 'Welcome!' });
					navigate('/home');
				} else {
					// No session returned — likely email confirmation required.
					toast({ title: 'Check your email', description: 'We sent a confirmation link if required. Please sign in after confirming your email.' });
					// stay on auth page so user can sign in after verifying
				}

				// Try to create a minimal profile row if the table exists. Non-fatal if it fails.
				try {
					const user = (res.data as any)?.user ?? (await supabase.auth.getUser()).data?.user;
					if (user) {
						try {
							await (supabase as any).from('profiles').upsert({ id: user.id, email: user.email ?? email, created_at: new Date().toISOString() }, { onConflict: 'id' });
						} catch (e) {
							// ignore profile upsert errors
						}
					}
				} catch (profileErr) {
					// ignore
				}

				try {
					if (remember) localStorage.setItem('rememberedEmail', email);
					else localStorage.removeItem('rememberedEmail');
					localStorage.setItem('rememberMe', remember ? 'true' : 'false');
				} catch (_) {}
			}
		} catch (err: any) {
			console.error('Auth error', err);
			const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
			setLastError(msg);
			toast({ title: 'Auth error', description: msg, variant: 'destructive' });
		} finally {
			setLoading(false);
		}
	};

	const signInWithProvider = async (provider: string) => {
		if (!enabledProviders.has(provider.toLowerCase())) {
			toast({
				title: "Provider disabled",
				description: `${provider} login is not enabled on this app. Ask the admin to enable ${provider} in Supabase Auth settings.`,
				variant: "destructive",
			});
			return;
		}
		setLoading(true);
		toast({ title: 'Redirecting', description: `Opening ${provider} sign-in...` });
		try {
			const redirectTo = (import.meta.env.VITE_SUPABASE_REDIRECT_URL as string) || `${window.location.origin}/auth/callback`;
			// Ask the client to return the provider URL instead of auto-redirecting so we can inspect errors in dev
			const result = await supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo, skipBrowserRedirect: true } });
			// result may contain { data: { provider, url }, error }
			if (result.error) {
				const e = result.error as any;
				if (e?.status === 400 || (e?.message || '').toLowerCase().includes('provider is not enabled') || (e?.message || '').toLowerCase().includes('validation_failed')) {
					toast({ title: 'OAuth disabled', description: `${provider} is not configured. Enable it in Supabase → Authentication → Providers.`, variant: 'destructive' });
				} else {
					toast({ title: 'OAuth error', description: e.message || String(e), variant: 'destructive' });
				}
				setLastError(JSON.stringify(e));
				setLoading(false);
				return;
			}
			const url = (result?.data as any)?.url;
			if (url) {
				console.log('OAuth provider URL:', url);
				// navigate user to the provider URL
				window.location.assign(url);
			} else {
				toast({ title: 'OAuth error', description: 'Failed to build provider URL', variant: 'destructive' });
			}
			if (error) {
				if ((error as any)?.status === 400 || (error as any)?.message?.toLowerCase?.().includes('provider is not enabled') || (error as any)?.message?.toLowerCase?.includes('validation_failed')) {
					toast({ title: 'OAuth disabled', description: `${provider} is not configured. Enable it in Supabase → Authentication → Providers.`, variant: 'destructive' });
				} else {
					toast({ title: 'OAuth error', description: error.message, variant: 'destructive' });
				}
			}
		} catch (err: any) {
			toast({ title: 'OAuth error', description: err?.message ?? String(err), variant: 'destructive' });
		}
		setLoading(false);
	};

	const sendMagicLink = async () => {
		if (!email) {
			toast({ title: 'Missing email', description: 'Enter your email to receive a magic link', variant: 'destructive' });
			return;
		}
		setLoading(true);
		try {
			const res = await supabase.auth.signInWithOtp({ email });
			console.log('signInWithOtp response', res);
			if (res.error) {
				setLastError(JSON.stringify(res.error));
				toast({ title: 'Magic link error', description: res.error.message || String(res.error), variant: 'destructive' });
			} else {
				setLastError(null);
				toast({ title: 'Magic link sent', description: 'Check your email for a sign-in link.' });
			}
		} catch (err: any) {
			console.error('Magic link error', err);
			const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
			setLastError(msg);
			toast({ title: 'Magic link error', description: msg, variant: 'destructive' });
		} finally {
			setLoading(false);
		}
	};

	const sendPasswordReset = async () => {
		if (!email) {
			toast({ title: 'Missing email', description: 'Enter your email to receive password reset instructions', variant: 'destructive' });
			return;
		}
		setLoading(true);
		try {
			// Supabase v2: resetPasswordForEmail accepts an object or email directly in some SDK variants
			// Try the object form first for compatibility
			// @ts-ignore
			const res = await supabase.auth.resetPasswordForEmail({ email });
			console.log('resetPasswordForEmail response', res);
			if (res?.error) {
				setLastError(JSON.stringify(res.error));
				toast({ title: 'Reset error', description: res.error.message || String(res.error), variant: 'destructive' });
			} else {
				setLastError(null);
				toast({ title: 'Reset email sent', description: 'Check your email for password reset instructions.' });
			}
		} catch (err: any) {
			console.error('Reset password error', err);
			const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
			setLastError(msg);
			toast({ title: 'Reset error', description: msg, variant: 'destructive' });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div
			className="min-h-screen flex items-center justify-center p-4 bg-black/10"
			style={{
				backgroundImage: "url('/images/capos-bg.jpg')",
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center top',
				backgroundSize: 'cover',
			}}
		>
			<div className="w-full max-w-md px-4">
				<div className="relative">
					<div className="bg-[rgba(17,24,39,0.92)] border border-yellow-700 rounded-2xl shadow-2xl">
						<div className="p-3 sm:p-6 text-center">
							<h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-widest text-yellow-300 drop-shadow-lg"> Sicario Crown Empire</h1>
							<p className="text-sm text-muted-foreground mt-1">Enter the Family</p>
						</div>

						<div className="bg-[rgba(30,20,10,0.95)] mx-3 sm:mx-6 rounded-lg p-3 sm:p-6 border border-yellow-900 shadow-inner">
							<div className="space-y-4">
								<div className="flex justify-between">
									<button className={`px-3 py-1 rounded ${mode==='signin'? 'bg-yellow-700 text-black' : 'bg-transparent text-yellow-200/70'}`} onClick={() => setMode('signin')}>Sign in</button>
									<button className={`px-3 py-1 rounded ${mode==='signup'? 'bg-yellow-700 text-black' : 'bg-transparent text-yellow-200/70'}`} onClick={() => setMode('signup')}>Create account</button>
								</div>

								<div className="p-3 sm:p-4 rounded-md border border-yellow-800" style={{ backgroundColor: 'rgba(40,28,18,0.8)' }}>
									<label className="relative block">
										<span className="sr-only">Email</span>
										<div className="flex items-center gap-3 rounded px-3 py-2 border border-yellow-800 bg-yellow-50/5">
											<Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="bg-transparent border-0 placeholder-yellow-200/60 text-yellow-50" />
										</div>
									</label>

									<label className="relative block mt-3">
										<span className="sr-only">Password</span>
										<div className="flex items-center gap-3 rounded px-3 py-2 border border-yellow-800 bg-yellow-50/5">
											<Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="bg-transparent border-0 placeholder-yellow-200/60 text-yellow-50" />
										</div>
									</label>

									<div className="mt-4 text-center">
										<Button onClick={handleEmailAuth} className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-bold py-2 sm:py-3 rounded-lg" disabled={loading}>{mode === 'signin' ? 'ENTER THE FAMILY' : 'CREATE ACCOUNT'}</Button>
									</div>
								</div>

									<div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-yellow-200/80">
										<a className="hover:underline cursor-pointer">Forgot password?</a>
										<div className="flex flex-wrap items-center gap-3">
											<label className="flex items-center gap-2 text-yellow-200/80">
												<input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
												<span className="text-sm">Remember me</span>
											</label>
											<a className="hover:underline cursor-pointer" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create account' : 'Have an account? Sign in'}</a>
										</div>
									</div>

									<div className="text-center text-sm text-yellow-200/60 mt-3">or continue with</div>
									<div className="flex gap-2 justify-center flex-wrap mt-2">
										<Button onClick={() => signInWithProvider('google')} size="sm" variant="outline" disabled={loading || !enabledProviders.has('google')}>Google</Button>
										<Button onClick={sendMagicLink} size="sm" variant="ghost" disabled={loading}>Magic Link</Button>
										<Button onClick={sendPasswordReset} size="sm" variant="ghost" disabled={loading}>Reset</Button>
									</div>

								{lastError && (
									<div className="mt-4 p-3 bg-red-900/80 text-red-100 rounded text-sm font-mono break-words">
										<strong className="block text-xs text-red-200">Last auth error:</strong>
										<div className="mt-1 text-xs">{lastError}</div>
									</div>
								)}

							</div>
						</div>

						<div className="p-4 text-center text-xs text-yellow-200/60">By entering you agree to join the family. Play fair.</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Auth;
