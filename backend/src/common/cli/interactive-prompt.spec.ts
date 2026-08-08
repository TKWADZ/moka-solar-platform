import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import {
  DEFAULT_HIDDEN_INPUT_MAX_LENGTH,
  promptHiddenFromStreams,
  PromptHiddenOptions,
} from './interactive-prompt';

class FakeHiddenInput extends EventEmitter {
  isTTY = true;
  isRaw = false;
  paused = false;
  resumed = false;
  readonly rawModeCalls: boolean[] = [];

  setRawMode(enabled: boolean) {
    this.rawModeCalls.push(enabled);
    this.isRaw = enabled;
    return this;
  }

  pause() {
    this.paused = true;
    return this;
  }

  resume() {
    this.resumed = true;
    return this;
  }
}

class FakeHiddenOutput {
  isTTY = true;
  value = '';

  write(chunk: unknown) {
    this.value += String(chunk);
    return true;
  }
}

function startHiddenPrompt(options: PromptHiddenOptions = {}) {
  const input = new FakeHiddenInput();
  const output = new FakeHiddenOutput();
  const result = promptHiddenFromStreams(
    'Hidden value',
    options,
    input as unknown as NodeJS.ReadStream,
    output as unknown as NodeJS.WriteStream,
  );

  return { input, output, result };
}

describe('promptHidden', () => {
  for (const length of [128, 256, 512, 903, 2048]) {
    it(`accepts an exact ${length}-character pasted input without truncation`, async () => {
      const { input, output, result } = startHiddenPrompt();
      const secret = 'x'.repeat(length);

      input.emit('data', Buffer.from(`${secret}\r`));

      assert.equal(await result, secret);
      assert.equal(output.value, 'Hidden value: \n');
      assert.deepEqual(input.rawModeCalls, [true, false]);
      assert.equal(input.paused, true);
    });
  }

  it('supports the default 16384-character maximum', async () => {
    const { input, result } = startHiddenPrompt();
    const secret = 'z'.repeat(DEFAULT_HIDDEN_INPUT_MAX_LENGTH);

    input.emit('data', Buffer.from(`${secret}\n`));

    assert.equal(await result, secret);
  });

  it('processes every character across pasted multi-character chunks', async () => {
    const { input, result } = startHiddenPrompt();

    input.emit('data', Buffer.from('chunk-one-'));
    input.emit('data', 'chunk-two');
    input.emit('data', '\r');

    assert.equal(await result, 'chunk-one-chunk-two');
  });

  it('recognizes Backspace inside a pasted input chunk', async () => {
    const { input, result } = startHiddenPrompt();

    input.emit('data', Buffer.from('abc\bD\r'));

    assert.equal(await result, 'abD');
  });

  it('cancels on Ctrl+C without echoing input', async () => {
    const { input, output, result } = startHiddenPrompt();

    input.emit('data', Buffer.from('fake-secret\u0003ignored'));

    await assert.rejects(result, /Operation cancelled\./);
    assert.equal(output.value, 'Hidden value: \n');
    assert.deepEqual(input.rawModeCalls, [true, false]);
    assert.equal(input.paused, true);
  });

  it('rejects input exceeding maxLength without echoing or truncating it', async () => {
    const { input, output, result } = startHiddenPrompt({ maxLength: 32 });

    input.emit('data', Buffer.from('q'.repeat(33)));

    await assert.rejects(result, /Input exceeds the permitted length\./);
    assert.equal(output.value, 'Hidden value: \n');
  });

  it('restores raw mode and pauses stdin after success', async () => {
    const { input, result } = startHiddenPrompt();

    input.emit('data', Buffer.from('safe-fake-value\r'));
    await result;

    assert.deepEqual(input.rawModeCalls, [true, false]);
    assert.equal(input.isRaw, false);
    assert.equal(input.paused, true);
  });

  it('restores raw mode and pauses stdin after failure', async () => {
    const { input, result } = startHiddenPrompt({ maxLength: 4 });

    input.emit('data', Buffer.from('12345'));
    await assert.rejects(result, /Input exceeds the permitted length\./);

    assert.deepEqual(input.rawModeCalls, [true, false]);
    assert.equal(input.isRaw, false);
    assert.equal(input.paused, true);
  });
});
