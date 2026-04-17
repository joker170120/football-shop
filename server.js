import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || "0.0.0.0";
const WHATSAPP_SELLER_NUMBER = process.env.WHATSAPP_SELLER_NUMBER || ""; // ex: 2416xxxxxxx (sans +)
const SHOP_NAME = process.env.SHOP_NAME || "Ma Boutique";
const CURRENCY = process.env.CURRENCY || "XAF";

const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const productsPath = path.join(dataDir, "products.json");
const ordersPath = path.join(dataDir, "orders.jsonl");

function toWaDigits(input) {
  // WhatsApp wa.me expects digits only, no leading +.
  return String(input).replace(/[^\d]/g, "");
}

function getProducts() {
  const raw = fs.readFileSync(productsPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("products.json must be an array");
  return parsed;
}

function sanitizeOrderPayload(payload) {
  // Minimal validation, enough to build a reliable message to WhatsApp.
  const customer = payload.customer || {};
  const items = payload.items || [];

  return {
    customer: {
      name: String(customer.name || "").trim(),
      phone: String(customer.phone || "").trim(),
      city: String(customer.city || "").trim(),
      address: String(customer.address || "").trim(),
      notes: String(customer.notes || "").trim()
    },
    items: items.map((it) => ({
      productId: String(it.productId || "").trim(),
      quantity: Number(it.quantity || 0),
      size: it.size ? String(it.size) : ""
    })),
    payment: {
      method: String(payload.payment?.method || "Airtel Money").trim(),
      afterConfirmation: payload.payment?.afterConfirmation !== false
    }
  };
}

function buildOrderText({ orderId, currency, productsById, order }) {
  const lines = [];
  lines.push(`Bonjour, je viens de passer une commande sur ${SHOP_NAME}.`);
  lines.push(`Commande ID: ${orderId}`);
  lines.push("");

  lines.push("Client:");
  lines.push(`- Nom: ${order.customer.name || "-"}`);
  lines.push(`- Téléphone: ${order.customer.phone || "-"}`);
  lines.push(`- Ville: ${order.customer.city || "-"}`);
  if (order.customer.address) lines.push(`- Adresse: ${order.customer.address}`);
  if (order.customer.notes) lines.push(`- Notes: ${order.customer.notes}`);
  lines.push("");

  lines.push("Articles:");

  let total = 0;
  for (const it of order.items) {
    const p = productsById.get(it.productId);
    if (!p) continue;
    const qty = Number.isFinite(it.quantity) && it.quantity > 0 ? it.quantity : 1;
    const sizePart = it.size ? ` (${it.size})` : "";
    lines.push(`- ${p.name}${sizePart} x${qty} = ${p.price * qty} ${currency}`);
    total += p.price * qty;
  }

  lines.push("");
  lines.push(`Total: ${total} ${currency}`);
  lines.push("");

  if (order.payment.afterConfirmation) {
    lines.push("Paiement:");
    lines.push(`- Méthode: ${order.payment.method}`);
    lines.push("- Paiement après confirmation (je te réponds avec le numéro Airtel Money et le montant).");
  } else {
    lines.push("Paiement:");
    lines.push(`- Méthode: ${order.payment.method}`);
  }

  return lines.join("\n");
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/products", (_req, res) => {
  try {
    const products = getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Impossible de lire products.json" });
  }
});

app.post("/api/order", (req, res) => {
  try {
    ensureDataDir();
    const products = getProducts();
    const productsById = new Map(products.map((p) => [String(p.id), p]));

    const order = sanitizeOrderPayload(req.body);

    if (!order.customer.name || !order.customer.phone || order.items.length === 0) {
      return res.status(400).json({ error: "Champs requis manquants (nom, téléphone, au moins 1 article)." });
    }

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const text = buildOrderText({
      orderId,
      currency: CURRENCY,
      productsById,
      order
    });

    // Store order for your records (JSONL).
    const record = {
      orderId,
      createdAt: new Date().toISOString(),
      shop: SHOP_NAME,
      customer: order.customer,
      items: order.items,
      payment: order.payment
    };
    fs.appendFileSync(ordersPath, `${JSON.stringify(record)}\n`, "utf8");

    if (!WHATSAPP_SELLER_NUMBER) {
      return res.status(500).json({
        error: "WHATSAPP_SELLER_NUMBER manquant dans .env"
      });
    }

    const waDigits = toWaDigits(WHATSAPP_SELLER_NUMBER);
    const waUrl = `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`;

    res.json({
      ok: true,
      orderId,
      waUrl
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});

app.listen(PORT, HOST, () => {
  const interfaces = os.networkInterfaces();
  let lanIp = "";
  for (const group of Object.values(interfaces)) {
    for (const item of group || []) {
      if (item && item.family === "IPv4" && !item.internal) {
        lanIp = item.address;
        break;
      }
    }
    if (lanIp) break;
  }

  // eslint-disable-next-line no-console
  console.log(`football-shop running on http://localhost:${PORT}`);
  if (lanIp) {
    // eslint-disable-next-line no-console
    console.log(`LAN access: http://${lanIp}:${PORT}`);
  }
});

