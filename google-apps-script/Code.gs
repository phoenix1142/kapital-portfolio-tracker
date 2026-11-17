/**
 * КАПІТАЛ — Персональний трекер інвестиційного портфеля (UAH / USD)
 * Google Apps Script Backend (Хостинг та автозбереження даних у Google Drive)
 */

const DRIVE_FOLDER_ID = '1X_VHDRMMMszQhb_0TFPg-64joSRfcgaO';
const DRIVE_FOLDER_NAME = 'КАПІТАЛ — Інвестиційний Портфель';
const PORTFOLIO_FILE_NAME = 'portfolio.json';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('КАПІТАЛ — Персональний трекер інвестиційного портфеля (UAH / USD)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getInitialStore() {
  return {
    auth: {
      requireAuth: false
    },
    settings: {
      primaryCurrency: 'UAH',
      manualFxOverride: false,
      fxRates: {
        USD_UAH: 41.65,
        EUR_UAH: 44.80
      },
      depositTaxDefault: true,
      depositTaxRate: 23.0
    },
    positions: [
      { id: 'crypto-btc-1', category: 'crypto', ticker: 'BTC', name: 'Bitcoin', quantity: 0.125, buyPriceUsd: 64200, platform: 'Ledger Nano X', notes: 'Довгостроковий холодний гаманець', createdAt: '2025-11-10' },
      { id: 'crypto-eth-2', category: 'crypto', ticker: 'ETH', name: 'Ethereum', quantity: 1.5, buyPriceUsd: 2580, platform: 'Binance', notes: 'Стейкінг ETH', createdAt: '2026-01-15' },
      { id: 'crypto-sol-3', category: 'crypto', ticker: 'SOL', name: 'Solana', quantity: 18, buyPriceUsd: 148.5, platform: 'Phantom', notes: 'Ліквідний стейкінг', createdAt: '2026-03-04' },
      { id: 'stock-voo-1', category: 'stocks', ticker: 'VOO', name: 'Vanguard S&P 500 ETF', quantity: 12, buyPriceUsd: 472.00, platform: 'Interactive Brokers', notes: 'Базовий індексний фонд США', createdAt: '2025-09-20' },
      { id: 'stock-nvda-2', category: 'stocks', ticker: 'NVDA', name: 'NVIDIA Corp.', quantity: 20, buyPriceUsd: 108.50, platform: 'Interactive Brokers', notes: 'AI та напівпровідники', createdAt: '2026-02-12' },
      { id: 'stock-vwce-3', category: 'stocks', ticker: 'VWCE', name: 'Vanguard FTSE All-World UCITS', quantity: 25, buyPriceUsd: 124.00, platform: 'Freedom24', notes: 'Глобальний акумулюючий ETF (0% податку на дивіденди всередині фонду)', createdAt: '2026-01-08' },
      { id: 'ovdp-uah-1', category: 'ovdp', name: 'Військові ОВДП «Симиренка» (UA4000231195)', currency: 'UAH', bondsCount: 150, faceValue: 1000, principalAmount: 150000, annualRate: 16.25, startDate: '2026-02-01', maturityDate: '2027-06-16', platform: 'Дія / ICU', notes: '0% податків (без ПДФО та військового збору), виплата кожні півроку' },
      { id: 'ovdp-usd-2', category: 'ovdp', name: 'Валютні ОВДП у USD (UA4000229843)', currency: 'USD', bondsCount: 4, faceValue: 1000, principalAmount: 4000, annualRate: 4.66, startDate: '2026-03-15', maturityDate: '2027-04-15', platform: 'Монобанк', notes: 'Валютний захист без оподаткування' },
      { id: 'dep-mono-1', category: 'deposits', name: 'Строковий депозит (Монобанк)', bank: 'Монобанк', currency: 'UAH', principalAmount: 85000, annualRate: 14.5, applyTax: true, taxRate: 23.0, startDate: '2026-05-10', endDate: '2027-05-10', notes: 'Без права дострокового розірвання, виплата щомісяця' },
      { id: 'dep-pumb-2', category: 'deposits', name: 'Валютний депозит «Дохідний»', bank: 'ПУМБ', currency: 'USD', principalAmount: 2500, annualRate: 2.5, applyTax: true, taxRate: 23.0, startDate: '2026-04-01', endDate: '2026-12-31', notes: 'Резерв у доларі на банківському рахунку' },
      { id: 'cash-usd-1', category: 'cash', name: 'Готівковий резерв вдома (USD)', location: 'Сейф / Готівка', currency: 'USD', amount: 3500, notes: 'Фінансова подушка безпеки (недоторканний запас)' },
      { id: 'cash-uah-2', category: 'cash', name: 'Банка та поточна картка (UAH)', location: 'Монобанк / ПриватБанк', currency: 'UAH', amount: 42000, notes: 'Оперативні кошти на поточні витрати' },
      { id: 'cash-eur-3', category: 'cash', name: 'Готівка та рахунок Wise (EUR)', location: 'Wise / Готівка', currency: 'EUR', amount: 1200, notes: 'Євровий резерв для поїздок' }
    ]
  };
}

function getOrCreatePortfolioFolder_() {
  try {
    return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  } catch (_) {
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    if (folders.hasNext()) return folders.next();
    return DriveApp.createFolder(DRIVE_FOLDER_NAME);
  }
}

function loadStoreFromDrive_() {
  try {
    const folder = getOrCreatePortfolioFolder_();
    const files = folder.getFilesByName(PORTFOLIO_FILE_NAME);
    if (files.hasNext()) {
      const content = files.next().getBlob().getDataAsString('UTF-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('Drive read fallback to PropertiesService:', e);
  }

  try {
    const raw = PropertiesService.getUserProperties().getProperty('KAPITAL_PORTFOLIO_STORE');
    if (raw) return JSON.parse(raw);
  } catch (_) {}

  const initial = getInitialStore();
  saveStoreToDrive_(initial);
  return initial;
}

function saveStoreToDrive_(store) {
  const json = JSON.stringify(store, null, 2);
  try {
    PropertiesService.getUserProperties().setProperty('KAPITAL_PORTFOLIO_STORE', json);
  } catch (_) {}

  try {
    const folder = getOrCreatePortfolioFolder_();
    const files = folder.getFilesByName(PORTFOLIO_FILE_NAME);
    if (files.hasNext()) {
      files.next().setContent(json);
    } else {
      folder.createFile(PORTFOLIO_FILE_NAME, json, MimeType.PLAIN_TEXT);
    }
  } catch (e) {
    console.warn('Could not write portfolio.json to Drive folder:', e);
  }
}

function gasGetPortfolio() {
  const store = loadStoreFromDrive_();
  const cryptoTickers = (store.positions || []).filter(p => p.category === 'crypto').map(p => p.ticker).join(',');
  const stockTickers = (store.positions || []).filter(p => p.category === 'stocks').map(p => p.ticker).join(',');
  const quotes = gasRefreshQuotes(cryptoTickers, stockTickers);
  return {
    settings: store.settings,
    positions: store.positions,
    auth: { requireAuth: false },
    quotes: quotes
  };
}

function gasSavePortfolio(payload) {
  const store = loadStoreFromDrive_();
  if (payload && Array.isArray(payload.positions)) {
    store.positions = payload.positions;
  }
  if (payload && payload.settings) {
    store.settings = Object.assign({}, store.settings || {}, payload.settings);
  }
  saveStoreToDrive_(store);
  return { ok: true, settings: store.settings, positions: store.positions };
}

function gasResetDemo() {
  const initial = getInitialStore();
  saveStoreToDrive_(initial);
  return { ok: true, settings: initial.settings, positions: initial.positions };
}

function gasRefreshQuotes(cryptoCsv, stocksCsv) {
  const quotes = {
    fx: {
      USD_UAH: 41.65,
      EUR_UAH: 44.80,
      GBP_UAH: 52.80,
      PLN_UAH: 10.35,
      updatedAt: new Date().toISOString(),
      source: 'Google Cloud (НБУ / Binance / Yahoo Finance)'
    },
    crypto: {},
    stocks: {}
  };

  // 1. NBU FX Rates
  try {
    const nbuRes = UrlFetchApp.fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json', { muteHttpExceptions: true });
    if (nbuRes.getResponseCode() === 200) {
      const nbu = JSON.parse(nbuRes.getContentText());
      if (Array.isArray(nbu)) {
        nbu.forEach(item => {
          if (item.cc === 'USD' && item.rate) quotes.fx.USD_UAH = Number(item.rate.toFixed(2));
          if (item.cc === 'EUR' && item.rate) quotes.fx.EUR_UAH = Number(item.rate.toFixed(2));
          if (item.cc === 'GBP' && item.rate) quotes.fx.GBP_UAH = Number(item.rate.toFixed(2));
          if (item.cc === 'PLN' && item.rate) quotes.fx.PLN_UAH = Number(item.rate.toFixed(2));
        });
      }
    }
  } catch (_) {}

  // 2. Binance Crypto Quotes
  try {
    const syms = String(cryptoCsv || 'BTC,ETH,SOL,TON,BNB').split(',').map(s => s.trim().toUpperCase()).filter(s => s && s !== 'USDT' && s !== 'USDC');
    const uniqueSyms = Array.from(new Set(syms));
    uniqueSyms.forEach(sym => {
      try {
        const res = UrlFetchApp.fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + encodeURIComponent(sym + 'USDT'), { muteHttpExceptions: true });
        if (res.getResponseCode() === 200) {
          const d = JSON.parse(res.getContentText());
          const p = parseFloat(d.lastPrice);
          const chg = parseFloat(d.priceChangePercent);
          if (!isNaN(p) && p > 0) {
            quotes.crypto[sym] = { name: sym, priceUsd: p, change24h: isNaN(chg) ? 0 : chg };
          }
        }
      } catch (_) {}
    });
  } catch (_) {}

  // 3. Yahoo Finance Stock Quotes
  try {
    const stockSyms = String(stocksCsv || 'VOO,SPY,NVDA,VWCE,QQQ,AAPL,MSFT').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const uniqueStocks = Array.from(new Set(stockSyms)).slice(0, 15);
    uniqueStocks.forEach(sym => {
      try {
        const yfRes = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=2d', { muteHttpExceptions: true });
        if (yfRes.getResponseCode() === 200) {
          const yf = JSON.parse(yfRes.getContentText());
          const meta = yf && yf.chart && yf.chart.result && yf.chart.result[0] && yf.chart.result[0].meta;
          if (meta && meta.regularMarketPrice) {
            const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
            const chg = prev > 0 ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0;
            quotes.stocks[sym] = {
              name: meta.shortName || meta.longName || sym,
              priceUsd: Number(meta.regularMarketPrice),
              change24h: Number(chg.toFixed(2))
            };
          }
        }
      } catch (_) {}
    });
  } catch (_) {}

  return quotes;
}
