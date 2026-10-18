import type { ClientMessage, ServerMessage } from '@replay/shared';
import { serverWsUrl } from './serverUrl';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';
type MessageListener = (msg: ServerMessage) => void;
type StatusListener = (status: ConnectionStatus) => void;

const PING_EVERY_MS = 3000;
const OFFSET_SAMPLES = 5;
const MAX_RETRY_MS = 5000;

/**
 * One WebSocket to the game server for the whole app.
 * Reconnects on its own (the free server may be waking up), and keeps an estimate
 * of the server clock so every device can start the clip at the same moment.
 */
class Connection {
  private ws: WebSocket | null = null;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private offsets: number[] = [];
  private pingTimer: number | undefined;
  private retryMs = 1000;
  private started = false;

  status: ConnectionStatus = 'connecting';
  /** Date.now() when the status last changed. */
  statusSince = Date.now();
  private queued: ClientMessage | null = null;
  rttMs: number | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.open();
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /**
   * Sends now, or as soon as the connection is up (the free server can take up to a minute to
   * wake). Only the latest queued message is kept: it's for one-off taps like JOIN.
   */
  sendWhenOnline(msg: ClientMessage): void {
    if (!this.send(msg)) this.queued = msg;
  }

  /** Drops a queued message, e.g. the screen that queued it closed before the server woke. */
  clearQueued(): void {
    this.queued = null;
  }

  onMessage(fn: MessageListener): () => void {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /** Server clock minus local clock (median of recent samples). */
  get offsetMs(): number {
    if (this.offsets.length === 0) return 0;
    const sorted = [...this.offsets].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  }

  /** Converts a server timestamp to this device's Date.now() timeline. */
  toLocal(serverTime: number): number {
    return serverTime - this.offsetMs;
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.statusSince = Date.now();
    if (status === 'online' && this.queued) {
      const msg = this.queued;
      this.queued = null;
      this.send(msg);
    }
    for (const fn of this.statusListeners) fn(status);
  }

  private open(): void {
    this.setStatus(this.status === 'online' ? 'connecting' : this.status);
    const ws = new WebSocket(serverWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.retryMs = 1000;
      this.setStatus('online');
      this.ping();
      this.pingTimer = window.setInterval(() => this.ping(), PING_EVERY_MS);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as ServerMessage;
      if (msg.t === 'pong') this.recordPong(msg.at, msg.serverTime);
      for (const fn of this.messageListeners) fn(msg);
    };

    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('offline');
      window.setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    };
  }

  private ping(): void {
    this.send({ t: 'ping', at: Date.now() });
  }

  private recordPong(sentAt: number, serverTime: number): void {
    const now = Date.now();
    this.rttMs = now - sentAt;
    this.offsets.push(serverTime - (sentAt + now) / 2);
    if (this.offsets.length > OFFSET_SAMPLES) this.offsets.shift();
  }
}

export const connection = new Connection();
