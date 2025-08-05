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
