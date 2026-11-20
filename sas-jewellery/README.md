# SAS Jewellery (Frontend + Backend + MongoDB)

- backend/  -> Node.js REST API (port 5000) using **MongoDB** (Mongoose)
- frontend/ -> HTML/CSS/JS website (port 3000). API address is set in frontend/config.js

## 1. Install & start MongoDB
Pick one:
- **Local:** install MongoDB Community Server (mongodb.com/try/download/community) and leave it running.
  The default connection string already works: `mongodb://127.0.0.1:27017/sas_jewellery`
- **Cloud (Atlas):** create a free cluster at mongodb.com/atlas, then paste its connection string
  into `backend/.env` as `MONGODB_URI=...` (allow your IP address in Atlas > Network Access).

## 2. Run (VS Code)
1. Install Node.js 18+ (nodejs.org). Open this folder in VS Code.
2. Terminal > New Terminal, run (first time only):  `npm run setup`
3. Then:  `npm start`   (starts backend + frontend together)
4. Open http://localhost:3000

The first start creates the database, 12 sample products and the admin account automatically.

## Admin login
Open http://localhost:3000/#/admin-login  (or click "Admin" in the menu).
Username / password come from `backend/.env` (ADMIN_USERNAME / ADMIN_PASSWORD).
Defaults: `admin` / `Admin@123`  -> change them in `backend/.env` before going live, then restart.

## Images
Put your real jewellery photos in `frontend/images/` - see `frontend/images/README.txt`
for the file names. You can also upload product photos from Admin > Products.

## Collections stored in MongoDB
users, products, orders, messages, settings (gold rate), counters.
