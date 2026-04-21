import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Lyric line parsing — mirrors the inline logic in App.tsx's onNext handler.
// Extracted here for isolated unit testing.
// ---------------------------------------------------------------------------
function parseLyricsToLines(raw: string) {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((l, i) => ({ id: `l-${i}`, text: l, startTime: null, endTime: null }));
}

describe('parseLyricsToLines()', () => {
  it('splits a multi-line string into lyric lines', () => {
    const result = parseLyricsToLines('Hello world\nThis is a song');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Hello world');
    expect(result[1].text).toBe('This is a song');
  });

  it('assigns sequential ids starting at l-0', () => {
    const result = parseLyricsToLines('line one\nline two\nline three');
    expect(result.map(l => l.id)).toEqual(['l-0', 'l-1', 'l-2']);
  });

  it('trims leading and trailing whitespace from each line', () => {
    const result = parseLyricsToLines('  hello  \n   world   ');
    expect(result[0].text).toBe('hello');
    expect(result[1].text).toBe('world');
  });

  it('filters out blank lines', () => {
    const result = parseLyricsToLines('hello\n\n\nworld\n  \n');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('hello');
    expect(result[1].text).toBe('world');
  });

  it('returns an empty array for an empty string', () => {
    expect(parseLyricsToLines('')).toHaveLength(0);
  });

  it('returns an empty array for whitespace-only input', () => {
    expect(parseLyricsToLines('   \n   \n   ')).toHaveLength(0);
  });

  it('initialises startTime and endTime as null', () => {
    const result = parseLyricsToLines('verse one');
    expect(result[0].startTime).toBeNull();
    expect(result[0].endTime).toBeNull();
  });

  it('handles Windows-style CRLF line endings', () => {
    const result = parseLyricsToLines('line one\r\nline two');
    // trim() removes \r so both lines should parse cleanly
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('line one');
    expect(result[1].text).toBe('line two');
  });

  it('preserves chord notation inline', () => {
    const result = parseLyricsToLines('[Am]Tears in [F]heaven');
    expect(result[0].text).toBe('[Am]Tears in [F]heaven');
  });

  it('handles a single line without a trailing newline', () => {
    const result = parseLyricsToLines('just one line');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l-0');
  });
});

// ---------------------------------------------------------------------------
// AI storyboard JSON parse + cleanup — mirrors the logic in handleDynamicCompose
// ---------------------------------------------------------------------------
function parseStoryboardResult(raw: string | null | undefined, fallbackLength: number): number[] {
  if (!raw) return Array.from({ length: fallbackLength }, (_, i) => i);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return Array.from({ length: fallbackLength }, (_, i) => i);
  }
}

describe('parseStoryboardResult()', () => {
  it('parses a clean JSON array from AI output', () => {
    expect(parseStoryboardResult('[2, 0, 1]', 3)).toEqual([2, 0, 1]);
  });

  it('strips markdown code fences before parsing', () => {
    expect(parseStoryboardResult('```json\n[1, 2, 0]\n```', 3)).toEqual([1, 2, 0]);
  });

  it('falls back to sequential order on invalid JSON', () => {
    expect(parseStoryboardResult('not valid json', 4)).toEqual([0, 1, 2, 3]);
  });

  it('falls back when input is null', () => {
    expect(parseStoryboardResult(null, 3)).toEqual([0, 1, 2]);
  });

  it('falls back when input is undefined', () => {
    expect(parseStoryboardResult(undefined, 2)).toEqual([0, 1]);
  });

  it('falls back when input is an empty string', () => {
    expect(parseStoryboardResult('', 2)).toEqual([0, 1]);
  });

  it('handles AI returning repeated indexes (valid storyboard pattern)', () => {
    expect(parseStoryboardResult('[0, 1, 0, 2, 1]', 3)).toEqual([0, 1, 0, 2, 1]);
  });
});

// ---------------------------------------------------------------------------
// AutoSync result → LyricLine mapping — mirrors handleAutoSync's setLyrics logic
// ---------------------------------------------------------------------------
interface LyricLine {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
}

function applyAutoSync(
  lines: LyricLine[],
  aiResult: { startTime: number; endTime: number }[]
): LyricLine[] {
  const newLyrics = [...lines];
  aiResult.forEach((aiLine, idx) => {
    if (idx < newLyrics.length) {
      newLyrics[idx] = { ...newLyrics[idx], startTime: aiLine.startTime, endTime: aiLine.endTime };
    }
  });
  return newLyrics;
}

describe('applyAutoSync()', () => {
  const baseLines: LyricLine[] = [
    { id: 'l-0', text: 'verse one', startTime: null, endTime: null },
    { id: 'l-1', text: 'verse two', startTime: null, endTime: null },
    { id: 'l-2', text: 'chorus',   startTime: null, endTime: null },
  ];

  it('applies timing to all matching lines', () => {
    const ai = [
      { startTime: 1.5, endTime: 3.0 },
      { startTime: 3.5, endTime: 5.0 },
      { startTime: 6.0, endTime: 8.0 },
    ];
    const result = applyAutoSync(baseLines, ai);
    expect(result[0].startTime).toBe(1.5);
    expect(result[1].endTime).toBe(5.0);
    expect(result[2].startTime).toBe(6.0);
  });

  it('does not mutate the original array', () => {
    const ai = [{ startTime: 0, endTime: 1 }];
    applyAutoSync(baseLines, ai);
    expect(baseLines[0].startTime).toBeNull();
  });

  it('preserves text and id on each line', () => {
    const ai = [{ startTime: 1, endTime: 2 }];
    const result = applyAutoSync(baseLines, ai);
    expect(result[0].text).toBe('verse one');
    expect(result[0].id).toBe('l-0');
  });

  it('ignores AI entries beyond the number of lyric lines', () => {
    const ai = [
      { startTime: 1, endTime: 2 },
      { startTime: 3, endTime: 4 },
      { startTime: 5, endTime: 6 },
      { startTime: 7, endTime: 8 }, // extra — no matching line
    ];
    const result = applyAutoSync(baseLines, ai);
    expect(result).toHaveLength(3); // no extra elements added
  });

  it('handles empty AI result gracefully', () => {
    const result = applyAutoSync(baseLines, []);
    expect(result).toHaveLength(3);
    result.forEach(l => {
      expect(l.startTime).toBeNull();
      expect(l.endTime).toBeNull();
    });
  });

  it('handles partial AI result (fewer lines than lyrics)', () => {
    const ai = [{ startTime: 0.5, endTime: 1.5 }];
    const result = applyAutoSync(baseLines, ai);
    expect(result[0].startTime).toBe(0.5);
    expect(result[1].startTime).toBeNull(); // untouched
    expect(result[2].startTime).toBeNull(); // untouched
  });
});
