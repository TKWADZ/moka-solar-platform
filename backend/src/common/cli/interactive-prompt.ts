import { createInterface } from 'node:readline/promises';

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

export async function promptHidden(label: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('An interactive TTY is required for hidden password entry.');
  }

  return new Promise<string>((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;

    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
    };

    const onData = (chunk: Buffer | string) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Operation cancelled.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }

        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }

        if (character >= ' ' && value.length < 256) {
          value += character;
        }
      }
    };

    process.stdout.write(`${label}: `);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
