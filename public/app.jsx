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

function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch (e) {
    return null;
  }
}
function saveAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}
function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

async function requestToken(params) {
  const body = new URLSearchParams({ client_id: "poc", ...params });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      data.error_description || data.error || "Ошибка авторизации",
    );
  return data;
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
      if (!auth) {
        setChecking(false);
        return;
      }
      if (Date.now() < auth.expiresAt - 5000) {
        setChecking(false);
        return;
      }
      try {
        const tokens = await requestToken({
          grant_type: "refresh_token",
          refresh_token: auth.refreshToken,
        });
        const next = tokensToAuth(auth.username, tokens);
        saveAuth(next);
        setAuth(next);
      } catch (e) {
        clearAuth();
        setAuth(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []); // eslint-disable-line

  const handleLogin = (username, tokens) => {
    const next = tokensToAuth(username, tokens);
    saveAuth(next);
    setAuth(next);
  };

  const handleLogout = () => {
    clearAuth();
    setAuth(null);
  };

  if (checking) return <div className="loading-screen">Загрузка…</div>;
  if (!auth) return <Welcome onLogin={handleLogin} />;
  return (
    <Dashboard auth={auth} onLogout={handleLogout} onAuthUpdate={setAuth} />
  );
}

// ---------- Экран входа + инструкция ----------
function Welcome({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Заполните логин и пароль");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const tokens = await requestToken({
        grant_type: "password",
        username: username.trim(),
        password,
      });
      onLogin(username.trim(), tokens);
    } catch (err) {
      setError(err.message);
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
            обработки заявок на вашей стороне. Все данные моковые, в реальный
            банк ничего не уходит.
          </p>

          <h3>1. Как войти</h3>
          <p>
            Отдельного реестра аккаунтов нет — как и в реальном банке,
            «техническую учётку» вы получаете сами: введите любой логин и пароль
            справа. Если такого логина ещё не было — он будет создан
            автоматически с этим паролем. Если логин уже существует — пароль
            должен совпадать с тем, что вы задали при первом входе.
          </p>
          <p>
            Токен, который вы получите, привязан именно к этому логину: заявки,
            созданные под одним логином, не видны под другим. Так несколько
            человек могут одновременно тестировать интеграцию на одном сервере,
            не мешая друг другу.
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
            настройках — отдельно для POS и для BNPL. Чтобы это проверить:
          </p>
          <ul>
            <li>
              <b>Быстрый ручной просмотр без кода:</b> создайте временный URL на
              <a href="https://webhook.site" target="_blank" rel="noreferrer">
                {" "}
                webhook.site
              </a>{" "}
              и вставьте его в настройки — все входящие запросы будут видны
              прямо в браузере. Подходит, чтобы один раз посмотреть на структуру
              payload.
            </li>
            <li>
              <b>Проверка вашего реального обработчика на localhost:</b>{" "}
              поднимите свой эндпоинт локально и пробросьте его наружу через{" "}
              <a href="https://ngrok.com" target="_blank" rel="noreferrer">
                ngrok
              </a>{" "}
              (или Cloudflare Tunnel) — команда вида{" "}
              <code>ngrok http 4000</code> даст публичный https-адрес, который
              форвардит запросы на ваш localhost:4000. Его и укажите в
              настройках как webhook URL.
            </li>
            <li>
              <b>Проверка задеплоенного обработчика:</b> просто укажите его
              боевой/тестовый публичный URL в настройках — ничего дополнительно
              поднимать не нужно.
            </li>
          </ul>
          <p>
            Ваш обработчик обязан отвечать <code>HTTP 200</code> — иначе (как и
            настоящий банк) мок повторит отправку столько раз, сколько задано в
            настройках «Кол-во повторов». Все попытки и коды ответов видно на
            вкладке «Логи».
          </p>
          <p>
            После входа: создайте моковую заявку (POS или BNPL), выберите нужный
            статус в выпадающем списке и нажмите «Сменить статус + вебхук» —
            запрос уйдёт немедленно, без ожидания реальных сроков обработки
            банком.
          </p>
        </div>

        <form className="login-box" onSubmit={submit}>
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
      return fetch(`/admin/api${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
          ...(options.headers || {}),
        },
      }).then(async (r) => {
        if (r.status === 401) {
          onLogout();
          throw new Error("unauthorized");
        }
        return r.json();
      });
    },
    [auth.accessToken, onLogout],
  );

  const copyToken = () => {
    navigator.clipboard.writeText(auth.accessToken);
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

// ---------- Настройки ----------
function SettingsTab({ api }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    api("/settings").then(setSettings);
  }, [api]);

  if (!settings) return <p>Загрузка…</p>;

  const set = (key) => (e) =>
    setSettings({ ...settings, [key]: e.target.value });
  const setNum = (key) => (e) =>
    setSettings({ ...settings, [key]: Number(e.target.value) || 0 });

  const save = async () => {
    await api("/settings", { method: "PUT", body: JSON.stringify(settings) });
    setStatus("Сохранено ✓");
    setTimeout(() => setStatus(""), 2000);
  };

  const base = window.location.origin;

  return (
    <section>
      <h2>Настройки вебхуков (только для вашего аккаунта)</h2>
      <div className="card">
        <label>URL для вебхуков POS (Смарт-анкета)</label>
        <input
          value={settings.posWebhookUrl}
          onChange={set("posWebhookUrl")}
          placeholder="https://ваш-сервис.ru/webhooks/pos"
        />

        <label>URL для вебхуков BNPL (Давай делить)</label>
        <input
          value={settings.bnplWebhookUrl}
          onChange={set("bnplWebhookUrl")}
          placeholder="https://ваш-сервис.ru/webhooks/bnpl"
        />

        <div className="row">
          <div>
            <label>Кол-во повторов при ошибке</label>
            <input
              type="number"
              min="0"
              value={settings.maxRetries}
              onChange={setNum("maxRetries")}
            />
          </div>
          <div>
            <label>Задержка между повторами (сек)</label>
            <input
              type="number"
              min="0"
              value={settings.retryDelaySeconds}
              onChange={setNum("retryDelaySeconds")}
            />
          </div>
        </div>

        <button onClick={save}>Сохранить настройки</button>
        <span className="save-status">{status}</span>
      </div>

      <div className="card">
        <h3>
          Адреса мок-сервера (вписать в вашу систему вместо реальных URL банка)
        </h3>
        <p>
          <b>Авторизация</b> (вместо poslogin.otpbank.ru):
        </p>
        <pre>
          POST {base}/keycloak/auth/realms/PPU/protocol/openid-connect/token
        </pre>
        <p>
          <b>POS API</b> (вместо ecom.otpbank.ru/broker/core):
        </p>
        <pre>{`GET ${base}/broker/core/api/v1/states
GET ${base}/broker/core/api/v1/states/{uuid}
GET ${base}/broker/core/api/v1/states/{uuid}/opty
GET ${base}/broker/core/api/v1/states/{uuid}/audit`}</pre>
        <p>
          <b>BNPL API</b> (вместо davay-delit.ru):
        </p>
        <pre>{`POST ${base}/pos-bnpl-partner-api/api/v1/applications
GET  ${base}/pos-bnpl-partner-api/api/v1/point/{pointCode}/credit-products
POST ${base}/pos-bnpl-partner-api/api/v1/applications/cancel
POST ${base}/pos-bnpl-partner-api/api/v1/applications/commit
POST ${base}/pos-bnpl-partner-api/api/v1/applications/refund`}</pre>
        <p className="hint">
          Все эти запросы требуют заголовок{" "}
          <code>Authorization: Bearer &lt;ваш access_token&gt;</code> — получить
          его можно на экране входа или напрямую через /token (см. инструкцию
          там). Вебхуки сервер отправляет сам на URL выше — их не нужно никуда
          вписывать, только принять у себя.
        </p>
      </div>
    </section>
  );
}

// ---------- Заявки ----------
function ApplicationsTab({ api, product, statuses }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api(`/applications?product=${product}`).then(setItems);
  }, [api, product]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const app = await api("/applications", {
      method: "POST",
      body: JSON.stringify({ product, overrides: {} }),
    });
    load();
    setModal({ title: "Заявка создана", json: app });
  };

  const remove = async (id) => {
    if (!confirm("Удалить заявку?")) return;
    await api(`/applications/${id}`, { method: "DELETE" });
    load();
  };

  const transition = async (id, status) => {
    setBusyId(id);
    try {
      const result = await api(`/applications/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setModal({
        title: "Результат отправки вебхука",
        json: result.webhookResult,
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (id, patch) => {
    await api(`/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    setEditing(null);
    load();
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
          onClose={() => setModal(null)}
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
            setStatus(e.target.value);
            onTransition(status);
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
    api("/logs").then(setLogs);
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const clear = async () => {
    await api("/logs", { method: "DELETE" });
    load();
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
