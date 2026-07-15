const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDB, writeDB, addLog, getSettingsForUser, setSettingsForUser } = require('./store');
const { requireBearer } = require('./auth');
const { dispatchWebhook } = require('./webhook');

const router = express.Router();

// Все ручки админки требуют тот же Bearer-токен, что и мок-API банка.
// Он выдаётся на экране входа (POST /token) и содержит username — им и
// фильтруются все данные ниже, поэтому разные пользователи видят только свои заявки.
router.use(requireBearer);

router.get('/me', (req, res) => {
  res.json({ username: req.user.username });
});

// ---- Настройки (свои у каждого пользователя) ----
router.get('/settings', (req, res) => {
  res.json(getSettingsForUser(req.user.username));
});

router.put('/settings', (req, res) => {
  const updated = setSettingsForUser(req.user.username, req.body || {});
  res.json(updated);
});

// ---- Заявки ----
function ownApp(db, username, id) {
  return db.applications.find((a) => a.id === id && a.owner === username);
}

router.get('/applications', (req, res) => {
  const db = readDB();
  const { product } = req.query;
  let items = db.applications.filter((a) => a.owner === req.user.username);
  if (product) items = items.filter((a) => a.product === product);
  res.json(items);
});

router.get('/applications/:id', (req, res) => {
  const db = readDB();
  const app = ownApp(db, req.user.username, req.params.id);
  if (!app) return res.status(404).json({ error: 'not_found' });
  res.json(app);
});

// Создание моковой заявки. body: { product: 'pos'|'bnpl', overrides: {...} }
router.post('/applications', (req, res) => {
  const db = readDB();
  const { product = 'pos', overrides = {} } = req.body || {};
  const now = new Date().toISOString();
  const id = uuidv4();
  const owner = req.user.username;

  let app;
  if (product === 'pos') {
    app = {
      id,
      owner,
      product: 'pos',
      orderId: overrides.orderId || String(Math.floor(Math.random() * 900000 + 100000)),
      optyId: overrides.optyId || `0-${uuidv4().slice(0, 8).toUpperCase()}`,
      agreementNumber: overrides.agreementNumber || '',
      status: 'OPTY_CREATED',
      statusDescription: 'Заявка отправлена',
      createDate: now,
      modifyDate: now,
      clientFio: overrides.clientFio || 'Иванов Иван Иванович',
      shopName: overrides.shopName || 'Тестовый магазин',
      organizationName: overrides.organizationName || 'ООО ТЕСТ',
      commercialNetName: overrides.commercialNetName || 'Тестовая сеть',
      signMethod: overrides.signMethod || 'paperless',
      amount: overrides.amount || 50000,
      firstPayment: overrides.firstPayment || 0,
      goodsCreditAmount: overrides.goodsCreditAmount || overrides.amount || 50000,
      productType: overrides.productType || 1,
      externalOrderId: overrides.externalOrderId || overrides.orderId || String(Date.now()),
      phone: overrides.phone || '+70000000000',
      email: overrides.email || 'test@example.com',
      goods: overrides.goods || [
        { id: '0001', category: 'RGB_GOODS_CATEGORY_101', name: 'Тестовый товар', price: 50000, quantity: 1, deleted: false }
      ],
      refundInitiated: false,
      audit: [{ status: 'OPTY_CREATED', statusDescription: 'Заявка отправлена', date: now, user: 'anonymous', userFio: overrides.clientFio || 'Иванов Иван Иванович' }]
    };
  } else {
    app = {
      id,
      owner,
      product: 'bnpl',
      number: overrides.number || `${Math.floor(Math.random() * 90000000 + 10000000)}-0001`,
      partnerApplicationId: overrides.partnerApplicationId || String(Date.now()),
      partnerAgreementNumber: overrides.partnerAgreementNumber || '',
      partnerOrganizationShortTitle: overrides.partnerOrganizationShortTitle || 'ООО "ТЕСТ"',
      pointCode: overrides.pointCode || 'BNPL-00001-24-000001',
      partnerPointTitle: overrides.partnerPointTitle || 'https://test-shop.ru',
      status: 'DRAFT',
      totalAmount: overrides.totalAmount || 45900,
      client: overrides.client || { firstName: 'Иван', middleName: 'Иванович', lastName: 'Иванов' },
      goods: overrides.goods || [{ category: 'Телефоны/Гаджеты/Аксессуары', name: 'Тестовый товар', quantity: 1, price: 45900 }],
      created: now,
      updated: now,
      audit: [{ status: 'DRAFT', created: now, date: now }]
    };
  }

  db.applications.unshift(app);
  writeDB(db);
  res.json(app);
});

// Редактирование заявки — разрешённые поля перечислены явно на бэкенде,
// чтобы нельзя было подменить id/owner/product извне.
const POS_EDITABLE_FIELDS = [
  'orderId', 'optyId', 'agreementNumber', 'clientFio', 'shopName', 'organizationName',
  'commercialNetName', 'signMethod', 'amount', 'firstPayment', 'goodsCreditAmount',
  'productType', 'externalOrderId', 'phone', 'email', 'goods', 'deliveryType',
  'deliveryAddr', 'deliveryDate', 'productCode', 'productName', 'creditPeriod',
  'discountInRubles'
];
const BNPL_EDITABLE_FIELDS = [
  'number', 'partnerApplicationId', 'partnerAgreementNumber', 'partnerOrganizationShortTitle',
  'pointCode', 'partnerPointTitle', 'totalAmount', 'client', 'goods',
  'paymentOrderNumber', 'paymentOrderDate'
];

router.put('/applications/:id', (req, res) => {
  const db = readDB();
  const app = ownApp(db, req.user.username, req.params.id);
  if (!app) return res.status(404).json({ error: 'not_found' });

  const allowed = app.product === 'pos' ? POS_EDITABLE_FIELDS : BNPL_EDITABLE_FIELDS;
  const body = req.body || {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      app[key] = body[key];
    }
  }

  if (app.product === 'pos') app.modifyDate = new Date().toISOString();
  else app.updated = new Date().toISOString();

  writeDB(db);
  res.json(app);
});

router.delete('/applications/:id', (req, res) => {
  const db = readDB();
  const app = ownApp(db, req.user.username, req.params.id);
  if (!app) return res.status(404).json({ error: 'not_found' });
  db.applications = db.applications.filter((a) => a.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// Смена статуса заявки + отправка вебхука
router.post('/applications/:id/transition', async (req, res) => {
  const db = readDB();
  const app = ownApp(db, req.user.username, req.params.id);
  if (!app) return res.status(404).json({ error: 'not_found' });

  const { status, statusDescription, rejectCode, rejectReason, sendWebhook = true } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status_required' });

  const now = new Date().toISOString();
  app.status = status;
  if (app.product === 'pos') {
    app.statusDescription = statusDescription || status;
    app.modifyDate = now;
    app.audit = app.audit || [];
    app.audit.push({ status, statusDescription: app.statusDescription, date: now, user: 'anonymous', userFio: app.clientFio });
  } else {
    app.updated = now;
    app.audit = app.audit || [];
    app.audit.push({ status, created: now, date: now });
  }
  writeDB(db);

  let webhookResult = null;
  if (sendWebhook) {
    webhookResult = await dispatchWebhook(app, status, { statusDescription, rejectCode, rejectReason });
  }

  res.json({ application: app, webhookResult });
});

// ---- Логи (только своего пользователя) ----
router.get('/logs', (req, res) => {
  const db = readDB();
  res.json(db.logs.filter((l) => l.owner === req.user.username));
});

router.delete('/logs', (req, res) => {
  const db = readDB();
  db.logs = db.logs.filter((l) => l.owner !== req.user.username);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
