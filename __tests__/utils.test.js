import {jest} from '@jest/globals';
import {strToBuf, bufToB64, b64ToBuf, fetchWithRetry} from '../src/utils.js';

test('string to base64 roundtrip', () => {
  const buf = strToBuf('hello');
  const b64 = bufToB64(buf);
  const back = b64ToBuf(b64);
  const str = new TextDecoder().decode(back);
  expect(str).toBe('hello');
});

test('fetchWithRetry retries and succeeds', async () => {
  let attempts = 0;
  const mockFetch = jest.fn(() => {
    attempts++;
    if (attempts < 3) {
      return Promise.reject(new Error('fail'));
    }
    return Promise.resolve({ok: true});
  });
  await fetchWithRetry('https://example.com', {}, 3, [0, 0, 0], mockFetch);
  expect(mockFetch).toHaveBeenCalledTimes(3);
});

  test('fetchWithRetry fails after max attempts', async () => {
    const failingFetch = jest.fn(() => Promise.reject(new Error('fail')));
    await expect(fetchWithRetry('https://example.com', {}, 3, [0, 0, 0], failingFetch)).rejects.toThrow('fail');
    expect(failingFetch).toHaveBeenCalledTimes(3);
  });

  test('fetchWithRetry logs on HTTP error', async () => {
    const logger = jest.fn(() => Promise.resolve());
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 402,
        text: () => Promise.resolve('Payment Required')
      })
    );
    await expect(
      fetchWithRetry('https://example.com', {}, 1, [0], mockFetch, logger)
    ).rejects.toThrow('HTTP 402');
    expect(logger).toHaveBeenCalledWith('HTTP 402: Payment Required');
  });
