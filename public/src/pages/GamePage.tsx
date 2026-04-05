import { useCallback, useEffect, useState } from "react";
import type { UseTicTacToeGame } from "../hooks/useTicTacToeGame";
import { GameBoard } from "../components/GameBoard";
import { GameResultModal } from "../components/GameResultModal";
import { GameStatus } from "../components/GameStatus";
import { PlayerStrip } from "../components/PlayerStrip";
import { RejectToast } from "../components/RejectToast";

const POST_MATCH_LOBBY_SEC = 10;

interface GamePageProps {
  game: UseTicTacToeGame;
}

export function GamePage({ game }: GamePageProps) {
  const { snapshot, matchId, myUserId } = game;
  const [postMatchSecondsLeft, setPostMatchSecondsLeft] = useState<
    number | null
  >(null);

  const leaveGame = game.leaveGame;

  useEffect(() => {
    if (!snapshot || snapshot.status !== "finished" || !matchId) {
      setPostMatchSecondsLeft(null);
      return;
    }
    let seconds = POST_MATCH_LOBBY_SEC;
    setPostMatchSecondsLeft(seconds);
    const id = window.setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        window.clearInterval(id);
        setPostMatchSecondsLeft(null);
        void leaveGame();
        return;
      }
      setPostMatchSecondsLeft(seconds);
    }, 1000);
    return () => window.clearInterval(id);
  }, [matchId, snapshot?.status, leaveGame]);

  const onMove = useCallback(
    (i: number) => {
      void game.sendMove(i);
    },
    [game]
  );

  if (!matchId || !snapshot) {
    return (
      <p className="muted">Loading board from server…</p>
    );
  }

  const canSendMoves =
    game.connection === "in_match" && snapshot.status === "playing";

  return (
    <div className="game-page">
      <GameStatus snapshot={snapshot} myUserId={myUserId} matchId={matchId} />
      <PlayerStrip snapshot={snapshot} myUserId={myUserId} />
      <GameBoard
        snapshot={snapshot}
        myUserId={myUserId}
        onMove={onMove}
        canSendMoves={canSendMoves}
      />
      <RejectToast
        reason={game.lastRejectReason}
        onDismiss={game.clearRejectToast}
      />
      {snapshot.status === "finished" ? (
        <GameResultModal
          snapshot={snapshot}
          myUserId={myUserId}
          matchId={matchId}
          postMatchSecondsLeft={postMatchSecondsLeft}
          onLeaveNow={() => void game.leaveGame()}
        />
      ) : null}
      <div className="game-page__actions">
        <button type="button" className="btn btn--ghost" onClick={() => void game.leaveGame()}>
          Leave match
        </button>
        <button
          type="button"
          className="btn"
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
  );
}
