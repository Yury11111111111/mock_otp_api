const express = require('express');
const cors = require('cors');
const path = require('path');

const { ensureDB } = require('./src/store');
const { router: authRouter } = require('./src/auth');
const posRoutes = require('./src/posRoutes');
const bnplRoutes = require('./src/bnplRoutes');
const adminRoutes = require('./src/adminRoutes');

ensureDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // нужно для x-www-form-urlencoded /token

// Статика React-панели (без сборки — см. public/index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Мок Keycloak-авторизации (реальный путь банка сохранён 1-в-1).
// Это же единственная "точка входа" для получения технической учётки:
// первый password-grant с новым username создаёт пользователя.
app.use('/keycloak/auth/realms/PPU/protocol/openid-connect', authRouter);

// Мок POS API (Смарт-анкета) — реальный префикс банка /broker/core
app.use('/broker/core', posRoutes);

// Мок BNPL API (Давай делить) — реальный префикс банка /pos-bnpl-partner-api
app.use('/pos-bnpl-partner-api', bnplRoutes);

// API для панели управления (настройки, заявки, ручной триггер вебхуков, логи).
// Требует тот же Bearer-токен, что и мок-API банка выше.
app.use('/admin/api', adminRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mock OTP Bank server listening on port ${PORT}`);
});
