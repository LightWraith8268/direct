<script lang="ts">
  export let totalItems = 0;
  export let totalQuantity = 0;
  export let changedCount = 0;
</script>

<section class="panel panel--summary">
  <h2>Inventory At A Glance</h2>
  <div class="grid grid--summary">
    <article class="metric-card">
      <h3>Total SKUs</h3>
      <p>{totalItems.toLocaleString()}</p>
    </article>
    <article class="metric-card">
      <h3>Units In Stock</h3>
      <p>{totalQuantity.toLocaleString()}</p>
    </article>
    <article class="metric-card">
      <h3>Changed Since Prior</h3>
      <p>{changedCount.toLocaleString()}</p>
    </article>
  </div>
</section>
