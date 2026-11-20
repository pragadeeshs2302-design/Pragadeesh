// SAS Jewellery - front end (vanilla JS single page app)
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const S = { token: localStorage.getItem('sas_token'), user: null, rate: null, products: [], cart: load('sas_cart', []), wish: load('sas_wish', []), cat: 'All', q: '', sort: 'featured', tab: 'dashboard' };
const CATS = ['All', 'Rings', 'Necklaces', 'Earrings', 'Bangles', 'Chains', 'Coins'];

// ---------- product images (real photos; elegant placeholder if a photo is missing) ----------
const imgUrl = p => {
  const i = String((p && p.image) || '').trim();
  if (!i) return '';
  if (/^(https?:|data:)/i.test(i)) return i;
  if (i.startsWith('/uploads/')) return (window.API_URL || '') + i;
  return i;
};
const noImg = cat => `<div class="noimg"><b>SAS</b><span>${esc(cat || 'Jewellery')}</span></div>`;
const picHtml = p => imgUrl(p) ? `<img src="${esc(imgUrl(p))}" alt="${esc(p.name)}" loading="lazy" onerror="imgFail(this)" data-cat="${esc(p.category)}">` : noImg(p.category);
window.imgFail = el => { el.outerHTML = noImg(el.dataset.cat); };

async function api(path, method = 'GET', body) {
  const r = await fetch((window.API_URL || '') + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && S.token && !path.startsWith('/auth/') ) { logout(true); }
    throw new Error(d.error || 'Something went wrong');
  }
  return d;
}
function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
}
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
const saveCart = () => { localStorage.setItem('sas_cart', JSON.stringify(S.cart)); renderMenu(); };
const saveWish = () => { localStorage.setItem('sas_wish', JSON.stringify(S.wish)); renderMenu(); };
const prod = id => S.products.find(p => p.id === +id);
const cartCount = () => S.cart.reduce((s, i) => s + i.qty, 0);

// ---------- modal ----------
function modal(html) { $('#modal').innerHTML = `<div class="box"><button class="x" onclick="closeModal()">×</button>${html}</div>`; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// ---------- data ----------
async function loadProducts() { S.products = await api('/products'); }
function tickerHtml() {
  const r = S.rate; if (!r) return 'Loading live gold rate…';
  return `<i class="dot"></i>LIVE GOLD RATE per gram: &nbsp;24K <b>${inr(r.rate24)}</b> &nbsp;|&nbsp; 22K <b>${inr(r.rate22)}</b> &nbsp;|&nbsp; 18K <b>${inr(r.rate18)}</b> &nbsp;·&nbsp; updated ${new Date(r.updatedAt).toLocaleTimeString()}`;
}
async function pollRate() {
  try {
    const r = await api('/rate');
    const changed = !S.rate || S.rate.updatedAt !== r.updatedAt;
    S.rate = r; $('#ticker').innerHTML = tickerHtml();
    if (changed) { await loadProducts(); if (['', 'wishlist', 'cart', 'calculator'].includes(route().name)) render(); }
  } catch { /* server offline, retry next tick */ }
}

// ---------- auth ----------
async function loadUser() {
  if (!S.token) return;
  try { S.user = (await api('/auth/me')).user; } catch { S.user = null; }
}
function setAuth(d) { S.token = d.token; S.user = d.user; localStorage.setItem('sas_token', d.token); renderMenu(); }
function logout(silent) {
  S.token = null; S.user = null; localStorage.removeItem('sas_token'); renderMenu();
  if (!silent) toast('Logged out'); location.hash = '#/';
}
window.logout = logout;

// ---------- routing ----------
function route() { const [name = '', arg] = location.hash.replace(/^#\/?/, '').split('/'); return { name, arg }; }
function renderMenu() {
  const n = route().name, a = (h, t) => `<a href="#/${h}" class="${n === h ? 'on' : ''}">${t}</a>`;
  $('#menu').innerHTML = a('', 'Shop') + a('calculator', 'Calculator') + a('wishlist', `Wishlist${S.wish.length ? `<span class="badge">${S.wish.length}</span>` : ''}`) +
    a('cart', `Cart${cartCount() ? `<span class="badge">${cartCount()}</span>` : ''}`) + a('contact', 'Contact') +
    (S.user ? (S.user.role === 'admin' ? a('admin', 'Admin') : a('orders', 'My Orders')) + `<button onclick="logout()">Logout (${esc(S.user.name.split(' ')[0])})</button>` : a('login', 'Login / Sign up') + a('admin-login', 'Admin'));
}
function render() {
  renderMenu();
  const { name, arg } = route();
  document.body.classList.toggle('bare', name === 'admin-login');
  const views = { '': shopView, wishlist: wishView, cart: cartView, checkout: checkoutView, login: loginView, orders: ordersView, calculator: calcView, contact: contactView, admin: adminView, 'admin-login': adminLoginView };
  Promise.resolve((views[name] || shopView)(arg)).then(h => { if (h !== undefined) $('#app').innerHTML = h; }).catch(e => toast(e.message, true));
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

// ---------- shop ----------
function cardHtml(p) {
  const wished = S.wish.includes(p.id);
  return `<div class="card"><div class="pic" onclick="showProduct(${p.id})"><button class="heart" onclick="event.stopPropagation();toggleWish(${p.id})" title="Wishlist" aria-label="Wishlist">${wished ? '♥' : '♡'}</button>${picHtml(p)}</div>
  <div class="info"><b>${esc(p.name)}</b><div class="meta"><span class="tag">${p.karat}</span><span class="tag">${p.weight} g</span><span class="tag">${esc(p.category)}</span></div>
  <div class="price">${inr(p.price.total)}</div>
  ${p.stock <= 0 ? '<div class="low">Out of stock</div>' : p.stock <= 3 ? `<div class="low">Only ${p.stock} left</div>` : ''}
  <div class="row"><button class="btn alt small" onclick="showProduct(${p.id})">Details</button><button class="btn small" ${p.stock <= 0 ? 'disabled' : ''} onclick="addToCart(${p.id})">Add to cart</button></div></div></div>`;
}
function filtered() {
  let l = S.products.filter(p => (S.cat === 'All' || p.category === S.cat) && (p.name + p.category + p.karat).toLowerCase().includes(S.q.toLowerCase()));
  if (S.sort === 'low') l.sort((a, b) => a.price.total - b.price.total);
  if (S.sort === 'high') l.sort((a, b) => b.price.total - a.price.total);
  if (S.sort === 'weight') l.sort((a, b) => b.weight - a.weight);
  return l;
}
function shopView() {
  setTimeout(() => { const i = $('#q'); if (i) { i.value = S.q; $('#sort').value = S.sort; } }, 0);
  return `<div class="hero"><h1>Pure gold,<br><em>priced live.</em></h1><p>Every price is calculated from today's gold rate, purity, weight and making charges — no hidden costs. BIS hallmarked, insured delivery, 7-day cancellation.</p><div class="rule"></div></div>
  <div class="chips">${CATS.map(c => `<button class="chip ${S.cat === c ? 'on' : ''}" onclick="setCat('${c}')">${c}</button>`).join('')}</div>
  <div class="toolbar"><input id="q" placeholder="Search rings, 22K, necklace…" oninput="setQ(this.value)">
  <select id="sort" onchange="S.sort=this.value;refreshGrid()"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="weight">Heaviest first</option></select></div>
  <div class="grid" id="grid">${gridHtml()}</div>`;
}
const gridHtml = () => filtered().map(cardHtml).join('') || '<div class="empty">No jewellery matches your search.</div>';
const refreshGrid = () => { $('#grid').innerHTML = gridHtml(); };
window.setQ = v => { S.q = v; refreshGrid(); };
window.setCat = c => { S.cat = c; render(); };
window.refreshGrid = refreshGrid; window.S = S;
window.toggleWish = id => { S.wish = S.wish.includes(id) ? S.wish.filter(x => x !== id) : [...S.wish, id]; saveWish(); const n = route().name; if (n === '') refreshGrid(); else if (n === 'wishlist') render(); if (!$('#modal').classList.contains('hidden')) showProduct(id); };
window.addToCart = id => {
  const p = prod(id), it = S.cart.find(i => i.id === id);
  if (!p || p.stock <= (it ? it.qty : 0)) return toast('No more stock available', true);
  it ? it.qty++ : S.cart.push({ id, qty: 1 }); saveCart(); toast(`${p.name} added to cart`);
};
window.showProduct = id => {
  const p = prod(id); if (!p) return;
  modal(`<div class="big">${picHtml(p)}</div><h2>${esc(p.name)}</h2><p>${esc(p.desc)}</p>
  <div class="bd"><div><span>Gold (${p.weight} g × ${p.karat})</span><span>${inr(p.price.base)}</span></div><div><span>Making charges (${p.making}%)</span><span>${inr(p.price.making)}</span></div><div><span>GST (3%)</span><span>${inr(p.price.gst)}</span></div><div><b>Total</b><b>${inr(p.price.total)}</b></div></div>
  <p class="meta">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</p>
  <div class="row"><button class="btn alt" onclick="toggleWish(${p.id})">${S.wish.includes(p.id) ? 'Remove from wishlist' : 'Add to wishlist'}</button><button class="btn" ${p.stock <= 0 ? 'disabled' : ''} onclick="addToCart(${p.id});closeModal()">Add to cart</button></div>`);
};
function wishView() {
  const l = S.products.filter(p => S.wish.includes(p.id));
  return `<h2>My Wishlist</h2>` + (l.length ? `<div class="grid">${l.map(cardHtml).join('')}</div>` : '<div class="empty">Nothing saved yet. Tap the heart on any piece.</div>');
}

// ---------- cart & checkout ----------
function cartLines() { return S.cart.map(i => ({ ...i, p: prod(i.id) })).filter(i => i.p); }
function cartView() {
  S.cart = cartLines().map(({ id, qty }) => ({ id, qty })); localStorage.setItem('sas_cart', JSON.stringify(S.cart));
  const l = cartLines();
  if (!l.length) return '<h2>Your Cart</h2><div class="empty">Your cart is empty. <a href="#/" class="gold-link">Browse jewellery</a></div>';
  const total = l.reduce((s, i) => s + i.p.price.total * i.qty, 0);
  return `<h2>Your Cart</h2><div class="panel">${l.map(i => `<div class="cartrow"><div class="ic">${picHtml(i.p)}</div><div class="nm"><b>${esc(i.p.name)}</b><div class="meta">${i.p.karat} · ${i.p.weight} g · ${inr(i.p.price.total)} each</div></div>
  <div class="qty"><button onclick="chg(${i.id},-1)">−</button><b>${i.qty}</b><button onclick="chg(${i.id},1)">+</button></div><b>${inr(i.p.price.total * i.qty)}</b><button class="btn danger small" onclick="rmCart(${i.id})">Remove</button></div>`).join('')}
  <div class="total">Total: ${inr(total)}</div><p class="meta" style="text-align:right">Prices follow today's live gold rate and are re-verified at checkout.</p>
  <div style="text-align:right"><button class="btn alt" onclick="clearCart()">Clear cart</button> <button class="btn" onclick="location.hash='#/checkout'">Proceed to checkout</button></div></div>`;
}
window.chg = (id, d) => { const it = S.cart.find(i => i.id === id), p = prod(id); if (!it) return; if (d > 0 && it.qty >= p.stock) return toast('Max stock reached', true); it.qty += d; if (it.qty < 1) S.cart = S.cart.filter(i => i.id !== id); saveCart(); render(); };
window.rmCart = id => { S.cart = S.cart.filter(i => i.id !== id); saveCart(); render(); };
window.clearCart = () => { S.cart = []; saveCart(); render(); };
function checkoutView() {
  if (!S.user) { toast('Please log in to checkout', true); location.hash = '#/login'; return; }
  const l = cartLines(); if (!l.length) { location.hash = '#/cart'; return; }
  const total = l.reduce((s, i) => s + i.p.price.total * i.qty, 0);
  return `<h2>Checkout</h2><form class="panel" onsubmit="placeOrder(event)"><div class="two"><div><label>Full name</label><input name="name" required value="${esc(S.user.name)}"></div><div><label>Phone (10 digits)</label><input name="phone" required pattern="\\d{10}" value="${esc(S.user.phone)}"></div></div>
  <label>Address</label><textarea name="line" rows="2" required></textarea><div class="two"><div><label>City</label><input name="city" required></div><div><label>Pincode (6 digits)</label><input name="pincode" required pattern="\\d{6}"></div></div>
  <label>Payment method</label><select name="payment" onchange="payChg(this.value)"><option value="COD">Cash on delivery</option><option value="UPI">UPI (demo)</option><option value="Card">Card (demo)</option></select>
  <div id="upiBox" class="upi-box hidden"><img src="images/payment-qr.svg" alt="Demo UPI QR code" width="190" height="190"><div><b>Scan &amp; pay (demo)</b><p class="meta">Scan this QR with any UPI app (GPay, PhonePe, Paytm) to pay <b>${inr(total)}</b>.<br>This is a dummy QR &mdash; no real money is taken. Then click "Place order".</p></div></div>
  <p class="meta">${l.length} item(s) · <b>Total ${inr(total)}</b> · Demo site: no real payment is taken.</p><button class="btn" id="pob">Place order</button></form>`;
}
window.payChg = v => { const b = document.getElementById('upiBox'); if (b) b.classList.toggle('hidden', v !== 'UPI'); };
window.placeOrder = guard(async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); $('#pob').disabled = true;
  try {
    const o = await api('/orders', 'POST', { items: S.cart, payment: f.payment, address: { name: f.name, phone: f.phone, line: f.line, city: f.city, pincode: f.pincode } });
    S.cart = []; saveCart(); await loadProducts(); toast(`Order ${o.id} placed!`); location.hash = '#/orders';
  } catch (er) { $('#pob').disabled = false; throw er; }
});

// ---------- login ----------
let signup = false;
function loginView() {
  if (S.user) { location.hash = '#/'; return; }
  return `<div class="panel" style="max-width:420px;margin:auto"><h2>${signup ? 'Create account' : 'Welcome back'}</h2><form onsubmit="doAuth(event)">
  ${signup ? '<label>Name</label><input name="name" required><label>Phone</label><input name="phone">' : ''}<label>Email</label><input name="email" type="email" required><label>Password</label><input name="password" type="password" required minlength="6">
  <p><button class="btn" style="width:100%">${signup ? 'Sign up' : 'Log in'}</button></p></form>
  <p class="meta">${signup ? 'Have an account?' : 'New here?'} <a href="#/login" onclick="signup=!signup;render();return false" class="gold-link">${signup ? 'Log in' : 'Create account'}</a></p>
  <p class="meta">Store owner? <a href="#/admin-login" class="gold-link">Admin login</a></p></div>`;
}
window.toggleSignup = () => { signup = !signup; render(); };
window.doAuth = guard(async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  setAuth(await api(signup ? '/auth/register' : '/auth/login', 'POST', f)); toast('Welcome, ' + S.user.name + '!');
  location.hash = S.cart.length ? '#/cart' : (S.user.role === 'admin' ? '#/admin' : '#/');
});

// ---------- admin login (screenshot design) ----------
function adminLoginView() {
  if (S.user && S.user.role === 'admin') { location.hash = '#/admin'; return; }
  return `<section class="adm">
  <div class="adm-left">
    <img class="logo" src="images/logo.png" alt="SAS Jewellery - Jewellery Management">
    <div class="eyebrow">Premium Business Management</div>
    <h1>Manage Your<br>Gold Business<br><span>With Excellence.</span></h1>
    <p>A smarter way to manage jewellery inventory, customers, sales and business operations.</p>
    <div class="rule"></div>
    <div class="trust">Trust · Quality · Excellence</div>
  </div>
  <div class="adm-right">
    <div class="eyebrow">Welcome Back</div>
    <h2>Admin Login</h2>
    <p class="sub">Sign in to access your jewellery management system.</p>
    <form onsubmit="doAdminAuth(event)" autocomplete="on">
      <label for="au">Username</label>
      <input id="au" name="username" autocomplete="username" required>
      <label for="ap">Password</label>
      <div class="pw"><input id="ap" name="password" type="password" autocomplete="current-password" required><button type="button" id="apt" onclick="togglePw()">SHOW</button></div>
      <button class="btn signin" id="asb">SIGN IN &nbsp;→</button>
      <p class="adm-note" id="admsg" role="status">Enter your admin credentials to continue.</p>
    </form>
    <div class="secure">Secure Admin Access</div>
    <div class="back"><a href="#/" class="gold-link">← Back to store</a></div>
    <div class="copy">© 2026 SAS Jewellery. All rights reserved.</div>
  </div>
</section>`;
}
window.togglePw = () => { const i = $('#ap'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('#apt').textContent = show ? 'HIDE' : 'SHOW'; };
window.doAdminAuth = async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target)), note = $('#admsg'), btn = $('#asb');
  btn.disabled = true; note.className = 'adm-note'; note.textContent = 'Signing in…';
  try {
    setAuth(await api('/auth/admin-login', 'POST', f));
    toast('Welcome, ' + S.user.name + '!'); location.hash = '#/admin';
  } catch (er) {
    note.className = 'adm-note err'; note.textContent = er.message === 'Failed to fetch' ? 'Cannot reach the server. Make sure the backend is running.' : er.message;
    btn.disabled = false;
  }
};

// ---------- orders ----------
const dt = s => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
async function ordersView() {
  if (!S.user) { location.hash = '#/login'; return; }
  const l = await api('/orders');
  window._orders = l;
  return `<h2>My Orders</h2>` + (l.length ? l.map(o => `<div class="panel"><div class="toolbar" style="justify-content:space-between"><div><b>#${o.id}</b> · ${dt(o.createdAt)}</div><span class="status ${o.status}">${o.status}</span></div>
  ${o.items.map(i => `<div>${esc(i.name)} (${i.karat}, ${i.weight} g) × ${i.qty} — ${inr(i.unit * i.qty)}</div>`).join('')}
  <p><b>Total ${inr(o.total)}</b> · ${esc(o.payment)} · ${esc(o.paymentStatus)}</p><div class="row" style="justify-content:flex-end"><button class="btn alt small" style="flex:none" onclick="invoice('${o.id}')">Invoice</button>
  ${['Placed', 'Confirmed'].includes(o.status) ? `<button class="btn danger small" style="flex:none" onclick="cancelOrder('${o.id}')">Cancel order</button>` : ''}</div></div>`).join('') : '<div class="empty">No orders yet.</div>');
}
window.cancelOrder = guard(async id => { if (!confirm('Cancel this order?')) return; await api(`/orders/${id}/cancel`, 'POST'); await loadProducts(); toast('Order cancelled'); render(); });
window.invoice = id => {
  const o = (window._orders || []).find(x => x.id === id); if (!o) return;
  modal(`<h2>Invoice #${o.id}</h2><p class="meta">${dt(o.createdAt)}<br>${esc(o.address.name)}, ${esc(o.address.line)}, ${esc(o.address.city)} - ${esc(o.address.pincode)} · ${esc(o.address.phone)}</p>
  <table><tr><th>Item</th><th>Qty</th><th>Amount</th></tr>${o.items.map(i => `<tr><td>${esc(i.name)} (${i.karat}, ${i.weight} g)</td><td>${i.qty}</td><td>${inr(i.unit * i.qty)}</td></tr>`).join('')}</table>
  <div class="total">Total ${inr(o.total)}</div><p class="meta">Incl. 3% GST · Payment: ${esc(o.payment)} (${esc(o.paymentStatus)})</p><button class="btn noprint" onclick="window.print()">🖨 Print</button>`);
};

// ---------- calculator ----------
function calcView() {
  setTimeout(calc, 0);
  return `<h2>Gold Price Calculator</h2><div class="panel" style="max-width:520px"><div class="two"><div><label>Weight (grams)</label><input id="cw" type="number" min="0" step="0.1" value="10" oninput="calc()"></div>
  <div><label>Purity</label><select id="ck" onchange="calc()"><option>22K</option><option>24K</option><option>18K</option></select></div></div>
  <label>Making charges (%)</label><input id="cm" type="number" min="0" value="10" oninput="calc()"><div class="bd" id="cr" style="margin-top:14px"></div></div>`;
}
window.calc = () => {
  if (!$('#cr') || !S.rate) return;
  const w = +$('#cw').value || 0, k = $('#ck').value, m = +$('#cm').value || 0, base = w * S.rate.rate24 * S.rate.purity[k], mk = base * m / 100, g = (base + mk) * .03;
  $('#cr').innerHTML = `<div><span>Rate per gram (${k})</span><span>${inr(Math.round(S.rate.rate24 * S.rate.purity[k]))}</span></div><div><span>Gold value</span><span>${inr(Math.round(base))}</span></div><div><span>Making charges</span><span>${inr(Math.round(mk))}</span></div><div><span>GST 3%</span><span>${inr(Math.round(g))}</span></div><div><b>Estimated total</b><b>${inr(Math.round(base + mk + g))}</b></div>`;
};

// ---------- contact ----------
function contactView() {
  return `<h2>Contact us</h2><form class="panel" style="max-width:520px" onsubmit="sendMsg(event)"><label>Name</label><input name="name" required value="${esc(S.user?.name || '')}"><label>Email</label><input name="email" type="email" required value="${esc(S.user?.email || '')}">
  <label>Message</label><textarea name="message" rows="4" required></textarea><p><button class="btn">Send message</button></p></form>`;
}
window.sendMsg = guard(async e => { e.preventDefault(); await api('/contact', 'POST', Object.fromEntries(new FormData(e.target))); e.target.reset(); toast('Message sent. We will reply soon!'); });

// ---------- admin ----------
async function adminView() {
  if (!S.user || S.user.role !== 'admin') { location.hash = '#/admin-login'; return; }
  const T = [['dashboard', 'Dashboard'], ['products', 'Products'], ['orders', 'Orders'], ['rate', 'Gold rate'], ['messages', 'Messages']];
  let body = '';
  if (S.tab === 'dashboard') {
    const s = await api('/admin/stats');
    body = `<div class="stats"><div class="stat">Revenue<b>${inr(s.revenue)}</b></div><div class="stat">Orders<b>${s.orders}</b></div><div class="stat">Pending<b>${s.pending}</b></div><div class="stat">Customers<b>${s.customers}</b></div><div class="stat">Products<b>${s.products}</b></div><div class="stat">Unread messages<b>${s.unread}</b></div></div>
    <div class="panel"><b>Low stock (3 or fewer)</b>${s.lowStock.length ? s.lowStock.map(p => `<div>${esc(p.name)} — ${p.stock} left</div>`).join('') : '<div class="meta">All products well stocked.</div>'}</div>`;
  } else if (S.tab === 'products') {
    await loadProducts();
    body = `<button class="btn" onclick="editProduct()">+ Add product</button><div class="panel scroll" style="margin-top:12px"><table><tr><th>Photo</th><th>Name</th><th>Category</th><th>Karat</th><th>Weight</th><th>Making</th><th>Stock</th><th>Price</th><th></th></tr>
    ${S.products.map(p => `<tr><td><div class="thumb">${picHtml(p)}</div></td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${p.karat}</td><td>${p.weight} g</td><td>${p.making}%</td><td>${p.stock}</td><td>${inr(p.price.total)}</td>
    <td style="white-space:nowrap"><button class="btn alt small" onclick="editProduct(${p.id})">Edit</button> <button class="btn danger small" onclick="delProduct(${p.id})">Delete</button></td></tr>`).join('')}</table></div>`;
  } else if (S.tab === 'orders') {
    const l = await api('/orders?all=1');
    body = `<div class="panel scroll"><table><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr>${l.map(o => `<tr><td>#${o.id}<br><span class="meta">${dt(o.createdAt)}</span></td><td>${esc(o.userName)}<br><span class="meta">${esc(o.address.phone)}, ${esc(o.address.city)}</span></td>
    <td>${o.items.map(i => esc(i.name) + ' ×' + i.qty).join('<br>')}</td><td>${inr(o.total)}</td><td>${esc(o.payment)}</td><td>${o.status === 'Cancelled' ? '<span class="status Cancelled">Cancelled</span>' :
      `<select onchange="setStatus('${o.id}',this.value)">${['Placed', 'Confirmed', 'Shipped', 'Delivered'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No orders yet</td></tr>'}</table></div>`;
  } else if (S.tab === 'rate') {
    const r = await api('/rate');
    body = `<div class="panel" style="max-width:420px"><h3>Set today's 24K gold rate</h3><p class="meta">Last updated ${dt(r.updatedAt)}. All product prices update instantly for every visitor.</p><label>₹ per gram (24K)</label><input id="nr" type="number" min="1" value="${r.rate24}"><p><button class="btn" onclick="saveRate()">Update rate</button></p></div>`;
  } else {
    const l = await api('/admin/messages');
    body = l.map(m => `<div class="panel" style="${m.read ? 'opacity:.65' : ''}"><b>${esc(m.name)}</b> &lt;${esc(m.email)}&gt; <span class="meta">${dt(m.createdAt)}</span><p>${esc(m.message)}</p>
    ${m.read ? '' : `<button class="btn alt small" onclick="readMsg(${m.id})">Mark read</button> `}<button class="btn danger small" onclick="delMsg(${m.id})">Delete</button></div>`).join('') || '<div class="empty">No messages.</div>';
  }
  return `<h2>Admin Panel</h2><div class="tabs">${T.map(([k, t]) => `<button class="chip ${S.tab === k ? 'on' : ''}" onclick="S.tab='${k}';render()">${t}</button>`).join('')}</div>${body}`;
}
window.setStatus = guard(async (id, status) => { await api('/orders/' + id, 'PATCH', { status }); toast('Order ' + id + ' → ' + status); });
window.saveRate = guard(async () => { await api('/rate', 'PUT', { rate24: $('#nr').value }); await pollRate(); toast('Gold rate updated'); render(); });
window.readMsg = guard(async id => { await api('/admin/messages/' + id, 'PATCH'); render(); });
window.delMsg = guard(async id => { if (!confirm('Delete message?')) return; await api('/admin/messages/' + id, 'DELETE'); render(); });
window.delProduct = guard(async id => { if (!confirm('Delete this product?')) return; await api('/products/' + id, 'DELETE'); toast('Product deleted'); render(); });
window.editProduct = id => {
  const p = id ? prod(id) : { name: '', category: 'Rings', karat: '22K', weight: '', making: 10, stock: 5, image: '', desc: '' };
  modal(`<h2>${id ? 'Edit' : 'Add'} product</h2><form onsubmit="saveProduct(event,${id || 0})"><label>Name</label><input name="name" required value="${esc(p.name)}">
  <div class="two"><div><label>Category</label><select name="category">${CATS.slice(1).map(c => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div><label>Karat</label><select name="karat">${['22K', '24K', '18K'].map(k => `<option ${k === p.karat ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
  <div><label>Weight (g)</label><input name="weight" type="number" step="0.1" min="0.1" required value="${p.weight}"></div><div><label>Making %</label><input name="making" type="number" step="0.1" min="0" required value="${p.making}"></div>
  <div><label>Stock</label><input name="stock" type="number" min="0" required value="${p.stock}"></div></div>
  <label>Product photo</label><input id="pimg" name="image" placeholder="images/products/my-ring.jpg or https://…" value="${esc(p.image)}" oninput="previewImg()">
  <label>…or upload a photo (JPG / PNG / WEBP, max 5 MB)</label><input type="file" accept="image/jpeg,image/png,image/webp" onchange="uploadImg(this)"><div class="thumb preview" id="pprev">${picHtml(p)}</div>
  <label>Description</label><textarea name="desc" rows="2">${esc(p.desc)}</textarea><p><button class="btn">Save</button></p></form>`);
};
window.saveProduct = guard(async (e, id) => {
  e.preventDefault(); await api(id ? '/products/' + id : '/products', id ? 'PUT' : 'POST', Object.fromEntries(new FormData(e.target)));
  closeModal(); toast('Product saved'); render();
});

window.previewImg = () => { const v = $('#pimg').value; $('#pprev').innerHTML = picHtml({ image: v, name: 'preview', category: 'Jewellery' }); };
window.uploadImg = guard(async input => {
  const f = input.files[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { input.value = ''; return toast('Image must be smaller than 5 MB', true); }
  const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Could not read the file')); r.readAsDataURL(f); });
  const res = await api('/uploads', 'POST', { data });
  $('#pimg').value = res.path; previewImg(); toast('Photo uploaded');
});

// ---------- start ----------
(async function init() {
  await Promise.all([loadUser(), pollRate()]);
  await loadProducts().catch(() => toast('Cannot reach server. Is it running?', true));
  render(); setInterval(pollRate, 10000);
})();
