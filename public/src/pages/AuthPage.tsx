import { useState, type FormEvent } from "react";
import type { UseTicTacToeGame } from "../hooks/useTicTacToeGame";

interface AuthPageProps {
  game: UseTicTacToeGame;
}

export function AuthPage({ game }: AuthPageProps) {
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "register") {
      void run(() =>
        game.registerWithEmail(email, password, username)
      );
    } else {
      void run(() =>
        game.signInWithIdentifier(identifier, password)
      );
    }
  };

  return (
    <div className="auth-page">
      <h2 className="auth-page__title">
        {mode === "register" ? "Create account" : "Sign in"}
      </h2>
      <p className="auth-page__hint muted">
        An account is required so your skill rating can be saved on the server.
      </p>
      <form className="auth-page__form" onSubmit={onSubmit}>
        {mode === "register" ? (
          <>
            <label className="auth-page__label">
              Email
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="auth-page__label">
              Username
              <input
                className="input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]{3,20}"
                title="3–20 characters: letters, numbers, underscores"
              />
            </label>
          </>
        ) : (
          <label className="auth-page__label">
            Email or username
            <input
              className="input"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </label>
        )}
        <label className="auth-page__label">
          Password
          <input
            className="input"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {game.errorMessage ? (
          <p className="auth-page__error" role="alert">
            {game.errorMessage}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn--primary auth-page__submit"
          disabled={busy}
        >
          {mode === "register" ? "Register" : "Sign in"}
        </button>
      </form>
      <p className="auth-page__switch">
        {mode === "register" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="btn-inline"
              onClick={() => {
                setMode("signin");
                game.clearErrorMessage();
              }}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            New here?{" "}
            <button
              type="button"
              className="btn-inline"
              onClick={() => {
                setMode("register");
                game.clearErrorMessage();
              }}
            >
              Register
            </button>
          </>
        )}
      </p>
    </div>
  );
}
