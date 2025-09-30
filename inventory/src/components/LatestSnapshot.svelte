<script lang="ts">
  import type { SnapshotItem, SnapshotMeta } from "../lib/types";

  export let meta: SnapshotMeta | null = null;
  export let items: SnapshotItem[] = [];

  const hasData = () => meta && items.length > 0;
</script>

<section class="panel">
  <header class="panel__head">
    <div>
      <h2>Latest Snapshot</h2>
      {#if meta}
        <p class="panel__sub">
          Snapshot {meta.snapshotDate} · Uploaded {new Date(meta.uploadedAt).toLocaleString()}
        </p>
      {:else}
        <p class="panel__sub">Waiting for processed inventory data…</p>
      {/if}
    </div>
    <button class="panel__action" disabled>Export CSV</button>
  </header>

  {#if hasData()}
    <table class="inventory-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Unit</th>
          <th scope="col" class="align-end">Quantity</th>
        </tr>
      </thead>
      <tbody>
        {#each items as item (item.name)}
          <tr>
            <td>{item.name}</td>
            <td>{item.unit}</td>
            <td class="align-end">{item.quantity.toLocaleString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="empty-state">
      Upload a CSV to generate the first snapshot.
    </p>
  {/if}
</section>
