import { createInterface } from 'node:readline/promises';

export type PromptHiddenOptions = {
  maxLength?: number;
};

export const DEFAULT_HIDDEN_INPUT_MAX_LENGTH = 16_384;

type HiddenInputStream = NodeJS.ReadStream & {
  isRaw?: boolean;
};

type HiddenOutputStream = Pick<NodeJS.WriteStream, 'isTTY' | 'write'>;

export function readCliOption(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }

  return null;
}

export function hasCliFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

export async function promptText(label: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('An interactive terminal is required.');
  }

  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await input.question(`${label}: `);
  } finally {
    input.close();
  }
}

export async function promptHidden(label: string, options: PromptHiddenOptions = {}) {
  return promptHiddenFromStreams(label, options, process.stdin, process.stdout);
}

export function promptHiddenFromStreams(
  label: string,
  options: PromptHiddenOptions,
  stdin: HiddenInputStream,
  stdout: HiddenOutputStream,
) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('An interactive TTY is required for hidden password entry.');
  }

  const maxLength = options.maxLength ?? DEFAULT_HIDDEN_INPUT_MAX_LENGTH;
  if (!Number.isSafeInteger(maxLength) || maxLength <= 0) {
    throw new Error('Hidden input maxLength must be a positive safe integer.');
  }

  return new Promise<string>((resolve, reject) => {
    let value = '';
    let settled = false;
    let cleanedUp = false;
    const previousRawMode = Boolean(stdin.isRaw);

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      stdin.off('data', onData);
      stdin.off('error', onError);
      stdin.off('end', onEnd);
      try {
        stdin.setRawMode(previousRawMode);
      } catch {
        // Continue cleanup so a terminal error cannot leave stdin flowing.
      } finally {
        stdin.pause();
        stdout.write('\n');
      }
    };

    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      value = '';
      cleanup();
      reject(new Error(message));
    };

    const complete = () => {
      if (settled) {
        return;
      }
      settled = true;
      const result = value;
      value = '';
      cleanup();
      resolve(result);
    };

    const onData = (chunk: Buffer | string) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          fail('Operation cancelled.');
          return;
        }

        if (character === '\r' || character === '\n') {
          complete();
          return;
        }

        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }

        if (character >= ' ') {
          if (value.length >= maxLength) {
            fail('Input exceeds the permitted length.');
            return;
          }
          value += character;
        }
      }
    };

    const onError = () => fail('Hidden input failed.');
    const onEnd = () => fail('Hidden input ended before confirmation.');

    stdout.write(`${label}: `);
    stdin.on('data', onData);
    stdin.on('error', onError);
    stdin.on('end', onEnd);

    try {
      stdin.setRawMode(true);
      stdin.resume();
    } catch {
      fail('Unable to enable hidden terminal input.');
    }
  });
}
