import { useEffect, useState } from "react";
import { ProfileModal } from "../components/ProfileModal";
import type { UseTicTacToeGame } from "../hooks/useTicTacToeGame";
import { LEADERBOARD_PAGE_SIZE } from "../services/lobbyRpc";

interface LobbyPageProps {
  game: UseTicTacToeGame;
}

export function LobbyPage({ game }: LobbyPageProps) {
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);
  const [playMode, setPlayMode] = useState<"classic" | "timed">("classic");
  const [profileOpen, setProfileOpen] = useState(false);

  const ready = game.connection === "ready";
  const matchmaking = game.connection === "matchmaking";

  const totalPages = Math.max(
    1,
    Math.ceil(game.leaderboardTotalCount / LEADERBOARD_PAGE_SIZE)
  );
  const rangeFrom =
    game.leaderboardTotalCount === 0
      ? 0
      : game.leaderboardPage * LEADERBOARD_PAGE_SIZE + 1;
  const rangeTo =
    game.leaderboardTotalCount === 0
      ? 0
      : Math.min(
          (game.leaderboardPage + 1) * LEADERBOARD_PAGE_SIZE,
          game.leaderboardTotalCount
        );
  const canPrev = game.leaderboardPage > 0;
  const canNext =
    (game.leaderboardPage + 1) * LEADERBOARD_PAGE_SIZE <
    game.leaderboardTotalCount;

  useEffect(() => {
    if (!ready) return;
    void game.refreshOpenMatches("any");
    void game.refreshLeaderboard(0);
  }, [ready, game.refreshOpenMatches, game.refreshLeaderboard]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lobby">
      {profileOpen ? (
        <ProfileModal game={game} onClose={() => setProfileOpen(false)} />
      ) : null}
      <div className="lobby__user-bar card card--glow">
        <div className="lobby__rating">
          <span className="lobby__stat-label">Your Elo</span>{" "}
          <strong className="lobby__elo mono">
            {game.myRating != null ? game.myRating : "—"}
          </strong>
        </div>
        <div className="lobby__user-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setProfileOpen(true)}
          >
            Profile
          </button>
          <button
            type="button"
            className="btn btn--ghost lobby__logout"
            onClick={() => game.logout()}
          >
            Log out
          </button>
        </div>
      </div>

      {game.myCareer ? (
        <div className="lobby__career mono card">
          <span className="lobby__stat-label">Record</span>{" "}
          <span className="lobby__career-nums">
            {game.myCareer.stats.wins}W / {game.myCareer.stats.losses}L /{" "}
            {game.myCareer.stats.draws}D
          </span>
          <span className="lobby__career-divider" aria-hidden />
          <span className="lobby__stat-label">Streak</span>{" "}
          <span className="lobby__career-nums">
            {game.myCareer.stats.winStreak}
          </span>
        </div>
      ) : null}

      <div className="lobby__mode card">
        <span className="lobby__stat-label lobby__mode-label">
          Match mode for new games
        </span>
        <div className="lobby__mode-row">
          <label className="lobby__radio">
            <input
              type="radio"
              name="play-mode"
              checked={playMode === "classic"}
              onChange={() => setPlayMode("classic")}
            />
            Classic (no clock)
          </label>
          <label className="lobby__radio">
            <input
              type="radio"
              name="play-mode"
              checked={playMode === "timed"}
              onChange={() => setPlayMode("timed")}
            />
            Timed (30s / move, forfeit on timeout)
          </label>
        </div>
      </div>

      {game.pendingResumeMatchId ? (
        <div className="lobby__resume card card--accent-edge">
          <p>Resume your last match?</p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!ready || busy}
            onClick={() => run(() => game.resumeStoredMatch())}
          >
            Resume match
          </button>
        </div>
      ) : null}

      <div className="lobby__actions">
        <div className="lobby__ranked card card--glow">
          <h3 className="lobby__section-title">Ranked queue</h3>
          <p className="lobby__section-desc muted">
            Same mode only (classic vs timed). Elo ±500 search.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--pulse"
            disabled={!ready || busy || matchmaking}
            onClick={() => run(() => game.findRankedMatch(playMode))}
          >
            Find ranked ({playMode})
          </button>
        </div>

        <div className="lobby__manual card">
          <h3 className="lobby__section-title">Play with a friend</h3>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!ready || busy || matchmaking}
            onClick={() => run(() => game.createGame({ mode: playMode }))}
          >
            Create match ({playMode})
          </button>

          <div className="lobby__join">
            <label htmlFor="match-id">Join with match id</label>
            <div className="lobby__join-row">
              <input
                id="match-id"
                className="input input--game"
                placeholder="Paste match UUID"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn"
                disabled={
                  !ready || busy || matchmaking || !joinId.trim()
                }
                onClick={() => run(() => game.joinGame(joinId))}
              >
                Join
              </button>
            </div>
          </div>
        </div>

        <div className="lobby__discover card">
          <div className="lobby__discover-head">
            <h3 className="lobby__section-title">Open rooms</h3>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!ready || busy}
              onClick={() =>
                run(async () => {
                  await game.refreshOpenMatches("any");
                })
              }
            >
              Refresh
            </button>
          </div>
          <p className="lobby__section-desc muted">
            Matches waiting for a second player (discovered via server
            match list).
          </p>
          {game.openMatches.length === 0 ? (
            <p className="muted">No open rooms right now.</p>
          ) : (
            <ul className="lobby__room-list">
              {game.openMatches.map((m) => (
                <li key={m.matchId} className="lobby__room">
                  <span className="mono lobby__room-id">
                    {m.matchId.length > 14
                      ? `${m.matchId.slice(0, 10)}…`
                      : m.matchId}
                  </span>
                  <span className="lobby__room-meta">
                    {m.mode} · {m.size}/2
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={!ready || busy || matchmaking}
                    onClick={() => run(() => game.joinGame(m.matchId))}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lobby__leaderboard card card--glow">
          <div className="lobby__discover-head">
            <div>
              <h3 className="lobby__section-title">Global leaderboard</h3>
              <p className="lobby__lb-meta muted">
                Top rated · {LEADERBOARD_PAGE_SIZE} per page
                {game.leaderboardTotalCount > 0
                  ? ` · ${game.leaderboardTotalCount.toLocaleString()} players`
                  : null}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!ready || busy}
              onClick={() =>
                run(() => game.refreshLeaderboard(game.leaderboardPage))
              }
            >
              Refresh
            </button>
          </div>
          {game.leaderboardRows.length === 0 ? (
            <p className="muted">No entries yet — play a rated game.</p>
          ) : (
            <>
              <p className="lobby__lb-range muted">
                Showing{" "}
                <strong className="mono">
                  {rangeFrom}–{rangeTo}
                </strong>{" "}
                of{" "}
                <strong className="mono">
                  {game.leaderboardTotalCount.toLocaleString()}
                </strong>
              </p>
              <div className="lobby__lb-table-wrap">
                <table className="lobby__lb-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Player</th>
                      <th>Elo</th>
                      <th>W</th>
                      <th>L</th>
                      <th>D</th>
                      <th>Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {game.leaderboardRows.map((r) => {
                      const rowClass =
                        r.rank === 1
                          ? "lobby__lb-row lobby__lb-row--gold"
                          : r.rank === 2
                            ? "lobby__lb-row lobby__lb-row--silver"
                            : r.rank === 3
                              ? "lobby__lb-row lobby__lb-row--bronze"
                              : "lobby__lb-row";
                      return (
                        <tr key={r.userId} className={rowClass}>
                          <td className="lobby__lb-rank mono">{r.rank}</td>
                          <td className="mono lobby__lb-name">
                            {r.username || r.userId.slice(0, 8)}
                          </td>
                          <td className="mono lobby__lb-elo">
                            {typeof r.rating === "number" ? r.rating : "—"}
                          </td>
                          <td>{r.wins}</td>
                          <td>{r.losses}</td>
                          <td>{r.draws}</td>
                          <td>{r.winStreak}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="lobby__lb-pager">
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={!ready || busy || !canPrev}
                  onClick={() =>
                    run(() =>
                      game.refreshLeaderboard(game.leaderboardPage - 1)
                    )
                  }
                >
                  Previous
                </button>
                <span className="lobby__lb-page mono muted">
                  Page {game.leaderboardPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={!ready || busy || !canNext}
                  onClick={() =>
                    run(() =>
                      game.refreshLeaderboard(game.leaderboardPage + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
