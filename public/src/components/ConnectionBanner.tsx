import type { ConnectionState } from "../hooks/useTicTacToeGame";

interface ConnectionBannerProps {
  connection: ConnectionState;
  errorMessage: string | null;
  onReconnect?: () => void;
  onCancelMatchmaking?: () => void;
}

export function ConnectionBanner({
  connection,
  errorMessage,
  onReconnect,
  onCancelMatchmaking,
}: ConnectionBannerProps) {
  if (connection === "authenticating" || connection === "joining") {
    return (
      <div className="banner banner--info" role="status">
        {connection === "authenticating"
          ? "Restoring session…"
          : "Joining match…"}
      </div>
    );
  }

  if (connection === "matchmaking") {
    return (
      <div className="banner banner--info" role="status">
        <span>Finding a ranked opponent (similar Elo)…</span>
        {onCancelMatchmaking ? (
          <button
            type="button"
            className="btn-inline"
            onClick={onCancelMatchmaking}
          >
            Cancel
          </button>
        ) : null}
      </div>
    );
  }

  if (connection === "disconnected") {
    return (
      <div className="banner banner--warn">
        <span>Disconnected from realtime server.</span>
        {onReconnect ? (
          <button type="button" className="btn-inline" onClick={onReconnect}>
            Reconnect
          </button>
        ) : null}
      </div>
    );
  }

  if (errorMessage && connection === "ready") {
    return (
      <div className="banner banner--error" role="alert">
        {errorMessage}
      </div>
    );
  }

  return null;
}
