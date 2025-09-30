<script lang="ts">
  import type { SnapshotReport } from "../lib/types";

  export let report: SnapshotReport | null = null;
  export let hasBaseline = false;

  const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  const quantityFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  const deltaFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  const totalsFallback = { items: 0, quantity: 0, deltaItems: 0, deltaQuantity: 0 };
  const countsFallback = { new: 0, removed: 0, increased: 0, decreased: 0, unchanged: 0 };

  $: totals = report?.totals ?? totalsFallback;
  $: counts = report?.counts ?? countsFallback;
  $: changedItems = counts.increased + counts.decreased;

  const formatCount = (value: number) => countFormatter.format(value);
  const formatQuantity = (value: number) => quantityFormatter.format(value);

  const deltaLabel = (value: number, suffix: string) => {
    if (!hasBaseline) {
      return "Initial snapshot";
    }
    if (value === 0) {
      return "No change";
    }
    const sign = value > 0 ? "+" : "–";
    const amount = deltaFormatter.format(Math.abs(value));
    return `${sign}${amount} ${suffix}`;
  };

  const deltaClass = (value: number) => {
    if (!hasBaseline || value === 0) {
      return "metric-delta metric-delta--neutral";
    }
    return value > 0 ? "metric-delta metric-delta--positive" : "metric-delta metric-delta--negative";
  };
</script>

<section class="panel panel--summary">
  <h2>Inventory At A Glance</h2>
  <div class="grid grid--summary">
    <article class="metric-card">
      <h3>Total SKUs</h3>
      <p>{formatCount(totals.items)}</p>
      {#if report}
        <span class={deltaClass(totals.deltaItems)}>{deltaLabel(totals.deltaItems, "items")}</span>
      {/if}
    </article>

    <article class="metric-card">
      <h3>Units In Stock</h3>
      <p>{formatQuantity(totals.quantity)}</p>
      {#if report}
        <span class={deltaClass(totals.deltaQuantity)}>{deltaLabel(totals.deltaQuantity, "units")}</span>
      {/if}
    </article>

    <article class="metric-card">
      <h3>Changed Items</h3>
      <p>{formatCount(changedItems)}</p>
      <span class="metric-sub">+{formatCount(counts.increased)} increased · -{formatCount(counts.decreased)} decreased</span>
    </article>

    <article class="metric-card">
      <h3>New Items</h3>
      <p>{formatCount(counts.new)}</p>
      <span class="metric-sub">Added this upload</span>
    </article>

    <article class="metric-card">
      <h3>Removed Items</h3>
      <p>{formatCount(counts.removed)}</p>
      <span class="metric-sub">Missing compared to prior</span>
    </article>
  </div>
</section>
