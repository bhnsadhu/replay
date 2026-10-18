import { randomBytes } from 'node:crypto';
import {
  DEFAULT_RULES,
  MAX_PLAYERS,
  ROOM_CODE_ALPHABET,
  VOTE_MS,
  isBlockedInitials,
  replayWins,
  type ClientMessage,
  type ErrorCode,
  type RoomPhase,
  type RoomRole,
  type RoomRules,
  type RoomView,
  type ServerMessage,
  type SoundMode,
} from '@replay/shared';
import { Game } from './game';

/** One WebSocket connection. */
export interface Session {
  readonly id: string;
  send(msg: ServerMessage): void;
  room: Room | null;
  role: RoomRole | null;
  /** Your id in a room or in the public room. */
  playerId: string | null;
  inPublic: boolean;
}

interface RoomPlayer {
  id: string;
  /** Secret for getting this seat back after a dropped connection or reload. */
  token: string;
  slot: number;
  session: Session | null;
  initials: string;
  ready: boolean;
  /** Running while the player is away; removes them when it fires. */
  goneTimer: NodeJS.Timeout | null;
}

/** How long a dropped player's (or TV's) seat is held (PLAN.md §5). Shorter in tests via env. */
export const SEAT_HOLD_MS = Number(process.env.SEAT_HOLD_MS ?? 60_000);
/** A host who drops keeps the role this long before it passes on. */
export const HOST_GRACE_MS = Number(process.env.HOST_GRACE_MS ?? 10_000);

const rooms = new Map<string, Room>();

const newId = (): string => randomBytes(8).toString('base64url');
const newToken = (): string => randomBytes(16).toString('base64url');

function newRoomCode(): string {
  for (;;) {
    const bytes = randomBytes(4);
    const code = [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
    if (!rooms.has(code)) return code;
  }
}

function sendError(session: Session, code: ErrorCode, message: string): void {
  session.send({ t: 'error', code, message });
}

function detach(session: Session): void {
  session.room = null;
  session.role = null;
  session.playerId = null;
}

/** DEV, then DE2…DE9 if taken or blocked (PLAN.md §5). */
export function uniqueInitials(wanted: string, inUse: Set<string>): string {
  const free = (s: string) => !inUse.has(s) && !isBlockedInitials(s);
  if (free(wanted)) return wanted;
  for (let n = 2; n <= 9; n++) {
    const candidate = `${wanted.slice(0, 2)}${n}`;
    if (free(candidate)) return candidate;
  }
  return isBlockedInitials(wanted) ? 'AAA' : wanted;
}

export class Room {
  readonly code = newRoomCode();
  private tv: Session | null = null;
  private tvToken: string | null = null;
  private tvReady = false;
  private tvGoneTimer: NodeJS.Timeout | null = null;
  private readonly players = new Map<string, RoomPlayer>();
  private hostId: string | null = null;
  private hostTimer: NodeJS.Timeout | null = null;
  /** The host pressed PAUSE (separate from the TV-drop pause, so the TV coming back doesn't undo it). */
  private hostPaused = false;
  private phase: RoomPhase = 'lobby';
  private rules: RoomRules;
  private game: Game | null = null;
  private vote: { endsAt: number; yes: Set<string>; timer: NodeJS.Timeout } | null = null;

  constructor(sound: SoundMode) {
    this.rules = { ...DEFAULT_RULES, sound };
    rooms.set(this.code, this);
  }

  // ----- Membership -----

  attachTv(session: Session): void {
    this.tv = session;
    this.tvToken = newToken();
    session.room = this;
    session.role = 'tv';
    session.playerId = null;
    this.broadcastState();
  }

  addPlayer(session: Session, initials: string): void {
    if (this.players.size >= MAX_PLAYERS) return sendError(session, 'room_full', `That room is full (${MAX_PLAYERS} players).`);

    const taken = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 1;
    while (taken.has(slot)) slot++;

    const inUse = new Set([...this.players.values()].map((p) => p.initials));
    const player: RoomPlayer = {
      id: newId(),
      token: newToken(),
      slot,
      session,
      initials: uniqueInitials(initials, inUse),
      ready: false,
      goneTimer: null,
    };
    this.players.set(player.id, player);
    session.room = this;
    session.role = 'player';
    session.playerId = player.id;
    if (!this.hostId) this.hostId = player.id;
    this.broadcastState();
    // Late join (PLAN.md §5): drop into the round in progress, starting from 0 points.
    const live = this.game?.roundInProgress();
    if (live) session.send(live);
  }

  /** Gets a seat back after a dropped connection or reload. */
  resume(session: Session, token: string): boolean {
    if (this.tvToken && token === this.tvToken) {
      if (this.tv && this.tv !== session) detach(this.tv);
      this.tv = session;
      session.room = this;
      session.role = 'tv';
      session.playerId = null;
      if (this.tvGoneTimer) clearTimeout(this.tvGoneTimer);
      this.tvGoneTimer = null;
      if (!this.hostPaused) this.game?.resume();
      this.broadcastState();
      const live = this.game?.roundInProgress();
      if (live) session.send(live);
      return true;
    }

    const player = [...this.players.values()].find((p) => p.token === token);
    if (!player) return false;
    if (player.session && player.session !== session) detach(player.session);
    player.session = session;
    if (player.goneTimer) clearTimeout(player.goneTimer);
    player.goneTimer = null;
    session.room = this;
    session.role = 'player';
    session.playerId = player.id;
    if (this.hostId === player.id && this.hostTimer) {
      clearTimeout(this.hostTimer);
      this.hostTimer = null;
    }
    if (!this.hostId) this.hostId = player.id;
    this.broadcastState();
    const live = this.game?.roundInProgress();
    if (live) session.send(live);
    return true;
  }

  /** Leaving on purpose (BACK TO HOME, removed by the host): the seat goes right away. */
  remove(session: Session): void {
    if (session.role === 'tv') {
      this.close('The TV left, so the room closed.', session);
      return;
    }
    const player = session.playerId ? this.players.get(session.playerId) : undefined;
    detach(session);
    if (!player) return;
    player.session = null;
    this.release(player);
  }

  /**
   * The connection dropped or the page is reloading: hold the seat for SEAT_HOLD_MS.
   * A TV going away in TV-sound mode pauses the game until it's back.
   */
  away(session: Session): void {
    if (session.role === 'tv') {
      detach(session);
      if (this.tv !== session) return;
      this.tv = null;
      if (this.phase === 'playing' && this.rules.sound === 'tv') this.game?.pause();
      this.tvGoneTimer = setTimeout(() => this.close('The TV has been gone for a minute, so the room closed.', null), SEAT_HOLD_MS);
      this.broadcastState();
      return;
    }
    const player = session.playerId ? this.players.get(session.playerId) : undefined;
    detach(session);
    if (!player || player.session !== session) return;
    player.session = null;
    player.goneTimer = setTimeout(() => this.release(player), SEAT_HOLD_MS);
    this.game?.playerLeft();
    if (this.vote) {
      this.vote.yes.delete(player.id);
      if (this.everyoneVotedYes()) return this.resolveVote();
    }
    if (this.hostId === player.id && !this.hostTimer) {
      this.hostTimer = setTimeout(() => {
        this.hostTimer = null;
        if (this.hostId === player.id && !player.session) {
          this.hostId = this.nextHost();
          this.broadcastState();
        }
      }, HOST_GRACE_MS);
    }
    this.broadcastState();
  }

  /** The seat is gone for good: off the lobby, or kept on the scoreboard until this game ends. */
  private release(player: RoomPlayer): void {
    if (player.goneTimer) clearTimeout(player.goneTimer);
    player.goneTimer = null;
    if (this.phase === 'lobby') this.players.delete(player.id);
    else this.game?.playerLeft();
    if (this.hostId === player.id) {
      if (this.hostTimer) clearTimeout(this.hostTimer);
      this.hostTimer = null;
      this.hostId = this.nextHost();
    }
    if (this.vote) {
      this.vote.yes.delete(player.id);
      if (this.everyoneVotedYes()) return this.resolveVote();
    }
    const anyoneHeld = [...this.players.values()].some((p) => p.session !== null || p.goneTimer !== null);
    if (!this.tv && !this.tvGoneTimer && !anyoneHeld) return this.destroy();
    this.broadcastState();
  }

  private nextHost(): string | null {
    const candidates = this.connectedPlayers().sort((a, b) => a.slot - b.slot);
    return candidates[0]?.id ?? null;
  }

  private connectedPlayers(): RoomPlayer[] {
    return [...this.players.values()].filter((p) => p.session !== null);
  }

  // ----- Messages -----

  handle(session: Session, msg: ClientMessage): void {
    const player = session.playerId ? this.players.get(session.playerId) : undefined;
    const isHost = player !== undefined && player.id === this.hostId;

    switch (msg.t) {
      case 'tv:soundOn':
        if (session.role !== 'tv') return;
        this.tvReady = true;
        return this.broadcastState();

      case 'room:initials': {
        if (!player || this.phase === 'playing') return;
        const inUse = new Set([...this.players.values()].filter((p) => p.id !== player.id).map((p) => p.initials));
        player.initials = uniqueInitials(msg.initials, inUse);
        return this.broadcastState();
      }

      case 'room:ready':
        if (!player) return;
        player.ready = msg.ready;
        return this.broadcastState();

      case 'room:rules': {
        if (!isHost) return sendError(session, 'not_host', 'Only the host can change the rules.');
        if (this.phase === 'playing') return;
        // TV sound needs a TV in the room.
        const sound = msg.rules.sound === 'tv' && !this.tv ? 'all' : msg.rules.sound;
        this.rules = { ...msg.rules, sound };
        return this.broadcastState();
      }

      case 'room:kick': {
        if (!isHost) return sendError(session, 'not_host', 'Only the host can remove players.');
        const target = this.players.get(msg.playerId);
        if (!target || target.id === player.id) return;
        if (target.session) {
          target.session.send({ t: 'room:closed', reason: 'The host removed you from the room.' });
          this.remove(target.session);
        } else {
          if (target.goneTimer) clearTimeout(target.goneTimer);
          target.goneTimer = null;
          this.players.delete(target.id);
          this.broadcastState();
        }
        return;
      }

      case 'room:start':
        if (!isHost) return sendError(session, 'not_host', 'Only the host can start the game.');
        this.startGame(session);
        return;

      case 'room:end':
        if (!isHost) return sendError(session, 'not_host', 'Only the host can end the game.');
        this.endGame();
        return;

      case 'room:pause':
        if (!isHost) return sendError(session, 'not_host', 'Only the host can pause the game.');
        if (this.phase !== 'playing' || !this.game) return;
        this.hostPaused = msg.paused;
        if (msg.paused) this.game.pause();
        else if (!this.waitingForTv()) this.game.resume();
        return this.broadcastState();

      case 'room:skip':
        if (!isHost) return sendError(session, 'not_host', 'Only the host can skip a song.');
        if (this.phase === 'playing') this.game?.skip();
        return;

      case 'vote':
        if (!this.vote || !player?.session) return;
        if (msg.replay) this.vote.yes.add(player.id);
        else this.vote.yes.delete(player.id);
        if (this.everyoneVotedYes()) return this.resolveVote();
        return this.broadcastState();

      case 'guess':
        if (player && this.game) this.game.guess(player.id, msg.roundId, msg.choice, msg.elapsedMs);
        return;

      default:
        return;
    }
  }

  /** Starts a game. `session` gets the error message if it can't start (null when the replay vote starts it). */
  private startGame(session: Session | null): boolean {
    if (this.phase === 'playing') return false;
    if (this.connectedPlayers().length === 0) {
      if (session) sendError(session, 'cannot_start', 'Nobody is in the room yet.');
      return false;
    }
    if (this.rules.sound === 'tv' && !(this.tv && this.tvReady)) {
      if (session) sendError(session, 'cannot_start', 'Press any key on the TV first so it can play sound.');
      return false;
    }

    this.cancelVote();
    this.game?.dispose();
    for (const p of [...this.players.values()]) {
      if (!p.session && !p.goneTimer) this.players.delete(p.id); // Drop players who left during the last game.
      else p.ready = false;
    }
    this.phase = 'playing';
    const game = new Game(
      { mix: this.rules.mix, rounds: this.rules.rounds, clipMs: this.rules.clipSeconds * 1000 },
      {
        playerIds: () => [...this.players.keys()],
        activePlayerIds: () => this.connectedPlayers().map((p) => p.id),
        initialsOf: (id) => this.players.get(id)?.initials ?? '???',
        send: (build) => this.sendEach(build),
        onFinished: () => {
          if (this.game !== game) return;
          this.phase = 'over';
          this.startVote();
          this.broadcastState();
        },
        onFailed: (message) => {
          if (this.game !== game) return;
          this.sendEach(() => ({ t: 'error', code: 'music_unavailable', message }));
          this.endGame();
        },
      },
    );
    this.game = game;
    this.broadcastState();
    void game.start();
    return true;
  }

  /** TV-sound games can't run without the TV. */
  private waitingForTv(): boolean {
    return this.rules.sound === 'tv' && this.tv === null;
  }

  private endGame(): void {
    this.hostPaused = false;
    this.cancelVote();
    this.game?.dispose();
    this.game = null;
    this.phase = 'lobby';
    for (const p of [...this.players.values()]) if (!p.session && !p.goneTimer) this.players.delete(p.id);
    this.broadcastState();
  }

  // ----- REPLAY? vote (PLAN.md §5) -----

  private startVote(): void {
    this.cancelVote();
    this.vote = { endsAt: Date.now() + VOTE_MS, yes: new Set(), timer: setTimeout(() => this.resolveVote(), VOTE_MS) };
  }

  private cancelVote(): void {
    if (this.vote) clearTimeout(this.vote.timer);
    this.vote = null;
  }

  private everyoneVotedYes(): boolean {
    const connected = this.connectedPlayers();
    return this.vote !== null && connected.length > 0 && connected.every((p) => this.vote!.yes.has(p.id));
  }

  /** Majority of connected players said yes: same room, same rules, new game. Otherwise back to the lobby. */
  private resolveVote(): void {
    if (!this.vote) return;
    const connected = this.connectedPlayers();
    const yes = connected.filter((p) => this.vote!.yes.has(p.id)).length;
    this.cancelVote();
    if (!(replayWins(yes, connected.length) && this.startGame(null))) this.endGame();
  }

  // ----- Output -----

  private sendEach(build: (playerId: string | null) => ServerMessage | null): void {
    if (this.tv) {
      const msg = build(null);
      if (msg) this.tv.send(msg);
    }
    for (const p of this.players.values()) {
      if (!p.session) continue;
      const msg = build(p.id);
      if (msg) p.session.send(msg);
    }
  }

  private view(): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      tvConnected: this.tv !== null,
      tvReady: this.tvReady,
      rules: this.rules,
      vote: this.vote ? { endsAt: this.vote.endsAt, yes: [...this.vote.yes], total: this.connectedPlayers().length } : null,
      paused: this.game?.isPaused ? (this.waitingForTv() ? 'tv' : 'host') : null,
      players: [...this.players.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          id: p.id,
          slot: p.slot,
          initials: p.initials,
          ready: p.ready,
          connected: p.session !== null,
          score: this.game?.scoreOf(p.id) ?? 0,
        })),
    };
  }

  private broadcastState(): void {
    const room = this.view();
    if (this.tv && this.tvToken) this.tv.send({ t: 'room:state', room, role: 'tv', you: null, token: this.tvToken });
    for (const p of this.players.values()) p.session?.send({ t: 'room:state', room, role: 'player', you: p.id, token: p.token });
  }

  private close(reason: string, except: Session | null): void {
    for (const p of this.players.values()) {
      if (p.session && p.session !== except) {
        p.session.send({ t: 'room:closed', reason });
        detach(p.session);
      }
    }
    if (this.tv && this.tv !== except) {
      this.tv.send({ t: 'room:closed', reason });
      detach(this.tv);
    }
    if (except) detach(except);
    this.destroy();
  }

  private destroy(): void {
    this.cancelVote();
    this.game?.dispose();
    this.game = null;
    if (this.tvGoneTimer) clearTimeout(this.tvGoneTimer);
    if (this.hostTimer) clearTimeout(this.hostTimer);
    for (const p of this.players.values()) if (p.goneTimer) clearTimeout(p.goneTimer);
    rooms.delete(this.code);
  }
}

/** Routes room-related messages for a session. Returns true if the message was a room message. */
export function handleRoomMessage(session: Session, msg: ClientMessage): boolean {
  switch (msg.t) {
    case 'room:create': {
      session.room?.remove(session);
      if (msg.role === 'tv') new Room('tv').attachTv(session);
      else new Room('all').addPlayer(session, msg.initials);
      return true;
    }
    case 'room:join': {
      const room = rooms.get(msg.code);
      if (!room) {
        sendError(session, 'room_not_found', `No room with code ${msg.code}. Check the code on the TV.`);
        return true;
      }
      if (session.room === room) return true;
      session.room?.remove(session);
      room.addPlayer(session, msg.initials);
      return true;
    }
    case 'room:resume': {
      const room = rooms.get(msg.code);
      if (session.room && session.room !== room) session.room.remove(session);
      if (!room || !room.resume(session, msg.token)) {
        sendError(session, 'resume_failed', 'Your seat is gone: the room closed, or you were away for over a minute. Check the code on the TV and join again.');
      }
      return true;
    }
    case 'room:leave':
      session.room?.remove(session);
      return true;
    case 'room:away':
      session.room?.away(session);
      return true;
    case 'room:initials':
    case 'room:ready':
    case 'room:rules':
    case 'room:kick':
    case 'room:start':
    case 'room:end':
    case 'room:pause':
    case 'room:skip':
    case 'tv:soundOn':
    case 'vote':
      if (session.room) session.room.handle(session, msg);
      else sendError(session, 'not_in_game', 'You are not in a room.');
      return true;
    case 'guess':
      if (!session.room) return false;
      session.room.handle(session, msg);
      return true;
    default:
      return false;
  }
}

/** For tests: how many rooms are open. */
export const openRoomCount = (): number => rooms.size;
