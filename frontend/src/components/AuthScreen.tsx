import { useState } from "react";
import type { FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import {
  ArrowUpRight,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  BrainCircuit,
  Code2,
  Compass,
  BookOpen,
} from "lucide-react";
import { auth } from "../firebase";
import { ThemeToggle } from "./ui/ThemeToggle";
import { errorMessage } from "../lib/workspace";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function AuthScreen() {
  const [tab, setTab] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearMessages = () => {
    setError("");
    setNotice("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!auth) {
      setError("Firebase is not configured. Check your VITE_FIREBASE_* environment variables.");
      return;
    }

    setBusy(true);
    clearMessages();

    try {
      if (tab === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        if (name.trim()) {
          await updateProfile(credential.user, { displayName: name.trim() });
        }
      } else if (tab === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice("Password reset email sent. Check your inbox.");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const signInGoogle = async () => {
    if (!auth) {
      setError("Firebase is not configured. Check your VITE_FIREBASE_* environment variables.");
      return;
    }

    setGoogleBusy(true);
    clearMessages();

    try {
      await signInWithPopup(auth, googleProvider);
      // App.tsx observes Firebase auth state and opens the workspace automatically.
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGoogleBusy(false);
    }
  };

  const switchTab = (nextTab: "login" | "signup" | "reset") => {
    setTab(nextTab);
    clearMessages();
  };

  return (
    <main className="auth-layout">
      <section className="auth-art" aria-label="Dexter introduction">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div><strong>Dexter</strong><span>PERSONAL INTELLIGENCE</span></div>
        </div>
        <div className="auth-art-copy">
          <div className="big-orb"><BrainCircuit size={30} /></div>
          <div className="eyebrow">YOUR PERSONAL AI WORKSPACE</div>
          <h1>One place.<br /><em>Infinite ways</em><br />to get things done.</h1>
          <p>Your ideas, projects, research, and plans — powered by a team of AI specialists that work together around you.</p>
          <div className="auth-feature"><CheckCircle2 size={17} /> One workspace for every kind of work</div>
          <div className="auth-feature"><ShieldCheck size={17} /> Your account. Your context. Your control.</div>
          <div className="floating-note"><span className="status-dot" /> Your AI team is ready when you are <ArrowUpRight size={15} /></div>
          <div className="auth-agent-preview">
            <div><Code2 size={17} /><span>Builder</span></div>
            <div><BookOpen size={17} /><span>Tutor</span></div>
            <div><Compass size={17} /><span>Planner</span></div>
            <div><BrainCircuit size={17} /><span>Researcher</span></div>
          </div>
        </div>
        <div className="auth-art-footer">THOUGHTFUL AI. BUILT AROUND YOU.</div>
      </section>

      <section className="auth-main">
        <div className="auth-theme-toggle"><ThemeToggle /></div>
        <div className="auth-card">
          <div className="auth-mobile-brand"><div className="brand-mark"><Sparkles size={20} /></div><strong>Dexter</strong></div>
          <div className="eyebrow">WELCOME TO YOUR WORKSPACE</div>
          <h2>
            {tab === "login"
              ? "Welcome back"
              : tab === "signup"
                ? "Create your account"
                : "Reset your password"}
          </h2>

          {error && <div className="alert error" role="alert">{error}</div>}
          {notice && <div className="alert success" role="status">{notice}</div>}

          {tab !== "reset" && (
            <>
              <button
                type="button"
                className="google-button"
                onClick={() => void signInGoogle()}
                disabled={busy || googleBusy}
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.06 13.22l7.98 6.19C12.93 13.72 18.02 9.5 24 9.5Z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.99 46.98 31.92 46.98 24.55Z" />
                  <path fill="#FBBC05" d="M10.04 28.59A14.4 14.4 0 0 1 9.25 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.48-6.19Z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.18 2.3-5.98 0-11.07-4.22-12.96-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </svg>
                {googleBusy ? "Connecting to Google…" : "Continue with Google"}
              </button>
              <div className="auth-divider"><span>or continue with email</span></div>
            </>
          )}

          <form className="auth-form" onSubmit={submit}>
            {tab === "signup" && (
              <>
                <label htmlFor="signup-name">Display name</label>
                <input
                  id="signup-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </>
            )}

            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            {tab !== "reset" && (
              <>
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </>
            )}

            {tab === "login" && (
              <button type="button" className="text-button" onClick={() => switchTab("reset")}>
                Forgot password?
              </button>
            )}

            <button className="primary-button auth-submit" disabled={busy || googleBusy}>
              {busy
                ? "Please wait…"
                : tab === "login"
                  ? "Sign in"
                  : tab === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </button>
          </form>

          <div className="auth-switch">
            {tab === "login" ? (
              <>
                New to Dexter?{" "}
                <button type="button" onClick={() => switchTab("signup")}>Create an account</button>
              </>
            ) : tab === "signup" ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchTab("login")}>Sign in</button>
              </>
            ) : (
              <button type="button" onClick={() => switchTab("login")}>Back to sign in</button>
            )}
            <div className="auth-legal"><ShieldCheck size={13} /> Secure sign-in powered by Firebase</div>
          </div>
        </div>
      </section>
    </main>
  );
}
