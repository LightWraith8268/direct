<script lang="ts">
  import { parse } from "csv-parse/browser/esm/sync";
  import type { SnapshotItem, SnapshotMeta, SnapshotReport, SnapshotPayload } from "../lib/types";
  import { buildReport, calculateTotals } from "../lib/report";

  interface CsvRow {
    Name: string;
    Unit: string;
    Quantity: string;
  }

  export let baselineReport: SnapshotReport | null = null;
  export let baselineItems: SnapshotItem[] = [];

  let fileInput: HTMLInputElement | null = null;

  const quantityFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

  let isDragging = false;
  let errorMessage = "";
  let warnings: string[] = [];
  let preview: {
    payload: SnapshotPayload;
    report: SnapshotReport;
  } | null = null;

  const hasBaseline = baselineItems.length > 0;
  const previousTotals = baselineReport?.totals ?? calculateTotals(baselineItems);

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    isDragging = true;
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    isDragging = false;
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    isDragging = false;
    handleFiles(event.dataTransfer?.files ?? null);
  };

  const onFileChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    handleFiles(input.files);
    input.value = "";
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput?.click();
    }
  };

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const file = fileList[0];
    await processFile(file);
  }

  async function processFile(file: File) {
    errorMessage = "";
    warnings = [];
    preview = null;

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const { payload, issues } = buildSnapshotFromRows(file.name, rows);
      warnings = issues;

      const report = buildReport({
        meta: payload.meta,
        items: payload.items,
        previousItems: baselineItems,
        previousTotals,
      });

      preview = { payload, report };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Failed to process the CSV file.";
    }
  }

  function parseCsv(text: string): CsvRow[] {
    try {
      return parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
      }) as CsvRow[];
    } catch (error) {
      throw new Error("Unable to parse CSV contents. Ensure the file is a valid CSV export.");
    }
  }

  function buildSnapshotFromRows(sourceFile: string, rows: CsvRow[]) {
    const items: SnapshotItem[] = [];
    const issues: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const name = row.Name?.trim();
      const unit = row.Unit?.trim() ?? "";
      const quantityRaw = row.Quantity?.trim();

      if (!name) {
        issues.push("Skipped a row without a Name value.");
        continue;
      }

      if (seen.has(name)) {
        issues.push(`Duplicate item "${name}" was skipped.`);
        continue;
      }

      const quantity = parseQuantity(quantityRaw);
      if (Number.isNaN(quantity)) {
        issues.push(`Row for "${name}" has an invalid quantity and was skipped.`);
        continue;
      }

      items.push({ name, unit, quantity });
      seen.add(name);
    }

    if (items.length === 0) {
      throw new Error("No valid inventory rows were found in the uploaded file.");
    }

    items.sort((a, b) => a.name.localeCompare(b.name));

    const snapshotDate = deriveSnapshotDate(sourceFile);
    const payload: SnapshotPayload = {
      meta: {
        snapshotDate,
        uploadedAt: new Date().toISOString(),
        sourceFile,
      },
      items,
    };

    return { payload, issues };
  }

  function parseQuantity(value: string | undefined): number {
    if (!value) return 0;
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function deriveSnapshotDate(fileName: string): string {
    const match = fileName.match(/stock-items_(\d{2})_(\d{2})_(\d{4})\.csv$/i);
    if (!match) {
      throw new Error(
        "File name must follow the pattern stock-items_MM_DD_YYYY.csv so the snapshot date can be inferred."
      );
    }

    const [, month, day, year] = match;
    return `${year}-${month}-${day}`;
  }

  function downloadSnapshot() {
    if (!preview) return;
    const baseName = sanitizeBaseName(preview.payload.meta.sourceFile);
    const json = JSON.stringify(preview.payload, null, 2);
    triggerDownload(json, `${baseName}-snapshot.json`);
  }

  function downloadReport() {
    if (!preview) return;
    const baseName = sanitizeBaseName(preview.payload.meta.sourceFile);
    const json = JSON.stringify(preview.report, null, 2);
    triggerDownload(json, `${baseName}-report.json`);
  }

  function sanitizeBaseName(fileName: string) {
    return fileName.replace(/\.csv$/i, "");
  }

  function triggerDownload(content: string, filename: string) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const formatQuantity = (value: number) => quantityFormatter.format(value);
</script>

<section class="panel panel--upload">
  <header class="panel__head">
    <div>
      <h2>Upload Snapshot</h2>
      <p class="panel__sub">
        Drop a new CSV export to preview changes. Processed JSON files are ready to download for commits.
      </p>
    </div>
  </header>

  <div
    role="button"
    tabindex="0"
    aria-label="Upload inventory CSV"
    class:upload-drop--active={isDragging}
    class="upload-drop"
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:drop={onDrop}
    on:keydown={onKeyDown}
  >
    <input
      class="upload-input"
      type="file"
      accept=".csv"
      on:change={onFileChange}
      bind:this={fileInput}
    />
    <p>
      <strong>Click to choose</strong> or drag and drop a CSV file named <code>stock-items_MM_DD_YYYY.csv</code>.
    </p>
  </div>

  {#if errorMessage}
    <div class="upload-alert upload-alert--error">{errorMessage}</div>
  {/if}

  {#if warnings.length > 0}
    <div class="upload-alert">
      <p>Warnings:</p>
      <ul>
        {#each warnings as warning, index}
          <li>{index + 1}. {warning}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if preview}
    <div class="upload-summary">
      <div>
        <h3>Snapshot Details</h3>
        <p>
          <span>Source file:</span> {preview.payload.meta.sourceFile}
        </p>
        <p>
          <span>Snapshot date:</span> {preview.payload.meta.snapshotDate}
        </p>
        <p>
          <span>Upload timestamp:</span> {new Date(preview.payload.meta.uploadedAt).toLocaleString()}
        </p>
      </div>
      <div>
        <h3>Totals</h3>
        <p>
          <span>Total SKUs:</span> {preview.report.totals.items.toLocaleString()}
        </p>
        <p>
          <span>Units in stock:</span> {formatQuantity(preview.report.totals.quantity)}
        </p>
        <p>
          <span>Change vs baseline:</span>
          {#if hasBaseline}
            <strong>
              {preview.report.totals.deltaItems >= 0 ? "?" : "?"}
              {Math.abs(preview.report.totals.deltaItems).toLocaleString()} items  
              {preview.report.totals.deltaQuantity >= 0 ? "?" : "?"}
              {formatQuantity(Math.abs(preview.report.totals.deltaQuantity))} units
            </strong>
          {:else}
            Initial snapshot
          {/if}
        </p>
      </div>
      <div>
        <h3>Change Counts</h3>
        <p><span>New items:</span> {preview.report.counts.new.toLocaleString()}</p>
        <p><span>Removed items:</span> {preview.report.counts.removed.toLocaleString()}</p>
        <p>
          <span>Qty increases:</span> {preview.report.counts.increased.toLocaleString()}   decreases:
          {preview.report.counts.decreased.toLocaleString()}
        </p>
      </div>
    </div>

    <div class="upload-changes">
      <article>
        <h4>Top Increases</h4>
        {#if preview.report.increases.length === 0}
          <p class="muted">No increases detected.</p>
        {:else}
          <ul>
            {#each preview.report.increases.slice(0, 5) as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-detail">
                  {formatQuantity(entry.previousQuantity)} ? {formatQuantity(entry.quantity)}
                  {entry.unit || "units"}
                </span>
                <span class="change-delta positive">
                  +{formatQuantity(entry.delta)} {entry.unit || "units"}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>

      <article>
        <h4>Top Decreases</h4>
        {#if preview.report.decreases.length === 0}
          <p class="muted">No decreases detected.</p>
        {:else}
          <ul>
            {#each preview.report.decreases.slice(0, 5) as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-detail">
                  {formatQuantity(entry.previousQuantity)} ? {formatQuantity(entry.quantity)}
                  {entry.unit || "units"}
                </span>
                <span class="change-delta negative">
                  -{formatQuantity(Math.abs(entry.delta))} {entry.unit || "units"}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>

      <article>
        <h4>New Items</h4>
        {#if preview.report.newItems.length === 0}
          <p class="muted">No new items.</p>
        {:else}
          <ul>
            {#each preview.report.newItems.slice(0, 5) as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-detail">
                  0 ? {formatQuantity(entry.quantity)} {entry.unit || "units"}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>

      <article>
        <h4>Removed Items</h4>
        {#if preview.report.removedItems.length === 0}
          <p class="muted">No removals.</p>
        {:else}
          <ul>
            {#each preview.report.removedItems.slice(0, 5) as entry (entry.name)}
              <li>
                <span class="change-name">{entry.name}</span>
                <span class="change-detail">
                  {formatQuantity(entry.previousQuantity)} ? 0 {entry.unit || "units"}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>
    </div>

    <div class="upload-actions">
      <button type="button" on:click={downloadSnapshot}>Download Snapshot JSON</button>
      <button type="button" on:click={downloadReport}>Download Report JSON</button>
    </div>
  {/if}
</section>



