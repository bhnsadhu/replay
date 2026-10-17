// Messages between clients (TV, phones, desktop) and the game server.
// Every message is JSON with a `t` (type) field. See PLAN.md §7.
// M0 only defines the connection basics; game messages are added per milestone.

export const WS_PATH = '/ws';
export const DEFAULT_SERVER_PORT = 8787;

export type ClientMessage =
  | { t: 'ping'; at: number }
  | { t: 'echo'; text: string };

export type ServerMessage =
  | { t: 'welcome'; serverTime: number }
  | { t: 'pong'; at: number; serverTime: number }
  | { t: 'echo'; text: string }
  | { t: 'error'; code: ErrorCode; message: string };

export type ErrorCode = 'bad_message';

const MAX_MESSAGE_BYTES = 4096;
const MAX_ECHO_LENGTH = 200;

/** Parses and validates a raw client message. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;

  const msg = data as Record<string, unknown>;
  switch (msg.t) {
    case 'ping':
      return typeof msg.at === 'number' && Number.isFinite(msg.at) ? { t: 'ping', at: msg.at } : null;
    case 'echo':
      return typeof msg.text === 'string' && msg.text.length <= MAX_ECHO_LENGTH
        ? { t: 'echo', text: msg.text }
        : null;
    default:
      return null;
  }
}
