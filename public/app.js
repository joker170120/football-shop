const productsEl = document.getElementById("products");
const cartEl = document.getElementById("cart");
const orderForm = document.getElementById("orderForm");
const itemsJsonEl = document.getElementById("itemsJson");
const searchEl = document.getElementById("search");
const clearBtn = document.getElementById("clearBtn");
const submitBtn = document.getElementById("submitBtn");
const statusEl = document.getElementById("status");

let products = [];
let cart = []; // [{ productId, quantity, size }]

function money(amount) {
  // Server sends numeric price; we just render as-is with currency symbol in text.
  return String(amount);
}

function cartTotal() {
  let total = 0;
  for (const it of cart) {
    const p = products.find((x) => String(x.id) === String(it.productId));
    if (!p) continue;
    total += (p.price || 0) * (it.quantity || 1);
  }
  return total;
}

function setStatus(msg, variant = "info") {
  statusEl.textContent = msg;
  statusEl.style.color = variant === "error" ? "var(--danger)" : "var(--text)";
}

function renderCart() {
  if (!cart.length) {
    cartEl.innerHTML = '<p class="muted">Ajoutez des produits depuis le catalogue.</p>';
    submitBtn.disabled = true;
    return;
  }

  const total = cartTotal();
  const lines = cart.map((it) => {
    const p = products.find((x) => String(x.id) === String(it.productId));
    if (!p) return "";
    const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
    const sizeSelect = hasSizes
      ? `
        <label class="label" style="margin-top:6px; width:140px;">
          Taille
          <select data-role="size" data-product-id="${p.id}" class="input">
            ${p.sizes.map((s) => `<option value="${s}" ${String(it.size || "") === String(s) ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
      `
      : "";

    return `
      <div class="cartLine">
        <div class="cartLine__left">
          <div class="cartLine__name">${p.name}</div>
          <div class="cartLine__meta">Prix: ${money(p.price)}</div>
          <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
            <label class="label" style="width:120px;">
              Qté
              <input
                class="input"
                type="number"
                min="1"
                step="1"
                data-role="qty"
                data-product-id="${p.id}"
                value="${it.quantity}"
              />
            </label>
            ${sizeSelect}
          </div>
        </div>
        <div class="cartLine__right">
          <div class="cartLine__price">${money((p.price || 0) * (it.quantity || 1))}</div>
          <button class="cartLine__remove" type="button" data-role="remove" data-product-id="${p.id}">
            Retirer
          </button>
        </div>
      </div>
    `;
  }).join("");

  cartEl.innerHTML = `
    <div class="divider"></div>
    ${lines}
    <div class="divider"></div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div class="muted">Total commande</div>
      <div style="font-weight:900; font-size:16px;">${money(total)}</div>
    </div>
  `;

  // Ensure submit enabled
  submitBtn.disabled = false;
  bindCartLineEvents();
  updateItemsJson();
}

function updateItemsJson() {
  itemsJsonEl.value = JSON.stringify(cart);
}

function addToCart(product) {
  const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
  const size = hasSizes ? product.sizes[0] : "";

  const existing = cart.find((x) => String(x.productId) === String(product.id) && String(x.size || "") === String(size || ""));
  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    cart.push({
      productId: product.id,
      quantity: 1,
      size
    });
  }
  renderCart();
}

function removeFromCart(productId) {
  // Remove first matching line; keeps it simple.
  cart = cart.filter((x) => String(x.productId) !== String(productId));
  renderCart();
}

function bindCartLineEvents() {
  const qtyInputs = cartEl.querySelectorAll('input[data-role="qty"]');
  qtyInputs.forEach((el) => {
    el.addEventListener("change", () => {
      const productId = el.getAttribute("data-product-id");
      const qty = Math.max(1, Number(el.value || 1));
      // Update all matching lines for this productId (same behavior as remove).
      for (const it of cart) {
        if (String(it.productId) === String(productId)) it.quantity = qty;
      }
      renderCart();
    });
  });

  const sizeSelects = cartEl.querySelectorAll('select[data-role="size"]');
  sizeSelects.forEach((el) => {
    el.addEventListener("change", () => {
      const productId = el.getAttribute("data-product-id");
      const size = el.value || "";
      // Update the first matching line (same as remove behavior).
      const target = cart.find((x) => String(x.productId) === String(productId));
      if (!target) return;
      target.size = size;
      renderCart();
    });
  });

  const removeBtns = cartEl.querySelectorAll('button[data-role="remove"]');
  removeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const productId = btn.getAttribute("data-product-id");
      removeFromCart(productId);
    });
  });
}

function renderProducts(list) {
  if (!list.length) {
    productsEl.innerHTML = '<p class="empty">Aucun produit trouvé.</p>';
    return;
  }

  productsEl.innerHTML = list
    .map((p) => {
      const sizesBadge = Array.isArray(p.sizes) && p.sizes.length > 0 ? "Taille dispo" : "Sans taille";
      return `
        <article class="product">
          <div class="product__img">
            <img src="${p.imageUrl || `https://via.placeholder.com/600x400?text=${encodeURIComponent(p.name)}`}" alt="${p.name}" />
          </div>
          <div class="product__body">
            <div class="product__title">${p.name}</div>
            <div class="product__desc">${p.description || ""}</div>
            <div class="product__actions">
              <div>
                <div class="product__price">${money(p.price)} ${p.currencySymbol || ""}</div>
                <div class="badge" style="display:inline-block; margin-top:6px;">${sizesBadge}</div>
              </div>
              <button class="btn" type="button" data-role="add" data-product-id="${p.id}">
                Ajouter
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  productsEl.querySelectorAll("button[data-role='add']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const productId = btn.getAttribute("data-product-id");
      const p = products.find((x) => String(x.id) === String(productId));
      if (!p) return;
      addToCart(p);
    });
  });
}

async function fetchProducts() {
  const res = await fetch("/api/products");
  if (!res.ok) throw new Error("Impossible de charger les produits");
  return await res.json();
}

function filterProducts(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return products;
  return products.filter((p) => {
    return (
      String(p.name || "").toLowerCase().includes(q) ||
      String(p.description || "").toLowerCase().includes(q)
    );
  });
}

clearBtn.addEventListener("click", () => {
  cart = [];
  renderCart();
  setStatus("Commande vidée.", "info");
});

searchEl.addEventListener("input", () => {
  renderProducts(filterProducts(searchEl.value));
});

orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!cart.length) return;

  const formData = new FormData(orderForm);
  const customer = {
    name: formData.get("name"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    address: formData.get("address"),
    notes: formData.get("notes")
  };

  const items = cart.map((it) => ({
    productId: it.productId,
    quantity: it.quantity,
    size: it.size || ""
  }));

  submitBtn.disabled = true;
  setStatus("Préparation de la commande...", "info");

  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer,
        items,
        payment: { method: "Airtel Money", afterConfirmation: true }
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Erreur lors de la création de la commande");

    setStatus("Ouverture de WhatsApp…", "info");
    // Redirect to WhatsApp with prefilled order text.
    window.location.href = data.waUrl;
  } catch (err) {
    submitBtn.disabled = false;
    setStatus(err?.message || "Erreur", "error");
  }
});

// Boot
renderCart();
(async () => {
  try {
    products = await fetchProducts();
    renderProducts(products);
  } catch (err) {
    productsEl.innerHTML = `<p class="empty">Erreur: ${err?.message || "impossible de charger les produits"}</p>`;
  }
})();

