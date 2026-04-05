import type { ServerGameSnapshot } from "../types/serverGame";

interface PlayerStripProps {
  snapshot: ServerGameSnapshot;
  myUserId: string | undefined;
}

export function PlayerStrip({ snapshot, myUserId }: PlayerStripProps) {
  if (snapshot.players.length === 0) {
    return <p className="player-strip">No players yet.</p>;
  }

  return (
    <ul className="player-strip">
      {snapshot.players.map((p) => (
        <li
          key={p.userId}
          className={`player-chip${p.userId === myUserId ? " player-chip--self" : ""}`}
        >
          <span className="player-chip__symbol">{p.symbol}</span>
          <span className="mono player-chip__id" title={p.userId}>
            {p.userId === myUserId ? "You" : "Guest"}
          </span>
        </li>
      ))}
    </ul>
  );
}
