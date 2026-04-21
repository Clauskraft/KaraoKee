import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cn, fileToBase64 } from '../lib/utils';

// ---------------------------------------------------------------------------
// cn() — Tailwind class merging utility
// ---------------------------------------------------------------------------
describe('cn()', () => {
  it('merges two class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', undefined, null, false, 'bar')).toBe('foo bar');
  });

  it('applies tailwind-merge: last conflicting utility wins', () => {
    // tailwind-merge resolves conflicts; text-blue overrides text-red
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('applies tailwind-merge: padding conflict', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });

  it('preserves non-conflicting classes', () => {
    const result = cn('rounded-lg', 'bg-black', 'text-white');
    expect(result).toContain('rounded-lg');
    expect(result).toContain('bg-black');
    expect(result).toContain('text-white');
  });

  it('accepts conditional class objects', () => {
    const isActive = true;
    const result = cn({ 'bg-orange-500': isActive, 'bg-gray-500': !isActive });
    expect(result).toBe('bg-orange-500');
  });

  it('returns empty string when all inputs are falsy', () => {
    expect(cn(undefined, null, false)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// fileToBase64() — FileReader wrapper
// ---------------------------------------------------------------------------
describe('fileToBase64()', () => {
  beforeEach(() => {
    // Polyfill FileReader in jsdom with a working mock
    const mockResult = 'data:image/png;base64,abc123==';
    vi.stubGlobal('FileReader', class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      readAsDataURL(_file: unknown) {
        this.result = mockResult;
        setTimeout(() => this.onload?.(), 0);
      }
    });
  });

  it('strips the data URI prefix and returns raw base64', async () => {
    const file = new File([''], 'test.png', { type: 'image/png' });
    const result = await fileToBase64(file);
    expect(result).toBe('abc123==');
  });

  it('resolves the promise on success', async () => {
    const file = new File(['hello'], 'audio.mp3', { type: 'audio/mpeg' });
    await expect(fileToBase64(file)).resolves.toBeDefined();
  });

  it('rejects when FileReader errors', async () => {
    vi.stubGlobal('FileReader', class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      readAsDataURL(_file: unknown) {
        setTimeout(() => this.onerror?.(new Error('read error')), 0);
      }
    });
    const file = new File([''], 'bad.png', { type: 'image/png' });
    await expect(fileToBase64(file)).rejects.toBeDefined();
  });
});
