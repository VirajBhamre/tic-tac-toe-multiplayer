import { useState, type FormEvent } from "react";
import type { UseTicTacToeGame } from "../hooks/useTicTacToeGame";
import { getNakamaClient } from "../services/nakamaClient";
import { rpcCheckUsernameAvailable } from "../services/profileRpc";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

interface UsernameRequiredModalProps {
  game: UseTicTacToeGame;
}

export function UsernameRequiredModal({ game }: UsernameRequiredModalProps) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<string | null>(null);

  const client = getNakamaClient();
  const session = game.session;

  const validateFormat = (u: string): string | null => {
    const t = u.trim();
    if (t.length < 3) {
      return "Username must be at least 3 characters.";
    }
    if (!USERNAME_PATTERN.test(t)) {
      return "Use 3–20 characters: letters, numbers, and underscores only.";
    }
    return null;
  };

  const checkAvailable = async (u: string) => {
    if (!session || !USERNAME_PATTERN.test(u.trim())) {
      setAvailability(null);
      return;
    }
    setAvailability("Checking…");
    const r = await rpcCheckUsernameAvailable(client, session, u.trim());
    if (r.available) {
      setAvailability("Available.");
    } else {
      setAvailability(
        r.reason === "invalid_format"
          ? "Invalid format."
          : "That username is already taken."
      );
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const fmt = validateFormat(username);
    if (fmt) {
      setLocalError(fmt);
      return;
    }
    setBusy(true);
    try {
      await game.submitOnboardingUsername(username.trim());
    } catch {
      /* game.errorMessage set by hook */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="username-gate" role="dialog" aria-modal="true">
      <div className="username-gate__panel">
        <h2 className="username-gate__title">Choose your username</h2>
        <p className="username-gate__text muted">
          A unique username is required to play. This is how you appear on the
          leaderboard and to other players.
        </p>
        <form className="username-gate__form" onSubmit={(e) => void onSubmit(e)}>
          <label className="auth-page__label">
            Username
            <input
              className="input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setAvailability(null);
              }}
              onBlur={() => void checkAvailable(username)}
              required
              minLength={3}
              maxLength={20}
            />
          </label>
          {availability ? (
            <p className="username-gate__hint muted">{availability}</p>
          ) : null}
          {localError ? (
            <p className="auth-page__error" role="alert">
              {localError}
            </p>
          ) : null}
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
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
        <button
          type="button"
          className="btn btn--ghost username-gate__logout"
          disabled={busy}
          onClick={() => game.logout()}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
