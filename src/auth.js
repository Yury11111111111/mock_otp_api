const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { readDB, findUser, createUser, verifyPassword } = require('./store');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'mock-otp-secret-change-me';
const TOKEN_TTL_SECONDS = 1800; // как в реальном банке: 1800 сек и на access, и на refresh

function issueTokens(username) {
  const access_token = jwt.sign({ sub: username, scope: 'profile email', type: 'access' }, SECRET, { expiresIn: TOKEN_TTL_SECONDS });
  const refresh_token = jwt.sign({ sub: username, type: 'refresh' }, SECRET, { expiresIn: TOKEN_TTL_SECONDS });
  return {
    access_token,
    expires_in: TOKEN_TTL_SECONDS,
    refresh_expires_in: TOKEN_TTL_SECONDS,
    refresh_token,
    token_type: 'Bearer',
    'not-before-policy': 0,
    session_state: uuidv4(),
    scope: 'profile email'
  };
}

// POST /keycloak/auth/realms/PPU/protocol/openid-connect/token
//
// grant_type=password:
//   - если пользователя с таким username ещё нет — он создаётся "на лету" с указанным
//     паролем (это и есть "выдача техучётки", которую в реальном банке делает куратор
//     вручную; здесь её делает сам разработчик на экране входа);
//   - если пользователь уже существует — пароль должен совпадать.
// grant_type=refresh_token:
//   - переиздаёт токены для того же пользователя, который был в refresh_token.
router.post('/token', (req, res) => {
  const { grant_type, username, password, refresh_token } = req.body || {};

  if (grant_type === 'password') {
    if (!username || !password) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'username and password are required' });
    }

    const db = readDB();
    let user = findUser(db, username);

    if (!user) {
      user = createUser(db, username, password);
    } else if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid user credentials' });
    }

    return res.json(issueTokens(username));
  }

  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required' });
    }
    try {
      const decoded = jwt.verify(refresh_token, SECRET);
      if (decoded.type !== 'refresh') throw new Error('not a refresh token');
      return res.json(issueTokens(decoded.sub));
    } catch (e) {
      return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
    }
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
});

// Общая Bearer-мидлварь: используется и мок-API банка, и API админ-панели.
// Кладёт в req.user.username того, кому принадлежит токен — весь остальной код
// фильтрует данные по этому полю, поэтому разные пользователи видят только свои заявки.
function requireBearer(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Bearer token required' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), SECRET);
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'invalid_token', message: 'Access token required' });
    }
    req.user = { username: decoded.sub };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = { router, requireBearer };
