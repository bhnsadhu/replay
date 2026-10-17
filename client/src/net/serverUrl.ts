import { DEFAULT_SERVER_PORT, WS_PATH } from '@replay/shared';

/**
 * Base HTTP(S) address of the game server.
 * Production sets VITE_SERVER_URL (e.g. https://replay-api.bhanusadhu.com).
 * In development it defaults to the page's own host on the server port,
 * so a phone opening http://<laptop-ip>:5173 reaches http://<laptop-ip>:8787.
 */
export function serverBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_SERVER_PORT}`;
}

export function serverWsUrl(): string {
  return serverBaseUrl().replace(/^http/, 'ws') + WS_PATH;
}
