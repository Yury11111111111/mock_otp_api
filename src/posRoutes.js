const express = require('express');
const { readDB, addLog } = require('./store');
const { requireBearer } = require('./auth');

const router = express.Router();

function toStateListItem(app) {
  return {
    uuid: app.id,
    orderId: app.orderId,
    optyId: app.optyId,
    agreementNumber: app.agreementNumber,
    status: app.status,
    statusDescription: app.statusDescription,
    createDate: app.createDate,
    modifyDate: app.modifyDate,
    clientFio: app.clientFio,
    shopName: app.shopName,
    organizationName: app.organizationName,
    commercialNetName: app.commercialNetName,
    signMethod: app.signMethod,
    amount: app.amount,
    refundInitiated: !!app.refundInitiated
  };
}

function toOptyDetails(app) {
  return {
    optyId: app.optyId,
    goods: app.goods || [],
    clientFio: app.clientFio,
    orderId: app.orderId,
    utm: app.utm || '',
    phone: app.phone,
    email: app.email,
    deliveryType: app.deliveryType || 0,
    deliveryAddr: app.deliveryAddr || '',
    deliveryDate: app.deliveryDate || null,
    productCode: app.productCode || '',
    productName: app.productName || '',
    productType: String(app.productType || 1),
    creditPeriod: app.creditPeriod || '',
    firstPayment: app.firstPayment || 0,
    discountInRubles: app.discountInRubles || 0,
    goodsCreditAmount: app.goodsCreditAmount || app.amount || 0,
    refundRequisites: app.refundRequisites || null,
    payDocDate: app.payDocDate || null,
    payDocNumber: app.payDocNumber || ''
  };
}

function ownApps(db, username) {
  return db.applications.filter((a) => a.product === 'pos' && a.owner === username);
}

// GET /api/v1/states
router.get('/api/v1/states', requireBearer, (req, res) => {
  const db = readDB();
  let items = ownApps(db, req.user.username);

  const { status, shop, org, orderid, page = 1, size = 100 } = req.query;
  if (status) items = items.filter((a) => a.status === status);
  if (shop) items = items.filter((a) => a.shopName === shop);
  if (org) items = items.filter((a) => a.organizationName === org);
  if (orderid) items = items.filter((a) => a.orderId === orderid);

  const p = parseInt(page, 10) || 1;
  const s = parseInt(size, 10) || 100;
  const start = (p - 1) * s;
  const pageItems = items.slice(start, start + s);

  addLog({ direction: 'in', product: 'pos', owner: req.user.username, url: req.originalUrl, method: 'GET', statusCode: 200 });

  res.json({
    _embedded: { stateList: pageItems.map(toStateListItem) },
    page: { size: s, totalElements: items.length, totalPages: Math.ceil(items.length / s) || 1, number: p }
  });
});

// GET /api/v1/states/:uuid
router.get('/api/v1/states/:uuid', requireBearer, (req, res) => {
  const db = readDB();
  const app = ownApps(db, req.user.username).find((a) => a.id === req.params.uuid);
  addLog({ direction: 'in', product: 'pos', owner: req.user.username, url: req.originalUrl, method: 'GET', statusCode: app ? 200 : 404 });
  if (!app) return res.status(404).json({ error: 'not_found' });
  res.json(toStateListItem(app));
});

// GET /api/v1/states/:uuid/opty
router.get('/api/v1/states/:uuid/opty', requireBearer, (req, res) => {
  const db = readDB();
  const app = ownApps(db, req.user.username).find((a) => a.id === req.params.uuid);
  addLog({ direction: 'in', product: 'pos', owner: req.user.username, url: req.originalUrl, method: 'GET', statusCode: app ? 200 : 404 });
  if (!app) return res.status(404).json({ error: 'not_found' });
  res.json(toOptyDetails(app));
});

// GET /api/v1/states/:uuid/audit
router.get('/api/v1/states/:uuid/audit', requireBearer, (req, res) => {
  const db = readDB();
  const app = ownApps(db, req.user.username).find((a) => a.id === req.params.uuid);
  addLog({ direction: 'in', product: 'pos', owner: req.user.username, url: req.originalUrl, method: 'GET', statusCode: app ? 200 : 404 });
  if (!app) return res.status(404).json({ error: 'not_found' });

  const auditList = (app.audit || []).map((entry) => ({
    user: entry.user || 'anonymous',
    userFio: entry.userFio || app.clientFio,
    status: entry.status,
    statusDescription: entry.statusDescription,
    message: entry.message || entry.statusDescription,
    date: entry.date
  }));

  res.json({ _embedded: { auditList } });
});

module.exports = router;
