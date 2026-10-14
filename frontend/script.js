
const $ = id => document.getElementById(id);

const money = value => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
}).format(Number(value) || 0);

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

let products = [];
let suppliers = [];
let movements = [];
let categoryChart;
let healthChart;

const normalizeProduct = p => ({
  ...p,
  id: Number(p.id),
  price: Number(p.price) || 0,
  qty: Number(p.quantity ?? p.qty) || 0,
  reorder: Number(p.reorder_level ?? p.reorder) || 0,
  demand: Number(p.daily_demand ?? p.demand) || 0
});

const normalizeMovement = m => ({
  ...m,
  productId: Number(m.product_id ?? m.productId),
  type: m.movement_type ?? m.type,
  qty: Number(m.quantity ?? m.qty) || 0,
  date: m.created_at ?? m.date,
  note: m.note || "",
  productName: m.product_name || ""
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}`);
  }

  return data;
}

function toast(message) {
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}

function status(p) {
  if (p.qty === 0) return ["Out of stock", "out"];
  if (p.qty <= p.reorder) return ["Low stock", "low"];
  return ["Healthy", "healthy"];
}

function pill(p) {
  const [label, kind] = status(p);
  return `<span class="status-pill status-${kind}">${label}</span>`;
}

function emptyRow(cols, message = "No records found") {
  return `<tr><td colspan="${cols}">
    <div class="empty-state">${escapeHTML(message)}</div>
  </td></tr>`;
}

function productById(id) {
  return products.find(p => p.id === Number(id));
}

function productNameForMovement(m) {
  return m.productName || productById(m.productId)?.name || "Deleted product";
}

/* ---------------- DASHBOARD ---------------- */

function renderDashboard() {
  const low = products.filter(p => p.qty <= p.reorder);

  $("totalProducts").textContent = products.length;
  $("totalUnits").textContent = products
    .reduce((sum, p) => sum + p.qty, 0)
    .toLocaleString("en-IN");

  $("inventoryValue").textContent = money(
    products.reduce((sum, p) => sum + p.qty * p.price, 0)
  );

  $("lowStockCount").textContent = low.length;

  const categories = [...new Set(products.map(p => p.category))];

  const categoryData = categories.map(category =>
    products
      .filter(p => p.category === category)
      .reduce((sum, p) => sum + p.qty, 0)
  );

  const healthy = products.filter(p => status(p)[1] === "healthy").length;
  const lowCount = products.filter(p => status(p)[1] === "low").length;
  const out = products.filter(p => status(p)[1] === "out").length;

  if (typeof Chart !== "undefined") {
    if ($("categoryChart")) {
      categoryChart?.destroy();

      categoryChart = new Chart($("categoryChart"), {
        type: "bar",
        data: {
          labels: categories,
          datasets: [{
            label: "Units",
            data: categoryData,
            backgroundColor: [
              "#8170f4", "#55a6e8", "#48c49a",
              "#f0b34f", "#e783a0"
            ],
            borderRadius: 6,
            maxBarThickness: 35
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 }
            },
            x: { grid: { display: false } }
          }
        }
      });
    }

    if ($("healthChart")) {
      healthChart?.destroy();

      healthChart = new Chart($("healthChart"), {
        type: "doughnut",
        data: {
          labels: ["Healthy", "Low stock", "Out of stock"],
          datasets: [{
            data: [healthy, lowCount, out],
            backgroundColor: ["#38bd91", "#f0b14b", "#ed7180"],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "72%"
        }
      });
    }
  }

  $("attentionTable").innerHTML = low.length
    ? low.map(p => `
        <tr>
          <td>
            <span class="product-name">${escapeHTML(p.name)}</span>
            <span class="subtext">${escapeHTML(p.sku)}</span>
          </td>
          <td>${escapeHTML(p.category)}</td>
          <td>${p.qty}</td>
          <td>${pill(p)}</td>
        </tr>
      `).join("")
    : emptyRow(4, "All products are above reorder level.");

  $("recentMovements").innerHTML = movements.slice(0, 5).map(m => `
    <div class="activity-item">
      <div class="activity-symbol ${m.type === "IN" ? "green" : "orange"}">
        ${m.type === "IN" ? "↓" : "↑"}
      </div>
      <div>
        <strong>${escapeHTML(productNameForMovement(m))}</strong>
        <p>${m.type === "IN" ? "Stock received" : "Stock dispatched"} · ${m.qty} units</p>
        <time>${escapeHTML(new Date(m.date).toLocaleString())}</time>
      </div>
    </div>
  `).join("") || `<div class="empty-state">No stock activity yet.</div>`;
}

/* ---------------- INVENTORY ---------------- */

function renderInventory() {
  const search = $("productSearch").value.trim().toLowerCase();
  const categorySelect = $("categoryFilter");
  const previousCategory = categorySelect.value;

  const categories = [...new Set(products.map(p => p.category))].sort();

  categorySelect.innerHTML =
    `<option value="">All categories</option>` +
    categories.map(c =>
      `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`
    ).join("");

  categorySelect.value = categories.includes(previousCategory)
    ? previousCategory
    : "";

  const filtered = products.filter(p =>
    (!search || [p.name, p.sku, p.category]
      .some(s => String(s).toLowerCase().includes(search))) &&
    (!categorySelect.value || p.category === categorySelect.value)
  );

  $("productTable").innerHTML = filtered.length
    ? filtered.map(p => `
        <tr>
          <td>
            <span class="product-name">${escapeHTML(p.name)}</span>
            <span class="subtext">${escapeHTML(p.sku)}</span>
          </td>
          <td>${escapeHTML(p.sku)}</td>
          <td>${escapeHTML(p.category)}</td>
          <td>${money(p.price)}</td>
          <td><strong>${p.qty}</strong></td>
          <td>${p.reorder}</td>
          <td>${pill(p)}</td>
          <td>
            <button class="action-btn" data-edit="${p.id}">Edit</button>
            <button class="action-btn danger" data-delete="${p.id}">Delete</button>
          </td>
        </tr>
      `).join("")
    : emptyRow(8);

  $("tableFooter").textContent =
    `Showing ${filtered.length} of ${products.length} products`;
}

/* ---------------- SUPPLIERS ---------------- */

function renderSuppliers() {
  $("supplierTable").innerHTML = suppliers.length
    ? suppliers.map(s => `
        <tr>
          <td><span class="product-name">${escapeHTML(s.name)}</span></td>
          <td>${escapeHTML(s.company || "—")}</td>
          <td>${escapeHTML(s.email || "—")}</td>
          <td>${escapeHTML(s.phone || "—")}</td>
        </tr>
      `).join("")
    : emptyRow(4, "No suppliers added yet.");
}

/* ---------------- STOCK MOVEMENTS ---------------- */

function renderMovements() {
  $("movementTable").innerHTML = movements.length
    ? movements.map(m => `
        <tr>
          <td>${escapeHTML(new Date(m.date).toLocaleString())}</td>
          <td>${escapeHTML(productNameForMovement(m))}</td>
          <td>
            <span class="status-pill status-${m.type === "IN" ? "healthy" : "low"}">
              ${m.type === "IN" ? "Stock in" : "Stock out"}
            </span>
          </td>
          <td>${m.type === "IN" ? "+" : "−"}${m.qty}</td>
          <td>${escapeHTML(m.note || "—")}</td>
        </tr>
      `).join("")
    : emptyRow(5, "No stock movements recorded yet.");
}

/* ---------------- STOCK PREDICTION ---------------- */

function renderForecasts() {
  $("forecastTable").innerHTML = products.map(p => {
    const days = p.demand > 0 ? Math.floor(p.qty / p.demand) : null;

    const recommendation = p.qty === 0
      ? "Restock immediately"
      : days !== null && days <= 7
        ? "Order soon"
        : days !== null && days <= 14
          ? "Monitor demand"
          : "Stock sufficient";

    return `
      <tr>
        <td>
          <span class="product-name">${escapeHTML(p.name)}</span>
          <span class="subtext">${escapeHTML(p.sku)}</span>
        </td>
        <td>${p.qty}</td>
        <td>${p.demand} units/day</td>
        <td>${days === null ? "—" : days + " days"}</td>
        <td>${recommendation}</td>
      </tr>
    `;
  }).join("") || emptyRow(5);
}

/* ---------------- REPORTS ---------------- */

function renderReports() {
  $("reportProducts").textContent = products.length;
  $("reportUnits").textContent = products
    .reduce((sum, p) => sum + p.qty, 0)
    .toLocaleString("en-IN");

  $("reportValue").textContent = money(
    products.reduce((sum, p) => sum + p.qty * p.price, 0)
  );

  const low = products.filter(p => p.qty <= p.reorder);
  $("reportLow").textContent = low.length;

  $("reportTable").innerHTML = low.length
    ? low.map(p => `
        <tr>
          <td>${escapeHTML(p.name)}</td>
          <td>${p.qty}</td>
          <td>${p.reorder}</td>
          <td>${Math.max(0, p.reorder * 2 - p.qty)}</td>
        </tr>
      `).join("")
    : emptyRow(4, "No products need replenishment.");
}

function renderAll() {
  renderDashboard();
  renderInventory();
  renderSuppliers();
  renderMovements();
  renderForecasts();
  renderReports();

  $("movementProduct").innerHTML = products.map(p => `
    <option value="${p.id}">
      ${escapeHTML(p.name)} (${p.qty} available)
    </option>
  `).join("");
}

/* ---------------- LOAD FROM SQLITE VIA FLASK ---------------- */

async function loadData() {
  try {
    const [productData, supplierData, movementData] = await Promise.all([
      api("/api/products"),
      api("/api/suppliers"),
      api("/api/stock-movements")
    ]);

    products = (Array.isArray(productData)
      ? productData
      : productData.products || []).map(normalizeProduct);

    suppliers = Array.isArray(supplierData)
      ? supplierData
      : supplierData.suppliers || [];

    movements = (Array.isArray(movementData)
      ? movementData
      : movementData.movements || []).map(normalizeMovement);

    renderAll();
  } catch (error) {
    console.error("Failed to load inventory:", error);
    toast(`Unable to load data: ${error.message}`);
  }
}

/* ---------------- PRODUCT FORM ---------------- */

function openProduct(product) {
  $("productForm").reset();
  $("productId").value = product?.id ?? "";
  $("productModalTitle").textContent = product ? "Edit product" : "Add product";
  $("productName").value = product?.name ?? "";
  $("productSku").value = product?.sku ?? "";
  $("productCategory").value = product?.category ?? "";
  $("productPrice").value = product?.price ?? "";
  $("productQty").value = product?.qty ?? 0;
  $("productReorder").value = product?.reorder ?? 10;

  if ($("productDemand")) {
    $("productDemand").value = product?.demand ?? 2;
  }

  $("productDialog").showModal();
}

/* ---------------- CSV EXPORT ---------------- */

function exportCSV() {
  const rows = [[
    "Name", "SKU", "Category", "Unit Price INR",
    "Quantity", "Reorder Level", "Daily Demand", "Inventory Value"
  ]];

  products.forEach(p => rows.push([
    p.name, p.sku, p.category, p.price,
    p.qty, p.reorder, p.demand, (p.price * p.qty).toFixed(2)
  ]));

  const csv = rows.map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\r\n");

  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  );

  const a = document.createElement("a");
  a.href = url;
  a.download = "inventory-report.csv";
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- EVENT HANDLERS ---------------- */

$("addProductBtn").addEventListener("click", () => openProduct());
$("inventoryAddBtn").addEventListener("click", () => openProduct());

$("addSupplierBtn").addEventListener("click", () => {
  $("supplierDialog").showModal();
});

$("movementBtn").addEventListener("click", () => {
  if (!products.length) {
    toast("Add a product first.");
    return;
  }

  $("movementForm").reset();
  renderAll();
  $("movementDialog").showModal();
});

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => $(btn.dataset.close).close());
});

$("productSearch").addEventListener("input", renderInventory);
$("categoryFilter").addEventListener("change", renderInventory);
$("exportBtn").addEventListener("click", exportCSV);
$("reportExportBtn").addEventListener("click", exportCSV);

/* CREATE OR UPDATE PRODUCT IN DATABASE */

$("productForm").addEventListener("submit", async e => {
  e.preventDefault();

  const id = $("productId").value;

  const payload = {
    name: $("productName").value.trim(),
    sku: $("productSku").value.trim(),
    category: $("productCategory").value.trim(),
    price: Number($("productPrice").value),
    qty: Number($("productQty").value),
    reorder: Number($("productReorder").value),
    demand: Number($("productDemand")?.value || 2)
  };

  if (
    !payload.name ||
    !payload.sku ||
    !payload.category ||
    !Number.isFinite(payload.price) ||
    payload.price < 0 ||
    !Number.isInteger(payload.qty) ||
    payload.qty < 0 ||
    !Number.isInteger(payload.reorder) ||
    payload.reorder < 0 ||
    !Number.isFinite(payload.demand) ||
    payload.demand < 0
  ) {
    toast("Please check the product fields.");
    return;
  }

  try {
    await api(id ? `/api/products/${id}` : "/api/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });

    $("productDialog").close();
    await loadData();
    toast(id ? "Product updated and saved." : "Product added and saved.");
  } catch (error) {
    toast(error.message);
  }
});

/* DELETE PRODUCT FROM DATABASE */

$("productTable").addEventListener("click", async e => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-delete]");

  if (edit) openProduct(productById(edit.dataset.edit));

  if (del) {
    const product = productById(del.dataset.delete);

    if (product && confirm(`Delete ${product.name} from the database?`)) {
      try {
        await api(`/api/products/${product.id}`, { method: "DELETE" });
        await loadData();
        toast("Product deleted.");
      } catch (error) {
        toast(error.message);
      }
    }
  }
});

/* CREATE SUPPLIER */

$("supplierForm").addEventListener("submit", async e => {
  e.preventDefault();

  const payload = {
    name: $("supplierName").value.trim(),
    company: $("supplierCompany").value.trim(),
    email: $("supplierEmail").value.trim(),
    phone: $("supplierPhone").value.trim()
  };

  try {
    await api("/api/suppliers", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    $("supplierDialog").close();
    $("supplierForm").reset();
    await loadData();
    toast("Supplier added and saved.");
  } catch (error) {
    toast(error.message);
  }
});

/* RECORD STOCK IN OR OUT */

$("movementForm").addEventListener("submit", async e => {
  e.preventDefault();

  const productId = Number($("movementProduct").value);
  const qty = Number($("movementQty").value);
  const type = $("movementType").value;
  const note = $("movementNote").value.trim();

  const product = productById(productId);

  if (!product || !Number.isInteger(qty) || qty <= 0) {
    toast("Enter a valid quantity.");
    return;
  }

  if (type === "OUT" && qty > product.qty) {
    toast("Not enough stock available.");
    return;
  }

  try {
    await api("/api/stock-movements", {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        type: type,
        qty: qty,
        note:note
      })
    });

    $("movementDialog").close();
    await loadData();
    toast("Stock movement saved.");
  } catch (error) {
    toast(error.message);
  }
});

/* NAVIGATION AND THEME */

document.querySelectorAll("[data-page]").forEach(link => {
  link.addEventListener("click", () => {
    const page = link.dataset.page;

    $("pageCrumb").textContent =
      page.charAt(0).toUpperCase() + page.slice(1);

    document.querySelectorAll(".nav-link").forEach(nav => {
      nav.classList.toggle("active", nav.dataset.page === page);
    });
  });
});

window.addEventListener("hashchange", () => {
  const page = location.hash.slice(1) || "dashboard";

  $("pageCrumb").textContent =
    page.charAt(0).toUpperCase() + page.slice(1);

  document.querySelectorAll(".nav-link").forEach(nav => {
    nav.classList.toggle("active", nav.dataset.page === page);
  });
});

$("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

/* INITIAL LOAD */

loadData();
