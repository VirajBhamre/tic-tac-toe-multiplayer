import type { ServerGameSnapshot } from "../types/serverGame";
import { BoardCell } from "./BoardCell";

interface GameBoardProps {
  snapshot: ServerGameSnapshot;
  myUserId: string | undefined;
  onMove: (index: number) => void;
  canSendMoves: boolean;
}

/**
 * Renders cells from server snapshot only. Clickability is UX (your turn / playing);
 * invalid taps are still rejected by the server.
 */
export function GameBoard({
  snapshot,
  myUserId,
  onMove,
  canSendMoves,
}: GameBoardProps) {
  return (
    <div className="board-grid" role="grid" aria-label="Tic tac toe board">
      {snapshot.board.map((cell, i) => {
        const isMyTurn =
          snapshot.status === "playing" && snapshot.currentTurn === myUserId;
        const empty = cell === null;
        const disabled =
          !canSendMoves || !empty || snapshot.status !== "playing" || !isMyTurn;
        return (
          <BoardCell
            key={i}
            index={i}
            value={cell}
            disabled={disabled}
            onSelect={onMove}
          />
        );
      })}
    </div>
  );
}
