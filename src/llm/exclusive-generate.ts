/**
 * One-at-a-time local generate. Classify/pick/chat/warm-up share this so two
 * createChatCompletion calls cannot run on the same engine at once.
 */

export function createExclusiveGenerate() {
  let busy: Promise<unknown> = Promise.resolve();
  let running = 0;

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = busy;
    let release!: () => void;
    const mine = new Promise<void>((r) => { release = r; });
    busy = mine;
    await Promise.resolve(prev).then(() => undefined, () => undefined);
    running += 1;
    try {
      return await fn();
    } finally {
      running -= 1;
      release();
    }
  };

  return {
    run,
    get concurrent() { return running; },
  };
}

export type ExclusiveGenerate = ReturnType<typeof createExclusiveGenerate>;
