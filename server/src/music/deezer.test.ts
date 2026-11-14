import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPreview } from './deezer';

afterEach(() => vi.unstubAllGlobals());

function mp3(tagged = false): Uint8Array {
  const data = new Uint8Array(5000);
  if (tagged) data.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  data.set([0xff, 0xfb, 0x90, 0], tagged ? 10 : 0);
  return data;
}

function respond(body: ConstructorParameters<typeof Response>[0], headers: Record<string, string> = { 'content-type': 'audio/mpeg' }, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers, status })));
}

describe('preview downloads', () => {
  it.each([true, false])('accepts an MP3 frame with an optional ID3 tag (%s)', async (tagged) => {
    const bytes = mp3(tagged);
    respond(bytes);
    expect(await downloadPreview('https://cdn/preview.mp3')).toEqual(Buffer.from(bytes));
  });

  it('accepts a generic binary response only when its bytes look like MP3', async () => {
    respond(mp3(), { 'content-type': 'application/octet-stream' });
    expect((await downloadPreview('https://cdn/preview.mp3')).length).toBe(5000);
  });

  it('rejects a successful HTML error page instead of starting a silent round', async () => {
    respond('<html>Temporarily unavailable</html>', { 'content-type': 'text/html' });
    await expect(downloadPreview('https://cdn/preview.mp3')).rejects.toThrow('rejected');
  });

  it.each([{ bytes: new Uint8Array() }, { bytes: new Uint8Array(5000) }, { bytes: mp3().slice(0, 100) }])('rejects empty, wrong-format and tiny bodies (%#)', async ({ bytes }) => {
    respond(bytes);
    await expect(downloadPreview('https://cdn/preview.mp3')).rejects.toThrow('MP3 audio');
  });

  it('rejects an ID3 tag with no following MPEG frame', async () => {
    const bytes = mp3(true);
    bytes.fill(0, 10);
    respond(bytes);
    await expect(downloadPreview('https://cdn/preview.mp3')).rejects.toThrow('MP3 audio');
  });

  it('rejects oversized responses before reading their body', async () => {
    const cancel = vi.fn();
    respond(new ReadableStream({ cancel }), { 'content-type': 'audio/mpeg', 'content-length': '3000000' });
    await expect(downloadPreview('https://cdn/preview.mp3')).rejects.toThrow('rejected');
    expect(cancel).toHaveBeenCalled();
  });

  it('limits streamed responses even without a content length and cancels the stream', async () => {
    const cancel = vi.fn();
    respond(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
      cancel,
    }));
    await expect(downloadPreview('https://cdn/preview.mp3')).rejects.toThrow('size limit');
    expect(cancel).toHaveBeenCalled();
  });

  it('propagates a dropped connection so the game can try another track', async () => {
    respond(new ReadableStream({ start(controller) { controller.error(new Error('connection reset')); } }));
    await expect(downloadPreview('https://cdn/preview.mp3')).rejects.toThrow('connection reset');
  });
});
