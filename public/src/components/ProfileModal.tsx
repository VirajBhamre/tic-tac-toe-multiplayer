import {
  useCallback,
  useEffect,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import type { UseTicTacToeGame } from "../hooks/useTicTacToeGame";
import { getNakamaClient } from "../services/nakamaClient";
import { rpcCheckUsernameAvailable } from "../services/profileRpc";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_NEW_PASSWORD_LEN = 8;

/** Block clipboard and drag-drop insertion so the value is typed only. */
function blockNonTypingInput(
  e: ClipboardEvent<HTMLInputElement> | DragEvent<HTMLInputElement>
) {
  e.preventDefault();
}

function mapUsernameError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes("username_taken")) {
    return "That username is already taken.";
  }
  if (m.includes("username_invalid")) {
    return "Use 3–20 characters: letters, numbers, and underscores only.";
  }
  return m || "Could not update username.";
}

function mapPasswordError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes("invalid_old_password")) {
    return "Current password is incorrect.";
  }
  if (m.includes("password_too_short")) {
    return `New password must be at least ${MIN_NEW_PASSWORD_LEN} characters.`;
  }
  if (m.includes("email_account_required")) {
    return "Password change is only available for email accounts.";
  }
  if (m.includes("missing_fields")) {
    return "Fill in all password fields.";
  }
  return m || "Could not change password.";
}

function validateNewPasswordPair(
  newPassword: string,
  confirmPassword: string
): string | null {
  if (newPassword.length < MIN_NEW_PASSWORD_LEN) {
    return `New password must be at least ${MIN_NEW_PASSWORD_LEN} characters.`;
  }
  if (newPassword !== confirmPassword) {
    return "New password and confirmation do not match.";
  }
  return null;
}

interface ProfileModalProps {
  game: UseTicTacToeGame;
  onClose: () => void;
}

export function ProfileModal({ game, onClose }: ProfileModalProps) {
  const [accountUsername, setAccountUsername] = useState<string | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<string | null>(null);

  const client = getNakamaClient();
  const session = game.session;

  const loadAccount = useCallback(async () => {
    if (!session) return;
    setLoadingAccount(true);
    try {
      const acc = await client.getAccount(session);
      const u = acc.user?.username?.trim();
      setAccountUsername(u && u.length > 0 ? u : null);
    } catch {
      setAccountUsername(session.username?.trim() || null);
    } finally {
      setLoadingAccount(false);
    }
  }, [client, session]);

  useEffect(() => {
    void game.refreshMyRating();
    void game.refreshMyCareer();
  }, [game.refreshMyRating, game.refreshMyCareer]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

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

  const enterEdit = () => {
    setLocalError(null);
    setAvailability(null);
    setUsername(accountUsername ?? "");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setLocalError(null);
    setAvailability(null);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const onSubmitEdit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const next = username.trim();
    const usernameChanged = next !== (accountUsername ?? "").trim();
    const op = oldPassword.length > 0;
    const np = newPassword.length > 0;
    const cp = confirmPassword.length > 0;
    const passwordIntent = op || np || cp;

    if (passwordIntent) {
      if (!op || !np || !cp) {
        setLocalError(
          "To change your password, fill in current password, new password, and confirmation."
        );
        return;
      }
      const pwErr = validateNewPasswordPair(newPassword, confirmPassword);
      if (pwErr) {
        setLocalError(pwErr);
        return;
      }
    }

    const fmt = validateFormat(username);
    if (fmt) {
      setLocalError(fmt);
      return;
    }

    if (!usernameChanged && !passwordIntent) {
      setEditMode(false);
      return;
    }

    setBusy(true);
    try {
      if (passwordIntent) {
        try {
          await game.changePassword(oldPassword, newPassword);
          setOldPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } catch (e) {
          setLocalError(mapPasswordError(e));
          return;
        }
      }
      if (usernameChanged) {
        await game.updateUsername(next);
      }
      await loadAccount();
      setEditMode(false);
    } catch (e) {
      setLocalError(mapUsernameError(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="profile-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <button
        type="button"
        className="profile-modal__backdrop"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div className="profile-modal__panel">
        <div className="profile-modal__head">
          <h2 id="profile-modal-title" className="profile-modal__title">
            Profile
          </h2>
          <button
            type="button"
            className="btn btn--ghost profile-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!editMode ? (
          <>
            <dl className="profile-modal__stats">
              <div className="profile-modal__stat">
                <dt>Username</dt>
                <dd className="mono">
                  {loadingAccount ? "…" : accountUsername ?? "—"}
                </dd>
              </div>
              <div className="profile-modal__stat">
                <dt>User id</dt>
                <dd className="mono profile-modal__userid">
                  {game.myUserId ?? "—"}
                </dd>
              </div>
              <div className="profile-modal__stat">
                <dt>Elo</dt>
                <dd className="mono">
                  {game.myRating != null ? game.myRating : "—"}
                </dd>
              </div>
              {game.myCareer ? (
                <>
                  <div className="profile-modal__stat">
                    <dt>Record</dt>
                    <dd className="mono">
                      {game.myCareer.stats.wins}W /{" "}
                      {game.myCareer.stats.losses}L /{" "}
                      {game.myCareer.stats.draws}D
                    </dd>
                  </div>
                  <div className="profile-modal__stat">
                    <dt>Win streak</dt>
                    <dd className="mono">{game.myCareer.stats.winStreak}</dd>
                  </div>
                </>
              ) : (
                <p className="muted profile-modal__career-pending">
                  Career stats loading…
                </p>
              )}
            </dl>
            <button
              type="button"
              className="btn btn--primary profile-modal__edit-btn"
              onClick={enterEdit}
            >
              Edit profile
            </button>
          </>
        ) : (
          <form
            className="profile-modal__form"
            onSubmit={(e) => void onSubmitEdit(e)}
          >
            <p className="muted profile-modal__edit-hint">
              Change your display name (3–20 characters: letters, numbers,
              underscores).
            </p>
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

            <div className="profile-modal__password-block">
              <h3 className="profile-modal__subheading">Change password</h3>
              <p className="muted profile-modal__edit-hint profile-modal__edit-hint--tight">
                Optional. New password and confirmation must match and be at
                least {MIN_NEW_PASSWORD_LEN} characters. Type new values
                manually (pasting is disabled).
              </p>
              <label className="auth-page__label">
                Current password
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </label>
              <label className="auth-page__label">
                New password
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onPaste={blockNonTypingInput}
                  onDrop={blockNonTypingInput}
                  onDragOver={(e) => e.preventDefault()}
                />
              </label>
              <label className="auth-page__label">
                Re-enter new password
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onPaste={blockNonTypingInput}
                  onDrop={blockNonTypingInput}
                  onDragOver={(e) => e.preventDefault()}
                />
              </label>
            </div>

            {localError ? (
              <p className="auth-page__error" role="alert">
                {localError}
              </p>
            ) : null}
            <div className="profile-modal__form-actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={cancelEdit}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
