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
