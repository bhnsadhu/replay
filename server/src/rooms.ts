import { randomBytes } from 'node:crypto';
import {
  DEFAULT_RULES,
  MAX_PLAYERS,
  ROOM_CODE_ALPHABET,
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
  playerId: string | null;
}

interface RoomPlayer {
  id: string;
  slot: number;
  session: Session | null;
  initials: string;
  ready: boolean;
}

const rooms = new Map<string, Room>();

const newId = (): string => randomBytes(8).toString('base64url');

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

export class Room {
  readonly code = newRoomCode();
  private tv: Session | null = null;
  private tvReady = false;
  private readonly players = new Map<string, RoomPlayer>();
  private hostId: string | null = null;
  private phase: RoomPhase = 'lobby';
  private rules: RoomRules;
  private game: Game | null = null;

  constructor(sound: SoundMode) {
    this.rules = { ...DEFAULT_RULES, sound };
    rooms.set(this.code, this);
  }

  // ----- Membership -----

  attachTv(session: Session): void {
    this.tv = session;
    session.room = this;
    session.role = 'tv';
    session.playerId = null;
    this.broadcastState();
  }

  addPlayer(session: Session, initials: string): void {
    if (this.phase === 'playing') return sendError(session, 'game_in_progress', 'That game already started. Join after it ends.');
    if (this.players.size >= MAX_PLAYERS) return sendError(session, 'room_full', `That room is full (${MAX_PLAYERS} players).`);

    const taken = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 1;
    while (taken.has(slot)) slot++;

    const player: RoomPlayer = { id: newId(), slot, session, initials: this.uniqueInitials(initials, null), ready: false };
    this.players.set(player.id, player);
    session.room = this;
    session.role = 'player';
    session.playerId = player.id;
    if (!this.hostId) this.hostId = player.id;
    this.broadcastState();
  }

  /** Called when a session leaves on purpose or disconnects. */
  remove(session: Session): void {
    if (session.role === 'tv') {
      this.close('The TV left, so the room closed.', session);
      return;
    }
    const player = session.playerId ? this.players.get(session.playerId) : undefined;
    session.room = null;
    session.role = null;
    session.playerId = null;
    if (!player) return;

    if (this.phase === 'lobby') {
      this.players.delete(player.id);
    } else {
      player.session = null; // Keep them on the scoreboard for this game.
      this.game?.playerLeft();
    }
    if (this.hostId === player.id) this.hostId = this.nextHost();
    if (!this.tv && this.connectedPlayers().length === 0) return this.destroy();
    this.broadcastState();
  }

  private nextHost(): string | null {
    const candidates = this.connectedPlayers().sort((a, b) => a.slot - b.slot);
    return candidates[0]?.id ?? null;
  }

  private connectedPlayers(): RoomPlayer[] {
    return [...this.players.values()].filter((p) => p.session !== null);
  }

  /** DEV, then DE2…DE9 if taken (PLAN.md §5). */
  private uniqueInitials(wanted: string, exceptId: string | null): string {
    const inUse = new Set([...this.players.values()].filter((p) => p.id !== exceptId).map((p) => p.initials));
    if (!inUse.has(wanted)) return wanted;
    for (let n = 2; n <= 9; n++) {
      const candidate = `${wanted.slice(0, 2)}${n}`;
      if (!inUse.has(candidate)) return candidate;
    }
    return wanted;
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

      case 'room:initials':
        if (!player || this.phase === 'playing') return;
        player.initials = this.uniqueInitials(msg.initials, player.id);
        return this.broadcastState();

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
        target.session?.send({ t: 'room:closed', reason: 'The host removed you from the room.' });
        if (target.session) this.remove(target.session);
        else {
          this.players.delete(target.id);
          this.broadcastState();
        }
        return;
      }

      case 'room:start':
        if (!isHost) return sendError(session, 'not_host', 'Only the host can start the game.');
        return this.startGame(session);

      case 'room:end':
        if (!isHost) return sendError(session, 'not_host', 'Only the host can end the game.');
        this.endGame();
        return;

      case 'guess':
        if (player && this.game) this.game.guess(player.id, msg.roundId, msg.choice, msg.elapsedMs);
        return;

      default:
        return;
    }
  }

  private startGame(session: Session): void {
    if (this.phase === 'playing') return;
    if (this.connectedPlayers().length === 0) return sendError(session, 'cannot_start', 'Nobody is in the room yet.');
    if (this.rules.sound === 'tv' && !(this.tv && this.tvReady)) {
      return sendError(session, 'cannot_start', 'Press any key on the TV first so it can play sound.');
    }

    this.game?.dispose();
    for (const p of [...this.players.values()]) {
      if (!p.session) this.players.delete(p.id); // Drop players who left during the last game.
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
  }

  private endGame(): void {
    this.game?.dispose();
    this.game = null;
    this.phase = 'lobby';
    for (const p of [...this.players.values()]) if (!p.session) this.players.delete(p.id);
    this.broadcastState();
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
    if (this.tv) this.tv.send({ t: 'room:state', room, role: 'tv', you: null });
    for (const p of this.players.values()) p.session?.send({ t: 'room:state', room, role: 'player', you: p.id });
  }

  private close(reason: string, except: Session | null): void {
    for (const p of this.players.values()) {
      if (p.session && p.session !== except) {
        p.session.send({ t: 'room:closed', reason });
        p.session.room = null;
        p.session.role = null;
        p.session.playerId = null;
      }
    }
    if (this.tv && this.tv !== except) this.tv.send({ t: 'room:closed', reason });
    if (except) {
      except.room = null;
      except.role = null;
      except.playerId = null;
    }
    this.destroy();
  }

  private destroy(): void {
    this.game?.dispose();
    this.game = null;
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
    case 'room:leave':
      session.room?.remove(session);
      return true;
    case 'room:initials':
    case 'room:ready':
    case 'room:rules':
    case 'room:kick':
    case 'room:start':
    case 'room:end':
    case 'tv:soundOn':
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
