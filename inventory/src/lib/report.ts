import type { SnapshotItem, SnapshotMeta, SnapshotReport, ChangeEntry } from "./types";

interface BuildReportOptions {
  meta: SnapshotMeta;
  items: SnapshotItem[];
  previousItems?: SnapshotItem[];
  previousTotals?: {
    items: number;
    quantity: number;
  };
}

export function buildReport(options: BuildReportOptions): SnapshotReport {
  const { meta } = options;
  const items = [...options.items].sort((a, b) => a.name.localeCompare(b.name));
  const previousItems = options.previousItems ? [...options.previousItems] : [];
  const previousTotals = options.previousTotals ?? calculateTotals(previousItems);

  const previousIndex = new Map(previousItems.map((item) => [item.name, item]));
  const currentIndex = new Map(items.map((item) => [item.name, item]));

  const newItems: ChangeEntry[] = [];
  const removedItems: ChangeEntry[] = [];
  const increases: ChangeEntry[] = [];
  const decreases: ChangeEntry[] = [];
  let unchanged = 0;

  for (const item of items) {
    const prior = previousIndex.get(item.name);
    if (!prior) {
      newItems.push(createChangeEntry(item, 0));
      continue;
    }

    const delta = roundQuantity(item.quantity - prior.quantity);
    if (delta > 0) {
      increases.push(createChangeEntry(item, prior.quantity, delta));
    } else if (delta < 0) {
      decreases.push(createChangeEntry(item, prior.quantity, delta));
    } else {
      unchanged += 1;
    }
  }

  for (const item of previousItems) {
    if (!currentIndex.has(item.name)) {
      removedItems.push({
        name: item.name,
        unit: item.unit,
        previousQuantity: roundQuantity(item.quantity),
        quantity: 0,
        delta: roundQuantity(-item.quantity),
      });
    }
  }

  sortChanges(newItems, removedItems, increases, decreases);

  const totals = calculateTotals(items);
  const deltaItems = totals.items - previousTotals.items;
  const deltaQuantity = roundQuantity(totals.quantity - previousTotals.quantity);

  return {
    meta,
    totals: {
      items: totals.items,
      quantity: totals.quantity,
      deltaItems,
      deltaQuantity,
    },
    counts: {
      new: newItems.length,
      removed: removedItems.length,
      increased: increases.length,
      decreased: decreases.length,
      unchanged,
    },
    newItems,
    removedItems,
    increases,
    decreases,
  };
}

export function calculateTotals(items: SnapshotItem[]) {
  const totalQuantityRaw = items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    items: items.length,
    quantity: roundQuantity(totalQuantityRaw),
  };
}

function createChangeEntry(item: SnapshotItem, previousQuantity: number, deltaOverride?: number): ChangeEntry {
  const delta = deltaOverride ?? roundQuantity(item.quantity - previousQuantity);
  return {
    name: item.name,
    unit: item.unit,
    previousQuantity: roundQuantity(previousQuantity),
    quantity: roundQuantity(item.quantity),
    delta,
  };
}

function sortChanges(
  newItems: ChangeEntry[],
  removedItems: ChangeEntry[],
  increases: ChangeEntry[],
  decreases: ChangeEntry[]
) {
  newItems.sort((a, b) => b.quantity - a.quantity);
  removedItems.sort((a, b) => b.previousQuantity - a.previousQuantity);
  increases.sort((a, b) => b.delta - a.delta);
  decreases.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta)).reverse();
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(3));
}
