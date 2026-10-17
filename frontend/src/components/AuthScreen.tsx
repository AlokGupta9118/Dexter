import { useState } from "react";
import type { FormEvent } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowUpRight, CheckCircle2, ShieldCheck, Sparkles, BrainCircuit, Code2, Compass, BookOpen } from "lucide-react";
import { auth } from "../firebase";
import { ThemeToggle } from "./ui/ThemeToggle";
import { errorMessage } from "../lib/workspace";

export function AuthScreen() {
  const [tab, setTab] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!auth) {
      setError("Firebase is not configured.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (tab === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        if (name.trim()) {
          await updateProfile(credential.user, {
            displayName: name.trim(),
          });
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

  return (
    <main className="auth-layout">
      <section className="auth-art" aria-label="Nexus introduction">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div><strong>NEXUS</strong><span>PERSONAL INTELLIGENCE</span></div>
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
          <div className="auth-mobile-brand"><div className="brand-mark"><Sparkles size={20} /></div><strong>NEXUS</strong></div>
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
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setTab("reset");
                setError("");
                setNotice("");
              }}
            >
              Forgot password?
            </button>
          )}

          <button className="primary-button auth-submit" disabled={busy}>
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
              New to Nexus?{" "}
              <button onClick={() => { setTab("signup"); setError(""); setNotice(""); }}>
                Create an account
              </button>
            </>
          ) : tab === "signup" ? (
            <>
              Already have an account?{" "}
              <button onClick={() => { setTab("login"); setError(""); setNotice(""); }}>
                Sign in
              </button>
            </>
          ) : (
            <button onClick={() => { setTab("login"); setError(""); setNotice(""); }}>
              Back to sign in
            </button>
          )}
          <div className="auth-legal"><ShieldCheck size={13} /> Secure sign-in powered by Firebase</div>
        </div>
        </div>
      </section>
    </main>
  );
}
