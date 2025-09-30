<script lang="ts">
  import type { SnapshotItem, SnapshotMeta } from "../lib/types";

  export let meta: SnapshotMeta | null = null;
  export let items: SnapshotItem[] = [];

  const hasData = () => meta && items.length > 0;

  $: sortedItems = hasData() ? [...items].sort((a, b) => b.quantity - a.quantity) : [];

  const escape = (value: string) => {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const formatQuantity = (value: number) => {
    const rounded = Number(value.toFixed(3));
    if (Number.isInteger(rounded)) {
      return rounded.toString();
    }
    return rounded.toString();
  };

  const toCsv = () => {
    const header = ["Name", "Unit", "Quantity"].join(",");
    const rows = sortedItems.map((item) =>
      [escape(item.name), escape(item.unit ?? ""), escape(formatQuantity(item.quantity))].join(",")
    );

    return [header, ...rows].join("\r\n");
  };

  const handleExport = () => {
    if (!hasData()) {
      return;
    }

    const csv = `\uFEFF${toCsv()}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = meta?.sourceFile?.replace(/\.csv$/i, "") ?? `inventory-${meta?.snapshotDate ?? "latest"}`;

    link.href = url;
    link.download = `${baseName}-export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
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
    <button class="panel__action" type="button" on:click={handleExport} disabled={!hasData()}>
      Export CSV
    </button>
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
        {#each sortedItems as item (item.name)}
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
