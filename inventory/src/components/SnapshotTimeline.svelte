<script lang="ts">
  import type { SnapshotIndexEntry } from "../lib/types";

  export let snapshots: SnapshotIndexEntry[] = [];

  const formatLabel = (entry: SnapshotIndexEntry) => {
    const uploaded = new Date(entry.uploadedAt);
    return `${entry.snapshotDate} · ${uploaded.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };
</script>

<section class="panel">
  <header class="panel__head">
    <div>
      <h2>Snapshot Timeline</h2>
      <p class="panel__sub">Tracks every upload, highlighting the most recent per day.</p>
    </div>
    <button class="panel__action" disabled>View Chart</button>
  </header>

  {#if snapshots.length > 0}
    <ol class="timeline">
      {#each snapshots as entry (entry.path)}
        <li class:timeline__item--active={entry.latestForDate}>
          <span class="timeline__title">{formatLabel(entry)}</span>
          <span class="timeline__meta">Source: {entry.sourceFile}</span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty-state">Snapshot history will appear after the first upload.</p>
  {/if}
</section>
