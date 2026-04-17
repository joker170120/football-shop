import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  // Load a simple .env file (KEY=VALUE) without external dependencies.
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Optional surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || "0.0.0.0";
const WHATSAPP_SELLER_NUMBER = process.env.WHATSAPP_SELLER_NUMBER || ""; // digits only (no '+')
const SHOP_NAME = process.env.SHOP_NAME || "Ma Boutique";
const CURRENCY = process.env.CURRENCY || "XAF";

const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const productsPath = path.join(dataDir, "products.json");
const ordersPath = path.join(dataDir, "orders.jsonl");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function toWaDigits(input) {
  // WhatsApp wa.me expects digits only, no leading +.
  return String(input).replace(/[^\d]/g, "");
}

function sendJson(res, statusCode, obj) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function getProducts() {
  const raw = fs.readFileSync(productsPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("products.json must be an array");
  return parsed;
}

function sanitizeOrderPayload(payload) {
  const customer = payload?.customer || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    customer: {
      name: String(customer.name || "").trim(),
      phone: String(customer.phone || "").trim(),
      city: String(customer.city || "").trim(),
      address: String(customer.address || "").trim(),
      notes: String(customer.notes || "").trim()
    },
    items: items.map((it) => ({
      productId: String(it?.productId || "").trim(),
      quantity: Number(it?.quantity || 0),
      size: it?.size ? String(it.size) : ""
    })),
    payment: {
      method: String(payload?.payment?.method || "Airtel Money").trim(),
      afterConfirmation: payload?.payment?.afterConfirmation !== false
    }
  };
}

function buildOrderText({ orderId, productsById, order }) {
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
    const p = productsById.get(String(it.productId));
    if (!p) continue;
    const qty = Number.isFinite(it.quantity) && it.quantity > 0 ? it.quantity : 1;
    const sizePart = it.size ? ` (${it.size})` : "";
    lines.push(`- ${p.name}${sizePart} x${qty} = ${p.price * qty} ${CURRENCY}`);
    total += p.price * qty;
  }

  lines.push("");
  lines.push(`Total: ${total} ${CURRENCY}`);
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

function readJsonBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limitBytes) {
        tooLarge = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooLarge) return reject(new Error("Payload trop volumineux"));
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (e) {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

function safeJoinPublic(pathname) {
  // Prevent path traversal.
  const clean = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, clean);
  if (!filePath.startsWith(publicDir)) return null;
  return filePath;
}

function serveStatic(req, res, pathname) {
  const filePath = safeJoinPublic(pathname === "/" ? "/index.html" : pathname);
  if (!filePath) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    // Parse URL.
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname || "/");

    // API routes.
    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/api/products") {
      try {
        const products = getProducts();
        return sendJson(res, 200, products);
      } catch {
        return sendJson(res, 500, { error: "Impossible de lire products.json" });
      }
    }

    if (req.method === "POST" && pathname === "/api/order") {
      const payload = await readJsonBody(req);

      ensureDataDir();
      const products = getProducts();
      const productsById = new Map(products.map((p) => [String(p.id), p]));

      const order = sanitizeOrderPayload(payload);

      if (!order.customer.name || !order.customer.phone || order.items.length === 0) {
        return sendJson(res, 400, {
          error: "Champs requis manquants (nom, téléphone, au moins 1 article)."
        });
      }

      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const text = buildOrderText({ orderId, productsById, order });

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
        return sendJson(res, 500, { error: "WHATSAPP_SELLER_NUMBER manquant dans .env" });
      }

      const waDigits = toWaDigits(WHATSAPP_SELLER_NUMBER);
      const waUrl = `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`;

      return sendJson(res, 200, { ok: true, orderId, waUrl });
    }

    // Static.
    return serveStatic(req, res, pathname);
  } catch (err) {
    return sendJson(res, 500, { error: err?.message || "Erreur serveur" });
  }
});

server.listen(PORT, HOST, () => {
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

