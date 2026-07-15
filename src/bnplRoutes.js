const express = require('express');
const { readDB, writeDB, addLog } = require('./store');
const { requireBearer } = require('./auth');

const router = express.Router();

function toApplicationResponse(app) {
  return {
    id: app.id,
    number: app.number,
    partnerApplicationId: app.partnerApplicationId || '',
    status: app.status,
    pointCode: app.pointCode || '',
    goods: app.goods || [],
    totalAmount: app.totalAmount || app.amount || 0,
    paymentOrderNumber: app.paymentOrderNumber || '',
    paymentOrderDate: app.paymentOrderDate || '',
    client: app.client || {},
    audit: (app.audit || []).map((a) => ({ status: a.status, created: a.date || a.created })),
    created: app.created,
    updated: app.updated
  };
}

function ownApps(db, username) {
  return db.applications.filter((a) => a.product === 'bnpl' && a.owner === username);
}

function findByLookup(db, username, { applicationNumber, partnerApplicationId, pointCode }) {
  return ownApps(db, username).find((a) => {
    if (applicationNumber && a.number !== applicationNumber) return false;
    if (partnerApplicationId && a.partnerApplicationId !== partnerApplicationId) return false;
    if (pointCode && a.pointCode !== pointCode) return false;
    return applicationNumber || partnerApplicationId;
  });
}

function touch(app, status) {
  app.status = status;
  app.updated = new Date().toISOString();
  app.audit = app.audit || [];
  app.audit.push({ status, date: app.updated });
}

// "Получение заявок" — в документации это POST, дублируем и как GET для удобства тестирования
function listApplications(req, res) {
  const db = readDB();
  let items = ownApps(db, req.user.username);

  const q = { ...req.query, ...req.body };
  if (q.statuses) {
    const statuses = Array.isArray(q.statuses) ? q.statuses : [q.statuses];
    items = items.filter((a) => statuses.includes(a.status));
  }
  if (q.partnerApplicationId) items = items.filter((a) => a.partnerApplicationId === q.partnerApplicationId);
  if (q.number) items = items.filter((a) => a.number === q.number);
  if (q.pointCodes) {
    const codes = Array.isArray(q.pointCodes) ? q.pointCodes : [q.pointCodes];
    items = items.filter((a) => codes.includes(a.pointCode));
  }

  addLog({ direction: 'in', product: 'bnpl', owner: req.user.username, url: req.originalUrl, method: req.method, statusCode: 200 });
  res.json(items.map(toApplicationResponse));
}

router.post('/api/v1/applications', requireBearer, listApplications);
router.get('/api/v1/applications', requireBearer, listApplications);

// GET /api/v1/point/:pointCode/credit-products
router.get('/api/v1/point/:pointCode/credit-products', requireBearer, (req, res) => {
  addLog({ direction: 'in', product: 'bnpl', owner: req.user.username, url: req.originalUrl, method: 'GET', statusCode: 200 });
  res.json([
    { code: 'PKP48M6_36ONL', name: 'Универсальный Бр 48 (PKP48M6_36ONL)' },
    { code: 'BNPL4_0', name: 'Давай Делить на 4 части' }
  ]);
});

function handleAction(actionStatus) {
  return (req, res) => {
    const db = readDB();
    const app = findByLookup(db, req.user.username, req.body || {});
    addLog({
      direction: 'in',
      product: 'bnpl',
      owner: req.user.username,
      url: req.originalUrl,
      method: 'POST',
      statusCode: app ? 200 : 404,
      payload: req.body
    });
    if (!app) return res.status(404).json({ error: 'application_not_found' });

    touch(app, actionStatus);
    writeDB(db);

    res.json(toApplicationResponse(app));
  };
}

router.post('/api/v1/applications/cancel', requireBearer, handleAction('CANCEL'));
router.post('/api/v1/applications/commit', requireBearer, handleAction('PAYMENT_IN_PROGRESS'));
router.post('/api/v1/applications/refund', requireBearer, handleAction('REFUND'));

module.exports = router;
