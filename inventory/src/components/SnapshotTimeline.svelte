<script lang="ts">
  import type { SnapshotIndexEntry } from "../lib/types";

  export let snapshots: SnapshotIndexEntry[] = [];

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const quantityFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  const formatLabel = (entry: SnapshotIndexEntry) => {
    const uploaded = new Date(entry.uploadedAt);
    return `${entry.snapshotDate} · ${timeFormatter.format(uploaded)}`;
  };

  const formatTotals = (entry: SnapshotIndexEntry) => {
    const quantity = quantityFormatter.format(entry.totalQuantity);
    return `${entry.totalItems} items · ${quantity} units`;
  };
</script>

<section class="panel">
  <header class="panel__head">
    <div>
      <h2>Snapshot Timeline</h2>
      <p class="panel__sub">Tracks every upload and highlights the most recent per day.</p>
    </div>
  </header>

  {#if snapshots.length > 0}
    <ol class="timeline">
      {#each snapshots as entry (entry.path)}
        <li class:timeline__item--active={entry.latestForDate}>
          <div>
            <span class="timeline__title">{formatLabel(entry)}</span>
            <span class="timeline__meta">{formatTotals(entry)}</span>
          </div>
          <span class="timeline__source">Source: {entry.sourceFile}</span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty-state">Snapshot history will appear after the first upload.</p>
  {/if}
</section>
