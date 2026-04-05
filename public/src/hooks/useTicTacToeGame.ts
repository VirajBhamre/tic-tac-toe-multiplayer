import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Session } from "@heroiclabs/nakama-js";
import type { Socket } from "@heroiclabs/nakama-js";
import { OP_MOVE, OP_REJECT, OP_STATE } from "../constants/matchProtocol";
import {
  clearPersistedSession,
  persistSession,
  readStoredSession,
} from "../services/authSession";
import { getNakamaClient } from "../services/nakamaClient";
import { getNakamaConfig } from "../services/env";
import {
  LEADERBOARD_PAGE_SIZE,
  type LeaderboardRow,
  type MyCareerPayload,
  type OpenMatchRow,
  rpcGetLeaderboard,
  rpcGetMyStats,
  rpcListOpenMatches,
} from "../services/lobbyRpc";
import { rpcCreateMatch, rpcJoinMatchAck } from "../services/matchRpc";
import {
  rpcChangePassword,
  rpcGetProfileStatus,
  rpcSetUsernameAndOnboard,
  rpcSignInWithIdentifier,
} from "../services/profileRpc";
import { rpcGetRating } from "../services/ratingRpc";
import {
  type ServerGameSnapshot,
  parseServerSnapshot,
} from "../types/serverGame";

const MATCH_STORAGE_KEY = "ttt_active_match_id";

export type ConnectionState =
  | "unauthenticated"
  | "authenticating"
  | "needs_username"
  | "ready"
  | "matchmaking"
  | "joining"
  | "in_match"
  | "disconnected"
  | "error";

export interface UseTicTacToeGame {
  connection: ConnectionState;
  session: Session | null;
  errorMessage: string | null;
  matchId: string | null;
  snapshot: ServerGameSnapshot | null;
  lastRejectReason: string | null;
  myUserId: string | undefined;
  myRating: number | null;
  signInWithIdentifier: (identifier: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    username: string
  ) => Promise<void>;
  submitOnboardingUsername: (username: string) => Promise<void>;
  /** Updates display username via server RPC; refreshes session token on success. */
  updateUsername: (username: string) => Promise<void>;
  /** Email-linked accounts only; verifies old password on server. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  refreshMyRating: () => Promise<void>;
  refreshOpenMatches: (mode?: "classic" | "timed" | "any") => Promise<void>;
  refreshLeaderboard: (page?: number) => Promise<void>;
  leaderboardPage: number;
  leaderboardTotalCount: number;
  refreshMyCareer: () => Promise<void>;
  findRankedMatch: (mode?: "classic" | "timed") => Promise<void>;
  cancelMatchmaking: () => Promise<void>;
  createGame: (opts?: { mode?: "classic" | "timed" }) => Promise<void>;
  joinGame: (matchId: string) => Promise<void>;
  sendMove: (index: number) => Promise<void>;
  leaveGame: () => Promise<void>;
  reconnect: () => Promise<void>;
  clearRejectToast: () => void;
  clearErrorMessage: () => void;
  resumeStoredMatch: () => Promise<void>;
  pendingResumeMatchId: string | null;
  openMatches: OpenMatchRow[];
  leaderboardRows: LeaderboardRow[];
  myCareer: MyCareerPayload | null;
}

function readStoredMatchId(): string | null {
  try {
    return sessionStorage.getItem(MATCH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredMatchId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(MATCH_STORAGE_KEY, id);
    else sessionStorage.removeItem(MATCH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useTicTacToeGame(): UseTicTacToeGame {
  const client = useMemo(() => getNakamaClient(), []);

  const [connection, setConnection] = useState<ConnectionState>(
    "authenticating"
  );
  const [session, setSession] = useState<Session | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ServerGameSnapshot | null>(null);
  const [lastRejectReason, setLastRejectReason] = useState<string | null>(
    null
  );
  const [myRating, setMyRating] = useState<number | null>(null);
  const [openMatches, setOpenMatches] = useState<OpenMatchRow[]>([]);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>(
    []
  );
  const [leaderboardPage, setLeaderboardPage] = useState(0);
  const [leaderboardTotalCount, setLeaderboardTotalCount] = useState(0);
  const leaderboardPageRef = useRef(0);
  const [myCareer, setMyCareer] = useState<MyCareerPayload | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const moveSeqRef = useRef(0);
  const mmTicketRef = useRef<string | null>(null);

  useEffect(() => {
    matchIdRef.current = matchId;
  }, [matchId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    leaderboardPageRef.current = leaderboardPage;
  }, [leaderboardPage]);

  const tearDownSocket = useCallback(() => {
    const s = socketRef.current;
    socketRef.current = null;
    mmTicketRef.current = null;
    if (s) {
      try {
        s.disconnect(true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const attachSocketHandlers = useCallback((sock: Socket, mid: string) => {
    sock.onmatchdata = (md) => {
      if (md.match_id !== mid) return;
      const text = new TextDecoder().decode(md.data);
      if (md.op_code === OP_STATE) {
        try {
          const json: unknown = JSON.parse(text);
          const next = parseServerSnapshot(json);
          if (next) {
            setSnapshot(next);
            const uid = sessionRef.current?.user_id;
            if (uid && next.eloSummary?.[uid]) {
              setMyRating(next.eloSummary[uid].after);
            }
          }
        } catch {
          setErrorMessage("Invalid state payload from server");
        }
        return;
      }
      if (md.op_code === OP_REJECT) {
        try {
          const json = JSON.parse(text) as { reason?: string };
          setLastRejectReason(json.reason ?? "move_rejected");
        } catch {
          setLastRejectReason("move_rejected");
        }
      }
    };

    sock.ondisconnect = () => {
      setConnection((c) =>
        c === "unauthenticated" ||
        c === "authenticating" ||
        c === "ready" ||
        c === "needs_username"
          ? c
          : "disconnected"
      );
    };
  }, []);

  const bindDefaultDisconnect = useCallback((sock: Socket) => {
    sock.ondisconnect = () => {
      setConnection((c) =>
        c === "unauthenticated" ||
        c === "authenticating" ||
        c === "ready" ||
        c === "needs_username"
          ? c
          : "disconnected"
      );
    };
  }, []);

  const openSocketAndJoin = useCallback(
    async (sess: Session, mid: string) => {
      tearDownSocket();
      const { useSSL } = getNakamaConfig();
      const sock = client.createSocket(useSSL, false);
      socketRef.current = sock;
      attachSocketHandlers(sock, mid);
      moveSeqRef.current = 0;
      await sock.connect(sess, true);
      await sock.joinMatch(mid, undefined, {});
      setMatchId(mid);
      matchIdRef.current = mid;
      writeStoredMatchId(mid);
      setConnection("in_match");
    },
    [attachSocketHandlers, client, tearDownSocket]
  );

  const refreshMyRating = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess) return;
    try {
      const r = await rpcGetRating(client, sess);
      setMyRating(r.rating);
    } catch {
      /* ignore */
    }
  }, [client]);

  const refreshMyCareer = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess) return;
    try {
      const c = await rpcGetMyStats(client, sess);
      setMyCareer(c);
    } catch {
      setMyCareer(null);
    }
  }, [client]);

  const refreshOpenMatches = useCallback(
    async (mode?: "classic" | "timed" | "any") => {
      const sess = sessionRef.current;
      if (!sess) return;
      try {
        const rows = await rpcListOpenMatches(client, sess, mode);
        setOpenMatches(rows);
      } catch {
        setOpenMatches([]);
      }
    },
    [client]
  );

  const refreshLeaderboard = useCallback(
    async (pageArg?: number) => {
      const sess = sessionRef.current;
      if (!sess) return;
      const page =
        pageArg !== undefined ? pageArg : leaderboardPageRef.current;
      try {
        const { records, totalCount } = await rpcGetLeaderboard(client, sess, {
          limit: LEADERBOARD_PAGE_SIZE,
          offset: page * LEADERBOARD_PAGE_SIZE,
        });
        setLeaderboardPage(page);
        setLeaderboardRows(records);
        setLeaderboardTotalCount(totalCount);
      } catch {
        setLeaderboardRows([]);
        setLeaderboardTotalCount(0);
      }
    },
    [client]
  );

  const applyAuthenticatedSession = useCallback(
    async (sess: Session) => {
      persistSession(sess);
      setSession(sess);
      sessionRef.current = sess;
      setErrorMessage(null);
      try {
        const r = await rpcGetRating(client, sess);
        setMyRating(r.rating);
      } catch {
        setMyRating(null);
      }
      try {
        const c = await rpcGetMyStats(client, sess);
        setMyCareer(c);
      } catch {
        setMyCareer(null);
      }
      let needsSetup = true;
      try {
        const prof = await rpcGetProfileStatus(client, sess);
        needsSetup = prof.needsUsernameSetup;
      } catch {
        needsSetup = true;
      }
      setConnection(needsSetup ? "needs_username" : "ready");
    },
    [client]
  );

  const signInWithIdentifier = useCallback(
    async (identifier: string, password: string) => {
      setErrorMessage(null);
      setConnection("authenticating");
      const id = identifier.trim();
      try {
        let sess: Session;
        if (id.includes("@")) {
          sess = await client.authenticateEmail(id, password, false);
        } else {
          const res = await rpcSignInWithIdentifier(client, id, password);
          if (!res.ok) {
            setConnection("unauthenticated");
            setErrorMessage(res.message);
            return;
          }
          sess = new Session(res.token, "", res.created ?? false);
        }
        await applyAuthenticatedSession(sess);
      } catch (e) {
        setConnection("unauthenticated");
        setErrorMessage(
          e instanceof Error ? e.message : "Sign-in failed"
        );
      }
    },
    [applyAuthenticatedSession, client]
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string, username: string) => {
      setErrorMessage(null);
      setConnection("authenticating");
      try {
        const u = username.trim();
        const sess = await client.authenticateEmail(
          email.trim(),
          password,
          true,
          u
        );
        await rpcSetUsernameAndOnboard(client, sess, u);
        await applyAuthenticatedSession(sess);
      } catch (e) {
        setConnection("unauthenticated");
        setErrorMessage(
          e instanceof Error ? e.message : "Registration failed"
        );
        throw e;
      }
    },
    [applyAuthenticatedSession, client]
  );

  const submitOnboardingUsername = useCallback(
    async (username: string) => {
      const sess = sessionRef.current;
      if (!sess) {
        setErrorMessage("Session lost; sign in again.");
        return;
      }
      setErrorMessage(null);
      try {
        await rpcSetUsernameAndOnboard(client, sess, username.trim());
        await applyAuthenticatedSession(sess);
      } catch (e) {
        setConnection("needs_username");
        setErrorMessage(
          e instanceof Error ? e.message : "Could not save username"
        );
        throw e;
      }
    },
    [applyAuthenticatedSession, client]
  );

  const updateUsername = useCallback(
    async (username: string) => {
      const sess = sessionRef.current;
      if (!sess) {
        throw new Error("Session lost; sign in again.");
      }
      await rpcSetUsernameAndOnboard(client, sess, username.trim());
      const refreshed = await client.sessionRefresh(sess);
      persistSession(refreshed);
      setSession(refreshed);
      sessionRef.current = refreshed;
    },
    [client]
  );

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      const sess = sessionRef.current;
      if (!sess) {
        throw new Error("Session lost; sign in again.");
      }
      await rpcChangePassword(client, sess, oldPassword, newPassword);
    },
    [client]
  );

  const logout = useCallback(() => {
    tearDownSocket();
    clearPersistedSession();
    setSession(null);
    sessionRef.current = null;
    setMatchId(null);
    matchIdRef.current = null;
    setSnapshot(null);
    setMyRating(null);
    setOpenMatches([]);
    setLeaderboardRows([]);
    setLeaderboardPage(0);
    setLeaderboardTotalCount(0);
    setMyCareer(null);
    writeStoredMatchId(null);
    setErrorMessage(null);
    setConnection("unauthenticated");
  }, [tearDownSocket]);

  const createGame = useCallback(
    async (opts?: { mode?: "classic" | "timed" }) => {
      const sess = sessionRef.current;
      if (!sess) {
        setErrorMessage("Not signed in");
        return;
      }
      setErrorMessage(null);
      setConnection("joining");
      setSnapshot(null);
      try {
        const mid = await rpcCreateMatch(client, sess, {
          rated: false,
          mode: opts?.mode ?? "classic",
          moveTimeLimitSec: 30,
        });
        await openSocketAndJoin(sess, mid);
      } catch (e) {
        setConnection("ready");
        setErrorMessage(
          e instanceof Error ? e.message : "Could not create match"
        );
        throw e;
      }
    },
    [client, openSocketAndJoin]
  );

  const joinGame = useCallback(
    async (rawId: string) => {
      const sess = sessionRef.current;
      if (!sess) {
        setErrorMessage("Not signed in");
        return;
      }
      const mid = rawId.trim();
      if (!mid) {
        setErrorMessage("Enter a match id");
        return;
      }
      setErrorMessage(null);
      setConnection("joining");
      setSnapshot(null);
      try {
        await rpcJoinMatchAck(client, sess, mid);
        await openSocketAndJoin(sess, mid);
      } catch (e) {
        setConnection("ready");
        setErrorMessage(
          e instanceof Error ? e.message : "Could not join match"
        );
        throw e;
      }
    },
    [client, openSocketAndJoin]
  );

  const findRankedMatch = useCallback(
    async (mode: "classic" | "timed" = "classic") => {
      const sess = sessionRef.current;
      if (!sess) {
        setErrorMessage("Not signed in");
        return;
      }
      setErrorMessage(null);
      setConnection("matchmaking");
      setSnapshot(null);
      tearDownSocket();

      let rating: number;
      try {
        const r = await rpcGetRating(client, sess);
        rating = r.rating;
        setMyRating(r.rating);
      } catch (e) {
        setConnection("ready");
        setErrorMessage(
          e instanceof Error ? e.message : "Could not load rating"
        );
        return;
      }

      const modeQuery =
        mode === "timed"
          ? "+properties.game_mode:timed"
          : "+properties.game_mode:classic";
      const spread = 500;
      const rMin = Math.max(0, Math.floor(rating - spread));
      const rMax = Math.floor(rating + spread);
      const query = `+properties.game:tictactoe +properties.rating:>=${rMin} +properties.rating:<=${rMax} ${modeQuery}`;

      const { useSSL } = getNakamaConfig();
      const sock = client.createSocket(useSSL, false);
      socketRef.current = sock;
      moveSeqRef.current = 0;
      bindDefaultDisconnect(sock);

      sock.onmatchmakermatched = async (mm) => {
        try {
          const mid = mm.match_id;
          attachSocketHandlers(sock, mid);
          await sock.joinMatch(mm.match_id, mm.token, {});
          setMatchId(mid);
          matchIdRef.current = mid;
          writeStoredMatchId(mid);
          mmTicketRef.current = null;
          setConnection("in_match");
        } catch (e) {
          tearDownSocket();
          setConnection("ready");
          setErrorMessage(
            e instanceof Error ? e.message : "Could not join ranked match"
          );
        }
      };

      try {
        await sock.connect(sess, true);
        const ticket = await sock.addMatchmaker(
          query,
          2,
          2,
          { game: "tictactoe", game_mode: mode },
          { rating }
        );
        mmTicketRef.current = ticket.ticket;
      } catch (e) {
        tearDownSocket();
        setConnection("ready");
        setErrorMessage(
          e instanceof Error ? e.message : "Matchmaking failed"
        );
      }
    },
    [
      attachSocketHandlers,
      bindDefaultDisconnect,
      client,
      tearDownSocket,
    ]
  );

  const cancelMatchmaking = useCallback(async () => {
    const ticket = mmTicketRef.current;
    const sock = socketRef.current;
    mmTicketRef.current = null;
    if (sock && ticket) {
      try {
        await sock.removeMatchmaker(ticket);
      } catch {
        /* ignore */
      }
    }
    tearDownSocket();
    setConnection("ready");
  }, [tearDownSocket]);

  const sendMove = useCallback(
    async (index: number) => {
      const sock = socketRef.current;
      const mid = matchIdRef.current;
      if (!sock || !mid) return;
      moveSeqRef.current += 1;
      const payload = JSON.stringify({
        index,
        clientMoveId: moveSeqRef.current,
      });
      await sock.sendMatchState(mid, OP_MOVE, payload);
    },
    []
  );

  const leaveGame = useCallback(async () => {
    const sock = socketRef.current;
    const mid = matchIdRef.current;
    if (sock && mid) {
      try {
        await sock.leaveMatch(mid);
      } catch {
        /* ignore */
      }
    }
    tearDownSocket();
    setMatchId(null);
    matchIdRef.current = null;
    setSnapshot(null);
    writeStoredMatchId(null);
    setConnection(sessionRef.current ? "ready" : "unauthenticated");
    void refreshMyRating();
    void refreshMyCareer();
    void refreshLeaderboard(0);
  }, [refreshLeaderboard, refreshMyCareer, refreshMyRating, tearDownSocket]);

  const reconnect = useCallback(async () => {
    const sess = sessionRef.current;
    const mid = matchIdRef.current;
    if (!sess || !mid) {
      setErrorMessage("Nothing to reconnect to");
      return;
    }
    setErrorMessage(null);
    setConnection("joining");
    try {
      await openSocketAndJoin(sess, mid);
    } catch (e) {
      setConnection("disconnected");
      setErrorMessage(
        e instanceof Error ? e.message : "Reconnection failed"
      );
    }
  }, [openSocketAndJoin]);

  const resumeStoredMatch = useCallback(async () => {
    const id = readStoredMatchId();
    if (id) await joinGame(id);
  }, [joinGame]);

  const clearRejectToast = useCallback(() => setLastRejectReason(null), []);

  const clearErrorMessage = useCallback(() => setErrorMessage(null), []);

  useEffect(() => {
    if (!lastRejectReason) return;
    const t = window.setTimeout(() => setLastRejectReason(null), 4000);
    return () => clearTimeout(t);
  }, [lastRejectReason]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setConnection("authenticating");
      const stored = readStoredSession();
      if (stored) {
        try {
          let sess = Session.restore(stored.token, stored.refresh_token);
          const now = Date.now() / 1000;
          if (sess.isexpired(now)) {
            if (sess.refresh_token) {
              sess = await client.sessionRefresh(sess);
              persistSession(sess);
            } else {
              clearPersistedSession();
              if (!cancelled) {
                setConnection("unauthenticated");
              }
              return;
            }
          }
          if (!cancelled) {
            await applyAuthenticatedSession(sess);
          }
          return;
        } catch {
          clearPersistedSession();
        }
      }
      if (!cancelled) {
        setConnection("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, applyAuthenticatedSession]);

  useEffect(() => {
    return () => {
      tearDownSocket();
    };
  }, [tearDownSocket]);

  return {
    connection,
    session,
    errorMessage,
    matchId,
    snapshot,
    lastRejectReason,
    myUserId: session?.user_id,
    myRating,
    signInWithIdentifier,
    registerWithEmail,
    submitOnboardingUsername,
    updateUsername,
    changePassword,
    logout,
    refreshMyRating,
    refreshOpenMatches,
    refreshLeaderboard,
    refreshMyCareer,
    findRankedMatch,
    cancelMatchmaking,
    createGame,
    joinGame,
    sendMove,
    leaveGame,
    reconnect,
    clearRejectToast,
    clearErrorMessage,
    resumeStoredMatch,
    pendingResumeMatchId:
      matchId || connection !== "ready" ? null : readStoredMatchId(),
    openMatches,
    leaderboardRows,
    leaderboardPage,
    leaderboardTotalCount,
    myCareer,
  };
}
