const defaultMaterials = [
  { id: "a", name: "原料 a", price: 12.5, usage: 0 },
  { id: "b", name: "原料 b", price: 18.8, usage: 0 },
  { id: "c", name: "原料 c", price: 9.6, usage: 0 },
  { id: "d", name: "原料 d", price: 26.0, usage: 0 },
];

let materials = defaultMaterials.map((item) => ({ ...item }));

const rowsEl = document.querySelector("#materialRows");
const totalCostEl = document.querySelector("#totalCost");
const totalUsageEl = document.querySelector("#totalUsage");
const avgCostEl = document.querySelector("#avgCost");
const topMaterialEl = document.querySelector("#topMaterial");
const importStatusEl = document.querySelector("#importStatus");
const fileInputEl = document.querySelector("#erpFile");

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 4,
});

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function parseNumber(value) {
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function setStatus(message, isWarning = false) {
  importStatusEl.textContent = message;
  importStatusEl.classList.toggle("warning", isWarning);
}

function renderRows() {
  rowsEl.innerHTML = "";

  materials.forEach((material) => {
    const row = document.createElement("div");
    row.className = "material-row";
    row.innerHTML = `
      <div class="material-name">
        <span class="badge" aria-label="${material.name}">${material.id}</span>
      </div>
      <label class="field currency price">
        <span>¥</span>
        <input type="number" min="0" step="0.01" value="${material.price}" data-id="${material.id}" data-field="price" aria-label="${material.name}单价" />
      </label>
      <label class="field usage">
        <input type="number" min="0" step="0.001" value="${material.usage || ""}" data-id="${material.id}" data-field="usage" aria-label="${material.name}用量" placeholder="0" />
      </label>
      <strong class="subtotal" id="subtotal-${material.id}">${formatCurrency(material.price * material.usage)}</strong>
    `;
    rowsEl.appendChild(row);
  });
}

function updateTotals() {
  let totalCost = 0;
  let totalUsage = 0;
  let topMaterial = null;

  materials.forEach((material) => {
    const subtotal = material.price * material.usage;
    totalCost += subtotal;
    totalUsage += material.usage;

    const subtotalEl = document.querySelector(`#subtotal-${material.id}`);
    if (subtotalEl) {
      subtotalEl.textContent = formatCurrency(subtotal);
    }

    if (!topMaterial || subtotal > topMaterial.subtotal) {
      topMaterial = { ...material, subtotal };
    }
  });

  totalCostEl.textContent = formatCurrency(totalCost);
  totalUsageEl.textContent = numberFormatter.format(totalUsage);
  avgCostEl.textContent = formatCurrency(totalUsage > 0 ? totalCost / totalUsage : 0);
  topMaterialEl.textContent = topMaterial && topMaterial.subtotal > 0 ? topMaterial.name : "-";
}

function updateMaterial(id, field, value) {
  const material = materials.find((item) => item.id === id);
  if (!material) return;
  material[field] = parseNumber(value);
  updateTotals();
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let insideQuote = false;

  for (const char of line) {
    if (char === '"') {
      insideQuote = !insideQuote;
    } else if (char === "," && !insideQuote) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, ""));
}

function parseErpCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV 至少需要表头和一行数据。");
  }

  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const materialIndex = header.findIndex((cell) =>
    ["原料", "名称", "物料", "material", "name", "item"].some((key) => cell.includes(key)),
  );
  const priceIndex = header.findIndex((cell) =>
    ["单价", "成本", "价格", "price", "cost"].some((key) => cell.includes(key)),
  );

  if (materialIndex === -1 || priceIndex === -1) {
    throw new Error("未找到原料名称或单价列。");
  }

  const importedPrices = new Map();

  lines.slice(1).forEach((line) => {
    const cells = splitCsvLine(line);
    const rawName = (cells[materialIndex] || "").trim().toLowerCase();
    const idMatch = rawName.match(/\b[abcd]\b|原料\s*([abcd])/i);
    const id = idMatch ? (idMatch[1] || idMatch[0]).toLowerCase() : rawName;
    const price = parseNumber(cells[priceIndex]);

    if (["a", "b", "c", "d"].includes(id) && price > 0) {
      importedPrices.set(id, price);
    }
  });

  if (importedPrices.size === 0) {
    throw new Error("没有识别到 a/b/c/d 的有效单价。");
  }

  return importedPrices;
}

function applyImportedPrices(importedPrices) {
  materials = materials.map((material) => ({
    ...material,
    price: importedPrices.get(material.id) ?? material.price,
  }));
  renderRows();
  updateTotals();
  setStatus(`已从 ERP CSV 更新 ${importedPrices.size} 种原料单价。`);
}

rowsEl.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  updateMaterial(input.dataset.id, input.dataset.field, input.value);
});

fileInputEl.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedPrices = parseErpCsv(text);
    applyImportedPrices(importedPrices);
  } catch (error) {
    setStatus(`导入失败：${error.message}`, true);
  } finally {
    fileInputEl.value = "";
  }
});

document.querySelector("#resetPrices").addEventListener("click", () => {
  materials = materials.map((material) => {
    const preset = defaultMaterials.find((item) => item.id === material.id);
    return { ...material, price: preset.price };
  });
  renderRows();
  updateTotals();
  setStatus("已恢复预设单价。");
});

document.querySelector("#clearUsage").addEventListener("click", () => {
  materials = materials.map((material) => ({ ...material, usage: 0 }));
  renderRows();
  updateTotals();
  setStatus("已清空用量，单价保留不变。");
});

document.querySelector("#downloadTemplate").addEventListener("click", () => {
  const csv = ["原料,单价", ...materials.map((item) => `${item.id},${item.price}`)].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "erp-price-template.csv";
  link.click();
  URL.revokeObjectURL(url);
});

renderRows();
updateTotals();
