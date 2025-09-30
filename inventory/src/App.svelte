<script lang="ts">
  import { onMount } from "svelte";
  import ChangeHighlights from "./components/ChangeHighlights.svelte";
  import InventorySummary from "./components/InventorySummary.svelte";
  import LatestSnapshot from "./components/LatestSnapshot.svelte";
  import SnapshotTimeline from "./components/SnapshotTimeline.svelte";
  import UploadPanel from "./components/UploadPanel.svelte";
  import type {
    SnapshotIndexEntry,
    SnapshotItem,
    SnapshotMeta,
    SnapshotPayload,
    SnapshotReport,
  } from "./lib/types";

  const base = import.meta.env.BASE_URL ?? "/";

  const demoMeta: SnapshotMeta = {
    snapshotDate: "2025-09-30",
    uploadedAt: new Date().toISOString(),
    sourceFile: "stock-items_09_30_2025.csv",
  };

  const demoItems: SnapshotItem[] = [
    { name: "1.5\" Northern River Rock", unit: "TON", quantity: 13.92 },
    { name: "Fabric Pins (50ct)", unit: "EACH", quantity: 291 },
    { name: "Class 1 Compost", unit: "YARD", quantity: 100.19 },
  ];

  let loading = true;
  let errorMessage = "";
  let latestMeta: SnapshotMeta | null = null;
  let latestItems: SnapshotItem[] = [];
  let timeline: SnapshotIndexEntry[] = [];
  let report: SnapshotReport | null = null;
  let hasBaseline = false;

  onMount(async () => {
    try {
      const entries = await fetchIndex();
      timeline = sortTimeline(entries);
      hasBaseline = entries.length > 1;

      if (entries.length === 0) {
        applyDemoData("No processed snapshots found. Add CSV files to data/raw and rerun build-data.");
        return;
      }

      const latestEntry = findLatest(entries);
      const payload = await fetchSnapshot(latestEntry.path);
      const latestReport = await fetchLatestReport();

      latestMeta = payload.meta;
      latestItems = payload.items ?? [];
      report = latestReport ?? buildFallbackReport(payload);
      errorMessage = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load snapshot data.";
      applyDemoData(message);
    } finally {
      loading = false;
    }
  });

  async function fetchIndex(): Promise<SnapshotIndexEntry[]> {
    const response = await fetch(`${base}data/index.json`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch index.json (${response.status})`);
    }

    return (await response.json()) as SnapshotIndexEntry[];
  }

  async function fetchSnapshot(pathname: string): Promise<SnapshotPayload> {
    const response = await fetch(`${base}${pathname}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${pathname} (${response.status})`);
    }

    return (await response.json()) as SnapshotPayload;
  }

  async function fetchLatestReport(): Promise<SnapshotReport | null> {
    const response = await fetch(`${base}data/latest-report.json`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch latest-report.json (${response.status})`);
    }

    const data = await response.json();
    if (!data) {
      return null;
    }

    return data as SnapshotReport;
  }

  function sortTimeline(entries: SnapshotIndexEntry[]): SnapshotIndexEntry[] {
    return [...entries].sort((a, b) => {
      const byDate = b.snapshotDate.localeCompare(a.snapshotDate);
      if (byDate !== 0) return byDate;
      return b.uploadedAt.localeCompare(a.uploadedAt);
    });
  }

  function findLatest(entries: SnapshotIndexEntry[]): SnapshotIndexEntry {
    return entries.reduce((acc, current) => {
      if (!acc) return current;
      return current.uploadedAt.localeCompare(acc.uploadedAt) > 0 ? current : acc;
    });
  }

  function buildFallbackReport(payload: SnapshotPayload): SnapshotReport {
    const items = payload.items ?? [];
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      meta: payload.meta,
      totals: {
        items: items.length,
        quantity: Number(totalQuantity.toFixed(3)),
        deltaItems: items.length,
        deltaQuantity: Number(totalQuantity.toFixed(3)),
      },
      counts: {
        new: items.length,
        removed: 0,
        increased: 0,
        decreased: 0,
        unchanged: 0,
      },
      newItems: items.map((item) => ({
        name: item.name,
        unit: item.unit,
        previousQuantity: 0,
        quantity: Number(item.quantity.toFixed(3)),
        delta: Number(item.quantity.toFixed(3)),
      })),
      removedItems: [],
      increases: [],
      decreases: [],
    };
  }

  function applyDemoData(message: string) {
    errorMessage = message;
    latestMeta = demoMeta;
    latestItems = demoItems;
    report = buildFallbackReport({ meta: demoMeta, items: demoItems });
    hasBaseline = false;
    timeline = [
      {
        snapshotDate: demoMeta.snapshotDate,
        uploadedAt: demoMeta.uploadedAt,
        sourceFile: demoMeta.sourceFile,
        path: "data/snapshots/demo.json",
        latestForDate: true,
        totalItems: demoItems.length,
        totalQuantity: report.totals.quantity,
      },
    ];
  }
</script>

<main class="layout">
  <header class="hero">
    <div>
      <p class="eyebrow">Inventory tracking</p>
      <h1>Stock Level Dashboard</h1>
      <p class="lede">
        Upload CSV snapshots to track quantity changes, compare days, and visualize trends over time.
      </p>
    </div>
    <button class="hero__cta" disabled>Upload Snapshot (coming soon)</button>
  </header>

  {#if loading}
    <section class="panel">
      <p>Loading latest snapshot...</p>
    </section>
  {:else}
    {#if errorMessage}
      <section class="panel panel--message">
        <p>{errorMessage}</p>
      </section>
    {/if}

    <section class="grid grid--pair">
      <InventorySummary {report} {hasBaseline} />
      <LatestSnapshot meta={latestMeta} items={latestItems} />
    </section>

    <section class="grid grid--pair">
      <ChangeHighlights {report} {hasBaseline} />
      <SnapshotTimeline snapshots={timeline} />
    </section>

    <section class="grid grid--single">
      <UploadPanel baselineItems={latestItems} baselineReport={report} />
    </section>
  {/if}

  <footer class="footer">
    <p>
      Data is sourced from dated CSV uploads stored in <code>data/raw</code>. Run <code>npm run build-data</code> to
      regenerate processed snapshots and surface them here.
    </p>
    <p class="version">Build: 2025-09-30T22:11:43Z</p>
  </footer>
</main>









