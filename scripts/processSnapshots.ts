import { promises as fs } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

const RAW_DIR = path.resolve("data", "raw");
const SNAPSHOT_DIR = path.resolve("data", "snapshots");
const DATA_INDEX_PATH = path.resolve("data", "index.json");
const PUBLIC_DATA_DIR = path.resolve("inventory", "public", "data");
const PUBLIC_SNAPSHOT_DIR = path.join(PUBLIC_DATA_DIR, "snapshots");

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

async function main() {
  await ensureDirectories();
  const csvFiles = await listCsvFiles();

  if (csvFiles.length === 0) {
    console.warn("No CSV snapshots found in data/raw. Skipping processing.");
    await writeIndex([]);
    return;
  }

  const records: SnapshotRecord[] = [];

  for (const fileName of csvFiles) {
    const record = await processCsv(fileName);
    records.push(record);
    await writeSnapshot(record);
  }

  annotateLatest(records);
  await writeIndex(records.map((record) => record.indexEntry));
  await writeLatest(records);
}

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(RAW_DIR, { recursive: true }),
    fs.mkdir(SNAPSHOT_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_DATA_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_SNAPSHOT_DIR, { recursive: true }),
  ]);
}

async function listCsvFiles(): Promise<string[]> {
  const entries = await fs.readdir(RAW_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name)
    .sort();
}

async function processCsv(fileName: string): Promise<SnapshotRecord> {
  const filePath = path.join(RAW_DIR, fileName);
  const csvContent = await fs.readFile(filePath, "utf8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as CsvRow[];

  const snapshotDate = deriveSnapshotDate(fileName);
  const uploadedAt = await determineUploadTimestamp(filePath);

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

  const totals = calculateTotals(items);
  const jsonFileName = generateSnapshotFileName(snapshotDate, uploadedAt);

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
  const totalQuantity = Number(totalQuantityRaw.toFixed(3));
  return {
    count: items.length,
    totalQuantity,
  };
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
    list.sort((a, b) => a.payload.meta.uploadedAt.localeCompare(b.payload.meta.uploadedAt));
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

async function writeLatest(records: SnapshotRecord[]) {
  if (records.length === 0) {
    return;
  }

  const latest = records.reduce((acc, current) => {
    if (!acc) return current;
    if (current.payload.meta.uploadedAt.localeCompare(acc.payload.meta.uploadedAt) > 0) {
      return current;
    }
    return acc;
  });

  const json = JSON.stringify(latest.payload, null, 2);

  await fs.writeFile(path.join(PUBLIC_DATA_DIR, "latest.json"), json);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
