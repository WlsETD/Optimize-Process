/* 背景工作：webhook 先回「已收單」再解析，避免 LINE 等太久。
   Cloud Run 需設定「CPU 一律分配」（instance-based billing），回應後的工作才會繼續跑。 */
export type Jobs = { run(name: string, fn: () => Promise<unknown>): void; idle(): Promise<void> };

export function makeJobs(onError: (name: string, e: unknown) => void = (n, e) => console.error('[job]', n, e)): Jobs {
  const pending = new Set<Promise<unknown>>();
  return {
    run(name, fn) {
      const p: Promise<unknown> = fn().catch(e => onError(name, e)).finally(() => pending.delete(p));
      pending.add(p);
    },
    async idle() { while (pending.size) await Promise.all([...pending]); },
  };
}
