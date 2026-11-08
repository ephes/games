import { vi } from 'vitest';

// Synthetic, streamed network boundary shared by import integration tests.
export function mockWorldFetch() {
  const source = vi.fn();
  vi.stubGlobal(
    'fetch',
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true
        });
        Promise.resolve()
          .then(() => source(url))
          .then(data => {
            const bytes = new TextEncoder().encode(JSON.stringify(data));
            resolve({
              ok: true,
              headers: new Headers(),
              body: new ReadableStream({
                start(controller) {
                  controller.enqueue(bytes);
                  controller.close();
                }
              })
            });
          }, reject);
      })
  );
  return source;
}
