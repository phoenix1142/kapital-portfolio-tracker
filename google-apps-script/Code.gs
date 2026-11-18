/**
 * Мані-кеш — Персональний трекер інвестиційного портфеля (UAH / USD)
 * Google Apps Script (Хмарна база даних на Google Диску для https://phoenix1142.github.io/kapital-portfolio-tracker/ + власний інтерфейс)
 */

const DRIVE_FOLDER_ID = '1X_VHDRMMMszQhb_0TFPg-64joSRfcgaO';
const DRIVE_INDEX_HTML_ID = '19jktydYnWk6NB-rhp_Fni4QO8tqcGlMh';
const GITHUB_HTML_URL = 'https://raw.githubusercontent.com/phoenix1142/kapital-portfolio-tracker/main/google-apps-script/Index.html';
const PORTFOLIO_FILE_NAME = 'portfolio.json';

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';

  if (action === 'get') {
    return jsonOutput_(gasGetPortfolio());
  }

  if (action === 'quotes') {
    var cryptoParam = (e && e.parameter && e.parameter.crypto) || '';
    var stocksParam = (e && e.parameter && e.parameter.stocks) || '';
    return jsonOutput_(gasRefreshQuotes(cryptoParam, stocksParam));
  }

  var htmlContent = '';
  try {
    htmlContent = DriveApp.getFileById(DRIVE_INDEX_HTML_ID).getBlob().getDataAsString('UTF-8');
  } catch (err) {
    var res = UrlFetchApp.fetch(GITHUB_HTML_URL, { muteHttpExceptions: true });
    htmlContent = res.getContentText('UTF-8');
  }

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle('Мані-кеш — Персональний трекер інвестиційного портфеля (UAH / USD)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = JSON.parse(raw);
    if (body.action === 'reset') {
      return jsonOutput_(gasResetDemo());
    }
    return jsonOutput_(gasSavePortfolio(body));
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function getOrCreatePortfolioFolder_() {
  try {
    return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  } catch (e) {
    var folders = DriveApp.getFoldersByName('КАПІТАЛ — Інвестиційний Портфель');
    if (folders.hasNext()) return folders.next();
    return DriveApp.createFolder('КАПІТАЛ — Інвестиційний Портфель');
  }
}

function loadStoreFromDrive_() {
  try {
    var folder = getOrCreatePortfolioFolder_();
    var files = folder.getFilesByName(PORTFOLIO_FILE_NAME);
    if (files.hasNext()) {
      var text = files.next().getBlob().getDataAsString('UTF-8');
      return JSON.parse(text);
    }
  } catch (e) {}

  try {
    var raw = PropertiesService.getUserProperties().getProperty('KAPITAL_PORTFOLIO_STORE');
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  return {
    settings: {
      primaryCurrency: 'UAH',
      manualFxOverride: false,
      fxRates: { USD_UAH: 41.65, EUR_UAH: 44.80 },
      depositTaxDefault: true,
      depositTaxRate: 23.0
    },
    positions: []
  };
}

function saveStoreToDrive_(store) {
  var json = JSON.stringify(store, null, 2);
  try {
    PropertiesService.getUserProperties().setProperty('KAPITAL_PORTFOLIO_STORE', json);
  } catch (e) {}

  try {
    var folder = getOrCreatePortfolioFolder_();
    var files = folder.getFilesByName(PORTFOLIO_FILE_NAME);
    if (files.hasNext()) {
      files.next().setContent(json);
    } else {
      folder.createFile(PORTFOLIO_FILE_NAME, json, MimeType.PLAIN_TEXT);
    }
  } catch (e) {}
}

function gasGetPortfolio() {
  var store = loadStoreFromDrive_();
  var positions = store.positions || [];
  var cryptoTickers = positions.filter(function(p) { return p.category === 'crypto'; }).map(function(p) { return p.ticker; }).join(',');
  var stockTickers = positions.filter(function(p) { return p.category === 'stocks'; }).map(function(p) { return p.ticker; }).join(',');
  var quotes = gasRefreshQuotes(cryptoTickers, stockTickers);
  return {
    settings: store.settings,
    positions: positions,
    auth: { requireAuth: false },
    quotes: quotes
  };
}

function gasSavePortfolio(payload) {
  var store = loadStoreFromDrive_();
  if (payload && Array.isArray(payload.positions)) {
    store.positions = payload.positions;
  }
  if (payload && payload.settings) {
    store.settings = payload.settings;
  }
  saveStoreToDrive_(store);
  return { ok: true, settings: store.settings, positions: store.positions };
}

function gasResetDemo() {
  var folder = getOrCreatePortfolioFolder_();
  var files = folder.getFilesByName(PORTFOLIO_FILE_NAME);
  if (files.hasNext()) {
    var text = files.next().getBlob().getDataAsString('UTF-8');
    return JSON.parse(text);
  }
  return loadStoreFromDrive_();
}

function gasRefreshQuotes(cryptoCsv, stocksCsv, cmcApiKey) {
  var quotes = {
    fx: {
      USD_UAH: 41.65,
      EUR_UAH: 44.80,
      GBP_UAH: 52.80,
      PLN_UAH: 10.35,
      updatedAt: new Date().toISOString(),
      source: 'Google Cloud (НБУ / CoinMarketCap / Yahoo Finance)'
    },
    crypto: {},
    stocks: {}
  };

  var CMC_COIN_IDS = {
    BTC: 1, ETH: 1027, USDT: 825, BNB: 1839, SOL: 5426, USDC: 3408, XRP: 52,
    TON: 11419, DOGE: 74, ADA: 2010, TRX: 1958, AVAX: 5805, SHIB: 5994,
    WBTC: 3717, DOT: 6636, LINK: 1975, BCH: 1831, NEAR: 6535, MATIC: 3890,
    POL: 28321, LTC: 2, UNI: 7083, DAI: 4943, ICP: 8916, APT: 21794,
    PEPE: 24478, KAS: 20396, ETC: 1321, XMR: 328, FET: 3773, SUI: 20947,
    STX: 4847, FIL: 2280, ARB: 11841, XLM: 512, HBAR: 4642, ATOM: 3794,
    OKB: 3897, IMX: 10603, OP: 11840, VET: 3077, INJV: 7226, INJ: 7226,
    MKR: 1518, AAVE: 7278, GRT: 6719, RUNE: 4157, ALGO: 4030, FTN: 22615,
    LDO: 8000, TIA: 22861, SEI: 23149, JUP: 29210, ENA: 30171, WLD: 13502,
    ONDO: 21159, PYTH: 28177, STRK: 22691, ZRO: 26997, WETH: 2396, WSTETH: 12409
  };

  try {
    var nbuRes = UrlFetchApp.fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json', { muteHttpExceptions: true });
    if (nbuRes.getResponseCode() === 200) {
      var nbu = JSON.parse(nbuRes.getContentText());
      if (Array.isArray(nbu)) {
        nbu.forEach(function(item) {
          if (item.cc === 'USD' && item.rate) quotes.fx.USD_UAH = Number(item.rate.toFixed(2));
          if (item.cc === 'EUR' && item.rate) quotes.fx.EUR_UAH = Number(item.rate.toFixed(2));
          if (item.cc === 'GBP' && item.rate) quotes.fx.GBP_UAH = Number(item.rate.toFixed(2));
          if (item.cc === 'PLN' && item.rate) quotes.fx.PLN_UAH = Number(item.rate.toFixed(2));
        });
      }
    }
  } catch (e) {}

  try {
    var store = loadStoreFromDrive_();
    var effectiveCmcKey = cmcApiKey || (store && store.settings && store.settings.cmcApiKey) || '';
    var syms = String(cryptoCsv || 'BTC,ETH,SOL,TON,BNB,AAVE').split(',').map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean);

    // 1. If user provided CoinMarketCap Pro API Key, query Official CMC Pro v1 API
    if (effectiveCmcKey && syms.length > 0) {
      try {
        var proUrl = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=' + encodeURIComponent(syms.join(',')) + '&convert=USD';
        var proRes = UrlFetchApp.fetch(proUrl, {
          muteHttpExceptions: true,
          headers: {
            'X-CMC_PRO_API_KEY': effectiveCmcKey,
            'Accept': 'application/json'
          }
        });
        if (proRes.getResponseCode() === 200) {
          var proJson = JSON.parse(proRes.getContentText());
          if (proJson && proJson.data) {
            syms.forEach(function(sym) {
              var entry = proJson.data[sym];
              if (Array.isArray(entry)) entry = entry[0];
              var usdQuote = entry && entry.quote && entry.quote.USD;
              if (usdQuote && usdQuote.price > 0) {
                quotes.crypto[sym] = {
                  name: entry.name || sym,
                  priceUsd: Number(usdQuote.price),
                  change24h: Number((usdQuote.percent_change_24h || 0).toFixed(2)),
                  source: 'CoinMarketCap'
                };
              }
            });
          }
        }
      } catch (e) {}
    }

    // 2. CoinMarketCap Public Data API v3 (No API key required - fetches top 300 ranked coins in 1 call)
    var missingSyms = syms.filter(function(s) { return !quotes.crypto[s]; });
    if (missingSyms.length > 0) {
      try {
        var listUrl = 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=1&limit=300&sortBy=market_cap&sortType=desc&convert=USD';
        var listRes = UrlFetchApp.fetch(listUrl, {
          muteHttpExceptions: true,
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        });
        if (listRes.getResponseCode() === 200) {
          var listJson = JSON.parse(listRes.getContentText());
          var coinList = (listJson && listJson.data && listJson.data.cryptoCurrencyList) || [];
          coinList.forEach(function(c) {
            var sym = String(c.symbol || '').toUpperCase();
            if (!quotes.crypto[sym] && Array.isArray(c.quotes)) {
              var usdQ = null;
              for (var i = 0; i < c.quotes.length; i++) {
                if (c.quotes[i].name === 'USD') { usdQ = c.quotes[i]; break; }
              }
              if (!usdQ && c.quotes.length > 0) usdQ = c.quotes[0];
              if (usdQ && usdQ.price > 0) {
                quotes.crypto[sym] = {
                  name: c.name || sym,
                  priceUsd: Number(usdQ.price),
                  change24h: Number((usdQ.percentChange24h || 0).toFixed(2)),
                  source: 'CoinMarketCap'
                };
              }
            }
          });
        }
      } catch (e) {}
    }

    // 3. CoinMarketCap Detail API for any specific coin IDs not in top 300
    missingSyms = syms.filter(function(s) { return !quotes.crypto[s]; });
    missingSyms.forEach(function(sym) {
      var cmcId = CMC_COIN_IDS[sym];
      if (cmcId) {
        try {
          var detUrl = 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail?id=' + cmcId;
          var detRes = UrlFetchApp.fetch(detUrl, {
            muteHttpExceptions: true,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
          });
          if (detRes.getResponseCode() === 200) {
            var detJson = JSON.parse(detRes.getContentText());
            var detData = detJson && detJson.data;
            var stats = detData && detData.statistics;
            if (stats && stats.price > 0) {
              quotes.crypto[sym] = {
                name: detData.name || sym,
                priceUsd: Number(stats.price),
                change24h: Number((stats.priceChangePercentage24h || 0).toFixed(2)),
                source: 'CoinMarketCap'
              };
            }
          }
        } catch (e) {}
      }
    });

    // 4. Final fallback to Binance only for symbols still missing
    missingSyms = syms.filter(function(s) { return !quotes.crypto[s] && s !== 'USDT' && s !== 'USDC'; });
    missingSyms.forEach(function(sym) {
      try {
        var res = UrlFetchApp.fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + encodeURIComponent(sym + 'USDT'), { muteHttpExceptions: true });
        if (res.getResponseCode() === 200) {
          var d = JSON.parse(res.getContentText());
          var p = parseFloat(d.lastPrice);
          var chg = parseFloat(d.priceChangePercent);
          if (!isNaN(p) && p > 0) {
            quotes.crypto[sym] = { name: sym, priceUsd: p, change24h: isNaN(chg) ? 0 : chg, source: 'Binance' };
          }
        }
      } catch (e) {}
    });
  } catch (e) {}

  try {
    var stockSyms = String(stocksCsv || 'VOO,SPY,NVDA,VWCE,QQQ,AAPL,MSFT').split(',').map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 12);
    stockSyms.forEach(function(sym) {
      try {
        var yfRes = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=2d', { muteHttpExceptions: true });
        if (yfRes.getResponseCode() === 200) {
          var yf = JSON.parse(yfRes.getContentText());
          var meta = yf && yf.chart && yf.chart.result && yf.chart.result[0] && yf.chart.result[0].meta;
          if (meta && meta.regularMarketPrice) {
            var prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
            var chg = prev > 0 ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0;
            quotes.stocks[sym] = {
              name: meta.shortName || meta.longName || sym,
              priceUsd: Number(meta.regularMarketPrice),
              change24h: Number(chg.toFixed(2))
            };
          }
        }
      } catch (e) {}
    });
  } catch (e) {}

  return quotes;
}
