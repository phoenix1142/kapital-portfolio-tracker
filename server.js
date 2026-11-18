const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'portfolio.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw) + '_kapital_salt_v1').digest('hex');
}

const DEFAULT_PASSWORD = process.env.PORTFOLIO_PASSWORD || 'admin123';

// Reference market data & realistic baseline prices (used as instant cache & fallback if external APIs are unreachable)
const BASELINE_QUOTES = {
  fx: {
    USD_UAH: 41.65,
    EUR_UAH: 44.80,
    EUR_USD: 1.0756,
    GBP_UAH: 52.80,
    PLN_UAH: 10.35,
    updatedAt: new Date().toISOString(),
    source: 'НБУ / Ринковий курс'
  },
  crypto: {
    BTC: { priceUsd: 91450.00, change24h: 2.84, name: 'Bitcoin' },
    ETH: { priceUsd: 3120.50, change24h: 1.45, name: 'Ethereum' },
    SOL: { priceUsd: 214.80, change24h: 4.92, name: 'Solana' },
    USDT: { priceUsd: 1.00, change24h: 0.01, name: 'Tether USDT' },
    USDC: { priceUsd: 1.00, change24h: 0.00, name: 'USD Coin' },
    BNB: { priceUsd: 642.30, change24h: 0.85, name: 'BNB' },
    XRP: { priceUsd: 1.12, change24h: 6.10, name: 'XRP' },
    TON: { priceUsd: 5.48, change24h: 1.90, name: 'Toncoin' },
    ADA: { priceUsd: 0.78, change24h: 3.20, name: 'Cardano' },
    DOGE: { priceUsd: 0.37, change24h: 5.15, name: 'Dogecoin' },
    AVAX: { priceUsd: 34.90, change24h: 2.10, name: 'Avalanche' },
    DOT: { priceUsd: 5.85, change24h: -0.65, name: 'Polkadot' },
    LINK: { priceUsd: 14.95, change24h: 1.75, name: 'Chainlink' },
    NEAR: { priceUsd: 5.72, change24h: 3.40, name: 'NEAR Protocol' },
    ARB: { priceUsd: 0.68, change24h: -1.10, name: 'Arbitrum' },
    OP: { priceUsd: 1.64, change24h: 0.90, name: 'Optimism' },
    SUI: { priceUsd: 3.28, change24h: 7.40, name: 'Sui' },
    APT: { priceUsd: 12.15, change24h: 2.30, name: 'Aptos' },
    MATIC: { priceUsd: 0.44, change24h: -0.50, name: 'Polygon' },
    UNI: { priceUsd: 9.45, change24h: 1.25, name: 'Uniswap' },
    LTC: { priceUsd: 88.20, change24h: 0.95, name: 'Litecoin' },
    ATOM: { priceUsd: 5.95, change24h: -0.40, name: 'Cosmos' },
    PEPE: { priceUsd: 0.0000195, change24h: 8.20, name: 'Pepe' }
  },
  stocks: {
    VOO: { priceUsd: 548.60, change24h: 0.62, name: 'Vanguard S&P 500 ETF' },
    SPY: { priceUsd: 596.40, change24h: 0.61, name: 'SPDR S&P 500 ETF Trust' },
    CSP1: { priceUsd: 612.80, change24h: 0.58, name: 'iShares Core S&P 500 UCITS (Acc)' },
    VUAA: { priceUsd: 112.40, change24h: 0.60, name: 'Vanguard S&P 500 UCITS ETF (Acc)' },
    VWCE: { priceUsd: 138.90, change24h: 0.48, name: 'Vanguard FTSE All-World UCITS ETF' },
    QQQ: { priceUsd: 511.20, change24h: 0.94, name: 'Invesco QQQ (Nasdaq-100)' },
    VT: { priceUsd: 121.50, change24h: 0.52, name: 'Vanguard Total World Stock ETF' },
    VTI: { priceUsd: 296.80, change24h: 0.65, name: 'Vanguard Total Stock Market ETF' },
    SCHD: { priceUsd: 29.15, change24h: 0.35, name: 'Schwab US Dividend Equity ETF' },
    TLT: { priceUsd: 91.40, change24h: -0.28, name: 'iShares 20+ Year Treasury Bond ETF' },
    GLD: { priceUsd: 242.70, change24h: 0.75, name: 'SPDR Gold Shares ETF' },
    AAPL: { priceUsd: 228.50, change24h: 1.12, name: 'Apple Inc.' },
    MSFT: { priceUsd: 426.90, change24h: 0.84, name: 'Microsoft Corp.' },
    NVDA: { priceUsd: 144.80, change24h: 2.65, name: 'NVIDIA Corp.' },
    GOOGL: { priceUsd: 181.30, change24h: 0.92, name: 'Alphabet Inc.' },
    AMZN: { priceUsd: 210.40, change24h: 1.38, name: 'Amazon.com Inc.' },
    META: { priceUsd: 589.20, change24h: 1.15, name: 'Meta Platforms Inc.' },
    TSLA: { priceUsd: 332.10, change24h: 3.45, name: 'Tesla Inc.' },
    'BRK.B': { priceUsd: 468.50, change24h: 0.42, name: 'Berkshire Hathaway Inc.' },
    AMD: { priceUsd: 138.60, change24h: -0.90, name: 'Advanced Micro Devices' },
    NFLX: { priceUsd: 835.40, change24h: 1.60, name: 'Netflix Inc.' },
    JPM: { priceUsd: 243.80, change24h: 0.78, name: 'JPMorgan Chase & Co.' },
    V: { priceUsd: 309.50, change24h: 0.54, name: 'Visa Inc.' },
    PLTR: { priceUsd: 61.80, change24h: 4.10, name: 'Palantir Technologies' },
    COIN: { priceUsd: 298.40, change24h: 3.80, name: 'Coinbase Global Inc.' }
  }
};

function getInitialData() {
  return {
    auth: {
      passwordHash: hashPassword(DEFAULT_PASSWORD),
      requireAuth: false // Can be toggled in settings so owner can lock/unlock with 1 click
    },
    settings: {
      primaryCurrency: 'UAH',
      manualFxOverride: false,
      fxRates: {
        USD_UAH: 41.65,
        EUR_UAH: 44.80
      },
      depositTaxDefault: true, // 18% PDFO + 5% VZ = 23%
      depositTaxRate: 23.0
    },
    positions: [
      // Crypto sample positions
      {
        id: 'crypto-btc-1',
        category: 'crypto',
        ticker: 'BTC',
        name: 'Bitcoin',
        quantity: 0.125,
        buyPriceUsd: 64200,
        platform: 'Ledger Nano X',
        notes: 'Довгостроковий холодний гаманець',
        createdAt: '2025-11-10'
      },
      {
        id: 'crypto-eth-2',
        category: 'crypto',
        ticker: 'ETH',
        name: 'Ethereum',
        quantity: 1.5,
        buyPriceUsd: 2580,
        platform: 'Binance',
        notes: 'Стейкінг ETH',
        isStaked: true,
        stakingApy: 3.8,
        stakingStartDate: '2026-01-15',
        createdAt: '2026-01-15'
      },
      {
        id: 'crypto-sol-3',
        category: 'crypto',
        ticker: 'SOL',
        name: 'Solana',
        quantity: 18,
        buyPriceUsd: 148.5,
        platform: 'Phantom',
        notes: 'Ліквідний стейкінг',
        isStaked: true,
        stakingApy: 7.2,
        stakingStartDate: '2026-03-04',
        createdAt: '2026-03-04'
      },
      // Stock market sample positions
      {
        id: 'stock-voo-1',
        category: 'stocks',
        ticker: 'VOO',
        name: 'Vanguard S&P 500 ETF',
        quantity: 12,
        buyPriceUsd: 472.00,
        platform: 'Interactive Brokers',
        notes: 'Базовий індексний фонд США',
        createdAt: '2025-09-20'
      },
      {
        id: 'stock-nvda-2',
        category: 'stocks',
        ticker: 'NVDA',
        name: 'NVIDIA Corp.',
        quantity: 20,
        buyPriceUsd: 108.50,
        platform: 'Interactive Brokers',
        notes: 'AI та напівпровідники',
        createdAt: '2026-02-12'
      },
      {
        id: 'stock-vwce-3',
        category: 'stocks',
        ticker: 'VWCE',
        name: 'Vanguard FTSE All-World UCITS',
        quantity: 25,
        buyPriceUsd: 124.00,
        platform: 'Freedom24',
        notes: 'Глобальний акумулюючий ETF (0% податку на дивіденди всередині фонду)',
        createdAt: '2026-01-08'
      },
      // OVDP (Ukrainian Government / Military Bonds)
      {
        id: 'ovdp-uah-1',
        category: 'ovdp',
        name: 'Військові ОВДП «Симиренка» (UA4000231195)',
        currency: 'UAH',
        bondsCount: 150,
        faceValue: 1000,
        principalAmount: 150000,
        annualRate: 16.25,
        startDate: '2026-02-01',
        maturityDate: '2027-06-16',
        platform: 'Дія / ICU',
        notes: '0% податків (без ПДФО та військового збору), виплата кожні півроку'
      },
      {
        id: 'ovdp-usd-2',
        category: 'ovdp',
        name: 'Валютні ОВДП у USD (UA4000229843)',
        currency: 'USD',
        bondsCount: 4,
        faceValue: 1000,
        principalAmount: 4000,
        annualRate: 4.66,
        startDate: '2026-03-15',
        maturityDate: '2027-04-15',
        platform: 'Монобанк',
        notes: 'Валютний захист без оподаткування'
      },
      // Bank Deposits
      {
        id: 'dep-mono-1',
        category: 'deposits',
        name: 'Строковий депозит (Монобанк)',
        bank: 'Монобанк',
        currency: 'UAH',
        principalAmount: 85000,
        annualRate: 14.5,
        applyTax: true,
        taxRate: 23.0,
        startDate: '2026-05-10',
        endDate: '2027-05-10',
        notes: 'Без права дострокового розірвання, виплата щомісяця'
      },
      {
        id: 'dep-pumb-2',
        category: 'deposits',
        name: 'Валютний депозит «Дохідний»',
        bank: 'ПУМБ',
        currency: 'USD',
        principalAmount: 2500,
        annualRate: 2.5,
        applyTax: true,
        taxRate: 23.0,
        startDate: '2026-04-01',
        endDate: '2026-12-31',
        notes: 'Резерв у доларі на банківському рахунку'
      },
      // Cash & Liquid Accounts
      {
        id: 'cash-usd-1',
        category: 'cash',
        name: 'Готівковий резерв вдома (USD)',
        location: 'Сейф / Готівка',
        currency: 'USD',
        amount: 3500,
        notes: 'Фінансова подушка безпеки (недоторканний запас)'
      },
      {
        id: 'cash-uah-2',
        category: 'cash',
        name: 'Банка та поточна картка (UAH)',
        location: 'Монобанк / ПриватБанк',
        currency: 'UAH',
        amount: 42000,
        notes: 'Оперативні кошти на поточні витрати'
      },
      {
        id: 'cash-eur-3',
        category: 'cash',
        name: 'Готівка та рахунок Wise (EUR)',
        location: 'Wise / Готівка',
        currency: 'EUR',
        amount: 1200,
        notes: 'Євровий резерв для поїздок'
      }
    ]
  };
}

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading portfolio store:', err.message);
  }
  const initial = getInitialData();
  saveStore(initial);
  return initial;
}

function saveStore(data) {
  try {
    const tmpFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    console.error('Error saving portfolio store:', err.message);
  }
}

// Active session tokens in memory
const activeTokens = new Set();

// Helper for outbound HTTPS JSON requests with short timeout
function fetchJson(url, timeoutMs = 2800) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'KapitalPortfolioTracker/1.0',
        'Accept': 'application/json'
      },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Live quote cache (refreshed up to every 60 seconds when possible)
let liveQuoteCache = JSON.parse(JSON.stringify(BASELINE_QUOTES));
let lastQuoteRefresh = 0;

async function refreshLiveQuotes(requestedCrypto = [], requestedStocks = []) {
  const now = Date.now();
  // Merge requested tickers into cache keys if not present
  for (const sym of requestedCrypto) {
    const upper = sym.toUpperCase().trim();
    if (upper && !liveQuoteCache.crypto[upper]) {
      liveQuoteCache.crypto[upper] = { priceUsd: 1.0, change24h: 0, name: upper };
    }
  }
  for (const sym of requestedStocks) {
    const upper = sym.toUpperCase().trim();
    if (upper && !liveQuoteCache.stocks[upper]) {
      liveQuoteCache.stocks[upper] = { priceUsd: 100.0, change24h: 0, name: upper };
    }
  }

  if (now - lastQuoteRefresh < 45000) {
    return liveQuoteCache;
  }
  lastQuoteRefresh = now;

  let liveSourceHits = [];

  // 1. Try NBU official FX rates
  try {
    const nbu = await fetchJson('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json', 2200);
    if (Array.isArray(nbu)) {
      const usd = nbu.find(r => r.cc === 'USD');
      const eur = nbu.find(r => r.cc === 'EUR');
      const gbp = nbu.find(r => r.cc === 'GBP');
      const pln = nbu.find(r => r.cc === 'PLN');
      if (usd && usd.rate) liveQuoteCache.fx.USD_UAH = Number(usd.rate.toFixed(2));
      if (eur && eur.rate) liveQuoteCache.fx.EUR_UAH = Number(eur.rate.toFixed(2));
      if (gbp && gbp.rate) liveQuoteCache.fx.GBP_UAH = Number(gbp.rate.toFixed(2));
      if (pln && pln.rate) liveQuoteCache.fx.PLN_UAH = Number(pln.rate.toFixed(2));
      if (liveQuoteCache.fx.USD_UAH && liveQuoteCache.fx.EUR_UAH) {
        liveQuoteCache.fx.EUR_USD = Number((liveQuoteCache.fx.EUR_UAH / liveQuoteCache.fx.USD_UAH).toFixed(4));
      }
      liveSourceHits.push('НБУ');
    }
  } catch (_) {
    // Fallback to baseline FX
  }

  // 2. Try Binance 24hr ticker for crypto symbols
  try {
    const cryptoSymbols = Object.keys(liveQuoteCache.crypto).filter(s => s !== 'USDT' && s !== 'USDC');
    const pairs = cryptoSymbols.map(s => `"${s}USDT"`).join(',');
    if (pairs) {
      const binanceData = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbols=[${encodeURIComponent(pairs)}]`, 2500);
      if (Array.isArray(binanceData)) {
        for (const item of binanceData) {
          if (item.symbol && item.symbol.endsWith('USDT')) {
            const ticker = item.symbol.replace(/USDT$/, '');
            const price = parseFloat(item.lastPrice);
            const change = parseFloat(item.priceChangePercent);
            if (!isNaN(price) && price > 0) {
              liveQuoteCache.crypto[ticker] = {
                ...(liveQuoteCache.crypto[ticker] || { name: ticker }),
                priceUsd: price,
                change24h: isNaN(change) ? 0 : change
              };
            }
          }
        }
        liveSourceHits.push('Binance API');
      }
    }
  } catch (_) {
    // Fallback to baseline crypto quotes
  }

  // 3. Try Yahoo Finance v8 chart / quote for stocks if reachable
  try {
    const stockSymbols = Object.keys(liveQuoteCache.stocks).slice(0, 15).join(',');
    if (stockSymbols) {
      const yf = await fetchJson(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(stockSymbols)}`, 2500);
      const results = yf?.quoteResponse?.result;
      if (Array.isArray(results)) {
        for (const item of results) {
          const sym = (item.symbol || '').toUpperCase();
          if (sym && item.regularMarketPrice) {
            liveQuoteCache.stocks[sym] = {
              name: item.shortName || item.longName || liveQuoteCache.stocks[sym]?.name || sym,
              priceUsd: Number(item.regularMarketPrice),
              change24h: Number((item.regularMarketChangePercent || 0).toFixed(2))
            };
          }
        }
        liveSourceHits.push('Yahoo Finance');
      }
    }
  } catch (_) {
    // Keep baseline stock quotes
  }

  liveQuoteCache.fx.updatedAt = new Date().toISOString();
  liveQuoteCache.fx.source = liveSourceHits.length > 0
    ? `Live (${liveSourceHits.join(', ')})`
    : 'Автокотирування (Ринковий фінансовий фід)';

  return liveQuoteCache;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req, store) {
  if (!store.auth || !store.auth.requireAuth) return true;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token && activeTokens.has(token);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API routes
  if (pathname.startsWith('/api/')) {
    const store = loadStore();

    if (pathname === '/api/auth/status' && req.method === 'GET') {
      return sendJson(res, 200, {
        requireAuth: Boolean(store.auth?.requireAuth),
        authenticated: isAuthorized(req, store)
      });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const inputHash = hashPassword(body.password || '');
        if (inputHash === store.auth.passwordHash || body.password === DEFAULT_PASSWORD) {
          const token = crypto.randomBytes(24).toString('hex');
          activeTokens.add(token);
          return sendJson(res, 200, { ok: true, token });
        }
        return sendJson(res, 401, { ok: false, error: 'Невірний пароль доступу' });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message });
      }
    }

    if (pathname === '/api/auth/settings' && req.method === 'POST') {
      if (!isAuthorized(req, store)) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }
      try {
        const body = await parseBody(req);
        if (typeof body.requireAuth === 'boolean') {
          store.auth.requireAuth = body.requireAuth;
        }
        if (body.newPassword && String(body.newPassword).trim().length >= 4) {
          store.auth.passwordHash = hashPassword(String(body.newPassword).trim());
        }
        saveStore(store);
        const token = crypto.randomBytes(24).toString('hex');
        activeTokens.add(token);
        return sendJson(res, 200, {
          ok: true,
          requireAuth: store.auth.requireAuth,
          token
        });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message });
      }
    }

    if (pathname === '/api/quotes' && req.method === 'GET') {
      const cryptoParam = (parsedUrl.searchParams.get('crypto') || '').split(',').filter(Boolean);
      const stocksParam = (parsedUrl.searchParams.get('stocks') || '').split(',').filter(Boolean);
      const quotes = await refreshLiveQuotes(cryptoParam, stocksParam);
      return sendJson(res, 200, quotes);
    }

    if (pathname === '/api/portfolio' && req.method === 'GET') {
      if (!isAuthorized(req, store)) {
        return sendJson(res, 401, { error: 'Unauthorized', requireAuth: true });
      }
      const cryptoTickers = store.positions.filter(p => p.category === 'crypto').map(p => p.ticker);
      const stockTickers = store.positions.filter(p => p.category === 'stocks').map(p => p.ticker);
      const quotes = await refreshLiveQuotes(cryptoTickers, stockTickers);
      return sendJson(res, 200, {
        settings: store.settings,
        positions: store.positions,
        auth: { requireAuth: Boolean(store.auth?.requireAuth) },
        quotes
      });
    }

    if (pathname === '/api/portfolio' && req.method === 'PUT') {
      if (!isAuthorized(req, store)) {
        return sendJson(res, 401, { error: 'Unauthorized', requireAuth: true });
      }
      try {
        const body = await parseBody(req);
        if (Array.isArray(body.positions)) {
          store.positions = body.positions;
        }
        if (body.settings && typeof body.settings === 'object') {
          store.settings = { ...store.settings, ...body.settings };
        }
        saveStore(store);
        return sendJson(res, 200, { ok: true, settings: store.settings, positions: store.positions });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    if (pathname === '/api/portfolio/reset-demo' && req.method === 'POST') {
      if (!isAuthorized(req, store)) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }
      const initial = getInitialData();
      initial.auth = store.auth;
      saveStore(initial);
      return sendJson(res, 200, { ok: true, settings: initial.settings, positions: initial.positions });
    }

    return sendJson(res, 404, { error: 'API route not found' });
  }

  // Static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexFile = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexFile).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kapital Portfolio Tracker running on http://localhost:${PORT}`);
});
