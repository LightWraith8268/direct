import { promises as fs } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { createHash } from "crypto";

const RAW_DIR = path.resolve("data", "raw");
const SNAPSHOT_DIR = path.resolve("data", "snapshots");
const REPORT_DIR = path.resolve("data", "reports");
const DATA_INDEX_PATH = path.resolve("data", "index.json");
const DATA_LATEST_PATH = path.resolve("data", "latest.json");
const DATA_LATEST_REPORT_PATH = path.resolve("data", "latest-report.json");

const PUBLIC_DATA_DIR = path.resolve("inventory", "public", "data");
const PUBLIC_SNAPSHOT_DIR = path.join(PUBLIC_DATA_DIR, "snapshots");
const PUBLIC_REPORTS_DIR = path.join(PUBLIC_DATA_DIR, "reports");
const PUBLIC_LATEST_REPORT_PATH = path.join(PUBLIC_DATA_DIR, "latest-report.json");

interface CsvRow {
  Name: string;
  Unit: string;
  Quantity: string;
}

interface SnapshotItem {
  name: string;
  unit: string;
  quantity: number;
}

interface SnapshotMeta {
  snapshotDate: string;
  uploadedAt: string;
  sourceFile: string;
}

interface SnapshotPayload {
  meta: SnapshotMeta;
  items: SnapshotItem[];
}

interface SnapshotIndexEntry extends SnapshotMeta {
  path: string;
  latestForDate: boolean;
  totalItems: number;
  totalQuantity: number;
}

interface SnapshotRecord {
  payload: SnapshotPayload;
  jsonFileName: string;
  indexEntry: SnapshotIndexEntry;
}

interface ChangeEntry {
  name: string;
  unit: string;
  previousQuantity: number;
  quantity: number;
  delta: number;
}

interface SnapshotReport {
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

interface ExistingSnapshotRecord {
  key: string;
  hash: string;
  meta: SnapshotMeta;
  fileName: string;
}

type ExistingSnapshots = Map<string, ExistingSnapshotRecord[]>;

async function main() {
  await ensureDirectories();
  const existingSnapshots = await loadExistingSnapshots();
  await clearDerivedDirectories();

  const csvFiles = await listCsvFiles();

  if (csvFiles.length === 0) {
    console.warn("No CSV snapshots found in data/raw. Skipping processing.");
    await writeIndex([]);
    await clearLatestOutputs();
    return;
  }

  const records: SnapshotRecord[] = [];

  for (const fileName of csvFiles) {
    const record = await processCsv(fileName, existingSnapshots);
    records.push(record);
    await writeSnapshot(record);
  }

  const reports = computeReports(records);
  annotateLatest(records);
  await writeIndex(records.map((record) => record.indexEntry));
  await writeReports(records, reports);

  const latestRecord = findLatestRecord(records);
  await Promise.all([
    writeLatest(latestRecord),
    writeLatestReport(latestRecord, reports),
  ]);
}

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(RAW_DIR, { recursive: true }),
    fs.mkdir(SNAPSHOT_DIR, { recursive: true }),
    fs.mkdir(REPORT_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_DATA_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_SNAPSHOT_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_REPORTS_DIR, { recursive: true }),
  ]);
}

async function clearDerivedDirectories() {
  await Promise.all([
    emptyDir(SNAPSHOT_DIR),
    emptyDir(REPORT_DIR),
    emptyDir(PUBLIC_SNAPSHOT_DIR),
    emptyDir(PUBLIC_REPORTS_DIR),
  ]);
}

async function emptyDir(directory: string) {
  try {
    const entries = await fs.readdir(directory);
    await Promise.all(
      entries.map((entry) => fs.rm(path.join(directory, entry), { recursive: true, force: true }))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function loadExistingSnapshots(): Promise<ExistingSnapshots> {
  try {
    const raw = await fs.readFile(DATA_INDEX_PATH, "utf8");
    const entries = JSON.parse(raw) as SnapshotIndexEntry[];
    const map: ExistingSnapshots = new Map();

    for (const entry of entries) {
      const fileName = path.basename(entry.path);
      const snapshotPath = path.join(SNAPSHOT_DIR, fileName);

      try {
        const snapshotRaw = await fs.readFile(snapshotPath, "utf8");
        const payload = JSON.parse(snapshotRaw) as SnapshotPayload;
        const items = [...(payload.items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
        const hash = hashItems(items);
        const key = makeExistingKey(entry.sourceFile, entry.snapshotDate);
        const record: ExistingSnapshotRecord = {
          key,
          hash,
          meta: {
            snapshotDate: entry.snapshotDate,
            uploadedAt: entry.uploadedAt,
            sourceFile: entry.sourceFile,
          },
          fileName,
        };

        const bucket = map.get(key);
        if (bucket) {
          bucket.push(record);
        } else {
          map.set(key, [record]);
        }
      } catch (error) {
        // Ignore missing snapshots; they will be regenerated.
        continue;
      }
    }

    return map;
  } catch (error) {
    return new Map();
  }
}

function makeExistingKey(sourceFile: string, snapshotDate: string) {
  return `${snapshotDate}::${sourceFile}`;
}

async function listCsvFiles(): Promise<string[]> {
  const entries = await fs.readdir(RAW_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name)
    .sort();
}

async function processCsv(
  fileName: string,
  existingSnapshots: ExistingSnapshots
): Promise<SnapshotRecord> {
  const filePath = path.join(RAW_DIR, fileName);
  const csvContent = await fs.readFile(filePath, "utf8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as CsvRow[];

  const snapshotDate = deriveSnapshotDate(fileName);

  const items: SnapshotItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = row.Name?.trim();
    const unit = row.Unit?.trim() ?? "";
    const quantityRaw = row.Quantity?.trim();

    if (!name) {
      continue;
    }

    if (seen.has(name)) {
      console.warn(`Duplicate item name detected in ${fileName}: ${name}`);
      continue;
    }

    const quantity = parseQuantity(quantityRaw);
    if (Number.isNaN(quantity)) {
      console.warn(`Skipping row with invalid quantity in ${fileName}:`, row);
      continue;
    }

    items.push({ name, unit, quantity });
    seen.add(name);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  const itemsHash = hashItems(items);
  const existingKey = makeExistingKey(fileName, snapshotDate);
  const reusable = takeExistingSnapshot(existingSnapshots, existingKey, itemsHash);

  let uploadedAt: string;
  let jsonFileName: string;

  if (reusable) {
    uploadedAt = reusable.meta.uploadedAt;
    jsonFileName = reusable.fileName;
  } else {
    uploadedAt = await determineUploadTimestamp(filePath);
    jsonFileName = generateSnapshotFileName(snapshotDate, uploadedAt);
  }

  const totals = calculateTotals(items);

  const payload: SnapshotPayload = {
    meta: {
      snapshotDate,
      uploadedAt,
      sourceFile: fileName,
    },
    items,
  };

  const indexEntry: SnapshotIndexEntry = {
    ...payload.meta,
    path: path.posix.join("data", "snapshots", jsonFileName),
    latestForDate: false,
    totalItems: totals.count,
    totalQuantity: totals.totalQuantity,
  };

  console.log(
    `Processed ${fileName} -> ${jsonFileName} (${totals.count} items, ${totals.totalQuantity.toFixed(2)} units)`
  );

  return { payload, jsonFileName, indexEntry };
}

function takeExistingSnapshot(
  existingSnapshots: ExistingSnapshots,
  key: string,
  hash: string
): ExistingSnapshotRecord | null {
  const bucket = existingSnapshots.get(key);
  if (!bucket || bucket.length === 0) {
    return null;
  }

  const index = bucket.findIndex((entry) => entry.hash === hash);
  if (index === -1) {
    return null;
  }

  const [record] = bucket.splice(index, 1);
  if (bucket.length === 0) {
    existingSnapshots.delete(key);
  }

  return record;
}

async function determineUploadTimestamp(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  return stats.mtime.toISOString();
}

function deriveSnapshotDate(fileName: string): string {
  const match = fileName.match(/stock-items_(\d{2})_(\d{2})_(\d{4})\.csv$/i);
  if (!match) {
    throw new Error(`File name does not match expected pattern: ${fileName}`);
  }

  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

function parseQuantity(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function calculateTotals(items: SnapshotItem[]) {
  const totalQuantityRaw = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalQuantity = roundQuantity(totalQuantityRaw);
  return {
    count: items.length,
    totalQuantity,
  };
}

function hashItems(items: SnapshotItem[]) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(items));
  return hash.digest("hex");
}

function generateSnapshotFileName(snapshotDate: string, uploadedAt: string): string {
  const stamp = new Date(uploadedAt)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `${snapshotDate}_${stamp}.json`;
}

async function writeSnapshot(record: SnapshotRecord) {
  const json = JSON.stringify(record.payload, null, 2);

  await Promise.all([
    fs.writeFile(path.join(SNAPSHOT_DIR, record.jsonFileName), json),
    fs.writeFile(path.join(PUBLIC_SNAPSHOT_DIR, record.jsonFileName), json),
  ]);
}

function annotateLatest(records: SnapshotRecord[]) {
  const byDate = new Map<string, SnapshotRecord[]>();

  for (const record of records) {
    const list = byDate.get(record.payload.meta.snapshotDate);
    if (list) {
      list.push(record);
    } else {
      byDate.set(record.payload.meta.snapshotDate, [record]);
    }
  }

  for (const list of byDate.values()) {
    list.sort(compareRecords);
    const latest = list[list.length - 1];
    latest.indexEntry.latestForDate = true;
  }
}

async function writeIndex(entries: SnapshotIndexEntry[]) {
  const sorted = [...entries].sort((a, b) => {
    const byDate = a.snapshotDate.localeCompare(b.snapshotDate);
    if (byDate !== 0) return byDate;
    return a.uploadedAt.localeCompare(b.uploadedAt);
  });

  const json = JSON.stringify(sorted, null, 2);

  await Promise.all([
    fs.writeFile(DATA_INDEX_PATH, json),
    fs.writeFile(path.join(PUBLIC_DATA_DIR, "index.json"), json),
  ]);
}

async function writeReports(records: SnapshotRecord[], reports: Map<string, SnapshotReport>) {
  await Promise.all([
    fs.mkdir(REPORT_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_REPORTS_DIR, { recursive: true }),
  ]);

  await Promise.all(
    records.map(async (record) => {
      const report = reports.get(record.jsonFileName);
      if (!report) return;

      const json = JSON.stringify(report, null, 2);
      await Promise.all([
        fs.writeFile(path.join(REPORT_DIR, record.jsonFileName), json),
        fs.writeFile(path.join(PUBLIC_REPORTS_DIR, record.jsonFileName), json),
      ]);
    })
  );
}

async function writeLatest(record: SnapshotRecord | null) {
  if (!record) {
    await clearLatestOutputs();
    return;
  }

  const json = JSON.stringify(record.payload, null, 2);

  await Promise.all([
    fs.writeFile(DATA_LATEST_PATH, json),
    fs.writeFile(path.join(PUBLIC_DATA_DIR, "latest.json"), json),
  ]);
}

async function writeLatestReport(record: SnapshotRecord | null, reports: Map<string, SnapshotReport>) {
  if (!record) {
    await fs.writeFile(PUBLIC_LATEST_REPORT_PATH, JSON.stringify(null));
    await fs.writeFile(DATA_LATEST_REPORT_PATH, JSON.stringify(null));
    return;
  }

  const report = reports.get(record.jsonFileName);
  if (!report) {
    return;
  }

  const json = JSON.stringify(report, null, 2);
  await Promise.all([
    fs.writeFile(DATA_LATEST_REPORT_PATH, json),
    fs.writeFile(PUBLIC_LATEST_REPORT_PATH, json),
  ]);
}

async function clearLatestOutputs() {
  await Promise.all([
    fs.writeFile(DATA_LATEST_PATH, JSON.stringify(null)),
    fs.writeFile(path.join(PUBLIC_DATA_DIR, "latest.json"), JSON.stringify(null)),
    fs.writeFile(DATA_LATEST_REPORT_PATH, JSON.stringify(null)),
    fs.writeFile(PUBLIC_LATEST_REPORT_PATH, JSON.stringify(null)),
  ]).catch(() => {
    // ignore missing directories during cleanup
  });
}

function computeReports(records: SnapshotRecord[]): Map<string, SnapshotReport> {
  const sorted = [...records].sort(compareRecords);
  const reports = new Map<string, SnapshotReport>();
  let previous: SnapshotRecord | null = null;

  for (const record of sorted) {
    const report = buildReport(record, previous);
    reports.set(record.jsonFileName, report);
    previous = record;
  }

  return reports;
}

function buildReport(current: SnapshotRecord, previous: SnapshotRecord | null): SnapshotReport {
  const previousItems = previous ? previous.payload.items : [];
  const previousIndex = new Map(previousItems.map((item) => [item.name, item]));
  const currentIndex = new Map(current.payload.items.map((item) => [item.name, item]));

  const newItems: ChangeEntry[] = [];
  const removedItems: ChangeEntry[] = [];
  const increases: ChangeEntry[] = [];
  const decreases: ChangeEntry[] = [];
  let unchanged = 0;

  for (const item of current.payload.items) {
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

  if (previous) {
    for (const item of previous.payload.items) {
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
  }

  sortChanges(newItems, removedItems, increases, decreases);

  const deltaItems = current.indexEntry.totalItems - (previous?.indexEntry.totalItems ?? 0);
  const deltaQuantity = roundQuantity(
    current.indexEntry.totalQuantity - (previous?.indexEntry.totalQuantity ?? 0)
  );

  return {
    meta: current.payload.meta,
    totals: {
      items: current.indexEntry.totalItems,
      quantity: current.indexEntry.totalQuantity,
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

function compareRecords(a: SnapshotRecord, b: SnapshotRecord) {
  const byDate = a.payload.meta.snapshotDate.localeCompare(b.payload.meta.snapshotDate);
  if (byDate !== 0) return byDate;
  return a.payload.meta.uploadedAt.localeCompare(b.payload.meta.uploadedAt);
}

function findLatestRecord(records: SnapshotRecord[]): SnapshotRecord | null {
  if (records.length === 0) {
    return null;
  }
  const sorted = [...records].sort(compareRecords);
  return sorted[sorted.length - 1];
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(3));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});



