import { transformSync } from '@babel/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Jest cannot run a worklet, so this does not try to. It reads what the worklets Babel plugin
 * decided to copy to the UI thread — the `__closure` it builds for every worklet in the app — and
 * pins it, because copying is the part that breaks. A `Date`, an array or an object in a closure
 * throws `[Worklets] Cannot copy value of type ...` on the first frame and red-screens the screen,
 * and nothing else in `pnpm validate` can see it: it is a runtime cost of what the code names.
 *
 * A static check cannot tell a number from a `Date` by its name, so it does the one thing it can:
 * it fails the moment a worklet starts copying something new. If it fails, check that what you
 * added is a number, a boolean, a shared value or a function, and then add it to the list.
 */
const COPIED_TO_THE_UI_THREAD: Readonly<Record<string, readonly string[]>> = {
  'components/week-strip.tsx': [
    'TRAVEL_MS',
    'columnWidth',
    'dragged',
    'highestReading',
    'reduceMotion',
    'resting',
    'runOnJS',
    'selectAt',
    'withTiming',
  ],
};

const SOURCE_ROOT = join(__dirname, '..');
const CLOSURE = /\.__closure = \{([^}]*)\}/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function copiedNames(file: string): string[] {
  const output = transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
    plugins: ['react-native-worklets/plugin'],
  });
  const names = [...(output?.code ?? '').matchAll(CLOSURE)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim())
  );
  return [...new Set(names.filter((name) => name.length > 0))].sort();
}

describe('worklet closures', () => {
  it('should copy nothing to the UI thread but the values it is allowed to', () => {
    const copied: Record<string, readonly string[]> = {};

    for (const file of sourceFiles(SOURCE_ROOT)) {
      const names = copiedNames(file);
      if (names.length > 0) {
        copied[relative(SOURCE_ROOT, file)] = names;
      }
    }

    expect(copied).toEqual(COPIED_TO_THE_UI_THREAD);
  });
});
