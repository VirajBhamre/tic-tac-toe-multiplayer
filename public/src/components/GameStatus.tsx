import { useEffect, useState } from "react";
import type { ServerGameSnapshot } from "../types/serverGame";

interface GameStatusProps {
  snapshot: ServerGameSnapshot;
  myUserId: string | undefined;
  matchId: string;
}

function symbolForUser(
  snapshot: ServerGameSnapshot,
  userId: string | undefined
): string {
  if (!userId) return "—";
  const p = snapshot.players.find((x) => x.userId === userId);
  return p?.symbol ?? "—";
}

export function GameStatus({ snapshot, myUserId, matchId }: GameStatusProps) {
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (
      snapshot.gameMode !== "timed" ||
      snapshot.status !== "playing" ||
      snapshot.turnDeadlineTick === null
    ) {
      setTurnSecondsLeft(null);
      return;
    }
    const tr = snapshot.tickRate > 0 ? snapshot.tickRate : 5;
    const ticksLeft = snapshot.turnDeadlineTick - snapshot.matchTick;
    const secAtSnap = Math.max(0, ticksLeft / tr);
    const t0 = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - t0) / 1000;
      setTurnSecondsLeft(Math.max(0, Math.ceil(secAtSnap - elapsed)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [
    snapshot.gameMode,
    snapshot.status,
    snapshot.turnDeadlineTick,
    snapshot.matchTick,
    snapshot.tickRate,
  ]);

  const you = symbolForUser(snapshot, myUserId);
  const phase =
    snapshot.status === "waiting"
      ? "Waiting for opponent…"
      : snapshot.status === "playing"
        ? "In progress"
        : "Game over";

  let headline = phase;
  if (snapshot.status === "playing" && myUserId) {
    headline =
      snapshot.currentTurn === myUserId
        ? "Your turn"
        : "Opponent's turn";
  }
  if (snapshot.status === "finished") {
    if (snapshot.winner && snapshot.winner === myUserId) {
      headline = "You won";
    } else if (snapshot.winner) {
      headline = "You lost";
    } else {
      headline = "Draw";
    }
  }

  const shortId = matchId.length > 12 ? `${matchId.slice(0, 8)}…` : matchId;

  const eloLine =
    snapshot.status === "finished" &&
    myUserId &&
    snapshot.eloSummary?.[myUserId]
      ? (() => {
          const { before, after } = snapshot.eloSummary[myUserId];
          const delta = after - before;
          const sign = delta > 0 ? "+" : "";
          return `Elo ${before} → ${after} (${sign}${delta})`;
        })()
      : null;

  const endReasonLine =
    snapshot.status === "finished" && snapshot.endReason === "timeout"
      ? "Decided by move timeout."
      : snapshot.status === "finished" &&
          snapshot.endReason === "disconnect"
        ? "Opponent disconnected."
        : null;

  const timerLine =
    snapshot.gameMode === "timed" &&
    snapshot.status === "playing" &&
    turnSecondsLeft !== null
      ? `Time left: ${turnSecondsLeft}s`
      : null;

  return (
    <section className="game-status" aria-live="polite">
      <p className="game-status__headline">{headline}</p>
      {timerLine ? (
        <p className="game-status__timer" aria-live="polite">
          {timerLine}
        </p>
      ) : null}
      {endReasonLine ? (
        <p className="game-status__end-reason muted">{endReasonLine}</p>
      ) : null}
      {eloLine ? (
        <p className="game-status__elo muted">{eloLine}</p>
      ) : null}
      <dl className="game-status__meta">
        <div>
          <dt>You</dt>
          <dd>
            <span className="mono">{you}</span>
          </dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{snapshot.gameMode === "timed" ? "Timed" : "Classic"}</dd>
        </div>
        <div>
          <dt>Match</dt>
          <dd className="mono match-id" title={matchId}>
            {shortId}
          </dd>
        </div>
        <div>
          <dt>Moves</dt>
          <dd>{snapshot.moveCount}</dd>
        </div>
      </dl>
    </section>
  );
}
