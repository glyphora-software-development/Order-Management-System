import type { CommerceData } from "./commerceModel.ts";
import type { CommerceRepository } from "./commerceRepository.ts";
import { buildDemoSeed, DEMO_VERSION } from "./demoSeed.ts";

const resetBlocked = "仅可重置本应用初始化的演示工作区。现有资料和历史备份受保护。";

function empty(data: CommerceData): boolean {
  return !data.demo && !data.legacySource && !data.orders.length &&
    !data.products.length && !data.payments.length && !data.movements.length;
}

export function canResetDemo(data: CommerceData): boolean {
  return data.demo?.version === DEMO_VERSION && !data.legacySource;
}

function replaceDemo(current: CommerceData, seed: CommerceData, generation: number): void {
  if (!seed.demo) throw new Error("演示数据格式无效");
  Object.assign(current, seed, {
    demo: { ...seed.demo, generation },
  });
}

export function createDemoLifecycle(repository: CommerceRepository, hasLegacySources: () => boolean) {
  return {
    async open() {
      const snapshot = await repository.read();
      if (!empty(snapshot) || hasLegacySources()) return snapshot;
      const seed = await buildDemoSeed();
      return repository.transact((current) => {
        if (empty(current) && !hasLegacySources()) replaceDemo(current, seed, 1);
        return current;
      });
    },

    async reset() {
      const snapshot = await repository.read();
      if (!canResetDemo(snapshot) || hasLegacySources()) throw new Error(resetBlocked);
      const seed = await buildDemoSeed();
      await repository.transact((current) => {
        if (!canResetDemo(current) || hasLegacySources()) throw new Error(resetBlocked);
        replaceDemo(current, seed, (current.demo?.generation ?? 0) + 1);
      });
    },
  };
}
