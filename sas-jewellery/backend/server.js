// SAS Jewellery - backend (Node.js + MongoDB via Mongoose)
require('dotenv').config();
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sas_jewellery';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PURITY = { '24K': 1, '22K': 0.916, '18K': 0.75 };
const GST = 0.03;

// ---------- password hashing ----------
const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const verify = (pw, stored) => {
  const [s, h] = String(stored || '').split(':');
  if (!s || !h) return false;
  const c = hash(pw, s).split(':')[1];
  return c.length === h.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(h));
};

// ---------- MongoDB models ----------
const { Schema } = mongoose;
const opts = { versionKey: false };
const Counter = mongoose.model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }, opts));
const Setting = mongoose.model('Setting', new Schema({ _id: String, value: Schema.Types.Mixed }, opts));
const User = mongoose.model('User', new Schema({
  id: { type: Number, unique: true, index: true },
  name: String,
  email: { type: String, unique: true, lowercase: true, trim: true },
  username: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  phone: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'customer'], default: 'customer' },
  password: String
}, opts));
const Product = mongoose.model('Product', new Schema({
  id: { type: Number, unique: true, index: true },
  name: String, category: String, karat: String,
  weight: Number, making: Number, stock: Number,
  image: { type: String, default: '' }, desc: { type: String, default: '' }
}, opts));
const Order = mongoose.model('Order', new Schema({
  id: { type: String, unique: true, index: true },
  userId: Number, userName: String,
  items: [Schema.Types.Mixed], total: Number, address: Schema.Types.Mixed,
  payment: String, paymentStatus: String, status: String,
  createdAt: { type: Date, default: Date.now }, history: [Schema.Types.Mixed]
}, opts));
const Message = mongoose.model('Message', new Schema({
  id: { type: Number, unique: true, index: true },
  name: String, email: String, message: String,
  createdAt: { type: Date, default: Date.now }, read: { type: Boolean, default: false }
}, opts));

async function nextId(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}
const clean = d => { if (!d) return d; const { _id, ...rest } = d; return rest; };

// ---------- seed data ----------
const P = (name, category, karat, weight, making, stock, image, desc) => ({ name, category, karat, weight, making, stock, image: 'images/products/' + image, desc });
const SEED_PRODUCTS = [
  P('Classic Solitaire Band', 'Rings', '22K', 4.5, 10, 15, 'solitaire-band.jpg', 'Timeless plain gold band with a mirror finish.'),
  P('Royal Temple Necklace', 'Necklaces', '22K', 32, 12, 4, 'temple-necklace.jpg', 'Handcrafted temple-style necklace with antique polish.'),
  P('Peacock Jhumka', 'Earrings', '22K', 9.2, 14, 10, 'peacock-jhumka.jpg', 'Traditional jhumka earrings with peacock motifs.'),
  P('Kasu Mala', 'Necklaces', '22K', 45, 11, 3, 'kasu-mala.jpg', 'Classic coin-style long mala, a bridal favourite.'),
  P('Plain Gold Bangle', 'Bangles', '22K', 16, 8, 12, 'gold-bangle.jpg', 'Smooth everyday bangle, light and durable.'),
  P('Rope Chain 20"', 'Chains', '22K', 12, 7, 20, 'rope-chain.jpg', 'Strong rope-pattern chain, 20 inch length.'),
  P('Gold Coin 10g', 'Coins', '24K', 10, 3, 30, 'gold-coin-10g.jpg', '999 purity investment coin with certificate.'),
  P('Minimal Stud Pair', 'Earrings', '18K', 2.1, 15, 25, 'stud-pair.jpg', 'Light daily-wear studs in 18K gold.'),
  P('Bridal Choker Set', 'Necklaces', '22K', 58, 13, 2, 'bridal-choker.jpg', 'Statement choker with matching earrings.'),
  P("Men's Kada", 'Bangles', '22K', 28, 9, 6, 'mens-kada.jpg', 'Bold gents kada with a brushed finish.'),
  P('Couple Ring Pair', 'Rings', '18K', 6, 12, 14, 'couple-rings.jpg', 'Matching pair of 18K engagement rings.'),
  P('Gold Coin 5g', 'Coins', '24K', 5, 3, 40, 'gold-coin-5g.jpg', '999 purity 5 gram coin, ideal for gifting.')
];

let rate = { rate24: 12000, updatedAt: new Date().toISOString() };
let SECRET = process.env.JWT_SECRET || '';

async function initData() {
  // signing secret
  if (!SECRET) {
    const s = await Setting.findById('secret').lean();
    if (s) SECRET = s.value;
    else { SECRET = crypto.randomBytes(32).toString('hex'); await Setting.create({ _id: 'secret', value: SECRET }); }
  }
  // gold rate
  const r = await Setting.findById('rate').lean();
  if (r) rate = r.value; else await Setting.create({ _id: 'rate', value: rate });
  // products
  if (await Product.countDocuments() === 0) {
    for (const p of SEED_PRODUCTS) await Product.create({ id: await nextId('product'), ...p });
    console.log('  Seeded 12 sample products into MongoDB');
  }
  // admin account
  const adminUser = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@123';
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    await User.create({ id: await nextId('user'), name: 'Admin', email: 'admin@sasjewellery.com', username: adminUser, phone: '', role: 'admin', password: hash(adminPass) });
    console.log('  Created admin account: ' + adminUser);
  } else {
    // keep the admin login in sync with the .env file
    const upd = {};
    if (admin.username !== adminUser) upd.username = adminUser;
    if (process.env.ADMIN_PASSWORD && !verify(adminPass, admin.password)) upd.password = hash(adminPass);
    if (Object.keys(upd).length) await User.updateOne({ _id: admin._id }, upd);
  }
}

// ---------- helpers ----------
const round = n => Math.round(n);
function price(p) {
  const base = p.weight * rate.rate24 * PURITY[p.karat];
  const making = base * p.making / 100;
  const gst = (base + making) * GST;
  return { base: round(base), making: round(making), gst: round(gst), total: round(base + making + gst) };
}
const withPrice = p => ({ ...clean(p), price: price(p) });
const err = (status, message) => Object.assign(new Error(message), { status });
const sign = payload => {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
};
function readToken(t) {
  if (!t) return null;
  const [b, s] = t.split('.');
  if (!b || !s) return null;
  const ok = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  if (s.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(ok))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, username: u.username || '', phone: u.phone, role: u.role });
const tokenFor = u => sign({ id: u.id, role: u.role, exp: Date.now() + 7 * 864e5 });
const need = (v, label) => { if (v === undefined || v === null || String(v).trim() === '') throw err(400, label + ' is required'); return String(v).trim(); };
const num = (v, label, min = 0) => { const n = Number(v); if (!isFinite(n) || n < min) throw err(400, label + ' is invalid'); return n; };
const rateInfo = () => ({ rate24: rate.rate24, rate22: round(rate.rate24 * PURITY['22K']), rate18: round(rate.rate24 * PURITY['18K']), updatedAt: rate.updatedAt, purity: PURITY });

// ---------- routes ----------
const routes = [];
const route = (m, p, auth, fn) => routes.push({ m, auth, fn, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });

route('GET', '/api/health', null, () => ({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
route('GET', '/api/rate', null, () => rateInfo());
route('PUT', '/api/rate', 'admin', async ({ body }) => {
  rate = { rate24: num(body.rate24, 'Rate', 1), updatedAt: new Date().toISOString() };
  await Setting.updateOne({ _id: 'rate' }, { value: rate }, { upsert: true });
  return rateInfo();
});

route('GET', '/api/products', null, async ({ query }) => {
  const filter = {};
  if (query.category && query.category !== 'All') filter.category = query.category;
  let list = (await Product.find(filter).sort({ id: 1 }).lean()).map(withPrice);
  const q = (query.q || '').toLowerCase();
  if (q) list = list.filter(p => (p.name + ' ' + p.category + ' ' + p.karat + ' ' + p.desc).toLowerCase().includes(q));
  const s = query.sort;
  if (s === 'low') list.sort((a, b) => a.price.total - b.price.total);
  else if (s === 'high') list.sort((a, b) => b.price.total - a.price.total);
  else if (s === 'weight') list.sort((a, b) => b.weight - a.weight);
  return list;
});
route('GET', '/api/products/:id', null, async ({ params }) => {
  const p = await Product.findOne({ id: +params.id }).lean();
  if (!p) throw err(404, 'Product not found');
  return withPrice(p);
});
function productFields(b, existing = {}) {
  const karat = need(b.karat ?? existing.karat, 'Karat');
  if (!PURITY[karat]) throw err(400, 'Karat must be 24K, 22K or 18K');
  return {
    name: need(b.name ?? existing.name, 'Name'), category: need(b.category ?? existing.category, 'Category'), karat,
    weight: num(b.weight ?? existing.weight, 'Weight', 0.1), making: num(b.making ?? existing.making, 'Making charge'),
    stock: Math.floor(num(b.stock ?? existing.stock, 'Stock')), image: String(b.image ?? existing.image ?? '').trim(), desc: String(b.desc ?? existing.desc ?? '')
  };
}
route('POST', '/api/products', 'admin', async ({ body }) => {
  const p = await Product.create({ id: await nextId('product'), ...productFields(body) });
  return withPrice(p.toObject());
});
route('PUT', '/api/products/:id', 'admin', async ({ params, body }) => {
  const old = await Product.findOne({ id: +params.id }).lean();
  if (!old) throw err(404, 'Product not found');
  const p = await Product.findOneAndUpdate({ id: old.id }, productFields(body, old), { new: true }).lean();
  return withPrice(p);
});
route('DELETE', '/api/products/:id', 'admin', async ({ params }) => {
  const r = await Product.deleteOne({ id: +params.id });
  if (!r.deletedCount) throw err(404, 'Product not found');
  return { ok: true };
});

// image upload (admin) - saved to backend/uploads and served at /uploads/<file>
route('POST', '/api/uploads', 'admin', async ({ body }) => {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(String(body.data || ''));
  if (!m) throw err(400, 'Please choose a JPG, PNG or WEBP image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw err(400, 'Image must be smaller than 5 MB');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = crypto.randomBytes(10).toString('hex') + (m[1] === 'jpeg' ? '.jpg' : '.' + m[1]);
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return { path: '/uploads/' + file };
});

// auth
route('POST', '/api/auth/register', null, async ({ body }) => {
  const name = need(body.name, 'Name'), email = need(body.email, 'Email').toLowerCase(), pw = need(body.password, 'Password');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw err(400, 'Enter a valid email');
  if (pw.length < 6) throw err(400, 'Password must be at least 6 characters');
  if (await User.exists({ email })) throw err(409, 'Email already registered');
  const u = (await User.create({ id: await nextId('user'), name, email, phone: String(body.phone || ''), role: 'customer', password: hash(pw) })).toObject();
  return { token: tokenFor(u), user: safeUser(u) };
});
const findLogin = id => User.findOne({ $or: [{ email: id }, { username: id }] }).lean();
route('POST', '/api/auth/login', null, async ({ body }) => {
  const id = need(body.email ?? body.identifier ?? body.username, 'Email').toLowerCase();
  const u = await findLogin(id);
  if (!u || !verify(String(body.password || ''), u.password)) throw err(401, 'Invalid email or password');
  return { token: tokenFor(u), user: safeUser(u) };
});
route('POST', '/api/auth/admin-login', null, async ({ body }) => {
  const id = need(body.username, 'Username').toLowerCase();
  const u = await findLogin(id);
  if (!u || u.role !== 'admin' || !verify(String(body.password || ''), u.password)) throw err(401, 'Invalid username or password');
  return { token: tokenFor(u), user: safeUser(u) };
});
route('GET', '/api/auth/me', 'user', ({ user }) => ({ user: safeUser(user) }));

// orders
async function restock(items) { for (const l of items) await Product.updateOne({ id: l.productId }, { $inc: { stock: l.qty } }); }
route('POST', '/api/orders', 'user', async ({ user, body }) => {
  if (!Array.isArray(body.items) || !body.items.length) throw err(400, 'Your cart is empty');
  const a = body.address || {};
  const address = { name: need(a.name, 'Name'), phone: need(a.phone, 'Phone'), line: need(a.line, 'Address'), city: need(a.city, 'City'), pincode: need(a.pincode, 'Pincode') };
  if (!/^\d{10}$/.test(address.phone)) throw err(400, 'Phone must be 10 digits');
  if (!/^\d{6}$/.test(address.pincode)) throw err(400, 'Pincode must be 6 digits');
  const payment = ['COD', 'UPI', 'Card'].includes(body.payment) ? body.payment : 'COD';
  const lines = [], taken = [];
  try {
    for (const it of body.items) {
      const qty = Math.floor(Number(it.qty));
      if (!(qty >= 1)) throw err(400, 'Invalid quantity');
      const exists = await Product.findOne({ id: +it.id }).lean();
      if (!exists) throw err(400, 'A product in your cart no longer exists');
      // atomic stock decrement: only succeeds if enough stock is left
      const p = await Product.findOneAndUpdate({ id: exists.id, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { new: true }).lean();
      if (!p) throw err(400, `Only ${exists.stock} left of "${exists.name}"`);
      taken.push({ productId: p.id, qty });
      lines.push({ productId: p.id, name: p.name, image: p.image, karat: p.karat, weight: p.weight, qty, unit: price(p).total });
    }
  } catch (e) { await restock(taken); throw e; }
  const total = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const now = new Date();
  const order = await Order.create({
    id: 'SAS' + (1000 + await nextId('order')), userId: user.id, userName: user.name, items: lines, total, address, payment,
    paymentStatus: payment === 'COD' ? 'Pay on delivery' : 'Paid (demo)', status: 'Placed', createdAt: now, history: [{ status: 'Placed', at: now.toISOString() }]
  });
  return clean(order.toObject());
});
route('GET', '/api/orders', 'user', async ({ user, query }) => {
  const filter = user.role === 'admin' && query.all ? {} : { userId: user.id };
  return (await Order.find(filter).sort({ createdAt: -1 }).lean()).map(clean);
});
const setStatus = (id, status) => Order.findOneAndUpdate({ id }, { $set: { status }, $push: { history: { status, at: new Date().toISOString() } } }, { new: true }).lean();
route('POST', '/api/orders/:id/cancel', 'user', async ({ user, params }) => {
  const o = await Order.findOne({ id: params.id }).lean();
  if (!o || (o.userId !== user.id && user.role !== 'admin')) throw err(404, 'Order not found');
  if (!['Placed', 'Confirmed'].includes(o.status)) throw err(400, 'This order can no longer be cancelled');
  await restock(o.items);
  return clean(await setStatus(o.id, 'Cancelled'));
});
route('PATCH', '/api/orders/:id', 'admin', async ({ params, body }) => {
  const o = await Order.findOne({ id: params.id }).lean();
  if (!o) throw err(404, 'Order not found');
  if (!['Placed', 'Confirmed', 'Shipped', 'Delivered'].includes(body.status)) throw err(400, 'Invalid status');
  if (o.status === 'Cancelled') throw err(400, 'Cancelled orders cannot be changed');
  return clean(await setStatus(o.id, body.status));
});

// contact + admin
route('POST', '/api/contact', null, async ({ body }) => {
  const m = { name: need(body.name, 'Name'), email: need(body.email, 'Email'), message: need(body.message, 'Message') };
  if (!/^\S+@\S+\.\S+$/.test(m.email)) throw err(400, 'Enter a valid email');
  await Message.create({ id: await nextId('message'), ...m });
  return { ok: true };
});
route('GET', '/api/admin/messages', 'admin', async () => (await Message.find().sort({ createdAt: -1 }).lean()).map(clean));
route('PATCH', '/api/admin/messages/:id', 'admin', async ({ params }) => {
  const m = await Message.findOneAndUpdate({ id: +params.id }, { read: true }, { new: true }).lean();
  if (!m) throw err(404, 'Message not found');
  return clean(m);
});
route('DELETE', '/api/admin/messages/:id', 'admin', async ({ params }) => { await Message.deleteOne({ id: +params.id }); return { ok: true }; });
route('GET', '/api/admin/stats', 'admin', async () => {
  const [live, orders, pending, customers, products, low, unread] = await Promise.all([
    Order.find({ status: { $ne: 'Cancelled' } }, 'total').lean(), Order.countDocuments(), Order.countDocuments({ status: { $in: ['Placed', 'Confirmed'] } }),
    User.countDocuments({ role: 'customer' }), Product.countDocuments(), Product.find({ stock: { $lte: 3 } }, 'id name stock').lean(), Message.countDocuments({ read: false })
  ]);
  return { revenue: live.reduce((s, o) => s + o.total, 0), orders, pending, customers, products, lowStock: low.map(clean), unread };
});

// ---------- server ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
const IMG = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS });
  res.end(JSON.stringify(data));
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > limit) { reject(err(413, 'Request too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(err(400, 'Invalid JSON')); } });
  });
}
async function handleApi(req, res, url) {
  try {
    const r = routes.find(x => x.m === req.method && x.re.test(url.pathname));
    if (!r) throw err(404, 'Not found');
    const params = url.pathname.match(r.re).groups || {};
    let user = null;
    if (r.auth) {
      const t = readToken((req.headers.authorization || '').replace('Bearer ', ''));
      user = t && await User.findOne({ id: t.id }).lean();
      if (!user) throw err(401, 'Please log in');
      if (r.auth === 'admin' && user.role !== 'admin') throw err(403, 'Admin access only');
    }
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req, url.pathname === '/api/uploads' ? 8e6 : 1e6) : {};
    send(res, 200, await r.fn({ req, params, query: Object.fromEntries(url.searchParams), body, user }));
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
}
function serveUpload(res, name) {
  const f = path.join(UPLOAD_DIR, path.basename(name));
  if (!fs.existsSync(f) || !IMG[path.extname(f)]) { res.writeHead(404, CORS); return res.end(); }
  res.writeHead(200, { 'Content-Type': IMG[path.extname(f)], 'Cache-Control': 'public, max-age=86400', ...CORS });
  fs.createReadStream(f).pipe(res);
}

async function start() {
  console.log('\n  Connecting to MongoDB…');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    console.error('\n  ✖ Could not connect to MongoDB at ' + MONGO_URI.replace(/\/\/[^@]*@/, '//***@'));
    console.error('    ' + e.message);
    console.error('\n  Fix: start MongoDB (local) or put your Atlas connection string in backend/.env as MONGODB_URI\n');
    process.exit(1);
  }
  console.log('  ✔ MongoDB connected (database: ' + mongoose.connection.name + ')');
  await initData();
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) return serveUpload(res, decodeURIComponent(url.pathname.slice(9)));
    send(res, 200, { name: 'SAS Jewellery API', status: 'running' });
  }).listen(PORT, () => console.log(`\n  Backend API running at http://localhost:${PORT}\n  Admin login page: http://localhost:3000/#/admin-login\n`));
}
start();
