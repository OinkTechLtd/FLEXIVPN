// FlexiVPN Background Service Worker
// Handles: proxy, timers, notifications, premium logic, server updates

const SERVERS_URL = 'https://raw.githubusercontent.com/OinkTechLtd/FLEXIVPN/main/servers.json';
const FREE_SESSION_MINUTES = 60;
const PREMIUM_UNLOCK_DAYS = 14;
const PREMIUM_TRIAL_DAYS = 7;

// ─── Default State ───────────────────────────────────────────────────────────
const DEFAULT_STATE = {
  connected: false,
  currentServer: null,
  sessionStart: null,
  sessionEndTime: null,
  bypassRF: false,
  acceptedTerms: false,
  isPremium: false,
  premiumExpiry: null,
  premiumTrialUsed: false,
  loginStreak: 0,
  lastLoginDate: null,
  totalDays: 0,
  servers: [],
  lastServerUpdate: null,
  notifications: true,
};

// ─── State helpers ───────────────────────────────────────────────────────────
async function getState() {
  const data = await chrome.storage.local.get('flexivpn_state');
  return { ...DEFAULT_STATE, ...(data.flexivpn_state || {}) };
}

async function setState(partial) {
  const current = await getState();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ flexivpn_state: next });
  return next;
}

// ─── Notifications ───────────────────────────────────────────────────────────
function notify(title, message, id = 'flexivpn-' + Date.now()) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 1,
  });
}

// ─── Premium Check ───────────────────────────────────────────────────────────
async function checkAndUpdateStreak() {
  const state = await getState();
  const today = new Date().toDateString();
  if (state.lastLoginDate === today) return state;

  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let streak = state.lastLoginDate === yesterday ? (state.loginStreak || 0) + 1 : 1;
  let totalDays = (state.totalDays || 0) + 1;
  let isPremium = state.isPremium;
  let premiumExpiry = state.premiumExpiry;
  let premiumTrialUsed = state.premiumTrialUsed;

  // Unlock premium trial after 14 days
  if (totalDays >= PREMIUM_UNLOCK_DAYS && !premiumTrialUsed && !isPremium) {
    const expiry = Date.now() + PREMIUM_TRIAL_DAYS * 86400000;
    isPremium = true;
    premiumExpiry = expiry;
    premiumTrialUsed = true;
    notify(
      '🏆 FlexiVPN Premium разблокирован!',
      `Вы заходите ${totalDays} дней подряд! Пробный Premium на 7 дней активирован — наслаждайтесь всеми серверами!`
    );
  }

  // Check premium expiry
  if (isPremium && premiumExpiry && Date.now() > premiumExpiry) {
    isPremium = false;
    notify('FlexiVPN', 'Пробный Premium истёк. Продолжайте заходить каждый день для нового триала!');
  }

  return setState({ loginStreak: streak, lastLoginDate: today, totalDays, isPremium, premiumExpiry, premiumTrialUsed });
}

// ─── Server Management ───────────────────────────────────────────────────────
async function fetchServers() {
  try {
    const res = await fetch(SERVERS_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const servers = await res.json();
    await setState({ servers, lastServerUpdate: Date.now() });
    console.log('[FlexiVPN] Servers updated:', servers.length);
    return servers;
  } catch (e) {
    console.warn('[FlexiVPN] Could not fetch servers:', e.message);
    const state = await getState();
    return state.servers || getFallbackServers();
  }
}

function getFallbackServers() {
  return [
    { id: 'nl-1', name: 'Netherlands 🇳🇱', country: 'NL', city: 'Amsterdam', host: '45.76.120.100', port: 1080, type: 'SOCKS5', tier: 'free', ping: 45, load: 30 },
    { id: 'de-1', name: 'Germany 🇩🇪', country: 'DE', city: 'Frankfurt', host: '157.90.115.200', port: 1080, type: 'SOCKS5', tier: 'free', ping: 38, load: 45 },
    { id: 'us-1', name: 'USA 🇺🇸', country: 'US', city: 'New York', host: '149.28.100.150', port: 1080, type: 'SOCKS5', tier: 'premium', ping: 90, load: 20 },
    { id: 'fi-1', name: 'Finland 🇫🇮', country: 'FI', city: 'Helsinki', host: '95.216.200.100', port: 1080, type: 'SOCKS5', tier: 'free', ping: 55, load: 60 },
    { id: 'fr-1', name: 'France 🇫🇷', country: 'FR', city: 'Paris', host: '51.178.100.200', port: 1080, type: 'SOCKS5', tier: 'premium', ping: 42, load: 35 },
    { id: 'jp-1', name: 'Japan 🇯🇵', country: 'JP', city: 'Tokyo', host: '103.31.200.150', port: 1080, type: 'SOCKS5', tier: 'premium', ping: 180, load: 15 },
    { id: 'se-1', name: 'Sweden 🇸🇪', country: 'SE', city: 'Stockholm', host: '185.213.100.50', port: 1080, type: 'SOCKS5', tier: 'free', ping: 62, load: 50 },
    { id: 'ch-1', name: 'Switzerland 🇨🇭', country: 'CH', city: 'Zurich', host: '194.165.100.80', port: 1080, type: 'SOCKS5', tier: 'premium', ping: 40, load: 25 },
  ];
}

async function autoSelectServer(bypassRF = false) {
  const state = await getState();
  let servers = state.servers.length > 0 ? state.servers : getFallbackServers();

  // Filter: if bypass RF, prefer western IPs (non-RU servers)
  if (bypassRF) {
    servers = servers.filter(s => s.country !== 'RU');
  }

  // Filter by tier
  const available = state.isPremium ? servers : servers.filter(s => s.tier === 'free');
  if (available.length === 0) return null;

  // Sort by ping + load score
  const scored = available.map(s => ({ ...s, score: (s.ping || 100) + (s.load || 50) * 0.5 }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0];
}

// ─── VPN Connect/Disconnect ───────────────────────────────────────────────────
async function connectVPN(serverId) {
  const state = await getState();
  let server;

  if (serverId === 'auto') {
    server = await autoSelectServer(state.bypassRF);
  } else {
    const servers = state.servers.length > 0 ? state.servers : getFallbackServers();
    server = servers.find(s => s.id === serverId);
  }

  if (!server) {
    notify('FlexiVPN ❌', 'Сервер не найден. Попробуйте другой.');
    return { success: false, error: 'Server not found' };
  }

  // Check premium lock
  if (server.tier === 'premium' && !state.isPremium) {
    notify('FlexiVPN 🔒', 'Этот сервер только для Premium. Заходите 14 дней подряд для бесплатного триала!');
    return { success: false, error: 'Premium required' };
  }

  // Set proxy
  const proxyConfig = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: server.type.toLowerCase(),
        host: server.host,
        port: server.port,
      },
    },
  };

  try {
    await chrome.proxy.settings.set({ value: proxyConfig, scope: 'regular' });
  } catch (e) {
    console.warn('[FlexiVPN] Proxy set failed:', e);
  }

  const sessionEnd = Date.now() + FREE_SESSION_MINUTES * 60 * 1000;

  await setState({
    connected: true,
    currentServer: server,
    sessionStart: Date.now(),
    sessionEndTime: state.isPremium ? null : sessionEnd,
  });

  // Set alarm for session end (free users)
  if (!state.isPremium) {
    chrome.alarms.create('session_end', { when: sessionEnd });
    chrome.alarms.create('session_warning', { when: sessionEnd - 5 * 60 * 1000 });
  }

  notify(
    `✅ Подключено — ${server.name}`,
    `${server.city} · Пинг ${server.ping}ms · Нагрузка ${server.load}%${state.isPremium ? '' : ' · Сессия 60 мин'}`
  );

  // Update badge
  chrome.action.setBadgeText({ text: 'ON' });
  chrome.action.setBadgeBackgroundColor({ color: '#00D9A3' });

  return { success: true, server };
}

async function disconnectVPN(reason = 'manual') {
  try {
    await chrome.proxy.settings.clear({ scope: 'regular' });
  } catch (e) {
    console.warn('[FlexiVPN] Proxy clear failed:', e);
  }

  const state = await getState();
  const serverName = state.currentServer?.name || 'сервер';

  await setState({
    connected: false,
    currentServer: null,
    sessionStart: null,
    sessionEndTime: null,
  });

  chrome.alarms.clear('session_end');
  chrome.alarms.clear('session_warning');

  chrome.action.setBadgeText({ text: '' });

  if (reason === 'manual') {
    notify('🔴 VPN отключён', `Отключено от ${serverName}. Ваш реальный IP снова используется.`);
  } else if (reason === 'expired') {
    notify('⏱️ Сессия истекла', 'Бесплатная сессия (60 мин) завершена. Снова подключитесь или получите Premium!');
  }

  return { success: true };
}

// ─── Alarm Handlers ──────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'session_end') {
    await disconnectVPN('expired');
  } else if (alarm.name === 'session_warning') {
    notify('⏱️ FlexiVPN', 'Осталось 5 минут бесплатной сессии! Заходите каждый день для Premium.');
  } else if (alarm.name === 'server_update') {
    await fetchServers();
  }
});

// ─── Message Handler ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'GET_STATE':
        const state = await checkAndUpdateStreak();
        sendResponse({ state, servers: state.servers.length > 0 ? state.servers : getFallbackServers() });
        break;

      case 'CONNECT':
        const connectResult = await connectVPN(msg.serverId || 'auto');
        sendResponse(connectResult);
        break;

      case 'DISCONNECT':
        const disconnectResult = await disconnectVPN('manual');
        sendResponse(disconnectResult);
        break;

      case 'SET_BYPASS_RF':
        await setState({ bypassRF: msg.value });
        sendResponse({ ok: true });
        break;

      case 'ACCEPT_TERMS':
        await setState({ acceptedTerms: true });
        sendResponse({ ok: true });
        break;

      case 'FETCH_SERVERS':
        const servers = await fetchServers();
        sendResponse({ servers });
        break;

      case 'GET_SERVERS':
        const st = await getState();
        sendResponse({ servers: st.servers.length > 0 ? st.servers : getFallbackServers() });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true; // Keep channel open for async
});

// ─── Install / Startup ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open welcome tab
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/welcome.html') });

    // Schedule daily server updates
    chrome.alarms.create('server_update', {
      delayInMinutes: 5,
      periodInMinutes: 24 * 60,
    });

    // Fetch servers immediately
    setTimeout(() => fetchServers(), 3000);

    notify('🎉 FlexiVPN установлен!', 'Добро пожаловать! Нажмите на иконку расширения, чтобы начать.');
  }

  if (details.reason === 'update') {
    notify('🔄 FlexiVPN обновлён', `Версия ${chrome.runtime.getManifest().version} — улучшена стабильность и новые серверы.`);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await checkAndUpdateStreak();
  // Restore alarm if needed
  const alarms = await chrome.alarms.getAll();
  if (!alarms.find(a => a.name === 'server_update')) {
    chrome.alarms.create('server_update', {
      delayInMinutes: 1,
      periodInMinutes: 24 * 60,
    });
  }
  // Fetch fresh servers on browser start
  setTimeout(() => fetchServers(), 5000);
});
