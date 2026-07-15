const { v4: uuidv4 } = require('uuid');
const { addLog, getSettingsForUser } = require('./store');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Payload вебхука POS (Смарт-анкета):
// stateId, state, stateDescription, externalOrderId, rejectCode, rejectReason,
// modifiedAt, creditAmount, firstPayment, goodsCreditAmount, agreementNumber, productType
function buildPosPayload(app, status, statusDescription, rejectCode, rejectReason) {
  return {
    stateId: app.id,
    state: status,
    stateDescription: statusDescription || status,
    externalOrderId: app.externalOrderId || app.orderId || '',
    rejectCode: rejectCode || null,
    rejectReason: rejectReason || null,
    modifiedAt: new Date().toISOString(),
    creditAmount: app.amount || 0,
    firstPayment: app.firstPayment || 0,
    goodsCreditAmount: app.goodsCreditAmount || app.amount || 0,
    agreementNumber: app.agreementNumber || '',
    productType: app.productType || 1
  };
}

// Payload вебхука BNPL (Давай делить):
// eventId, id, number, partnerApplicationId, partnerAgreementNumber,
// partnerOrganizationShortTitle, partnerPointCode, partnerPointTitle,
// status, totalAmount, updated, goods[]
function buildBnplPayload(app, status) {
  return {
    eventId: uuidv4(),
    id: app.id,
    number: app.number,
    partnerApplicationId: app.partnerApplicationId || '',
    partnerAgreementNumber: app.partnerAgreementNumber || app.number,
    partnerOrganizationShortTitle: app.partnerOrganizationShortTitle || 'ООО "ТЕСТ"',
    partnerPointCode: app.pointCode || '',
    partnerPointTitle: app.partnerPointTitle || '',
    status: status,
    totalAmount: app.totalAmount || app.amount || 0,
    updated: new Date().toISOString(),
    goods: app.goods || []
  };
}

async function sendWebhook(product, owner, url, payload, retrySettings) {
  const { maxRetries = 3, retryDelaySeconds = 5 } = retrySettings || {};
  let attempt = 0;
  let lastError = null;
  let lastStatus = null;

  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      lastStatus = resp.status;
      const bodyText = await resp.text().catch(() => '');

      addLog({
        direction: 'out',
        product,
        owner,
        url,
        method: 'POST',
        statusCode: resp.status,
        attempt,
        payload,
        responseBody: bodyText.slice(0, 1000)
      });

      if (resp.status === 200) {
        return { ok: true, status: resp.status, attempt };
      }
      // не 200 -> банк повторяет отправку; делаем то же самое
    } catch (err) {
      lastError = err.message;
      addLog({
        direction: 'out',
        product,
        owner,
        url,
        method: 'POST',
        statusCode: null,
        attempt,
        payload,
        error: err.message
      });
    }

    if (attempt <= maxRetries) {
      await sleep(retryDelaySeconds * 1000);
    }
  }

  return { ok: false, status: lastStatus, error: lastError, attempts: attempt };
}

async function dispatchWebhook(app, status, meta = {}) {
  const settings = getSettingsForUser(app.owner);
  const { posWebhookUrl, bnplWebhookUrl, maxRetries, retryDelaySeconds } = settings;

  const targetUrl = app.product === 'pos' ? posWebhookUrl : bnplWebhookUrl;
  if (!targetUrl) {
    addLog({
      direction: 'out',
      product: app.product,
      owner: app.owner,
      url: null,
      method: 'POST',
      statusCode: null,
      error: 'Webhook URL is not configured in settings for this user'
    });
    return { ok: false, error: 'webhook_url_not_configured' };
  }

  const payload = app.product === 'pos'
    ? buildPosPayload(app, status, meta.statusDescription, meta.rejectCode, meta.rejectReason)
    : buildBnplPayload(app, status);

  return sendWebhook(app.product, app.owner, targetUrl, payload, { maxRetries, retryDelaySeconds });
}

module.exports = { dispatchWebhook, buildPosPayload, buildBnplPayload };
