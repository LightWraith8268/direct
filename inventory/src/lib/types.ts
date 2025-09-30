export interface SnapshotMeta {
  snapshotDate: string; // ISO date derived from filename
  uploadedAt: string; // ISO timestamp of upload
  sourceFile: string;
}

export interface SnapshotItem {
  name: string;
  unit: string;
  quantity: number;
}

export interface SnapshotPayload {
  meta: SnapshotMeta;
  items: SnapshotItem[];
}

export interface SnapshotIndexEntry extends SnapshotMeta {
  path: string;
  latestForDate: boolean;
  totalItems: number;
  totalQuantity: number;
}

export interface ChangeEntry {
  name: string;
  unit: string;
  previousQuantity: number;
  quantity: number;
  delta: number;
}

export interface SnapshotReport {
  meta: SnapshotMeta;
  totals: {
    items: number;
    quantity: number;
    deltaItems: number;
    deltaQuantity: number;
  };
  counts: {
    new: number;
    removed: number;
    increased: number;
    decreased: number;
    unchanged: number;
  };
  newItems: ChangeEntry[];
  removedItems: ChangeEntry[];
  increases: ChangeEntry[];
  decreases: ChangeEntry[];
}
