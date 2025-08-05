import {jest} from '@jest/globals';
import {logToGitHub} from '../src/logger.js';

test('logToGitHub uploads log file', async () => {
  const mockGet = jest.fn((defaults, cb) => cb({githubToken: 'tok', githubOwner: 'me', githubRepo: 'repo'}));
  const mockStorage = {get: mockGet};
  const mockFetch = jest.fn(() => Promise.resolve({status: 201}));
  await logToGitHub('hello', {storage: mockStorage, fetchImpl: mockFetch});
  expect(mockGet).toHaveBeenCalled();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, opts] = mockFetch.mock.calls[0];
  expect(url).toMatch(/https:\/\/api\.github\.com\/repos\/me\/repo\/contents\/logs\/log-\d+\.txt/);
  expect(opts.method).toBe('PUT');
  expect(opts.headers.Authorization).toBe('Bearer tok');
});
