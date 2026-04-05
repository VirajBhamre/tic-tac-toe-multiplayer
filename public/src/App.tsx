import { Layout } from "./components/Layout";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { UsernameRequiredModal } from "./components/UsernameRequiredModal";
import { useTicTacToeGame } from "./hooks/useTicTacToeGame";
import { AuthPage } from "./pages/AuthPage";
import { LobbyPage } from "./pages/LobbyPage";
import { GamePage } from "./pages/GamePage";

export default function App() {
  const game = useTicTacToeGame();
  const inGame = Boolean(game.matchId);

  if (game.connection === "unauthenticated") {
    return (
      <Layout subtitle="Sign in to play">
        <AuthPage game={game} />
      </Layout>
    );
  }

  if (game.connection === "needs_username") {
    return (
      <Layout subtitle="Set your username">
        <UsernameRequiredModal game={game} />
      </Layout>
    );
  }

  return (
    <Layout
      subtitle={
        inGame
          ? "Live match"
          : "Ranked queue, create a room, or join with a match id"
      }
    >
      <ConnectionBanner
        connection={game.connection}
        errorMessage={game.errorMessage}
        onReconnect={
          game.connection === "disconnected"
            ? () => void game.reconnect()
            : undefined
        }
        onCancelMatchmaking={
          game.connection === "matchmaking"
            ? () => void game.cancelMatchmaking()
            : undefined
        }
      />
      {inGame ? <GamePage game={game} /> : <LobbyPage game={game} />}
    </Layout>
  );
}
