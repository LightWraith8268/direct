<script lang="ts">
  import type { ChangeEntry, SnapshotReport } from "../lib/types";

  export let report: SnapshotReport | null = null;
  export let hasBaseline = false;

  const limit = 5;
  const quantityFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  $: increases = (report?.increases ?? []).slice(0, limit);
  $: decreases = (report?.decreases ?? []).slice(0, limit);
  $: newItems = (report?.newItems ?? []).slice(0, limit);
  $: removedItems = (report?.removedItems ?? []).slice(0, limit);

  const formatQuantity = (value: number) => quantityFormatter.format(value);

  const formatRange = (entry: ChangeEntry) => {
    const previous = formatQuantity(entry.previousQuantity);
    const current = formatQuantity(entry.quantity);
    return `${previous} ? ${current}`;
  };

  const formatDelta = (entry: ChangeEntry) => {
    if (entry.delta === 0) return "0";
    const sign = entry.delta > 0 ? "+" : " ";
    return `${sign}${formatQuantity(Math.abs(entry.delta))}`;
  };

  const unitLabel = (unit: string) => unit || "units";
</script>

<section class="panel">
  <header class="panel__head">
    <div>
      <h2>Change Highlights</h2>
      <p class="panel__sub">
        {#if hasBaseline}
          Comparing against the previous upload to surface top movements.
        {:else}
          First snapshot captured. Upload another CSV to unlock comparisons.
        {/if}
      </p>
    </div>
  </header>

  {#if !report}
    <p class="empty-state">Waiting for report data </p>
  {:else}
    <div class="change-grid">
      <article>
        <h3>Top Increases</h3>
        {#if increases.length === 0}
          <p class="muted">No increases recorded.</p>
        {:else}
          <ul class="change-list">
            {#each increases as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-range">{formatRange(entry)} {unitLabel(entry.unit)}</span>
                <span class="change-delta positive">{formatDelta(entry)} {unitLabel(entry.unit)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>

      <article>
        <h3>Top Decreases</h3>
        {#if decreases.length === 0}
          <p class="muted">No decreases recorded.</p>
        {:else}
          <ul class="change-list">
            {#each decreases as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-range">{formatRange(entry)} {unitLabel(entry.unit)}</span>
                <span class="change-delta negative">{formatDelta(entry)} {unitLabel(entry.unit)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>

      <article>
        <h3>New Items</h3>
        {#if newItems.length === 0}
          <p class="muted">No new items in this upload.</p>
        {:else}
          <ul class="change-list">
            {#each newItems as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-range">0 ? {formatQuantity(entry.quantity)} {unitLabel(entry.unit)}</span>
                <span class="change-delta positive">+{formatQuantity(entry.quantity)} {unitLabel(entry.unit)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>

      <article>
        <h3>Removed Items</h3>
        {#if removedItems.length === 0}
          <p class="muted">No items were removed.</p>
        {:else}
          <ul class="change-list">
            {#each removedItems as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-range">{formatQuantity(entry.previousQuantity)} ? 0 {unitLabel(entry.unit)}</span>
                <span class="change-delta negative">-{formatQuantity(entry.previousQuantity)} {unitLabel(entry.unit)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>
    </div>
  {/if}
</section>
