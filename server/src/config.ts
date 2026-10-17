import { DEFAULT_SERVER_PORT } from '@replay/shared';

const isProduction = process.env.NODE_ENV === 'production';

/** Website origins allowed to open a WebSocket. Comma-separated in ALLOWED_ORIGINS. */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? DEFAULT_SERVER_PORT),
  isProduction,
  allowedOrigins,
};

/**
 * In development any origin is accepted, so phones on the same Wi-Fi can connect.
 * In production only the listed website origins may connect.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!config.isProduction) return true;
  return origin !== undefined && config.allowedOrigins.includes(origin);
}
