import { useEffect } from "react";
import type { ServerGameSnapshot } from "../types/serverGame";

interface GameResultModalProps {
  snapshot: ServerGameSnapshot;
  myUserId: string | undefined;
  matchId: string;
  postMatchSecondsLeft: number | null;
  onLeaveNow: () => void;
}

function outcomeClass(snapshot: ServerGameSnapshot, myUserId: string | undefined): string {
  if (!snapshot.winner) return "game-result-modal__title--draw";
  if (snapshot.winner === myUserId) return "game-result-modal__title--win";
  return "game-result-modal__title--loss";
}

function outcomeTitle(snapshot: ServerGameSnapshot, myUserId: string | undefined): string {
  if (snapshot.winner && snapshot.winner === myUserId) return "You won";
  if (snapshot.winner) return "You lost";
  return "Draw";
}

function endReasonText(snapshot: ServerGameSnapshot): string | null {
  if (snapshot.endReason === "timeout") return "Decided by move timeout.";
  if (snapshot.endReason === "disconnect") return "Opponent disconnected.";
  return null;
}

function eloText(
  snapshot: ServerGameSnapshot,
  myUserId: string | undefined
): string | null {
  if (!myUserId || !snapshot.eloSummary?.[myUserId]) return null;
  const { before, after } = snapshot.eloSummary[myUserId];
  const delta = after - before;
  const sign = delta > 0 ? "+" : "";
  return `Elo ${before} → ${after} (${sign}${delta})`;
}

export function GameResultModal({
  snapshot,
  myUserId,
  matchId,
  postMatchSecondsLeft,
  onLeaveNow,
}: GameResultModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onLeaveNow();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onLeaveNow]);

  const title = outcomeTitle(snapshot, myUserId);
  const titleClass = outcomeClass(snapshot, myUserId);
  const reason = endReasonText(snapshot);
  const elo = eloText(snapshot, myUserId);

  return (
    <div
      className="game-result-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-result-modal-title"
    >
      <div className="game-result-modal__backdrop" aria-hidden />
      <div className="game-result-modal__panel">
        <h2 id="game-result-modal-title" className={`game-result-modal__title ${titleClass}`}>
          {title}
        </h2>
        {reason ? (
          <p className="game-result-modal__reason muted">{reason}</p>
        ) : null}
        {elo ? <p className="game-result-modal__elo mono">{elo}</p> : null}
        {postMatchSecondsLeft !== null && postMatchSecondsLeft > 0 ? (
          <p className="game-result-modal__countdown" role="status">
            Returning to lobby in{" "}
            <strong>{postMatchSecondsLeft}</strong>s…
          </p>
        ) : postMatchSecondsLeft === 0 ? (
          <p className="game-result-modal__countdown muted" role="status">
            Returning to lobby…
          </p>
        ) : null}
        <div className="game-result-modal__actions">
          <button
            type="button"
            className="btn btn--primary game-result-modal__leave"
            onClick={() => onLeaveNow()}
          >
            Leave to lobby now
          </button>
          <button
            type="button"
            className="btn btn--ghost game-result-modal__copy"
            onClick={() => {
              void navigator.clipboard.writeText(matchId).catch(() => {
                window.prompt("Copy match id:", matchId);
              });
            }}
          >
            Copy match id
          </button>
        </div>
      </div>
    </div>
  );
}
