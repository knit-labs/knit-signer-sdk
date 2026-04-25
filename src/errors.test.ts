import { describe, expect, it } from 'vitest';
import {
  CeremonyAbortedError,
  KnitSignerError,
  SafeSdkError,
  UnsupportedEnvironmentError,
} from './errors.js';

describe('error hierarchy', () => {
  it('every concrete error is an instance of KnitSignerError', () => {
    const cases: Error[] = [
      new UnsupportedEnvironmentError('x'),
      new CeremonyAbortedError('x'),
      new SafeSdkError('x'),
    ];
    for (const error of cases) {
      expect(error).toBeInstanceOf(KnitSignerError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('each subclass sets a distinct name for branchable UX', () => {
    expect(new UnsupportedEnvironmentError('x').name).toBe('UnsupportedEnvironmentError');
    expect(new CeremonyAbortedError('x').name).toBe('CeremonyAbortedError');
    expect(new SafeSdkError('x').name).toBe('SafeSdkError');
    expect(new KnitSignerError('x').name).toBe('KnitSignerError');
  });

  it('preserves the underlying cause when supplied', () => {
    const underlying = new Error('boom');
    const error = new SafeSdkError('wrapped', { cause: underlying });
    expect(error.cause).toBe(underlying);
  });
});
