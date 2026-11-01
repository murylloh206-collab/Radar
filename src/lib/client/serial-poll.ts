export function serialPoll(task: (signal: AbortSignal) => Promise<boolean>, intervalMs = 2500) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    if (controller.signal.aborted) return;
    try {
      if (await task(controller.signal)) controller.abort();
    } finally {
      if (!controller.signal.aborted) timer = setTimeout(run, intervalMs);
    }
  }
  // Callers handle recoverable errors; a rejected task stops instead of leaking a rejection.
  function run() { void tick().catch(() => controller.abort()); }
  timer = setTimeout(run, 0);
  return () => { controller.abort(); if (timer) clearTimeout(timer); };
}
