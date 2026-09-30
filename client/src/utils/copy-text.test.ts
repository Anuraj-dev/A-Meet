import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './copy-text';

const link = 'https://ameet.example/lobby/abc-defg-hij';

function stubExec(impl: (command: string) => boolean) {
  const exec = vi.fn(impl);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
  return exec;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'execCommand');
});

describe('copyText', () => {
  it('writes with the async clipboard when that is allowed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const exec = stubExec(() => true);

    await expect(copyText(link)).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith(link);
    expect(exec).not.toHaveBeenCalled();
  });

  it('copies from a temporary field when the clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const exec = stubExec((command) => {
      expect(command).toBe('copy');
      expect(document.querySelector('textarea')?.value).toBe(link);
      return true;
    });

    await expect(copyText(link)).resolves.toBe(true);
    expect(exec).toHaveBeenCalledOnce();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when neither copy path works', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    stubExec(() => false);

    await expect(copyText(link)).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure and removes the field when the fallback copy throws', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    stubExec(() => {
      throw new Error('blocked');
    });

    await expect(copyText(link)).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
