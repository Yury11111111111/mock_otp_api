const { useState, useEffect, useCallback } = React;

const POS_STATUSES = [
  "OPTY_PREPARED",
  "OPTY_CREATED",
  "DECISION_APPROVAL",
  "DECISION_PRE_APPROVAL",
  "ESIA_AGREEMENT_REQUESTED",
  "ESIA_PERSONAL_DATA_RECIEVED",
  "CONFIRMATION_AT_SHOP",
  "DOCUMENT_SIGNING_OPTION",
  "SIGNING_AT_ORDER_POINT",
  "SIGNING_AT_OTHER_POINT",
  "DELIVERY_DOCUMENTS",
  "DELIVERY_DOCUMENTS_PROBLEM",
  "DOCUMENTS_DELIVERED",
  "DECISION_INFORMATION",
  "AGREEMENT_CREATED_PAPERLESS_ES",
  "AGREEMENT_CREATED_PAPERLESS",
  "AGREEMENT_CREATED_PAPER_TECH",
  "AGREEMENT_DOCS_SENT",
  "AGREEMENT_SIGNED",
  "AGREEMENT_SIGN_FAILED",
  "AGREEMENT_AUTHORIZED",
  "AGREEMENT_PAID",
  "PAYMENT_ORDER",
  "NOT_PAYABLE",
  "REJECTED",
  "EXECUTION_ERROR",
  "CANCEL_AUTHORIZATION",
  "ARCHIVE",
];

const BNPL_STATUSES = [
  "DRAFT",
  "CONFIRM",
  "APPROVE",
  "DECLINE",
  "WAITING_FIRST_PAY",
  "CARD_LINKED",
  "WAITING_FOR_COMMIT",
  "PAYMENT_IN_PROGRESS",
  "COMPLETE",
  "INVOICE_CREATE",
  "INVOICE_PAID",
  "INVOICE_REFUND",
  "CANCEL",
  "REFUND",
  "FAILED",
];

const AUTH_KEY = "mockOtp.auth";
const TOKEN_URL = "/keycloak/auth/realms/PPU/protocol/openid-connect/token";

const DEBUG = true;

const Logger = {
  info: (message, ...optional) => {
    if (DEBUG) console.log(`[INFO] ${message}`, ...optional);
  },
  warn: (message, ...optional) => {
    if (DEBUG) console.warn(`[WARN] ${message}`, ...optional);
  },
  error: (message, ...optional) => {
    if (DEBUG) console.error(`[ERROR] ${message}`, ...optional);
  },
};

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    const auth = raw ? JSON.parse(raw) : null;
    Logger.info(
      "loadAuth: успешно загружены данные",
      auth ? auth.username : "нет данных",
    );
    return auth;
  } catch (e) {
    Logger.error("loadAuth: ошибка парсинга", e);
    return null;
  }
}

function saveAuth(auth) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    Logger.info("saveAuth: сохранены данные для", auth.username);
  } catch (e) {
    Logger.error("saveAuth: ошибка сохранения", e);
  }
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  Logger.info("clearAuth: данные удалены");
}

async function requestToken(params) {
  const body = new URLSearchParams({ client_id: "poc", ...params });
  Logger.info("requestToken: отправка запроса", {
    grant_type: params.grant_type,
    username: params.username || "(refresh)",
  });
  try {
    const tokenRequest = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await tokenRequest.json();
    if (!tokenRequest.ok) {
      const errMsg =
        data.error_description || data.error || "Ошибка авторизации";
      Logger.warn("requestToken: ответ с ошибкой", {
        status: tokenRequest.status,
        message: errMsg,
      });
      throw new Error(errMsg);
    }
    Logger.info("requestToken: токен получен", {
      username: params.username || "(refresh)",
    });
    return data;
  } catch (e) {
    Logger.error("requestToken: ошибка", e);
    throw e;
  }
}

function tokensToAuth(username, tokens) {
  return {
    username,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
}

// ---------- Корневой компонент ----------
function App() {
  const [auth, setAuth] = useState(loadAuth());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      if (!auth || Date.now() < auth.expiresAt - 5000) {
        Logger.info("App: проверка токена — валидный, пропускаем обновление");
        setChecking(false);
        return;
      }
      Logger.info("App: попытка обновления токена по refresh_token");
      try {
        const tokens = await requestToken({
          grant_type: "refresh_token",
          refresh_token: auth.refreshToken,
        });
        login(auth.username, tokens);
        Logger.info("App: токен успешно обновлён");
      } catch (e) {
        Logger.warn("App: обновление токена не удалось, выход", e);
        logout();
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const login = (username, tokens) => {
    const next = tokensToAuth(username, tokens);
    saveAuth(next);
    setAuth(next);
    Logger.info("login: пользователь вошёл", username);
  };

  const logout = () => {
    clearAuth();
    setAuth(null);
    Logger.info("logout: пользователь вышел");
  };

  if (checking) return <div className="loading-screen">Загрузка…</div>;
  if (!auth) return <Welcome onLogin={login} />;
  return <Dashboard auth={auth} onLogout={logout} onAuthUpdate={setAuth} />;
}

// ---------- Экран входа + инструкция ----------
function Welcome({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submitLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Заполните логин и пароль");
      Logger.warn("submitLogin: попытка входа с пустыми полями");
      return;
    }
    setLoading(true);
    setError("");
    Logger.info("submitLogin: попытка входа", { username: username.trim() });
    try {
      const tokens = await requestToken({
        grant_type: "password",
        username: username.trim(),
        password,
      });
      onLogin(username.trim(), tokens);
      Logger.info("submitLogin: вход выполнен успешно");
    } catch (err) {
      setError(err.message);
      Logger.error("submitLogin: ошибка входа", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-grid">
        <div className="welcome-instructions">
          <h1>
            Mock OTP Bank <span className="badge">POS / BNPL</span>
          </h1>
          <p className="lead">
            Тестовый сервер, который эмулирует API и вебхуки ОТП Банка
            (POS-кредитование «Смарт-анкета» и BNPL «Давай делить») для отладки
            обработки заявок на вашей стороне. Все данные моковые и нужны только
            для тестирования, в реальный банк ничего не уходит.
          </p>

          <h3>1. Как войти</h3>
          <p>
            Отдельного реестра аккаунтов в этом серсе нет, «техническую учётку»
            вы создаёте сами: введите любой логин и пароль справа. Если такого
            логина ещё не было — он будет создан автоматически с этим паролем.
            Если логин уже существует — пароль должен совпадать с тем, что вы
            задали при первом входе.
          </p>
          <p>
            Токен, который вы получите, привязан именно к этому логину: заявки,
            созданные под одним логином, не видны под другим. Так несколько
            человек могут одновременно тестировать запросы на одном сервере, не
            мешая друг другу.
          </p>

          <h3>2. Как использовать в Insomnia / Postman</h3>
          <p>
            Тот же самый запрос, что делает эта форма входа, можно выполнить
            руками:
          </p>
          <pre>{`POST ${window.location.origin}${TOKEN_URL}
Content-Type: application/x-www-form-urlencoded

grant_type=password&client_id=poc&username=ВАШ_ЛОГИН&password=ВАШ_ПАРОЛЬ`}</pre>
          <p>
            В ответе будет <code>access_token</code> — его нужно вставить в
            заголовок
            <code> Authorization: Bearer ...</code> при запросах к мок-API
            POS/BNPL (адреса эндпоинтов увидите на вкладке «Настройки» после
            входа).
          </p>

          <h3>3. Как проверить приём вебхуков</h3>
          <p>
            Мок сам отправляет POST-запросы на URL, который вы укажете в
            настройках — отдельно для POS и для BNPL.
          </p>
          <p>
            Ваш обработчик обязан отвечать <code>HTTP 200</code> — иначе (как и
            настоящий банк) мок повторит отправку столько раз, сколько задано в
            настройках «Кол-во повторов». Все попытки и коды ответов видно на
            вкладке «Логи».
          </p>
          <p>
            После входа: создайте моковую заявку (POS или BNPL), выберите нужный
            статус в выпадающем списке — запрос уйдёт немедленно, без ожидания
            реальных сроков обработки банком.
          </p>
        </div>

        <form className="login-box" onSubmit={submitLogin}>
          <h2>Вход / создание тестового аккаунта</h2>
          <label>Логин</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="например, dev1"
            autoFocus
          />
          <label>Пароль</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="любой пароль"
          />
          <button type="submit" disabled={loading}>
            {loading ? "Входим…" : "Войти / создать аккаунт"}
          </button>
          {error && <div className="error">{error}</div>}
          <p className="hint">
            Если логина ещё нет — он создастся с этим паролем. Если есть —
            пароль должен совпадать.
          </p>
        </form>
      </div>
    </div>
  );
}

// ---------- Дашборд ----------
function Dashboard({ auth, onLogout, onAuthUpdate }) {
  const [tab, setTab] = useState("settings");
  const [tokenVisible, setTokenVisible] = useState(false);

  const api = useCallback(
    (path, options = {}) => {
      const url = `/admin/api${path}`;
      Logger.info("api: запрос", { method: options.method || "GET", url });
      return fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
          ...(options.headers || {}),
        },
      })
        .then(async (result) => {
          if (result.status === 401) {
            Logger.warn("api: получен 401, выполняем выход");
            onLogout();
            throw new Error("unauthorized");
          }
          const data = await result.json();
          Logger.info("api: ответ", { status: result.status, url });
          return data;
        })
        .catch((err) => {
          Logger.error("api: ошибка", err);
          throw err;
        });
    },
    [auth.accessToken, onLogout],
  );

  const copyToken = () => {
    navigator.clipboard.writeText(auth.accessToken);
    Logger.info("copyToken: токен скопирован в буфер обмена");
  };

  const minutesLeft = Math.max(
    0,
    Math.round((auth.expiresAt - Date.now()) / 60000),
  );

  return (
    <div className="app">
      <header>
        <h1>
          Mock OTP Bank <span className="badge">POS / BNPL</span>
        </h1>
        <div className="user-box">
          <span className="username">👤 {auth.username}</span>
          <button className="ghost" onClick={() => setTokenVisible((v) => !v)}>
            {tokenVisible ? "Скрыть токен" : "Показать Bearer token"}
          </button>
          <button className="ghost" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      {tokenVisible && (
        <div className="token-panel">
          <div>
            <b>Bearer token</b> (истекает через ~{minutesLeft} мин): используйте
            его для запросов к <code>/broker/core/...</code> и{" "}
            <code>/pos-bnpl-partner-api/...</code>.
          </div>
          <textarea
            readOnly
            value={auth.accessToken}
            onFocus={(e) => e.target.select()}
          />
          <button onClick={copyToken}>Скопировать</button>
        </div>
      )}

      <nav>
        {[
          ["settings", "Настройки"],
          ["pos", "POS заявки"],
          ["bnpl", "BNPL заявки"],
          ["logs", "Логи"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "settings" && <SettingsTab api={api} />}
        {tab === "pos" && (
          <ApplicationsTab api={api} product="pos" statuses={POS_STATUSES} />
        )}
        {tab === "bnpl" && (
          <ApplicationsTab api={api} product="bnpl" statuses={BNPL_STATUSES} />
        )}
        {tab === "logs" && <LogsTab api={api} />}
      </main>
    </div>
  );
}



// ---------- Заявки ----------
function ApplicationsTab({ api, product, statuses }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    Logger.info(`ApplicationsTab (${product}): загрузка списка`);
    api(`/applications?product=${product}`)
      .then(setItems)
      .catch((err) =>
        Logger.error(`ApplicationsTab (${product}): ошибка загрузки`, err),
      );
  }, [api, product]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    Logger.info(`ApplicationsTab (${product}): создание новой заявки`);
    try {
      const app = await api("/applications", {
        method: "POST",
        body: JSON.stringify({ product, overrides: {} }),
      });
      Logger.info(`ApplicationsTab (${product}): заявка создана`, app);
      load();
      setModal({ title: "Заявка создана", json: app });
    } catch (err) {
      Logger.error(`ApplicationsTab (${product}): ошибка создания`, err);
    }
  };

  const remove = async (id) => {
    if (!confirm("Удалить заявку?")) return;
    Logger.info(`ApplicationsTab (${product}): удаление заявки ${id}`);
    try {
      await api(`/applications/${id}`, { method: "DELETE" });
      Logger.info(`ApplicationsTab (${product}): заявка ${id} удалена`);
      load();
    } catch (err) {
      Logger.error(`ApplicationsTab (${product}): ошибка удаления ${id}`, err);
    }
  };

  const transition = async (id, status) => {
    setBusyId(id);
    Logger.info(
      `ApplicationsTab (${product}): смена статуса заявки ${id} -> ${status}`,
    );
    try {
      const result = await api(`/applications/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      Logger.info(
        `ApplicationsTab (${product}): статус изменён, результат вебхука`,
        result,
      );
      setModal({
        title: "Результат отправки вебхука",
        json: result.webhookResult,
      });
      load();
    } catch (err) {
      Logger.error(
        `ApplicationsTab (${product}): ошибка смены статуса ${id}`,
        err,
      );
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (id, patch) => {
    Logger.info(
      `ApplicationsTab (${product}): сохранение редактирования заявки ${id}`,
      patch,
    );
    try {
      await api(`/applications/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      Logger.info(`ApplicationsTab (${product}): заявка ${id} обновлена`);
      setEditing(null);
      load();
    } catch (err) {
      Logger.error(
        `ApplicationsTab (${product}): ошибка обновления ${id}`,
        err,
      );
    }
  };

  return (
    <section>
      <h2>Моковые заявки {product === "pos" ? "POS" : "BNPL"}</h2>
      <button onClick={create}>+ Создать заявку</button>

      <table className="apps-table">
        <thead>
          <tr>
            <th>{product === "pos" ? "orderId" : "number"}</th>
            <th>{product === "pos" ? "optyId" : "partnerApplicationId"}</th>
            <th>Статус</th>
            <th>Сумма</th>
            <th>Обновлено</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan="6">Заявок пока нет</td>
            </tr>
          )}
          {items.map((app) => {
            const col1 = product === "pos" ? app.orderId : app.number;
            const col2 =
              product === "pos" ? app.optyId : app.partnerApplicationId;
            const amount = product === "pos" ? app.amount : app.totalAmount;
            const updated =
              (product === "pos" ? app.modifyDate : app.updated) || "";
            return (
              <AppRow
                key={app.id}
                app={app}
                col1={col1}
                col2={col2}
                amount={amount}
                updated={updated}
                statuses={statuses}
                busy={busyId === app.id}
                onTransition={(status) => transition(app.id, status)}
                onEdit={() => setEditing(app)}
                onDelete={() => remove(app.id)}
              />
            );
          })}
        </tbody>
      </table>

      {editing && (
        <EditAppModal
          app={editing}
          product={product}
          onClose={() => setEditing(null)}
          onSave={(patch) => saveEdit(editing.id, patch)}
        />
      )}

      {modal && (
        <JsonModal
          title={modal.title}
          json={modal.json}
          onClose={() => {
            setModal(null);
            transition();
          }}
        />
      )}
    </section>
  );
}

function AppRow({
  app,
  col1,
  col2,
  amount,
  updated,
  statuses,
  busy,
  onTransition,
  onEdit,
  onDelete,
}) {
  const [status, setStatus] = useState(app.status);
  return (
    <tr>
      <td>{col1}</td>
      <td>{col2}</td>
      <td>{app.status}</td>
      <td>{amount}</td>
      <td>{updated.replace("T", " ").slice(0, 19)}</td>
      <td className="actions">
        <select
          value={status}
          onChange={(e) => {
            const newStatus = e.target.value;
            setStatus(newStatus);
            onTransition(newStatus);
          }}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="small" onClick={onEdit}>
          Редактировать
        </button>
        <button className="small danger" onClick={onDelete}>
          Удалить
        </button>
      </td>
    </tr>
  );
}

// ---------- Редактирование заявки ----------
function EditAppModal({ app, product, onClose, onSave }) {
  const isPos = product === "pos";
  const [form, setForm] = useState(() =>
    isPos
      ? {
          clientFio: app.clientFio || "",
          phone: app.phone || "",
          email: app.email || "",
          shopName: app.shopName || "",
          organizationName: app.organizationName || "",
          amount: app.amount || 0,
          firstPayment: app.firstPayment || 0,
          goodsCreditAmount: app.goodsCreditAmount || 0,
          productType: app.productType || 1,
          agreementNumber: app.agreementNumber || "",
          goods:
            app.goods && app.goods[0]
              ? { ...app.goods[0] }
              : { name: "", price: 0, quantity: 1 },
        }
      : {
          partnerApplicationId: app.partnerApplicationId || "",
          partnerOrganizationShortTitle:
            app.partnerOrganizationShortTitle || "",
          pointCode: app.pointCode || "",
          partnerPointTitle: app.partnerPointTitle || "",
          totalAmount: app.totalAmount || 0,
          firstName: app.client?.firstName || "",
          middleName: app.client?.middleName || "",
          lastName: app.client?.lastName || "",
          goods:
            app.goods && app.goods[0]
              ? { ...app.goods[0] }
              : { name: "", price: 0, quantity: 1 },
        },
  );

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setNumField = (key) => (e) =>
    setForm({ ...form, [key]: Number(e.target.value) || 0 });
  const setGoodField = (key) => (e) =>
    setForm({
      ...form,
      goods: {
        ...form.goods,
        [key]: key === "name" ? e.target.value : Number(e.target.value) || 0,
      },
    });

  const submit = () => {
    Logger.info("EditAppModal: сохранение изменений", { product, form });
    if (isPos) {
      onSave({
        clientFio: form.clientFio,
        phone: form.phone,
        email: form.email,
        shopName: form.shopName,
        organizationName: form.organizationName,
        amount: form.amount,
        firstPayment: form.firstPayment,
        goodsCreditAmount: form.goodsCreditAmount,
        productType: form.productType,
        agreementNumber: form.agreementNumber,
        goods: [
          {
            id: (app.goods && app.goods[0] && app.goods[0].id) || "0001",
            category:
              (app.goods && app.goods[0] && app.goods[0].category) ||
              "RGB_GOODS_CATEGORY_101",
            ...form.goods,
            deleted: false,
          },
        ],
      });
    } else {
      onSave({
        partnerApplicationId: form.partnerApplicationId,
        partnerOrganizationShortTitle: form.partnerOrganizationShortTitle,
        pointCode: form.pointCode,
        partnerPointTitle: form.partnerPointTitle,
        totalAmount: form.totalAmount,
        client: {
          firstName: form.firstName,
          middleName: form.middleName,
          lastName: form.lastName,
        },
        goods: [
          {
            category:
              (app.goods && app.goods[0] && app.goods[0].category) || "",
            ...form.goods,
          },
        ],
      });
    }
  };

  return (
    <div className="modal">
      <div className="modal-box">
        <h3>Редактирование заявки</h3>

        {isPos ? (
          <>
            <label>ФИО клиента</label>
            <input value={form.clientFio} onChange={setField("clientFio")} />
            <label>Телефон</label>
            <input value={form.phone} onChange={setField("phone")} />
            <label>Email</label>
            <input value={form.email} onChange={setField("email")} />
            <label>Магазин</label>
            <input value={form.shopName} onChange={setField("shopName")} />
            <label>Организация</label>
            <input
              value={form.organizationName}
              onChange={setField("organizationName")}
            />
            <div className="row">
              <div>
                <label>Сумма кредита</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={setNumField("amount")}
                />
              </div>
              <div>
                <label>Первый взнос</label>
                <input
                  type="number"
                  value={form.firstPayment}
                  onChange={setNumField("firstPayment")}
                />
              </div>
              <div>
                <label>Тип продукта (1/2/3)</label>
                <input
                  type="number"
                  value={form.productType}
                  onChange={setNumField("productType")}
                />
              </div>
            </div>
            <label>Номер договора</label>
            <input
              value={form.agreementNumber}
              onChange={setField("agreementNumber")}
            />
          </>
        ) : (
          <>
            <label>ID заявки партнёра</label>
            <input
              value={form.partnerApplicationId}
              onChange={setField("partnerApplicationId")}
            />
            <label>Организация</label>
            <input
              value={form.partnerOrganizationShortTitle}
              onChange={setField("partnerOrganizationShortTitle")}
            />
            <label>Код точки (pointCode)</label>
            <input value={form.pointCode} onChange={setField("pointCode")} />
            <label>Точка (title / URL)</label>
            <input
              value={form.partnerPointTitle}
              onChange={setField("partnerPointTitle")}
            />
            <label>Сумма заявки</label>
            <input
              type="number"
              value={form.totalAmount}
              onChange={setNumField("totalAmount")}
            />
            <div className="row">
              <div>
                <label>Имя</label>
                <input
                  value={form.firstName}
                  onChange={setField("firstName")}
                />
              </div>
              <div>
                <label>Отчество</label>
                <input
                  value={form.middleName}
                  onChange={setField("middleName")}
                />
              </div>
              <div>
                <label>Фамилия</label>
                <input value={form.lastName} onChange={setField("lastName")} />
              </div>
            </div>
          </>
        )}

        <h4>Товар (первая позиция)</h4>
        <div className="row">
          <div>
            <label>Название</label>
            <input value={form.goods.name} onChange={setGoodField("name")} />
          </div>
          <div>
            <label>Цена</label>
            <input
              type="number"
              value={form.goods.price}
              onChange={setGoodField("price")}
            />
          </div>
          <div>
            <label>Кол-во</label>
            <input
              type="number"
              value={form.goods.quantity}
              onChange={setGoodField("quantity")}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={submit}>Сохранить</button>
          <button className="ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Логи ----------
function LogsTab({ api }) {
  const [logs, setLogs] = useState([]);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    Logger.info("LogsTab: загрузка логов");
    api("/logs")
      .then(setLogs)
      .catch((err) => Logger.error("LogsTab: ошибка загрузки логов", err));
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const clear = async () => {
    Logger.info("LogsTab: очистка логов");
    try {
      await api("/logs", { method: "DELETE" });
      Logger.info("LogsTab: логи очищены");
      load();
    } catch (err) {
      Logger.error("LogsTab: ошибка очистки логов", err);
    }
  };

  return (
    <section>
      <h2>Логи запросов и вебхуков</h2>
      <button onClick={load}>Обновить</button>
      <button onClick={clear}>Очистить</button>
      <table className="apps-table">
        <thead>
          <tr>
            <th>Время</th>
            <th>Напр.</th>
            <th>Продукт</th>
            <th>Метод</th>
            <th>URL</th>
            <th>Код</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 && (
            <tr>
              <td colSpan="7">Логов пока нет</td>
            </tr>
          )}
          {logs.map((l, i) => (
            <tr key={i}>
              <td>{(l.timestamp || "").replace("T", " ").slice(0, 19)}</td>
              <td>{l.direction}</td>
              <td>{l.product}</td>
              <td>{l.method}</td>
              <td className="url-cell">{l.url}</td>
              <td>{l.statusCode ?? l.error ?? ""}</td>
              <td>
                <button
                  className="small"
                  onClick={() => setModal({ title: "Детали записи", json: l })}
                >
                  JSON
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {modal && (
        <JsonModal
          title={modal.title}
          json={modal.json}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

// ---------- Универсальная модалка с JSON ----------
function JsonModal({ title, json, onClose }) {
  return (
    <div className="modal">
      <div className="modal-box">
        <h3>{title}</h3>
        <pre>{JSON.stringify(json, null, 2)}</pre>
        <button onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
