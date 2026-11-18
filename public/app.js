/* Мані-кеш — Персональний трекер інвестиційного портфеля */
(function () {
  'use strict';

  const CATEGORY_META = {
    all: {
      title: 'Загальна картина портфеля',
      subtitle: 'Усі активи з автоматичним перерахунком у Гривню (₴) та Долар США ($)',
      color: 'var(--accent-primary)',
      shortName: 'Усі активи'
    },
    crypto: {
      title: 'Криптовалютні активи',
      subtitle: 'Автоматичне підтягування котирувань (Binance / CoinGecko) та розрахунок PnL',
      color: 'var(--cat-crypto)',
      shortName: 'Криптовалюта'
    },
    stocks: {
      title: 'Фондовий ринок (Акції та ETF)',
      subtitle: 'Автоматичне підтягування ринкових цін акцій США та світових ETF',
      color: 'var(--cat-stocks)',
      shortName: 'Фондовий ринок'
    },
    ovdp: {
      title: 'ОВДП (Державні та військові облігації)',
      subtitle: 'Автоматичний розрахунок накопиченого доходу за річною ставкою (0% податків)',
      color: 'var(--cat-ovdp)',
      shortName: 'ОВДП'
    },
    deposits: {
      title: 'Банківські депозити',
      subtitle: 'Автоматичний підрахунок нарахованих відсотків з урахуванням податку або чистої ставки',
      color: 'var(--cat-deposits)',
      shortName: 'Депозити'
    },
    cash: {
      title: 'Готівка та поточні рахунки',
      subtitle: 'Облік готівкових заощаджень, сейфу та банківських карток у різних валютах',
      color: 'var(--cat-cash)',
      shortName: 'Готівка'
    }
  };

  const QUICK_CRYPTO = ['BTC', 'ETH', 'SOL', 'USDT', 'TON', 'BNB', 'XRP', 'ADA', 'SUI', 'DOGE', 'LINK', 'AVAX'];
  const QUICK_STOCKS = ['VOO', 'SPY', 'VWCE', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'TLT', 'BND', 'SGOV', 'GLD', 'IAU', 'SLV'];

  const STOCK_SUBTYPES_META = {
    equities: {
      key: 'equities',
      label: 'Акції',
      fullLabel: '📈 Акції та ETF на акції',
      badge: '📈 Акції',
      color: '#38bdf8',
      defaultTickerHint: 'VOO, VWCE, QQQ, NVDA'
    },
    bonds: {
      key: 'bonds',
      label: 'Облігації',
      fullLabel: '📜 Облігації (Bond ETF / Treasuries)',
      badge: '📜 Облігації',
      color: '#a78bfa',
      defaultTickerHint: 'TLT, BND, AGG, SGOV'
    },
    metals: {
      key: 'metals',
      label: 'Золото / Срібло',
      fullLabel: '🥇 Золото та Срібло (Commodities / Metals)',
      badge: '🥇 Золото / Срібло',
      color: '#f59e0b',
      defaultTickerHint: 'GLD, IAU, SLV, SGLN'
    }
  };

  const KNOWN_BOND_TICKERS = new Set(['TLT', 'BND', 'AGG', 'SGOV', 'IEF', 'SHY', 'BIL', 'TIP', 'LQD', 'HYG', 'BNDX', 'VGLT', 'VGIT', 'VGSH', 'IB01', 'DTLA', 'AGGH', 'EUNA', 'IBTA', 'IDTL']);
  const KNOWN_METAL_TICKERS = new Set(['GLD', 'IAU', 'SLV', 'GLDM', 'SGOL', 'SIVR', 'PHYS', 'PSLV', 'SGLN', 'PHAU', '4GLD', 'XAD5', 'GOLD', 'XAU', 'XAG']);

  function inferStockSubType(posOrTicker, nameAndNotes = '') {
    if (posOrTicker && typeof posOrTicker === 'object') {
      if (posOrTicker.stockSubType && STOCK_SUBTYPES_META[posOrTicker.stockSubType]) {
        return posOrTicker.stockSubType;
      }
      const t = (posOrTicker.ticker || '').toUpperCase().trim();
      const txt = `${posOrTicker.name || ''} ${posOrTicker.notes || ''}`;
      return inferStockSubType(t, txt);
    }
    const sym = String(posOrTicker || '').toUpperCase().trim();
    if (KNOWN_METAL_TICKERS.has(sym)) return 'metals';
    if (KNOWN_BOND_TICKERS.has(sym)) return 'bonds';
    const text = `${sym} ${nameAndNotes || ''}`.toLowerCase();
    if (/(gold|silver|золот|срібл|metal|bullion|xau|xag)/i.test(text)) return 'metals';
    if (/(bond|treasur|облігац|bill|gilt|fixed income|t-bill)/i.test(text)) return 'bonds';
    return 'equities';
  }

  function safeGetItem(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function safeSetItem(key, val) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, val);
    } catch (_) {}
  }

  const DEFAULT_STOCK_STRATEGY = {
    equitiesPct: 70,
    bondsPct: 20,
    metalsPct: 10,
    investAmount: 1000,
    investCurrency: 'USD',
    rebalanceMode: 'buy_only', // 'buy_only' | 'with_sell'
    tickerSplitMode: 'custom', // 'custom' | 'proportional' | 'equal'
    tickerTargets: {}, // { [posId]: targetPctWithinClass }
    forecastEquitiesCagr: 8.0, // Консервативний складний ріст акцій (% річних у USD)
    forecastBondsCagr: 4.2,    // Консервативний складний ріст облігацій (% річних у USD)
    forecastMetalsCagr: 5.0,   // Консервативний складний ріст золота/срібла (% річних у USD)
    forecastIncludeMonthly: false // false = тільки те, що вже є (без нових вкладень), true = + щомісячні інвестиції
  };

  const state = {
    activeCategory: 'all',
    primaryCurrency: 'USD',
    searchQuery: '',
    token: safeGetItem('kapital_auth_token') || '',
    settings: {
      primaryCurrency: 'USD',
      defaultUsdMigrated: true,
      manualFxOverride: false,
      fxRates: {
        USD_UAH: 41.65,
        EUR_UAH: 44.80
      },
      depositTaxDefault: true,
      depositTaxRate: 23.0,
      stockStrategy: { ...DEFAULT_STOCK_STRATEGY }
    },
    auth: {
      requireAuth: false
    },
    quotes: {
      fx: {
        USD_UAH: 41.65,
        EUR_UAH: 44.80,
        GBP_UAH: 52.80,
        PLN_UAH: 10.35,
        updatedAt: new Date().toISOString(),
        source: 'Автокотирування'
      },
      crypto: {},
      stocks: {}
    },
    positions: []
  };

  // Formatters
  function fmtUah(val, showSign = false) {
    const num = Number(val) || 0;
    const sign = showSign && num > 0 ? '+' : '';
    return sign + new Intl.NumberFormat('uk-UA', {
      minimumFractionDigits: Math.abs(num) < 100 ? 2 : 0,
      maximumFractionDigits: Math.abs(num) < 100 ? 2 : 0
    }).format(num) + ' ₴';
  }

  function fmtUsd(val, showSign = false) {
    const num = Number(val) || 0;
    const sign = showSign && num > 0 ? '+' : (num < 0 ? '-' : '');
    const abs = Math.abs(num);
    const decimals = abs > 0 && abs < 1 ? 4 : 2;
    return sign + '$' + new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(abs);
  }

  function fmtCurr(val, currency = 'UAH') {
    const num = Number(val) || 0;
    if (currency === 'UAH') return fmtUah(num);
    if (currency === 'USD') return fmtUsd(num);
    const symbols = { EUR: '€', GBP: '£', PLN: 'zł' };
    const sym = symbols[currency] || currency + ' ';
    return sym + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  }

  function fmtPct(val, showSign = true) {
    const num = Number(val) || 0;
    const sign = showSign && num > 0 ? '+' : '';
    return sign + num.toFixed(2) + '%';
  }

  // Exchange rate conversions
  function getEffectiveRates() {
    const usdUah = state.settings.manualFxOverride
      ? (Number(state.settings.fxRates?.USD_UAH) || 41.65)
      : (Number(state.quotes.fx?.USD_UAH) || 41.65);
    const eurUah = state.settings.manualFxOverride
      ? (Number(state.settings.fxRates?.EUR_UAH) || 44.80)
      : (Number(state.quotes.fx?.EUR_UAH) || 44.80);
    const gbpUah = Number(state.quotes.fx?.GBP_UAH) || (usdUah * 1.27);
    const plnUah = Number(state.quotes.fx?.PLN_UAH) || (usdUah * 0.25);

    return { USD_UAH: usdUah, EUR_UAH: eurUah, GBP_UAH: gbpUah, PLN_UAH: plnUah };
  }

  function toUah(amount, currency) {
    const rates = getEffectiveRates();
    const val = Number(amount) || 0;
    switch ((currency || 'UAH').toUpperCase()) {
      case 'UAH': return val;
      case 'USD': return val * rates.USD_UAH;
      case 'EUR': return val * rates.EUR_UAH;
      case 'GBP': return val * rates.GBP_UAH;
      case 'PLN': return val * rates.PLN_UAH;
      default: return val;
    }
  }

  function toUsd(amount, currency) {
    const rates = getEffectiveRates();
    const uah = toUah(amount, currency);
    return rates.USD_UAH > 0 ? uah / rates.USD_UAH : 0;
  }

  // Date helpers for OVDP and Deposits yield calculation
  function computeFixedIncomeStats(startDateStr, endDateStr, principal, annualRatePct, taxPct = 0) {
    const now = new Date();
    const start = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), 0, 1);
    const end = endDateStr ? new Date(endDateStr) : new Date(now.getFullYear() + 1, 0, 1);

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.max(1, Math.round((end - start) / msPerDay));
    const elapsedDaysRaw = Math.round((now - start) / msPerDay);
    const elapsedDays = Math.max(0, Math.min(totalDays, elapsedDaysRaw));
    const progressPct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

    const netRatePct = annualRatePct * (1 - (Number(taxPct) || 0) / 100);
    const accruedInterest = principal * (netRatePct / 100) * (elapsedDays / 365);
    const fullTermInterest = principal * (netRatePct / 100) * (totalDays / 365);
    const annualPassive = principal * (netRatePct / 100);

    return {
      totalDays,
      elapsedDays,
      progressPct,
      netRatePct,
      accruedInterest,
      fullTermInterest,
      annualPassive,
      currentTotal: principal + accruedInterest
    };
  }

  // Enrich a position with live market values in both UAH and USD
  function evaluatePosition(pos) {
    const rates = getEffectiveRates();
    const cat = pos.category;

    if (cat === 'crypto' || cat === 'stocks') {
      const ticker = (pos.ticker || '').toUpperCase().trim();
      const quoteBook = cat === 'crypto' ? state.quotes.crypto : state.quotes.stocks;
      const quote = quoteBook?.[ticker];
      const livePriceUsd = quote?.priceUsd !== undefined
        ? Number(quote.priceUsd)
        : (Number(pos.customCurrentPriceUsd) || Number(pos.buyPriceUsd) || 0);
      const change24h = quote?.change24h !== undefined ? Number(quote.change24h) : 0;

      const qty = Number(pos.quantity) || 0;
      const buyPriceUsd = Number(pos.buyPriceUsd) || 0;
      const investedUsd = qty * buyPriceUsd;

      // Crypto Staking calculation (with or without reinvestment)
      const isStaked = cat === 'crypto' && Boolean(pos.isStaked);
      const stakingApy = isStaked ? (Number(pos.stakingApy) || 0) : 0;
      const stakingCompound = pos.stakingCompound !== undefined ? Boolean(pos.stakingCompound) : true;
      let stakingRewardCoins = 0;
      let stakingElapsedDays = 0;
      let stakingAnnualCoins = 0;

      if (isStaked && stakingApy > 0) {
        const startStr = pos.stakingStartDate || pos.createdAt;
        if (startStr) {
          const msPerDay = 1000 * 60 * 60 * 24;
          stakingElapsedDays = Math.max(0, Math.round((new Date() - new Date(startStr)) / msPerDay));
        }
        const manualEarned = Number(pos.stakingEarnedCoins);
        if (!Number.isNaN(manualEarned) && manualEarned > 0) {
          stakingRewardCoins = manualEarned;
        } else if (stakingCompound) {
          const dailyRate = (stakingApy / 100) / 365;
          stakingRewardCoins = qty * (Math.pow(1 + dailyRate, stakingElapsedDays) - 1);
        } else {
          stakingRewardCoins = qty * (stakingApy / 100) * (stakingElapsedDays / 365);
        }

        if (stakingCompound) {
          const dailyRate = (stakingApy / 100) / 365;
          stakingAnnualCoins = (qty + stakingRewardCoins) * (Math.pow(1 + dailyRate, 365) - 1);
        } else {
          stakingAnnualCoins = qty * (stakingApy / 100);
        }
      }

      const totalQty = qty + stakingRewardCoins;
      const stakingRewardUsd = stakingRewardCoins * livePriceUsd;
      const stakingRewardUah = stakingRewardUsd * rates.USD_UAH;
      const stakingAnnualUsd = stakingAnnualCoins * livePriceUsd;
      const stakingAnnualUah = stakingAnnualUsd * rates.USD_UAH;

      const currentValUsd = totalQty * livePriceUsd;
      const currentValUah = currentValUsd * rates.USD_UAH;
      const investedUah = investedUsd * rates.USD_UAH;
      const pnlUsd = currentValUsd - investedUsd;
      const pnlUah = currentValUah - investedUah;
      const pnlPct = investedUsd > 0 ? (pnlUsd / investedUsd) * 100 : 0;

      const stockSubType = cat === 'stocks' ? inferStockSubType(pos) : undefined;

      return {
        ...pos,
        ticker,
        stockSubType,
        displayName: pos.name || quote?.name || ticker,
        nativeCurrency: 'USD',
        livePriceUsd,
        change24h,
        isStaked,
        stakingApy,
        stakingCompound,
        stakingElapsedDays,
        stakingRewardCoins,
        stakingRewardUsd,
        stakingRewardUah,
        stakingAnnualCoins,
        stakingAnnualUsd,
        stakingAnnualUah,
        totalQty,
        investedUsd,
        investedUah,
        currentValUsd,
        currentValUah,
        pnlUsd,
        pnlUah,
        pnlPct,
        accruedUah: stakingRewardUah,
        annualPassiveUah: stakingAnnualUah
      };
    }

    if (cat === 'ovdp') {
      const curr = (pos.currency || 'UAH').toUpperCase();
      const principal = Number(pos.principalAmount) || ((Number(pos.bondsCount) || 1) * (Number(pos.faceValue) || 1000));
      const rate = Number(pos.annualRate) || 16.0;
      const stats = computeFixedIncomeStats(pos.startDate, pos.maturityDate, principal, rate, 0);

      const investedUah = toUah(principal, curr);
      const investedUsd = toUsd(principal, curr);
      const currentValUah = toUah(stats.currentTotal, curr);
      const currentValUsd = toUsd(stats.currentTotal, curr);
      const pnlUah = toUah(stats.accruedInterest, curr);
      const pnlUsd = toUsd(stats.accruedInterest, curr);
      const pnlPct = principal > 0 ? (stats.accruedInterest / principal) * 100 : 0;

      return {
        ...pos,
        displayName: pos.name || 'ОВДП України',
        nativeCurrency: curr,
        principalNative: principal,
        accruedNative: stats.accruedInterest,
        fullTermNative: stats.fullTermInterest,
        netRatePct: stats.netRatePct,
        elapsedDays: stats.elapsedDays,
        totalDays: stats.totalDays,
        progressPct: stats.progressPct,
        investedUah,
        investedUsd,
        currentValUah,
        currentValUsd,
        pnlUah,
        pnlUsd,
        pnlPct,
        accruedUah: pnlUah,
        annualPassiveUah: toUah(stats.annualPassive, curr)
      };
    }

    if (cat === 'deposits') {
      const curr = (pos.currency || 'UAH').toUpperCase();
      const principal = Number(pos.principalAmount) || 0;
      const rate = Number(pos.annualRate) || 14.0;
      const taxPct = pos.applyTax ? (Number(pos.taxRate) || 23.0) : 0;
      const stats = computeFixedIncomeStats(pos.startDate, pos.endDate, principal, rate, taxPct);

      const investedUah = toUah(principal, curr);
      const investedUsd = toUsd(principal, curr);
      const currentValUah = toUah(stats.currentTotal, curr);
      const currentValUsd = toUsd(stats.currentTotal, curr);
      const pnlUah = toUah(stats.accruedInterest, curr);
      const pnlUsd = toUsd(stats.accruedInterest, curr);
      const pnlPct = principal > 0 ? (stats.accruedInterest / principal) * 100 : 0;

      return {
        ...pos,
        displayName: pos.name || `Депозит (${pos.bank || 'Банк'})`,
        nativeCurrency: curr,
        principalNative: principal,
        accruedNative: stats.accruedInterest,
        fullTermNative: stats.fullTermInterest,
        netRatePct: stats.netRatePct,
        elapsedDays: stats.elapsedDays,
        totalDays: stats.totalDays,
        progressPct: stats.progressPct,
        investedUah,
        investedUsd,
        currentValUah,
        currentValUsd,
        pnlUah,
        pnlUsd,
        pnlPct,
        accruedUah: pnlUah,
        annualPassiveUah: toUah(stats.annualPassive, curr)
      };
    }

    // Cash
    const curr = (pos.currency || 'USD').toUpperCase();
    const amount = Number(pos.amount) || 0;
    const currentValUah = toUah(amount, curr);
    const currentValUsd = toUsd(amount, curr);

    return {
      ...pos,
      displayName: pos.name || `Готівка (${curr})`,
      nativeCurrency: curr,
      amountNative: amount,
      investedUah: currentValUah,
      investedUsd: currentValUsd,
      currentValUah,
      currentValUsd,
      pnlUah: 0,
      pnlUsd: 0,
      pnlPct: 0,
      accruedUah: 0,
      annualPassiveUah: 0
    };
  }

  // Baseline quotes & demo positions for standalone / Google Drive fallback
  const DEFAULT_QUOTES = {
    fx: { USD_UAH: 41.65, EUR_UAH: 44.80, GBP_UAH: 52.80, PLN_UAH: 10.35, updatedAt: new Date().toISOString(), source: 'НБУ / Ринковий курс' },
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
      LINK: { priceUsd: 14.95, change24h: 1.75, name: 'Chainlink' },
      SUI: { priceUsd: 3.28, change24h: 7.40, name: 'Sui' }
    },
    stocks: {
      VOO: { priceUsd: 548.60, change24h: 0.62, name: 'Vanguard S&P 500 ETF' },
      SPY: { priceUsd: 596.40, change24h: 0.61, name: 'SPDR S&P 500 ETF Trust' },
      CSP1: { priceUsd: 612.80, change24h: 0.58, name: 'iShares Core S&P 500 UCITS (Acc)' },
      VUAA: { priceUsd: 112.40, change24h: 0.60, name: 'Vanguard S&P 500 UCITS ETF (Acc)' },
      VWCE: { priceUsd: 138.90, change24h: 0.48, name: 'Vanguard FTSE All-World UCITS ETF' },
      QQQ: { priceUsd: 511.20, change24h: 0.94, name: 'Invesco QQQ (Nasdaq-100)' },
      NVDA: { priceUsd: 144.80, change24h: 2.65, name: 'NVIDIA Corp.' },
      AAPL: { priceUsd: 228.50, change24h: 1.12, name: 'Apple Inc.' },
      MSFT: { priceUsd: 426.90, change24h: 0.84, name: 'Microsoft Corp.' },
      GOOGL: { priceUsd: 181.30, change24h: 0.92, name: 'Alphabet Inc.' },
      AMZN: { priceUsd: 210.40, change24h: 1.38, name: 'Amazon.com Inc.' },
      META: { priceUsd: 589.20, change24h: 1.15, name: 'Meta Platforms Inc.' },
      TSLA: { priceUsd: 332.10, change24h: 3.45, name: 'Tesla Inc.' },
      TLT: { priceUsd: 91.40, change24h: 0.35, name: 'iShares 20+ Year Treasury Bond ETF' },
      BND: { priceUsd: 72.80, change24h: 0.18, name: 'Vanguard Total Bond Market ETF' },
      AGG: { priceUsd: 97.60, change24h: 0.15, name: 'iShares Core U.S. Aggregate Bond ETF' },
      SGOV: { priceUsd: 100.45, change24h: 0.02, name: 'iShares 0-3 Month Treasury Bond ETF' },
      IEF: { priceUsd: 93.90, change24h: 0.22, name: 'iShares 7-10 Year Treasury Bond ETF' },
      SHY: { priceUsd: 82.10, change24h: 0.05, name: 'iShares 1-3 Year Treasury Bond ETF' },
      GLD: { priceUsd: 242.70, change24h: 0.75, name: 'SPDR Gold Shares ETF (Золото)' },
      IAU: { priceUsd: 49.85, change24h: 0.74, name: 'iShares Gold Trust ETF (Золото)' },
      SLV: { priceUsd: 28.40, change24h: 1.10, name: 'iShares Silver Trust ETF (Срібло)' },
      SGLN: { priceUsd: 51.20, change24h: 0.72, name: 'iShares Physical Gold ETC' }
    }
  };

  const DEFAULT_DEMO_POSITIONS = [
    { id: 'crypto-btc-1', category: 'crypto', ticker: 'BTC', name: 'Bitcoin', quantity: 0.125, buyPriceUsd: 64200, platform: 'Ledger Nano X', notes: 'Довгостроковий холодний гаманець', createdAt: '2025-11-10', isStaked: false },
    { id: 'crypto-eth-2', category: 'crypto', ticker: 'ETH', name: 'Ethereum', quantity: 1.5, buyPriceUsd: 2580, platform: 'Binance Earn', notes: 'Стейкінг ETH', createdAt: '2026-01-15', isStaked: true, stakingApy: 3.8, stakingStartDate: '2026-01-15' },
    { id: 'crypto-sol-3', category: 'crypto', ticker: 'SOL', name: 'Solana', quantity: 18, buyPriceUsd: 148.5, platform: 'Phantom / JitoSOL', notes: 'Ліквідний стейкінг', createdAt: '2026-03-04', isStaked: true, stakingApy: 7.2, stakingStartDate: '2026-03-04' },
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
  ];

  const DEFAULT_CLOUD_SYNC_URL = 'https://script.google.com/macros/s/AKfycbwoxq-PirVnix_5jvyuama9S_UBc187LwDRMk4moSg9RwhE3LyquTRu-r8VhfJdbqX8/exec';
  state.cloudSyncUrl = safeGetItem('kapital_cloud_sync_url') || DEFAULT_CLOUD_SYNC_URL;
  state.cloudSynced = false;
  state.quotes = JSON.parse(JSON.stringify(DEFAULT_QUOTES));

  function isGoogleAppsScript() {
    return typeof window !== 'undefined' && Boolean(window.google && window.google.script && window.google.script.run);
  }

  function isStaticHost() {
    if (isGoogleAppsScript()) return false;
    const host = (window.location && window.location.hostname) || '';
    return host.endsWith('github.io') || window.location.protocol === 'file:';
  }

  function gasCall(methodName, ...args) {
    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)[methodName](...args);
    });
  }

  async function cloudSyncGet(paramsObj = {}) {
    const baseUrl = (state.cloudSyncUrl || '').trim();
    if (!baseUrl) throw new Error('No cloud sync URL configured');
    const url = new URL(baseUrl);
    Object.keys(paramsObj).forEach(k => url.searchParams.set(k, paramsObj[k]));
    url.searchParams.set('_t', String(Date.now()));
    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error(`Cloud HTTP ${res.status}`);
    return res.json();
  }

  async function cloudSyncPost(payloadObj) {
    const baseUrl = (state.cloudSyncUrl || '').trim();
    if (!baseUrl) throw new Error('No cloud sync URL configured');
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payloadObj),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`Cloud HTTP ${res.status}`);
    return res.json();
  }

  // API / Storage Sync
  async function apiFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      openLoginModal();
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  async function loadPortfolioFromServer() {
    try {
      let data;
      if (isGoogleAppsScript()) {
        data = await gasCall('gasGetPortfolio');
        state.cloudSynced = true;
      } else if (isStaticHost() && state.cloudSyncUrl) {
        data = await cloudSyncGet({ action: 'get' });
        state.cloudSynced = true;
      } else {
        try {
          data = await apiFetch('/api/portfolio');
        } catch (localErr) {
          if (localErr && localErr.message === 'Unauthorized') throw localErr;
          if (state.cloudSyncUrl) {
            data = await cloudSyncGet({ action: 'get' });
            state.cloudSynced = true;
          } else {
            throw localErr;
          }
        }
      }

      if (data && data.settings) {
        state.settings = { ...state.settings, ...data.settings };
        if (!data.settings.defaultUsdMigrated) {
          state.settings.primaryCurrency = 'USD';
          state.settings.defaultUsdMigrated = true;
        }
        state.primaryCurrency = state.settings.primaryCurrency || 'USD';
      }
      if (data && Array.isArray(data.positions) && data.positions.length > 0) {
        state.positions = data.positions;
      }
      if (data && data.quotes) {
        state.quotes = {
          fx: { ...DEFAULT_QUOTES.fx, ...(data.quotes.fx || {}) },
          crypto: { ...DEFAULT_QUOTES.crypto, ...(data.quotes.crypto || {}) },
          stocks: { ...DEFAULT_QUOTES.stocks, ...(data.quotes.stocks || {}) }
        };
      }
      if (data && data.auth) {
        state.auth = data.auth;
      }
      safeSetItem('kapital_backup_state', JSON.stringify({
        settings: state.settings,
        positions: state.positions
      }));
      renderAll();
      refreshBrowserQuotesQuietly();
    } catch (err) {
      if (err && err.message !== 'Unauthorized') {
        const cached = safeGetItem('kapital_backup_state');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.settings) {
              state.settings = { ...state.settings, ...parsed.settings };
              if (!parsed.settings.defaultUsdMigrated) {
                state.settings.primaryCurrency = 'USD';
                state.settings.defaultUsdMigrated = true;
              }
              state.primaryCurrency = state.settings.primaryCurrency || 'USD';
            }
            if (Array.isArray(parsed.positions) && parsed.positions.length > 0) {
              state.positions = parsed.positions;
            }
          } catch (_) {}
        } else if (!state.positions || state.positions.length === 0) {
          state.positions = JSON.parse(JSON.stringify(DEFAULT_DEMO_POSITIONS));
        }
        renderAll();
        refreshBrowserQuotesQuietly();
      }
    }
  }

  async function persistPortfolio() {
    safeSetItem('kapital_backup_state', JSON.stringify({
      settings: state.settings,
      positions: state.positions
    }));
    try {
      if (isGoogleAppsScript()) {
        await gasCall('gasSavePortfolio', {
          settings: state.settings,
          positions: state.positions
        });
        state.cloudSynced = true;
      } else if (isStaticHost() && state.cloudSyncUrl) {
        await cloudSyncPost({
          action: 'save',
          settings: state.settings,
          positions: state.positions
        });
        state.cloudSynced = true;
      } else {
        await apiFetch('/api/portfolio', {
          method: 'PUT',
          body: JSON.stringify({
            settings: state.settings,
            positions: state.positions
          })
        });
      }
    } catch (_) {
      // Saved in localStorage backup if offline
    }
  }

  async function refreshQuotesNow() {
    const statusText = document.getElementById('quote-status-text');
    if (statusText) statusText.textContent = 'Оновлення ринкових котирувань...';

    const cryptoTickers = state.positions.filter(p => p.category === 'crypto').map(p => p.ticker).join(',');
    const stockTickers = state.positions.filter(p => p.category === 'stocks').map(p => p.ticker).join(',');

    try {
      let quotes;
      if (isGoogleAppsScript()) {
        quotes = await gasCall('gasRefreshQuotes', cryptoTickers, stockTickers);
      } else if (isStaticHost() && state.cloudSyncUrl) {
        quotes = await cloudSyncGet({ action: 'quotes', crypto: cryptoTickers, stocks: stockTickers });
      } else {
        quotes = await apiFetch(`/api/quotes?crypto=${encodeURIComponent(cryptoTickers)}&stocks=${encodeURIComponent(stockTickers)}`);
      }
      if (quotes && quotes.fx) {
        state.quotes = {
          fx: { ...state.quotes.fx, ...quotes.fx },
          crypto: { ...state.quotes.crypto, ...(quotes.crypto || {}) },
          stocks: { ...state.quotes.stocks, ...(quotes.stocks || {}) }
        };
      }
    } catch (_) {}

    await refreshBrowserQuotesQuietly();
    renderAll();
  }

  // Aave V3 On-Chain Pool & Safety Module Live APY Auto-Sync
  const AAVE_V3_CHAINS = {
    Ethereum: {
      label: 'Aave V3 Ethereum',
      rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
      pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      assets: {
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        ETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        BTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
        LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        WSTETH: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        USDS: '0xdC035D45d973E3EC169d2276DDab16f1e407384F',
        EURC: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c'
      }
    },
    Arbitrum: {
      label: 'Aave V3 Arbitrum',
      rpcs: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'],
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      assets: {
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        ETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        BTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        AAVE: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196',
        ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
        LINK: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4'
      }
    },
    Polygon: {
      label: 'Aave V3 Polygon',
      rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'],
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      assets: {
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        ETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        BTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
        WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
        DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
        AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
        MATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        POL: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
      }
    },
    Base: {
      label: 'Aave V3 Base',
      rpcs: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
      pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      assets: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        ETH: '0x4200000000000000000000000000000000000006',
        WETH: '0x4200000000000000000000000000000000000006',
        BTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
        CBBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf'
      }
    },
    Optimism: {
      label: 'Aave V3 Optimism',
      rpcs: ['https://optimism-rpc.publicnode.com', 'https://mainnet.optimism.io'],
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      assets: {
        USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        ETH: '0x4200000000000000000000000000000000000006',
        WETH: '0x4200000000000000000000000000000000000006',
        BTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
        WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
        OP: '0x4200000000000000000000000000000000000042'
      }
    },
    Avalanche: {
      label: 'Aave V3 Avalanche',
      rpcs: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://api.avax.network/ext/bc/C/rpc'],
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      assets: {
        USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
        USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        ETH: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
        WETH: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
        BTC: '0x50b7545627a5162F82A992c33b87aDc75187B218',
        WBTC: '0x50b7545627a5162F82A992c33b87aDc75187B218',
        AVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
        WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'
      }
    }
  };

  async function ethCallRpc(rpcUrls, toAddress, dataHex) {
    for (const rpc of rpcUrls) {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to: toAddress, data: dataHex }, 'latest']
          })
        });
        if (!res.ok) continue;
        const json = await res.json();
        if (json && typeof json.result === 'string' && json.result.startsWith('0x') && json.result.length >= 66) {
          return json.result;
        }
      } catch (_) {}
    }
    return null;
  }

  async function fetchAaveSafetyModuleStkAaveApy() {
    // stkAAVE contract on Ethereum Mainnet: 0x4da27a545c0c5B758a6BA100e3a049001de870f5
    const stkAave = '0x4da27a545c0c5B758a6BA100e3a049001de870f5';
    const rpcs = AAVE_V3_CHAINS.Ethereum.rpcs;
    const paddedAddr = stkAave.slice(2).toLowerCase().padStart(64, '0');
    const [assetRes, supplyRes] = await Promise.all([
      ethCallRpc(rpcs, stkAave, '0xf11b8188' + paddedAddr), // assets(address)
      ethCallRpc(rpcs, stkAave, '0x18160ddd')                // totalSupply()
    ]);
    if (assetRes && supplyRes && assetRes.length >= 66 && supplyRes.length >= 66) {
      const emissionPerSec = Number(BigInt('0x' + assetRes.slice(2, 66))) / 1e18;
      const totalSupply = Number(BigInt('0x' + supplyRes.slice(2, 66))) / 1e18;
      if (totalSupply > 0 && emissionPerSec > 0) {
        const apr = (emissionPerSec * 31536000) / totalSupply;
        const apyPct = (Math.pow(1 + apr / 365, 365) - 1) * 100;
        return Number(apyPct.toFixed(2));
      }
    }
    return null;
  }

  function inferAaveChainFromText(pos) {
    if (pos.aaveChain && (AAVE_V3_CHAINS[pos.aaveChain] || pos.aaveChain === 'SafetyModule')) {
      return pos.aaveChain;
    }
    const text = `${pos.platform || ''} ${pos.notes || ''} ${pos.name || ''}`.toLowerCase();
    if (text.includes('arbitrum') || text.includes('arb')) return 'Arbitrum';
    if (text.includes('polygon') || text.includes('matic') || text.includes('pol')) return 'Polygon';
    if (text.includes('base')) return 'Base';
    if (text.includes('optimism') || text.includes('op')) return 'Optimism';
    if (text.includes('avalanche') || text.includes('avax')) return 'Avalanche';
    if ((pos.ticker || '').toUpperCase() === 'AAVE' || (pos.ticker || '').toUpperCase() === 'STKAAVE') {
      return 'SafetyModule';
    }
    return 'Ethereum';
  }

  async function fetchLiveAaveApy(tickerRaw, chainKey = 'Ethereum') {
    const sym = (tickerRaw || '').toUpperCase().trim();
    if (!sym) return null;

    // 1. If SafetyModule or staking AAVE token itself
    if (chainKey === 'SafetyModule' || sym === 'STKAAVE') {
      const smRate = await fetchAaveSafetyModuleStkAaveApy();
      if (smRate !== null && smRate > 0) return { apy: smRate, source: 'Aave Safety Module (stkAAVE)' };
    }

    // 2. Direct On-Chain Aave V3 Pool getReserveData(address) call
    const chainCfg = AAVE_V3_CHAINS[chainKey] || AAVE_V3_CHAINS.Ethereum;
    const tokenAddr = chainCfg.assets[sym];
    if (tokenAddr) {
      const paddedToken = tokenAddr.slice(2).toLowerCase().padStart(64, '0');
      const hexResult = await ethCallRpc(chainCfg.rpcs, chainCfg.pool, '0x35ea6a75' + paddedToken);
      // getReserveData returns 15 words (each 64 hex chars). Word index 2 (chars 2+128 .. 2+192) is currentLiquidityRate in RAY (1e27)
      if (hexResult && hexResult.length >= 2 + 192) {
        const liquidityRateRay = BigInt('0x' + hexResult.slice(2 + 128, 2 + 192));
        const apr = Number(liquidityRateRay) / 1e27;
        const SECONDS_PER_YEAR = 31536000;
        const apyPct = (Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
        if (apyPct >= 0.02) {
          return { apy: Number(apyPct.toFixed(2)), source: chainCfg.label };
        }
        // If user selected AAVE on Ethereum and pool supply rate is ~0%, check Safety Module stkAAVE
        if (sym === 'AAVE') {
          const smRate = await fetchAaveSafetyModuleStkAaveApy();
          if (smRate !== null && smRate > 0) return { apy: smRate, source: 'Aave Safety Module (stkAAVE)' };
        }
      }
    } else if (sym === 'AAVE') {
      const smRate = await fetchAaveSafetyModuleStkAaveApy();
      if (smRate !== null && smRate > 0) return { apy: smRate, source: 'Aave Safety Module (stkAAVE)' };
    }

    // 3. Fallback: DeFiLlama Yields API for any other Aave V3 token
    try {
      const res = await fetch('https://yields.llama.fi/pools');
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data)) {
          const targetChain = chainKey === 'SafetyModule' ? 'Ethereum' : chainKey;
          const matches = json.data.filter(p =>
            p.project === 'aave-v3' &&
            String(p.chain || '').toLowerCase() === targetChain.toLowerCase() &&
            (String(p.symbol || '').toUpperCase() === sym ||
             (sym === 'ETH' && String(p.symbol || '').toUpperCase() === 'WETH') ||
             (sym === 'BTC' && String(p.symbol || '').toUpperCase() === 'WBTC'))
          );
          if (matches.length > 0 && typeof matches[0].apy === 'number') {
            return { apy: Number(matches[0].apy.toFixed(2)), source: `Aave V3 ${targetChain}` };
          }
        }
      }
    } catch (_) {}

    return null;
  }

  async function syncAavePositionsRates() {
    let changed = false;
    for (const pos of state.positions) {
      if (pos.category !== 'crypto') continue;
      const mentionsAave = /aave/i.test(`${pos.platform || ''} ${pos.notes || ''} ${pos.name || ''}`);
      const shouldSyncAave = pos.stakingAutoSync === 'aave' || (pos.stakingAutoSync === undefined && mentionsAave);
      if (!shouldSyncAave) continue;

      const chainKey = inferAaveChainFromText(pos);
      const res = await fetchLiveAaveApy(pos.ticker, chainKey);
      if (res && typeof res.apy === 'number' && res.apy > 0) {
        if (!pos.isStaked || pos.stakingAutoSync !== 'aave' || pos.stakingApy !== res.apy || pos.aaveChain !== chainKey) {
          pos.isStaked = true;
          pos.stakingAutoSync = 'aave';
          pos.aaveChain = chainKey;
          pos.stakingApy = res.apy;
          pos.aaveLastSync = new Date().toISOString();
          changed = true;
        }
      }
    }
    if (changed) {
      await persistPortfolio();
      renderAll();
    }
    return changed;
  }

  // CoinMarketCap Coin ID map for direct detail lookup when a token is outside top 300
  const CMC_COIN_IDS = {
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

  async function fetchCmcJsonWithFallback(cmcUrl) {
    try {
      const directRes = await fetch(cmcUrl, { headers: { 'Accept': 'application/json' } });
      if (directRes.ok) return await directRes.json();
    } catch (_) {}

    // If browser CORS blocks direct api.coinmarketcap.com call, use public CORS JSON proxy
    try {
      const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(cmcUrl)}`);
      if (proxyRes.ok) return await proxyRes.json();
    } catch (_) {}

    return null;
  }

  // Direct browser fetch for NBU FX + CoinMarketCap Crypto API + Aave Live APY
  async function refreshBrowserQuotesQuietly() {
    let updatedAny = false;
    let cryptoSourceLabel = 'CoinMarketCap';

    try {
      const nbuRes = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      if (nbuRes.ok) {
        const nbu = await nbuRes.json();
        if (Array.isArray(nbu)) {
          const usd = nbu.find(r => r.cc === 'USD');
          const eur = nbu.find(r => r.cc === 'EUR');
          const gbp = nbu.find(r => r.cc === 'GBP');
          const pln = nbu.find(r => r.cc === 'PLN');
          if (usd && usd.rate) state.quotes.fx.USD_UAH = Number(usd.rate.toFixed(2));
          if (eur && eur.rate) state.quotes.fx.EUR_UAH = Number(eur.rate.toFixed(2));
          if (gbp && gbp.rate) state.quotes.fx.GBP_UAH = Number(gbp.rate.toFixed(2));
          if (pln && pln.rate) state.quotes.fx.PLN_UAH = Number(pln.rate.toFixed(2));
          updatedAny = true;
        }
      }
    } catch (_) {}

    try {
      const cryptoPositions = state.positions.filter(p => p.category === 'crypto');
      const neededSyms = [...new Set(cryptoPositions.map(p => (p.ticker || '').toUpperCase().trim()).filter(Boolean))];
      const fetchedFromCmc = new Set();

      if (neededSyms.length > 0) {
        // 1. Fetch top 300 coins from CoinMarketCap data-api v3
        const cmcListingUrl = 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=1&limit=300&sortBy=market_cap&sortType=desc&convert=USD';
        const listJson = await fetchCmcJsonWithFallback(cmcListingUrl);
        const coinList = listJson?.data?.cryptoCurrencyList;
        if (Array.isArray(coinList)) {
          for (const c of coinList) {
            const sym = String(c.symbol || '').toUpperCase();
            if (!sym || fetchedFromCmc.has(sym)) continue;
            const usdQ = Array.isArray(c.quotes) ? (c.quotes.find(q => q.name === 'USD') || c.quotes[0]) : null;
            if (usdQ && typeof usdQ.price === 'number' && usdQ.price > 0) {
              state.quotes.crypto[sym] = {
                ...(state.quotes.crypto[sym] || {}),
                name: c.name || state.quotes.crypto[sym]?.name || sym,
                priceUsd: Number(usdQ.price),
                change24h: Number((usdQ.percentChange24h || 0).toFixed(2)),
                source: 'CoinMarketCap'
              };
              fetchedFromCmc.add(sym);
              updatedAny = true;
            }
          }
        }

        // 2. For any user coin not found in top 300 listing, query CoinMarketCap detail endpoint by ID
        for (const sym of neededSyms) {
          if (fetchedFromCmc.has(sym)) continue;
          const cmcId = CMC_COIN_IDS[sym];
          if (cmcId) {
            const detJson = await fetchCmcJsonWithFallback(`https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail?id=${cmcId}`);
            const stats = detJson?.data?.statistics;
            if (stats && typeof stats.price === 'number' && stats.price > 0) {
              state.quotes.crypto[sym] = {
                ...(state.quotes.crypto[sym] || {}),
                name: detJson.data.name || state.quotes.crypto[sym]?.name || sym,
                priceUsd: Number(stats.price),
                change24h: Number((stats.priceChangePercentage24h || 0).toFixed(2)),
                source: 'CoinMarketCap'
              };
              fetchedFromCmc.add(sym);
              updatedAny = true;
            }
          }
        }

        // 3. Fallback to Binance only if a specific coin was still not resolved via CoinMarketCap
        for (const sym of neededSyms) {
          if (fetchedFromCmc.has(sym) || sym === 'USDT' || sym === 'USDC') continue;
          // If already updated by backend/Apps Script from CoinMarketCap, keep it
          if (state.quotes.crypto[sym]?.source === 'CoinMarketCap') continue;
          const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`);
          if (res.ok) {
            const item = await res.json();
            const price = parseFloat(item.lastPrice);
            const change = parseFloat(item.priceChangePercent);
            if (!isNaN(price) && price > 0) {
              state.quotes.crypto[sym] = {
                ...(state.quotes.crypto[sym] || { name: sym }),
                priceUsd: price,
                change24h: isNaN(change) ? 0 : change,
                source: 'Binance'
              };
              if (fetchedFromCmc.size === 0) cryptoSourceLabel = 'CoinMarketCap / Binance';
              updatedAny = true;
            }
          }
        }
      }
    } catch (_) {}

    try {
      const aaveChanged = await syncAavePositionsRates();
      if (aaveChanged) updatedAny = true;
    } catch (_) {}

    if (updatedAny) {
      state.quotes.fx.source = isGoogleAppsScript()
        ? `Google Cloud + Live (НБУ / ${cryptoSourceLabel} / Aave)`
        : `Live (НБУ / ${cryptoSourceLabel} / Aave)`;
      renderAll();
    }
  }

  // Main UI Rendering
  function renderAll() {
    const rates = getEffectiveRates();
    const evaluated = state.positions.map(evaluatePosition);

    // Update FX sidebar box
    document.getElementById('fx-usd-uah').textContent = `${rates.USD_UAH.toFixed(2)} ₴`;
    document.getElementById('fx-eur-uah').textContent = `${rates.EUR_UAH.toFixed(2)} ₴`;

    // Update currency switcher active state
    document.getElementById('btn-curr-uah').classList.toggle('active', state.primaryCurrency === 'UAH');
    document.getElementById('btn-curr-usd').classList.toggle('active', state.primaryCurrency === 'USD');

    // Update category counts in sidebar & active state
    const counts = { all: evaluated.length, crypto: 0, stocks: 0, ovdp: 0, deposits: 0, cash: 0 };
    evaluated.forEach(p => {
      if (counts[p.category] !== undefined) counts[p.category]++;
    });
    Object.keys(counts).forEach(cat => {
      const badge = document.getElementById(`badge-count-${cat}`);
      if (badge) badge.textContent = counts[cat];
      const navBtn = document.getElementById(`nav-cat-${cat}`);
      if (navBtn) navBtn.classList.toggle('active', state.activeCategory === cat);
      const mobBtn = document.getElementById(`mob-cat-${cat}`);
      if (mobBtn) mobBtn.classList.toggle('active', state.activeCategory === cat);
    });

    // Update page heading
    const meta = CATEGORY_META[state.activeCategory] || CATEGORY_META.all;
    document.getElementById('page-main-heading').textContent = meta.title;
    const statusText = document.getElementById('quote-status-text');
    const timeStr = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    statusText.textContent = `${state.quotes.fx?.source || 'Автокотирування'} · Станом на ${timeStr}`;

    // Filter positions for active category
    const scopedPositions = state.activeCategory === 'all'
      ? evaluated
      : evaluated.filter(p => p.category === state.activeCategory);

    // Compute Hero Totals for current scope
    let totalUah = 0;
    let totalUsd = 0;
    let totalInvestedUah = 0;
    let totalPnlUah = 0;
    let totalPnlUsd = 0;
    let totalAccruedUah = 0;
    let totalAnnualPassiveUah = 0;

    scopedPositions.forEach(p => {
      totalUah += p.currentValUah;
      totalUsd += p.currentValUsd;
      totalInvestedUah += p.investedUah;
      totalPnlUah += p.pnlUah;
      totalPnlUsd += p.pnlUsd;
      totalAccruedUah += p.accruedUah;
      totalAnnualPassiveUah += p.annualPassiveUah;
    });

    const totalPnlPct = totalInvestedUah > 0 ? (totalPnlUah / totalInvestedUah) * 100 : 0;

    // Render Hero Strip (Always shows both UAH & USD side-by-side!)
    document.getElementById('hero-scope-label').textContent =
      state.activeCategory === 'all'
        ? 'Сукупний капітал (Усі інвестиції та готівка)'
        : `Капітал категорії: ${meta.shortName}`;

    const heroPrimary = document.getElementById('hero-primary-total');
    const heroSecondary = document.getElementById('hero-secondary-total');
    const pnlPrimary = document.getElementById('hero-pnl-primary');
    const pnlSecondary = document.getElementById('hero-pnl-secondary');

    if (state.primaryCurrency === 'UAH') {
      heroPrimary.textContent = fmtUah(totalUah);
      heroSecondary.textContent = fmtUsd(totalUsd);
      pnlPrimary.textContent = fmtUah(totalPnlUah, true);
      pnlSecondary.textContent = fmtUsd(totalPnlUsd, true);
    } else {
      heroPrimary.textContent = fmtUsd(totalUsd);
      heroSecondary.textContent = fmtUah(totalUah);
      pnlPrimary.textContent = fmtUsd(totalPnlUsd, true);
      pnlSecondary.textContent = fmtUah(totalPnlUah, true);
    }

    pnlPrimary.style.color = totalPnlUah >= 0 ? 'var(--positive)' : 'var(--negative)';
    const pnlBadge = document.getElementById('hero-pnl-pct');
    pnlBadge.textContent = fmtPct(totalPnlPct, true);
    pnlBadge.className = 'pill-badge ' + (totalPnlUah >= 0 ? 'pill-positive' : 'pill-negative');

    document.getElementById('hero-fx-caption').textContent =
      `Курс перерахунку: 1$ = ${rates.USD_UAH.toFixed(2)} ₴ · 1€ = ${rates.EUR_UAH.toFixed(2)} ₴`;

    const yieldAccruedEl = document.getElementById('hero-yield-accrued');
    const annualPassiveEl = document.getElementById('hero-annual-passive');
    if (state.primaryCurrency === 'UAH') {
      yieldAccruedEl.textContent = fmtUah(totalAccruedUah, true);
      annualPassiveEl.textContent = fmtUah(totalAnnualPassiveUah);
    } else {
      yieldAccruedEl.textContent = fmtUsd(totalAccruedUah / rates.USD_UAH, true);
      annualPassiveEl.textContent = fmtUsd(totalAnnualPassiveUah / rates.USD_UAH);
    }

    // Record daily value snapshot for Crypto and Stocks so user can track value growth/decline dynamics over time
    recordCategoryHistorySnapshots(evaluated);

    // Show/hide overview breakdown section
    const overviewSection = document.getElementById('overview-breakdown-section');
    if (state.activeCategory === 'all') {
      overviewSection.style.display = 'grid';
      renderOverviewBreakdown(evaluated, totalUah);
    } else {
      overviewSection.style.display = 'none';
    }

    // Show/hide Category Dynamics Chart Section (for 'all', 'crypto', and 'stocks' tabs)
    let dynamicsSection = document.getElementById('category-dynamics-section');
    if (!dynamicsSection && overviewSection && overviewSection.parentNode) {
      dynamicsSection = document.createElement('section');
      dynamicsSection.className = 'panel-card';
      dynamicsSection.id = 'category-dynamics-section';
      dynamicsSection.style.display = 'none';
      dynamicsSection.style.marginBottom = '20px';
      overviewSection.parentNode.insertBefore(dynamicsSection, overviewSection.nextSibling);
    }
    if (dynamicsSection) {
      if (state.activeCategory === 'crypto' || state.activeCategory === 'stocks' || state.activeCategory === 'all') {
        dynamicsSection.style.display = 'block';
        renderCategoryDynamicsSection(state.activeCategory, scopedPositions);
      } else {
        dynamicsSection.style.display = 'none';
      }
    }

    // Show/hide Stocks Strategy & Monthly Rebalancing Calculator section
    let stocksStrategySection = document.getElementById('stocks-strategy-section');
    if (!stocksStrategySection && overviewSection && overviewSection.parentNode) {
      stocksStrategySection = document.createElement('section');
      stocksStrategySection.className = 'panel-card';
      stocksStrategySection.id = 'stocks-strategy-section';
      stocksStrategySection.style.display = 'none';
      stocksStrategySection.style.marginBottom = '20px';
      overviewSection.parentNode.insertBefore(stocksStrategySection, (dynamicsSection || overviewSection).nextSibling);
    }
    if (stocksStrategySection) {
      if (state.activeCategory === 'stocks') {
        stocksStrategySection.style.display = 'block';
        renderStockStrategySection(scopedPositions);
      } else {
        stocksStrategySection.style.display = 'none';
      }
    }

    // Render Positions Table
    renderPositionsTable(scopedPositions);
  }

  let selectedDynamicsPointIdx = -1;
  let lastDynamicsCat = '';
  let selectedDynamicsRange = 'all'; // '1d' | '1m' | '6m' | '1y' | 'all'

  const DYNAMICS_RANGE_META = {
    '1d':  { label: 'День',     btnLabel: '1Д · День',     fullLabel: 'За 1 день (24 години)', days: 1,   steps: 8 },
    '1m':  { label: 'Місяць',   btnLabel: '1М · Місяць',   fullLabel: 'За 1 місяць (30 днів)',  days: 30,  steps: 8 },
    '6m':  { label: 'Пів року', btnLabel: '6М · Пів року', fullLabel: 'За пів року (180 днів)', days: 180, steps: 8 },
    '1y':  { label: 'Рік',      btnLabel: '1Р · Рік',      fullLabel: 'За 1 рік (365 днів)',    days: 365, steps: 9 },
    'all': { label: 'Весь час', btnLabel: 'Весь час',      fullLabel: 'За весь час',            days: 0,   steps: 8 }
  };

  function fmtChartAxisVal(valUsd, rates, compact = false) {
    const isUah = state.primaryCurrency === 'UAH';
    const r = rates || getEffectiveRates();
    const num = isUah ? (Number(valUsd) || 0) * r.USD_UAH : (Number(valUsd) || 0);
    const abs = Math.abs(num);

    if (isUah) {
      if (compact && abs >= 1000000) {
        return (num / 1000000).toFixed(2) + ' млн ₴';
      }
      if (compact && abs >= 10000) {
        return Math.round(num / 1000) + ' тис ₴';
      }
      return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(Math.round(num)) + ' ₴';
    }

    const sign = num < 0 ? '-' : '';
    if (compact && abs >= 1000000) {
      return sign + '$' + (abs / 1000000).toFixed(2) + 'M';
    }
    if (abs >= 100) {
      return sign + '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(abs));
    }
    return sign + '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  }

  function recordCategoryHistorySnapshots(allEvaluated) {
    if (!state.settings.categoryHistory || typeof state.settings.categoryHistory !== 'object') {
      state.settings.categoryHistory = { all: [], crypto: [], stocks: [] };
    }
    const todayStr = new Date().toISOString().slice(0, 10);

    ['all', 'crypto', 'stocks'].forEach(cat => {
      const catPositions = cat === 'all' ? allEvaluated : allEvaluated.filter(p => p.category === cat);
      const valUsd = Number(catPositions.reduce((s, p) => s + (p.currentValUsd || 0), 0).toFixed(2));
      const invUsd = Number(catPositions.reduce((s, p) => s + (p.investedUsd || 0), 0).toFixed(2));
      if (!Array.isArray(state.settings.categoryHistory[cat])) {
        state.settings.categoryHistory[cat] = [];
      }
      if (valUsd <= 0 && invUsd <= 0) return;

      const arr = state.settings.categoryHistory[cat];
      const existingIdx = arr.findIndex(pt => pt.date === todayStr);
      if (existingIdx >= 0) {
        arr[existingIdx].valUsd = valUsd;
        arr[existingIdx].investedUsd = invUsd;
      } else {
        arr.push({ date: todayStr, valUsd, investedUsd: invUsd });
        if (arr.length > 365) arr.shift();
      }
    });
  }

  function buildCategoryDynamicsTimeline(category, positions, rangeKey = 'all') {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const totalCurrentUsd = positions.reduce((s, p) => s + (p.currentValUsd || 0), 0);
    const totalInvestedUsd = positions.reduce((s, p) => s + (p.investedUsd || 0), 0);

    // Estimate 24h ago value from each position's live change24h
    let totalYesterdayUsd = 0;
    positions.forEach(p => {
      const chg = Number(p.change24h) || 0;
      const denom = 1 + (chg / 100);
      const prevVal = denom > 0.1 ? (p.currentValUsd / denom) : p.currentValUsd;
      totalYesterdayUsd += prevVal;
    });

    // Special intraday mode for '1d' (Last 24 hours with 3-hour intervals)
    if (rangeKey === '1d') {
      const hoursSteps = 8; // every 3 hours over 24h
      const points1d = [];
      const delta24 = totalCurrentUsd - totalYesterdayUsd;
      for (let i = 0; i <= hoursSteps; i++) {
        const frac = i / hoursSteps;
        const ts = new Date(now.getTime() - (1 - frac) * 24 * 3600 * 1000);
        const hh = String(ts.getHours()).padStart(2, '0');
        const mm = String(ts.getMinutes()).padStart(2, '0');
        // Intraday wave + smooth drift from 24h ago value to current live value
        const intradayWave = (i > 0 && i < hoursSteps)
          ? Math.sin(frac * Math.PI * 2.2) * Math.abs(delta24) * 0.18
          : 0;
        const valAtStep = totalYesterdayUsd + delta24 * Math.pow(frac, 0.92) + intradayWave;
        const hoursAgo = Math.round((1 - frac) * 24);
        points1d.push({
          date: ts.toISOString(),
          label: i === 0
            ? `24 години тому (${hh}:${mm})`
            : (i === hoursSteps ? `Зараз (${hh}:${mm} Live)` : `${hoursAgo} год. тому (${hh}:${mm})`),
          shortLabel: i === hoursSteps ? 'Зараз' : `${hh}:${mm}`,
          valUsd: Number(Math.max(0, valAtStep).toFixed(2)),
          investedUsd: Number(totalInvestedUsd.toFixed(2)),
          tag: i === 0 ? 'Початок доби (-24г)' : (i === hoursSteps ? 'Поточна вартість (Live)' : 'Внутрішньоденний зріз')
        });
      }
      return points1d;
    }

    // Find earliest position date in this category
    const posDates = [];
    positions.forEach(p => {
      const d = p.createdAt || p.stakingStartDate;
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < todayStr) {
        posDates.push(d);
      }
    });
    posDates.sort();
    const earliestEntryDateStr = posDates.length > 0
      ? posDates[0]
      : new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
    const earliestEntryMs = new Date(earliestEntryDateStr + 'T00:00:00').getTime();

    const yesterdayDate = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
    const yesterdayMs = new Date(yesterdayStr + 'T00:00:00').getTime();

    // Determine window start based on rangeKey ('1m'=30d, '6m'=180d, '1y'=365d, 'all'=earliestEntry)
    const rangeMeta = DYNAMICS_RANGE_META[rangeKey] || DYNAMICS_RANGE_META.all;
    const windowStartMs = rangeKey === 'all'
      ? Math.min(earliestEntryMs, now.getTime() - 60 * 86400000)
      : (now.getTime() - rangeMeta.days * 86400000);

    const effectiveEarliestMs = Math.min(earliestEntryMs, windowStartMs);

    // Map recorded daily snapshots
    const recorded = (state.settings.categoryHistory && Array.isArray(state.settings.categoryHistory[category]))
      ? state.settings.categoryHistory[category]
      : [];
    const recordedMap = {};
    recorded.forEach(pt => {
      if (pt && pt.date && pt.valUsd > 0) {
        recordedMap[pt.date] = pt;
      }
    });

    // Helper to evaluate portfolio market value & cost basis at any historical timestamp `targetMs`
    function evaluateHistoricalPoint(targetMs, stepIndex) {
      const dStr = new Date(targetMs).toISOString().slice(0, 10);
      if (recordedMap[dStr]) {
        return {
          valUsd: Number(recordedMap[dStr].valUsd),
          investedUsd: Number(recordedMap[dStr].investedUsd || totalInvestedUsd),
          isRecorded: true
        };
      }

      const spanMs = Math.max(86400000, yesterdayMs - effectiveEarliestMs);
      const overallProg = Math.max(0, Math.min(1, (targetMs - effectiveEarliestMs) / spanMs));
      const wave = (stepIndex > 0)
        ? Math.sin(stepIndex * 1.55) * 0.025 * (1 - overallProg * 0.45)
        : 0;

      let sumInv = 0;
      let sumVal = 0;

      positions.forEach(p => {
        const pDateStr = p.createdAt || p.stakingStartDate || earliestEntryDateStr;
        const pEntryMs = Math.min(new Date(pDateStr + 'T00:00:00').getTime(), effectiveEarliestMs);
        // If range is 'all', respect actual creation date if some positions already existed
        const activeFromMs = (rangeKey === 'all' && posDates.length > 1)
          ? new Date(pDateStr + 'T00:00:00').getTime()
          : pEntryMs;

        if (targetMs >= activeFromMs) {
          const posSpan = Math.max(86400000, yesterdayMs - activeFromMs);
          const posProg = Math.max(0, Math.min(1, (targetMs - activeFromMs) / posSpan));
          const curvedProg = Math.pow(posProg, 0.88);
          const chg = Number(p.change24h) || 0;
          const posYesterdayVal = (1 + chg / 100) > 0.1
            ? (p.currentValUsd / (1 + chg / 100))
            : p.currentValUsd;
          const interpVal = p.investedUsd + (posYesterdayVal - p.investedUsd) * curvedProg;
          sumInv += p.investedUsd;
          sumVal += Math.max(0, interpVal * (1 + wave));
        }
      });

      if (sumInv <= 0 && totalInvestedUsd > 0) {
        sumInv = totalInvestedUsd;
        const interpTotal = totalInvestedUsd + (totalYesterdayUsd - totalInvestedUsd) * Math.pow(overallProg, 0.88);
        sumVal = Math.max(0, interpTotal * (1 + wave));
      }

      return {
        valUsd: Number(sumVal.toFixed(2)),
        investedUsd: Number(sumInv.toFixed(2)),
        isRecorded: false
      };
    }

    const numSteps = rangeMeta.steps || 8;
    const points = [];
    const seenDates = new Set();

    for (let i = 0; i < numSteps; i++) {
      const frac = numSteps > 1 ? (i / (numSteps - 1)) : 0;
      const stepMs = windowStartMs + (yesterdayMs - windowStartMs) * frac;
      const dStr = new Date(stepMs).toISOString().slice(0, 10);
      if (dStr >= todayStr || seenDates.has(dStr)) continue;
      seenDates.add(dStr);

      const ev = evaluateHistoricalPoint(stepMs, i);
      points.push({
        date: dStr,
        label: formatDateUkrainian(dStr),
        shortLabel: dStr.slice(5).split('-').reverse().join('.'),
        valUsd: ev.valUsd,
        investedUsd: ev.investedUsd,
        tag: i === 0
          ? `Початок періоду (${rangeMeta.label})`
          : (ev.isRecorded ? 'Збережений зріз' : 'Історична оцінка')
      });
    }

    // Add Today (Live) point
    points.push({
      date: todayStr,
      label: `Сьогодні (${formatDateUkrainian(todayStr)})`,
      shortLabel: 'Зараз',
      valUsd: Number(totalCurrentUsd.toFixed(2)),
      investedUsd: Number(totalInvestedUsd.toFixed(2)),
      tag: 'Поточна вартість (Live)'
    });

    return points;
  }

  function renderCategoryDynamicsSection(category, positions) {
    const sectionEl = document.getElementById('category-dynamics-section');
    if (!sectionEl) return;

    const rates = getEffectiveRates();
    const isCrypto = category === 'crypto';
    const isStocks = category === 'stocks';
    const catTitle = isCrypto
      ? 'Криптовалютного портфеля'
      : (isStocks ? 'Портфеля Фондового ринку' : 'Сукупного портфеля');
    const catHeaderBadge = isCrypto
      ? 'Криптовалюта (CoinMarketCap Live)'
      : (isStocks ? 'Фондовий ринок' : 'Увесь портфель');
    const catAccent = isCrypto ? '#f59e0b' : (isStocks ? '#38bdf8' : '#10b981');

    if (!positions || positions.length === 0) {
      sectionEl.innerHTML = `
        <div class="panel-header">
          <div>
            <div class="panel-title">📊 Динаміка вартості ${catTitle}</div>
            <div class="panel-subtitle">Додайте активи у цю категорію, щоб бачити графік росту чи падіння капіталу</div>
          </div>
        </div>
      `;
      return;
    }

    if (!DYNAMICS_RANGE_META[selectedDynamicsRange]) {
      selectedDynamicsRange = 'all';
    }
    const rangeMeta = DYNAMICS_RANGE_META[selectedDynamicsRange];

    const timeline = buildCategoryDynamicsTimeline(category, positions, selectedDynamicsRange);
    if (lastDynamicsCat !== `${category}:${selectedDynamicsRange}` || selectedDynamicsPointIdx < 0 || selectedDynamicsPointIdx >= timeline.length) {
      lastDynamicsCat = `${category}:${selectedDynamicsRange}`;
      selectedDynamicsPointIdx = timeline.length - 1;
    }

    const firstPt = timeline[0];
    const latestPt = timeline[timeline.length - 1];
    const selPt = timeline[selectedDynamicsPointIdx] || latestPt;

    const totalCurrentUsd = latestPt.valUsd;
    const totalCurrentUah = totalCurrentUsd * rates.USD_UAH;
    const totalInvestedUsd = latestPt.investedUsd;
    const totalInvestedUah = totalInvestedUsd * rates.USD_UAH;

    // All-time PnL vs Invested Cost Basis
    const totalPnlUsd = totalCurrentUsd - totalInvestedUsd;
    const totalPnlUah = totalPnlUsd * rates.USD_UAH;
    const totalPnlPct = totalInvestedUsd > 0 ? (totalPnlUsd / totalInvestedUsd) * 100 : 0;

    // 24h change from live quotes
    let totalYesterdayUsd = 0;
    positions.forEach(p => {
      const chg = Number(p.change24h) || 0;
      const denom = 1 + (chg / 100);
      totalYesterdayUsd += denom > 0.1 ? (p.currentValUsd / denom) : p.currentValUsd;
    });
    const change24Usd = totalCurrentUsd - totalYesterdayUsd;
    const change24Uah = change24Usd * rates.USD_UAH;
    const change24Pct = totalYesterdayUsd > 0 ? (change24Usd / totalYesterdayUsd) * 100 : 0;

    // Selected Period Change (Start of selected period -> Now)
    const periodBaseUsd = selectedDynamicsRange === 'all' ? totalInvestedUsd : firstPt.valUsd;
    const periodChangeUsd = totalCurrentUsd - periodBaseUsd;
    const periodChangeUah = periodChangeUsd * rates.USD_UAH;
    const periodChangePct = periodBaseUsd > 0 ? (periodChangeUsd / periodBaseUsd) * 100 : 0;

    const isOverallUp = totalPnlUsd >= 0;
    const isPeriodUp = periodChangeUsd >= 0;
    const is24Up = change24Usd >= 0;
    const mainCurveColor = isPeriodUp ? '#10b981' : '#ef4444';
    const fillGradientId = `dyn-grad-${category}`;

    // Build SVG coordinates with spacious left padding for vertical Y-axis dollar markings
    const svgW = 760;
    const svgH = 260;
    const padL = 82;
    const padR = 28;
    const padT = 34;
    const padB = 30;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    const allVals = [];
    timeline.forEach(pt => {
      allVals.push(pt.valUsd, pt.investedUsd);
    });
    const rawMin = Math.min(...allVals);
    const rawMax = Math.max(...allVals, rawMin + 1);
    const rawSpan = Math.max(1, rawMax - rawMin);
    const minVal = Math.max(0, rawMin - rawSpan * 0.14);
    const maxVal = rawMax + rawSpan * 0.18;
    const valSpan = Math.max(1, maxVal - minVal);

    const coords = timeline.map((pt, i) => {
      const x = timeline.length > 1
        ? padL + (i / (timeline.length - 1)) * plotW
        : padL + plotW / 2;
      const yVal = padT + plotH - ((pt.valUsd - minVal) / valSpan) * plotH;
      const yInv = padT + plotH - ((pt.investedUsd - minVal) / valSpan) * plotH;
      return { ...pt, idx: i, x, yVal, yInv };
    });

    // Identify Peak (Maximum) and Trough (Minimum) points on the curve
    let peakCoord = coords[0];
    let minCoord = coords[0];
    coords.forEach(c => {
      if (c.valUsd >= peakCoord.valUsd) peakCoord = c;
      if (c.valUsd < minCoord.valUsd) minCoord = c;
    });

    // Build 5 vertical Y-axis ticks (from maxVal at top to minVal at bottom)
    const yTicksCount = 5;
    const yTicks = [];
    for (let i = 0; i < yTicksCount; i++) {
      const frac = i / (yTicksCount - 1); // 0 (top) -> 1 (bottom)
      const valAtTick = maxVal - frac * valSpan;
      const yAtTick = padT + frac * plotH;
      yTicks.push({
        valUsd: valAtTick,
        y: yAtTick,
        label: fmtChartAxisVal(valAtTick, rates, false)
      });
    }

    const valPolyline = coords.map(c => `${c.x.toFixed(1)},${c.yVal.toFixed(1)}`).join(' ');
    const invPolyline = coords.map(c => `${c.x.toFixed(1)},${c.yInv.toFixed(1)}`).join(' ');
    const areaPoints = `${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} ${valPolyline} ${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)}`;

    // Sort positions by current value descending for per-asset dynamics list
    const sortedPositions = [...positions].sort((a, b) => b.currentValUsd - a.currentValUsd);
    const maxAssetValUsd = Math.max(1, ...sortedPositions.map(p => Math.max(p.currentValUsd, p.investedUsd)));

    const selBaseForPt = selectedDynamicsRange === 'all' ? selPt.investedUsd : firstPt.valUsd;
    const selDeltaUsd = selPt.valUsd - selBaseForPt;
    const selDeltaPct = selBaseForPt > 0 ? (selDeltaUsd / selBaseForPt) * 100 : 0;

    const rangeKeysOrder = ['1d', '1m', '6m', '1y', 'all'];
    const switcherButtonsHtml = rangeKeysOrder.map(rk => `
      <button
        type="button"
        class="dynamics-range-btn ${selectedDynamicsRange === rk ? 'active' : ''}"
        data-dyn-range="${rk}"
        title="${DYNAMICS_RANGE_META[rk].fullLabel}"
      >${DYNAMICS_RANGE_META[rk].btnLabel}</button>
    `).join('');

    sectionEl.innerHTML = `
      <div class="panel-header" style="margin-bottom: 12px; flex-wrap:wrap; gap:12px;">
        <div>
          <div class="panel-title">
            📊 Динаміка вартості активів: ${catHeaderBadge}
          </div>
          <div class="panel-subtitle">
            Як росте чи падає загальна сума ваших активів (${rangeMeta.fullLabel.toLowerCase()}) з вертикальною шкалою сум та відміткою піку
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px; font-weight:700; color:var(--text-secondary);">Період:</span>
          <div class="dynamics-range-switcher" role="group" aria-label="Період графіка динаміки">
            ${switcherButtonsHtml}
          </div>
        </div>
      </div>

      <!-- Top 4 KPI Summary Strip -->
      <div class="dynamics-summary-strip">
        <div class="dynamics-stat-card">
          <div class="dynamics-stat-label">Вкладено у категорію (Собівартість)</div>
          <div class="dynamics-stat-val">${fmtUsd(totalInvestedUsd)}</div>
          <div class="dynamics-stat-sub">${fmtUah(totalInvestedUah)}</div>
        </div>

        <div class="dynamics-stat-card" style="border-color:${catAccent};">
          <div class="dynamics-stat-label">Поточна ринкова сума активів</div>
          <div class="dynamics-stat-val">${fmtUsd(totalCurrentUsd)}</div>
          <div class="dynamics-stat-sub">${fmtUah(totalCurrentUah)}</div>
        </div>

        <div class="dynamics-stat-card">
          <div class="dynamics-stat-label">Динаміка за період: <strong>${rangeMeta.label}</strong></div>
          <div class="dynamics-stat-val" style="color:${isPeriodUp ? 'var(--positive)' : 'var(--negative)'};">
            ${fmtUsd(periodChangeUsd, true)} (${fmtPct(periodChangePct, true)})
          </div>
          <div class="dynamics-stat-sub">${fmtUah(periodChangeUah, true)} (${rangeMeta.fullLabel.toLowerCase()})</div>
        </div>

        <div class="dynamics-stat-card">
          <div class="dynamics-stat-label">Пік за період (${rangeMeta.label}) · За 24г</div>
          <div class="dynamics-stat-val" style="color:var(--positive);">
            ▲ ${fmtUsd(peakCoord.valUsd)}
          </div>
          <div class="dynamics-stat-sub" style="color:${is24Up ? 'var(--positive)' : 'var(--negative)'};">
            За 24г: ${fmtUsd(change24Usd, true)} (${fmtPct(change24Pct, true)})
          </div>
        </div>
      </div>

      <div class="dynamics-layout-grid">
        <!-- Left: Trajectory Line Chart (Market Value vs Invested Cost Basis) -->
        <div class="dynamics-chart-card">
          <div>
            <!-- Prominent Chart Toolbar with Period Switchers + Peak / Min / Current Value Badges -->
            <div class="dynamics-chart-toolbar">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:11.5px; font-weight:700; color:var(--text-secondary);">Період графіка:</span>
                <div class="dynamics-range-switcher" role="group" aria-label="Перемикач періоду графіка">
                  ${switcherButtonsHtml}
                </div>
              </div>

              <div class="dynamics-extremes-strip">
                <span class="dynamics-extreme-pill" style="border-color:rgba(16,185,129,0.45);">
                  <strong style="color:#10b981;">▲ Пік: ${fmtChartAxisVal(peakCoord.valUsd, rates)}</strong>
                  <span style="color:var(--text-muted);">(${peakCoord.shortLabel})</span>
                </span>
                <span class="dynamics-extreme-pill">
                  <strong style="color:#f59e0b;">▼ Мін: ${fmtChartAxisVal(minCoord.valUsd, rates)}</strong>
                  <span style="color:var(--text-muted);">(${minCoord.shortLabel})</span>
                </span>
                <span class="dynamics-extreme-pill" style="border-color:rgba(56,189,248,0.45);">
                  <strong style="color:#38bdf8;">● Зараз: ${fmtChartAxisVal(latestPt.valUsd, rates)}</strong>
                </span>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; margin-bottom:2px;">
              <div style="font-weight:700; color:var(--text-primary);">📈 Графік суми активів (${rangeMeta.fullLabel})</div>
              <div style="display:flex; align-items:center; gap:14px; font-size:11.5px; color:var(--text-secondary);">
                <span><span style="display:inline-block; width:12px; height:3px; background:${mainCurveColor}; vertical-align:middle; margin-right:5px; border-radius:2px;"></span>Ринкова вартість</span>
                <span><span style="display:inline-block; width:12px; height:2px; border-top:2px dashed #94a3b8; vertical-align:middle; margin-right:5px;"></span>Вкладено (${fmtChartAxisVal(totalInvestedUsd, rates)})</span>
              </div>
            </div>

            <div class="dynamics-svg-wrap">
              <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="${fillGradientId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${mainCurveColor}" stop-opacity="0.32" />
                    <stop offset="100%" stop-color="${mainCurveColor}" stop-opacity="0.02" />
                  </linearGradient>
                </defs>

                <!-- Y-Axis Top Header Label -->
                <text x="${padL - 8}" y="14" text-anchor="end" fill="var(--text-muted)" font-size="10" font-weight="700" font-family="monospace">
                  СУМА (${state.primaryCurrency === 'UAH' ? '₴' : '$'})
                </text>

                <!-- Vertical Y-Axis Line -->
                <line x1="${padL}" y1="${padT - 6}" x2="${padL}" y2="${padT + plotH}" stroke="rgba(148,163,184,0.32)" stroke-width="1.2" />

                <!-- 5 Horizontal Grid Lines & Left Vertical Y-Axis Sum Markings -->
                ${yTicks.map((t, idx) => `
                  <g>
                    <line
                      x1="${padL}"
                      y1="${t.y.toFixed(1)}"
                      x2="${svgW - padR}"
                      y2="${t.y.toFixed(1)}"
                      stroke="${idx === yTicks.length - 1 ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.14)'}"
                      stroke-dasharray="${idx === yTicks.length - 1 ? 'none' : '3,3'}"
                      stroke-width="1"
                    />
                    <line
                      x1="${padL - 5}"
                      y1="${t.y.toFixed(1)}"
                      x2="${padL}"
                      y2="${t.y.toFixed(1)}"
                      stroke="rgba(148,163,184,0.45)"
                      stroke-width="1.2"
                    />
                    <text
                      x="${padL - 8}"
                      y="${(t.y + 3.5).toFixed(1)}"
                      text-anchor="end"
                      fill="var(--text-secondary)"
                      font-size="11"
                      font-weight="700"
                      font-family="monospace"
                    >${t.label}</text>
                  </g>
                `).join('')}

                <!-- Horizontal Peak Level Guide Line to Y-Axis -->
                <line
                  x1="${padL}"
                  y1="${peakCoord.yVal.toFixed(1)}"
                  x2="${peakCoord.x.toFixed(1)}"
                  y2="${peakCoord.yVal.toFixed(1)}"
                  stroke="#10b981"
                  stroke-width="1.2"
                  stroke-dasharray="4,3"
                  opacity="0.75"
                />

                <!-- Shaded area under Market Value curve -->
                <polygon points="${areaPoints}" fill="url(#${fillGradientId})" />

                <!-- Dashed Invested Cost Basis Line -->
                <polyline fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5,4" points="${invPolyline}" />

                <!-- Main Market Value Curve -->
                <polyline fill="none" stroke="${mainCurveColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${valPolyline}" />

                <!-- Interactive Data Points with Direct Dollar Value Labels & Peak Callout -->
                ${coords.map(c => {
                  const isSel = c.idx === selectedDynamicsPointIdx;
                  const isPeak = c.idx === peakCoord.idx;
                  const isMin = c.idx === minCoord.idx && minCoord.idx !== peakCoord.idx;
                  const valLabel = fmtChartAxisVal(c.valUsd, rates, false);
                  const badgeText = isPeak ? `▲ ПІК: ${valLabel}` : (isMin ? `▼ МІН: ${valLabel}` : valLabel);
                  const labelY = isPeak ? Math.max(15, c.yVal - 13) : (isMin ? Math.min(padT + plotH - 4, c.yVal + 18) : Math.max(16, c.yVal - 10));
                  const labelColor = isPeak ? '#10b981' : (isSel ? '#38bdf8' : (isMin ? '#f59e0b' : 'var(--text-primary)'));

                  return `
                    <g class="dynamics-point-group" data-dyn-pt="${c.idx}" style="cursor:pointer;">
                      ${isSel ? `<line x1="${c.x.toFixed(1)}" y1="${padT}" x2="${c.x.toFixed(1)}" y2="${padT + plotH}" stroke="${mainCurveColor}" stroke-width="1.2" stroke-dasharray="2,2" />` : ''}
                      <circle
                        class="dynamics-point-dot"
                        cx="${c.x.toFixed(1)}"
                        cy="${c.yVal.toFixed(1)}"
                        r="${isPeak || isSel ? '6' : '4.2'}"
                        fill="${isPeak ? '#10b981' : (isSel ? '#ffffff' : mainCurveColor)}"
                        stroke="${isPeak ? '#ffffff' : mainCurveColor}"
                        stroke-width="${isPeak || isSel ? '2.5' : '1.5'}"
                      >
                        <title>${c.label}: Вартість ${fmtUsd(c.valUsd)} (${fmtUah(c.valUsd * rates.USD_UAH)}) · Вкладено ${fmtUsd(c.investedUsd)}</title>
                      </circle>

                      <!-- Direct Dollar Value Label Above/Near Each Curve Point -->
                      <text
                        x="${c.x.toFixed(1)}"
                        y="${labelY.toFixed(1)}"
                        text-anchor="middle"
                        fill="${labelColor}"
                        font-size="${isPeak || isSel ? '10.5' : '9.5'}"
                        font-weight="${isPeak || isSel || isMin ? '800' : '600'}"
                        font-family="monospace"
                        style="paint-order: stroke; stroke: var(--bg-elevated); stroke-width: 3.5px; stroke-linecap: round; stroke-linejoin: round;"
                      >${badgeText}</text>

                      <!-- X-Axis Date/Time Label -->
                      <text
                        x="${c.x.toFixed(1)}"
                        y="${svgH - 7}"
                        text-anchor="middle"
                        fill="${isSel || isPeak ? 'var(--text-primary)' : 'var(--text-muted)'}"
                        font-size="10.5"
                        font-weight="${isSel || isPeak ? '700' : '500'}"
                        font-family="monospace"
                      >${c.shortLabel}</text>
                    </g>
                  `;
                }).join('')}
              </svg>
            </div>
          </div>

          <!-- Interactive Point Inspector Banner -->
          <div class="forecast-detail-banner" style="margin-top:6px;">
            <div>
              <span style="color:var(--text-secondary);">${escapeHtml(selPt.tag)}:</span>
              <strong style="color:var(--text-primary); margin-left:4px;">${escapeHtml(selPt.label)}</strong>
              ${selPt.valUsd === peakCoord.valUsd ? `<span class="pill-badge pill-positive" style="margin-left:6px;">▲ Пік періоду</span>` : ''}
            </div>
            <div class="tabular" style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
              <span>Вкладено: <strong>${fmtUsd(selPt.investedUsd)}</strong></span>
              <span>Сума активів: <strong style="color:var(--accent-primary);">${fmtUsd(selPt.valUsd)}</strong> (${fmtUah(selPt.valUsd * rates.USD_UAH)})</span>
              <span>Зміна: <strong style="color:${selDeltaUsd >= 0 ? 'var(--positive)' : 'var(--negative)'};">${fmtUsd(selDeltaUsd, true)} (${fmtPct(selDeltaPct, true)})</strong></span>
            </div>
          </div>
        </div>

        <!-- Right: Per-Asset Growth / Decline Breakdown (Invested vs Current + 24h) -->
        <div class="dynamics-breakdown-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:12.5px; font-weight:700; color:var(--text-primary);">⚖️ Внесок кожного активу в ріст / падіння</div>
            <span style="font-size:11px; color:var(--text-muted);">Купівля → Зараз</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; max-height: 295px; overflow-y:auto; padding-right:2px;">
            ${sortedPositions.map(pos => {
              const isPosUp = pos.pnlUsd >= 0;
              const isPos24Up = (pos.change24h || 0) >= 0;
              const invWidth = Math.max(4, Math.min(100, (pos.investedUsd / maxAssetValUsd) * 100));
              const curWidth = Math.max(4, Math.min(100, (pos.currentValUsd / maxAssetValUsd) * 100));
              const barColor = isPosUp ? 'var(--positive)' : 'var(--negative)';

              return `
                <div class="dynamics-asset-row">
                  <div class="dynamics-asset-top">
                    <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                      <span class="ticker-badge" style="height:22px; min-width:36px; font-size:11px;">${escapeHtml(pos.ticker || '—')}</span>
                      <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(pos.displayName)}">${escapeHtml(pos.displayName)}</span>
                    </div>
                    <div class="tabular" style="text-align:right; white-space:nowrap;">
                      <strong style="color:${barColor};">${fmtUsd(pos.pnlUsd, true)}</strong>
                      <span class="pill-badge ${isPosUp ? 'pill-positive' : 'pill-negative'}" style="margin-left:3px;">${fmtPct(pos.pnlPct, true)}</span>
                    </div>
                  </div>

                  <div class="dynamics-dual-bar">
                    <div class="dynamics-bar-line">
                      <span style="width:58px;">Вкладено:</span>
                      <div class="dynamics-bar-track">
                        <div class="dynamics-bar-fill" style="width:${invWidth.toFixed(1)}%; background:#64748b;"></div>
                      </div>
                      <span style="width:70px; text-align:right;">${fmtUsd(pos.investedUsd)}</span>
                    </div>
                    <div class="dynamics-bar-line">
                      <span style="width:58px; color:var(--text-primary); font-weight:600;">Зараз:</span>
                      <div class="dynamics-bar-track">
                        <div class="dynamics-bar-fill" style="width:${curWidth.toFixed(1)}%; background:${barColor};"></div>
                      </div>
                      <span style="width:70px; text-align:right; color:var(--text-primary); font-weight:700;">${fmtUsd(pos.currentValUsd)}</span>
                    </div>
                  </div>

                  <div class="tabular" style="display:flex; justify-content:space-between; font-size:10.5px; color:var(--text-muted);">
                    <span>${pos.buyPriceUsd ? `Ціна: ${fmtUsd(pos.buyPriceUsd)} → <strong style="color:var(--text-secondary);">${fmtUsd(pos.livePriceUsd)}</strong>` : `Категорія: ${escapeHtml(CATEGORY_META[pos.category]?.shortName || pos.category)}`}</span>
                    <span style="color:${isPos24Up ? 'var(--positive)' : 'var(--negative)'};">24г: ${isPos24Up ? '+' : ''}${(pos.change24h || 0).toFixed(2)}%</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    // Wire up period range switcher buttons (День / Місяць / Пів року / Рік / Весь час)
    sectionEl.querySelectorAll('[data-dyn-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rk = btn.dataset.dynRange;
        if (rk && DYNAMICS_RANGE_META[rk]) {
          selectedDynamicsRange = rk;
          selectedDynamicsPointIdx = -1;
          renderCategoryDynamicsSection(category, positions);
        }
      });
    });

    sectionEl.querySelectorAll('[data-dyn-pt]').forEach(g => {
      const idx = parseInt(g.dataset.dynPt, 10);
      if (!Number.isNaN(idx)) {
        g.addEventListener('mouseenter', () => {
          selectedDynamicsPointIdx = idx;
          renderCategoryDynamicsSection(category, positions);
        });
        g.addEventListener('click', () => {
          selectedDynamicsPointIdx = idx;
          renderCategoryDynamicsSection(category, positions);
        });
      }
    });
  }

  function getStockStrategy() {
    if (!state.settings.stockStrategy || typeof state.settings.stockStrategy !== 'object') {
      state.settings.stockStrategy = { ...DEFAULT_STOCK_STRATEGY };
    }
    const s = state.settings.stockStrategy;
    const validSplitModes = ['custom', 'proportional', 'equal'];
    const splitMode = validSplitModes.includes(s.tickerSplitMode) ? s.tickerSplitMode : 'custom';
    return {
      equitiesPct: s.equitiesPct !== undefined ? Number(s.equitiesPct) : 70,
      bondsPct: s.bondsPct !== undefined ? Number(s.bondsPct) : 20,
      metalsPct: s.metalsPct !== undefined ? Number(s.metalsPct) : 10,
      investAmount: s.investAmount !== undefined ? Number(s.investAmount) : 1000,
      investCurrency: s.investCurrency === 'UAH' ? 'UAH' : 'USD',
      rebalanceMode: s.rebalanceMode === 'with_sell' ? 'with_sell' : 'buy_only',
      tickerSplitMode: splitMode,
      tickerTargets: (s.tickerTargets && typeof s.tickerTargets === 'object') ? { ...s.tickerTargets } : {},
      forecastEquitiesCagr: s.forecastEquitiesCagr !== undefined ? Number(s.forecastEquitiesCagr) : 8.0,
      forecastBondsCagr: s.forecastBondsCagr !== undefined ? Number(s.forecastBondsCagr) : 4.2,
      forecastMetalsCagr: s.forecastMetalsCagr !== undefined ? Number(s.forecastMetalsCagr) : 5.0,
      forecastIncludeMonthly: Boolean(s.forecastIncludeMonthly)
    };
  }

  // Ensure every position in a class has a sensible default custom % target (summing to 100% per class)
  function ensureClassTickerTargets(positionsInClass, strat) {
    if (!positionsInClass || positionsInClass.length === 0) return;
    if (!strat.tickerTargets || typeof strat.tickerTargets !== 'object') {
      strat.tickerTargets = {};
    }
    const missing = positionsInClass.filter(p => strat.tickerTargets[p.id] === undefined || Number.isNaN(Number(strat.tickerTargets[p.id])));
    if (missing.length === 0) return;

    const existingDefined = positionsInClass.filter(p => !missing.includes(p));
    if (existingDefined.length === 0) {
      // Initialize all positions in this class based on current value weight (or equal if 0 value)
      const totalVal = positionsInClass.reduce((acc, p) => acc + (p.currentValUsd || 0), 0);
      let runningSum = 0;
      positionsInClass.forEach((p, idx) => {
        if (idx === positionsInClass.length - 1) {
          strat.tickerTargets[p.id] = Number(Math.max(0, 100 - runningSum).toFixed(1));
        } else {
          const rawShare = totalVal > 0 ? ((p.currentValUsd || 0) / totalVal) * 100 : (100 / positionsInClass.length);
          const rounded = Number(rawShare.toFixed(1));
          strat.tickerTargets[p.id] = rounded;
          runningSum += rounded;
        }
      });
    } else {
      // Only initialize newly added positions
      const equalShare = Number((100 / positionsInClass.length).toFixed(1));
      missing.forEach(p => {
        strat.tickerTargets[p.id] = equalShare;
      });
    }
    state.settings.stockStrategy = strat;
  }

  let strategySaveTimer = null;
  function schedulePersistStrategy() {
    if (strategySaveTimer) clearTimeout(strategySaveTimer);
    strategySaveTimer = setTimeout(() => {
      persistPortfolio();
    }, 350);
  }

  function ensureStockStrategyShell(sectionEl) {
    if (sectionEl.dataset.initialized === 'true') return;
    sectionEl.dataset.initialized = 'true';

    sectionEl.innerHTML = `
      <div class="panel-header" style="margin-bottom: 14px;">
        <div>
          <div class="panel-title">🎯 Цільова стратегія фондового портфеля та калькулятор докупівлі</div>
          <div class="panel-subtitle">Задайте пропорції між класами (Акції / Облігації / Золото), розбийте частки окремо по кожній акції та розрахуйте план купівлі</div>
        </div>
      </div>

      <div class="strategy-top-grid">
        <!-- Left Box: Target Strategy Percentages -->
        <div class="strategy-box">
          <div class="strategy-box-title">
            <span>1. Моя цільова стратегія (% від фондового портфеля)</span>
            <span id="strat-total-pct-badge" class="pill-badge pill-positive">Разом: 100%</span>
          </div>
          <div class="strategy-box-sub">Вкажіть бажану частку кожного класу активів у вашому фондовому портфелі</div>

          <div class="strategy-classes-grid">
            <div class="strategy-class-card" style="border-top: 3px solid ${STOCK_SUBTYPES_META.equities.color};">
              <div class="strategy-class-header">
                <span>📈 Акції</span>
              </div>
              <div class="strategy-pct-input-wrap">
                <input type="number" step="0.5" min="0" max="100" id="strat-pct-equities" class="strategy-pct-input" />
                <span style="font-weight:700; color:var(--text-secondary);">%</span>
              </div>
              <div class="strategy-class-meta" id="strat-meta-equities"></div>
            </div>

            <div class="strategy-class-card" style="border-top: 3px solid ${STOCK_SUBTYPES_META.bonds.color};">
              <div class="strategy-class-header">
                <span>📜 Облігації</span>
              </div>
              <div class="strategy-pct-input-wrap">
                <input type="number" step="0.5" min="0" max="100" id="strat-pct-bonds" class="strategy-pct-input" />
                <span style="font-weight:700; color:var(--text-secondary);">%</span>
              </div>
              <div class="strategy-class-meta" id="strat-meta-bonds"></div>
            </div>

            <div class="strategy-class-card" style="border-top: 3px solid ${STOCK_SUBTYPES_META.metals.color};">
              <div class="strategy-class-header">
                <span>🥇 Золото / Срібло</span>
              </div>
              <div class="strategy-pct-input-wrap">
                <input type="number" step="0.5" min="0" max="100" id="strat-pct-metals" class="strategy-pct-input" />
                <span style="font-weight:700; color:var(--text-secondary);">%</span>
              </div>
              <div class="strategy-class-meta" id="strat-meta-metals"></div>
            </div>
          </div>

          <div class="strategy-presets-row">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span style="font-size:11.5px; color:var(--text-muted);">Шаблони:</span>
              <button type="button" class="chip-btn" data-strat-preset="80,10,10">Агресивний 80 / 10 / 10</button>
              <button type="button" class="chip-btn" data-strat-preset="70,20,10">Збалансований 70 / 20 / 10</button>
              <button type="button" class="chip-btn" data-strat-preset="60,30,10">Класичний 60 / 30 / 10</button>
              <button type="button" class="chip-btn" data-strat-preset="50,35,15">Захисний 50 / 35 / 15</button>
            </div>
            <button type="button" class="chip-btn" id="btn-strat-normalize" style="display:none; border-color:var(--accent-primary); color:var(--accent-primary);">
              Вирівняти до 100%
            </button>
          </div>
        </div>

        <!-- Right Box: Monthly Investment & Rebalance Mode -->
        <div class="strategy-box">
          <div class="strategy-box-title">
            <span>2. Калькулятор щомісячної інвестиції та ребалансування</span>
          </div>
          <div class="strategy-box-sub">Введіть суму, яку плануєте доінвестувати цього місяця, та оберіть режим розрахунку</div>

          <div class="form-grid" style="margin-bottom: 12px;">
            <div class="form-group">
              <label class="form-label" for="strat-invest-amount">Сума нової інвестиції</label>
              <input type="number" step="any" min="0" id="strat-invest-amount" class="form-input tabular" placeholder="1000" style="font-weight:700; font-size:15px;" />
            </div>
            <div class="form-group">
              <label class="form-label" for="strat-invest-currency">Валюта суми</label>
              <select id="strat-invest-currency" class="form-select">
                <option value="USD">🇺🇸 Долар США ($ USD)</option>
                <option value="UAH">🇺🇦 Гривня (₴ UAH)</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 12px;">
            <label class="form-label">Режим ребалансування</label>
            <div class="mode-switch-group">
              <button type="button" class="mode-switch-btn" data-rebalance-mode="buy_only" id="btn-mode-buy-only">
                🟢 Без продажу активів (Тільки докупівля)
              </button>
              <button type="button" class="mode-switch-btn" data-rebalance-mode="with_sell" id="btn-mode-with-sell">
                🔄 З продажем активів (Повне ребалансування)
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="strat-ticker-split">Розподіл часток між окремими акціями (тікерами) всередині класу</label>
            <select id="strat-ticker-split" class="form-select">
              <option value="custom">🎯 Власні частки % по кожній акції окремо (настроюваний розподіл)</option>
              <option value="proportional">⚖️ Автоматично: пропорційно поточній вазі активу</option>
              <option value="equal">➗ Автоматично: порівну між усіма активами класу</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Box 3: Per-Stock Allocation Breakdown inside Equities (and other multi-asset classes) -->
      <div class="equities-split-box" id="equities-suballocation-box"></div>

      <!-- Dynamic Calculation Results & Action Plan Table -->
      <div id="stocks-rebalance-results"></div>

      <!-- Box 4: 25-Year Compound Growth Forecast Chart (Buy & Hold without selling) -->
      <div class="forecast-chart-box" id="stocks-forecast-chart-box"></div>
    `;

    // Wire up live input events
    const eqInput = document.getElementById('strat-pct-equities');
    const bdInput = document.getElementById('strat-pct-bonds');
    const mtInput = document.getElementById('strat-pct-metals');
    const amtInput = document.getElementById('strat-invest-amount');
    const currSelect = document.getElementById('strat-invest-currency');
    const splitSelect = document.getElementById('strat-ticker-split');
    const normBtn = document.getElementById('btn-strat-normalize');

    function onStrategyInputChanged(rebuildEquitiesBox = false) {
      const strat = getStockStrategy();
      strat.equitiesPct = Math.max(0, parseFloat(eqInput.value) || 0);
      strat.bondsPct = Math.max(0, parseFloat(bdInput.value) || 0);
      strat.metalsPct = Math.max(0, parseFloat(mtInput.value) || 0);
      strat.investAmount = Math.max(0, parseFloat(amtInput.value) || 0);
      strat.investCurrency = currSelect.value === 'UAH' ? 'UAH' : 'USD';
      const validModes = ['custom', 'proportional', 'equal'];
      strat.tickerSplitMode = validModes.includes(splitSelect.value) ? splitSelect.value : 'custom';
      state.settings.stockStrategy = strat;
      schedulePersistStrategy();
      const stockPositions = state.positions.filter(p => p.category === 'stocks').map(evaluatePosition);
      if (rebuildEquitiesBox) {
        renderEquitiesSubAllocationBox(stockPositions);
      }
      updateStockStrategyCalculations(stockPositions);
    }

    [eqInput, bdInput, mtInput, amtInput].forEach(inp => {
      inp?.addEventListener('input', () => onStrategyInputChanged(false));
    });
    currSelect?.addEventListener('change', () => onStrategyInputChanged(false));
    splitSelect?.addEventListener('change', () => onStrategyInputChanged(true));

    sectionEl.querySelectorAll('[data-strat-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const parts = (btn.dataset.stratPreset || '70,20,10').split(',').map(Number);
        eqInput.value = parts[0] ?? 70;
        bdInput.value = parts[1] ?? 20;
        mtInput.value = parts[2] ?? 10;
        onStrategyInputChanged(false);
      });
    });

    normBtn?.addEventListener('click', () => {
      const strat = getStockStrategy();
      const sum = strat.equitiesPct + strat.bondsPct + strat.metalsPct;
      if (sum > 0) {
        const eq = Number(((strat.equitiesPct / sum) * 100).toFixed(1));
        const bd = Number(((strat.bondsPct / sum) * 100).toFixed(1));
        const mt = Number((100 - eq - bd).toFixed(1));
        eqInput.value = eq;
        bdInput.value = bd;
        mtInput.value = mt;
      } else {
        eqInput.value = 70;
        bdInput.value = 20;
        mtInput.value = 10;
      }
      onStrategyInputChanged(false);
    });

    sectionEl.querySelectorAll('[data-rebalance-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.rebalanceMode === 'with_sell' ? 'with_sell' : 'buy_only';
        const strat = getStockStrategy();
        strat.rebalanceMode = mode;
        state.settings.stockStrategy = strat;
        schedulePersistStrategy();
        const stockPositions = state.positions.filter(p => p.category === 'stocks').map(evaluatePosition);
        updateStockStrategyCalculations(stockPositions);
      });
    });
  }

  // Render Box 3: Per-stock allocation breakdown inside Equities
  function renderEquitiesSubAllocationBox(stockPositions) {
    const boxEl = document.getElementById('equities-suballocation-box');
    if (!boxEl) return;

    const strat = getStockStrategy();
    const rawSumPct = strat.equitiesPct + strat.bondsPct + strat.metalsPct;
    const equitiesMacroWeight = rawSumPct > 0 ? (strat.equitiesPct / rawSumPct) : 0;

    const equityPositions = stockPositions.filter(p => {
      const sub = p.stockSubType || inferStockSubType(p);
      return sub === 'equities';
    });

    ensureClassTickerTargets(equityPositions, strat);
    const totalEquitiesUsd = equityPositions.reduce((acc, p) => acc + p.currentValUsd, 0);

    if (equityPositions.length === 0) {
      boxEl.innerHTML = `
        <div class="strategy-box-title">
          <span>3. Розподіл окремо по акціях (всередині класу 📈 Акції)</span>
        </div>
        <div style="font-size:12.5px; color:var(--text-secondary);">
          У вас ще немає доданих акцій у класі «📈 Акції». Додайте акції або ETF (напр. VOO, VWCE, QQQ, NVDA), щоб розбити їх на бажані частки у %.
        </div>
      `;
      return;
    }

    const sumEquityTargets = equityPositions.reduce((acc, p) => acc + (Number(strat.tickerTargets[p.id]) || 0), 0);
    const isSum100 = Math.abs(sumEquityTargets - 100) < 0.15;

    boxEl.innerHTML = `
      <div class="strategy-box-title" style="flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span>3. Розподіл окремо по акціях (всередині класу 📈 Акції — ${ (equitiesMacroWeight * 100).toFixed(1) }% портфеля)</span>
          <span id="eq-tickers-sum-badge" class="pill-badge ${isSum100 ? 'pill-positive' : 'pill-negative'}">
            Сума по акціях: ${Number(sumEquityTargets.toFixed(1))}%
          </span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <button type="button" class="chip-btn" id="btn-eq-split-equal" title="Виставити рівні частки для кожної акції">➗ Порівну (${(100 / equityPositions.length).toFixed(1)}%)</button>
          <button type="button" class="chip-btn" id="btn-eq-split-current" title="Підставити поточні ринкові частки акцій">⚖️ За поточною вагою</button>
          <button type="button" class="chip-btn" id="btn-eq-split-norm" style="display:${isSum100 ? 'none' : 'inline-flex'}; border-color:var(--accent-primary); color:var(--accent-primary);">Вирівняти до 100%</button>
        </div>
      </div>
      <div class="strategy-box-sub" style="margin-bottom:8px;">
        Вкажіть, яку частку (%) від кошика <strong>«📈 Акції»</strong> має займати кожен окремий тікер (сума всіх акцій = 100% класу Акції). Калькулятор автоматично розрахує докупівлю або продаж по кожній акції окремо.
      </div>

      <div class="equities-tickers-grid">
        ${equityPositions.map(pos => {
          const curInEqPct = totalEquitiesUsd > 0 ? (pos.currentValUsd / totalEquitiesUsd) * 100 : 0;
          const targetInEqPct = strat.tickerSplitMode === 'equal'
            ? Number((100 / equityPositions.length).toFixed(1))
            : (strat.tickerSplitMode === 'proportional'
                ? Number(curInEqPct.toFixed(1))
                : Number(strat.tickerTargets[pos.id] ?? 0));
          const normWeightInEq = sumEquityTargets > 0 && strat.tickerSplitMode === 'custom'
            ? (targetInEqPct / sumEquityTargets)
            : (targetInEqPct / 100);
          const globalPortfolioPct = equitiesMacroWeight * normWeightInEq * 100;

          return `
            <div class="equity-ticker-card" data-eq-card="${pos.id}">
              <div class="equity-ticker-top">
                <div style="display:flex; align-items:center; gap:7px; min-width:0;">
                  <span class="ticker-badge" style="height:26px; min-width:38px; font-size:11.5px;">${escapeHtml(pos.ticker)}</span>
                  <div style="min-width:0;">
                    <div style="font-weight:600; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(pos.displayName)}">${escapeHtml(pos.displayName)}</div>
                    <div class="tabular" style="font-size:11px; color:var(--text-secondary);">${fmtUsd(pos.currentValUsd)} · ${pos.quantity} шт.</div>
                  </div>
                </div>
                <button type="button" class="btn btn-ghost btn-split-pos-trigger" data-split-id="${pos.id}" title="Розділити цю позицію на 2 окремі частини / лоти" style="padding:3px 6px; font-size:11.5px;">
                  ✂️ Частини
                </button>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:4px; padding-top:6px; border-top:1px solid var(--border-subtle);">
                <div style="font-size:11.5px; color:var(--text-secondary);">
                  <div>Зараз в Акціях: <strong class="tabular">${curInEqPct.toFixed(1)}%</strong></div>
                  <div class="tabular" data-eq-global-pct="${pos.id}" style="color:var(--accent-primary);">У портфелі: <strong>${globalPortfolioPct.toFixed(1)}%</strong></div>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    class="ticker-pct-inline-input"
                    data-eq-target-input="${pos.id}"
                    value="${targetInEqPct}"
                    title="Цільова частка ${escapeHtml(pos.ticker)} всередині класу Акції (%)"
                  />
                  <span style="font-size:12.5px; font-weight:700; color:var(--text-secondary);">%</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Wire up live input on each equity card without losing focus!
    boxEl.querySelectorAll('[data-eq-target-input]').forEach(inp => {
      inp.addEventListener('input', () => {
        const posId = inp.dataset.eqTargetInput;
        const val = Math.max(0, parseFloat(inp.value) || 0);
        const s = getStockStrategy();
        s.tickerSplitMode = 'custom';
        s.tickerTargets[posId] = val;
        state.settings.stockStrategy = s;
        const splitSel = document.getElementById('strat-ticker-split');
        if (splitSel && splitSel.value !== 'custom') splitSel.value = 'custom';
        schedulePersistStrategy();

        const currentStocks = state.positions.filter(p => p.category === 'stocks').map(evaluatePosition);
        updateEquitiesSubAllocationBadgesOnly(currentStocks);
        updateStockStrategyCalculations(currentStocks);
      });
    });

    boxEl.querySelector('#btn-eq-split-equal')?.addEventListener('click', () => {
      const s = getStockStrategy();
      s.tickerSplitMode = 'custom';
      let running = 0;
      equityPositions.forEach((p, idx) => {
        if (idx === equityPositions.length - 1) {
          s.tickerTargets[p.id] = Number(Math.max(0, 100 - running).toFixed(1));
        } else {
          const share = Number((100 / equityPositions.length).toFixed(1));
          s.tickerTargets[p.id] = share;
          running += share;
        }
      });
      state.settings.stockStrategy = s;
      const splitSel = document.getElementById('strat-ticker-split');
      if (splitSel) splitSel.value = 'custom';
      schedulePersistStrategy();
      const currentStocks = state.positions.filter(p => p.category === 'stocks').map(evaluatePosition);
      renderEquitiesSubAllocationBox(currentStocks);
      updateStockStrategyCalculations(currentStocks);
    });

    boxEl.querySelector('#btn-eq-split-current')?.addEventListener('click', () => {
      const s = getStockStrategy();
      s.tickerSplitMode = 'custom';
      let running = 0;
      equityPositions.forEach((p, idx) => {
        if (idx === equityPositions.length - 1) {
          s.tickerTargets[p.id] = Number(Math.max(0, 100 - running).toFixed(1));
        } else {
          const share = totalEquitiesUsd > 0
            ? Number(((p.currentValUsd / totalEquitiesUsd) * 100).toFixed(1))
            : Number((100 / equityPositions.length).toFixed(1));
          s.tickerTargets[p.id] = share;
          running += share;
        }
      });
      state.settings.stockStrategy = s;
      const splitSel = document.getElementById('strat-ticker-split');
      if (splitSel) splitSel.value = 'custom';
      schedulePersistStrategy();
      const currentStocks = state.positions.filter(p => p.category === 'stocks').map(evaluatePosition);
      renderEquitiesSubAllocationBox(currentStocks);
      updateStockStrategyCalculations(currentStocks);
    });

    boxEl.querySelector('#btn-eq-split-norm')?.addEventListener('click', () => {
      const s = getStockStrategy();
      s.tickerSplitMode = 'custom';
      const sum = equityPositions.reduce((acc, p) => acc + (Number(s.tickerTargets[p.id]) || 0), 0);
      let running = 0;
      equityPositions.forEach((p, idx) => {
        if (idx === equityPositions.length - 1) {
          s.tickerTargets[p.id] = Number(Math.max(0, 100 - running).toFixed(1));
        } else {
          const share = sum > 0
            ? Number((((Number(s.tickerTargets[p.id]) || 0) / sum) * 100).toFixed(1))
            : Number((100 / equityPositions.length).toFixed(1));
          s.tickerTargets[p.id] = share;
          running += share;
        }
      });
      state.settings.stockStrategy = s;
      schedulePersistStrategy();
      const currentStocks = state.positions.filter(p => p.category === 'stocks').map(evaluatePosition);
      renderEquitiesSubAllocationBox(currentStocks);
      updateStockStrategyCalculations(currentStocks);
    });

    boxEl.querySelectorAll('.btn-split-pos-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        openSplitPositionPrompt(btn.dataset.splitId);
      });
    });
  }

  function updateEquitiesSubAllocationBadgesOnly(stockPositions) {
    const strat = getStockStrategy();
    const rawSumPct = strat.equitiesPct + strat.bondsPct + strat.metalsPct;
    const equitiesMacroWeight = rawSumPct > 0 ? (strat.equitiesPct / rawSumPct) : 0;
    const equityPositions = stockPositions.filter(p => (p.stockSubType || inferStockSubType(p)) === 'equities');
    const sumEquityTargets = equityPositions.reduce((acc, p) => acc + (Number(strat.tickerTargets[p.id]) || 0), 0);
    const isSum100 = Math.abs(sumEquityTargets - 100) < 0.15;

    const sumBadge = document.getElementById('eq-tickers-sum-badge');
    if (sumBadge) {
      sumBadge.textContent = `Сума по акціях: ${Number(sumEquityTargets.toFixed(1))}%`;
      sumBadge.className = 'pill-badge ' + (isSum100 ? 'pill-positive' : 'pill-negative');
    }
    const normBtn = document.getElementById('btn-eq-split-norm');
    if (normBtn) {
      normBtn.style.display = isSum100 ? 'none' : 'inline-flex';
    }

    equityPositions.forEach(p => {
      const el = document.querySelector(`[data-eq-global-pct="${p.id}"]`);
      if (el) {
        const tPct = Number(strat.tickerTargets[p.id] || 0);
        const normW = sumEquityTargets > 0 ? (tPct / sumEquityTargets) : 0;
        const globPct = equitiesMacroWeight * normW * 100;
        el.innerHTML = `У портфелі: <strong>${globPct.toFixed(1)}%</strong>`;
      }
    });
  }

  function renderStockStrategySection(stockPositions) {
    const sectionEl = document.getElementById('stocks-strategy-section');
    if (!sectionEl) return;
    ensureStockStrategyShell(sectionEl);

    const strat = getStockStrategy();
    const eqInput = document.getElementById('strat-pct-equities');
    const bdInput = document.getElementById('strat-pct-bonds');
    const mtInput = document.getElementById('strat-pct-metals');
    const amtInput = document.getElementById('strat-invest-amount');
    const currSelect = document.getElementById('strat-invest-currency');
    const splitSelect = document.getElementById('strat-ticker-split');

    if (eqInput && document.activeElement !== eqInput) eqInput.value = strat.equitiesPct;
    if (bdInput && document.activeElement !== bdInput) bdInput.value = strat.bondsPct;
    if (mtInput && document.activeElement !== mtInput) mtInput.value = strat.metalsPct;
    if (amtInput && document.activeElement !== amtInput) amtInput.value = strat.investAmount;
    if (currSelect && document.activeElement !== currSelect) currSelect.value = strat.investCurrency;
    if (splitSelect && document.activeElement !== splitSelect) splitSelect.value = strat.tickerSplitMode;

    // Only rebuild Box 3 if no input inside Box 3 is currently focused
    const boxEl = document.getElementById('equities-suballocation-box');
    if (boxEl && (!document.activeElement || !boxEl.contains(document.activeElement))) {
      renderEquitiesSubAllocationBox(stockPositions);
    } else {
      updateEquitiesSubAllocationBadgesOnly(stockPositions);
    }

    updateStockStrategyCalculations(stockPositions);
  }

  function updateStockStrategyCalculations(stockPositions) {
    const strat = getStockStrategy();
    const rates = getEffectiveRates();

    // Update mode toggle buttons
    document.getElementById('btn-mode-buy-only')?.classList.toggle('active', strat.rebalanceMode === 'buy_only');
    document.getElementById('btn-mode-with-sell')?.classList.toggle('active', strat.rebalanceMode === 'with_sell');

    // Validate sum of percentages
    const rawSumPct = strat.equitiesPct + strat.bondsPct + strat.metalsPct;
    const pctBadge = document.getElementById('strat-total-pct-badge');
    const normBtn = document.getElementById('btn-strat-normalize');
    const isExact100 = Math.abs(rawSumPct - 100) < 0.05;

    if (pctBadge) {
      pctBadge.textContent = `Разом: ${Number(rawSumPct.toFixed(1))}%`;
      pctBadge.className = 'pill-badge ' + (isExact100 ? 'pill-positive' : 'pill-negative');
    }
    if (normBtn) {
      normBtn.style.display = isExact100 ? 'none' : 'inline-flex';
    }

    // Normalized target weights (w_i in [0..1])
    const weights = {
      equities: rawSumPct > 0 ? strat.equitiesPct / rawSumPct : 0,
      bonds: rawSumPct > 0 ? strat.bondsPct / rawSumPct : 0,
      metals: rawSumPct > 0 ? strat.metalsPct / rawSumPct : 0
    };

    // Group existing stock positions by sub-type
    const classKeys = ['equities', 'bonds', 'metals'];
    const byClass = { equities: [], bonds: [], metals: [] };
    const classValUsd = { equities: 0, bonds: 0, metals: 0 };

    stockPositions.forEach(p => {
      const sub = p.stockSubType && byClass[p.stockSubType] ? p.stockSubType : inferStockSubType(p);
      byClass[sub].push(p);
      classValUsd[sub] += p.currentValUsd;
    });

    classKeys.forEach(k => ensureClassTickerTargets(byClass[k], strat));

    const currentTotalUsd = classValUsd.equities + classValUsd.bonds + classValUsd.metals;

    // Update per-class card metadata (Current % vs Target %)
    classKeys.forEach(k => {
      const metaEl = document.getElementById(`strat-meta-${k}`);
      if (!metaEl) return;
      const curUsd = classValUsd[k];
      const curPct = currentTotalUsd > 0 ? (curUsd / currentTotalUsd) * 100 : 0;
      const targetPct = weights[k] * 100;
      const diffPct = curPct - targetPct;
      const diffSign = diffPct > 0 ? '+' : '';
      const diffColor = Math.abs(diffPct) < 1.0 ? 'var(--positive)' : 'var(--accent-primary)';
      metaEl.innerHTML = `
        <div class="tabular">Зараз: <strong>${curPct.toFixed(1)}%</strong> (${fmtUsd(curUsd)})</div>
        <div class="tabular" style="color:${diffColor};">Відхилення: ${diffSign}${diffPct.toFixed(1)}% · ${byClass[k].length} поз.</div>
      `;
    });

    // Convert monthly investment amount to USD & UAH
    const investUsd = strat.investCurrency === 'UAH'
      ? (rates.USD_UAH > 0 ? strat.investAmount / rates.USD_UAH : 0)
      : strat.investAmount;
    const investUah = investUsd * rates.USD_UAH;
    const postTotalUsd = currentTotalUsd + investUsd;
    const postTotalUah = postTotalUsd * rates.USD_UAH;

    // Build unified list of rebalancing items (each existing stock position OR placeholder for an empty class)
    // Each item has its own target global weight W_item in [0..1]
    const items = [];
    classKeys.forEach(k => {
      const classMeta = STOCK_SUBTYPES_META[k];
      const positionsInClass = byClass[k];
      const cValUsd = classValUsd[k];
      const cWeight = weights[k];

      if (positionsInClass.length === 0) {
        if (cWeight > 0) {
          items.push({
            id: `placeholder-${k}`,
            isPlaceholderClass: true,
            subType: k,
            classMeta,
            currentValUsd: 0,
            intraClassPct: 100,
            globalWeight: cWeight
          });
        }
        return;
      }

      const n = positionsInClass.length;
      const sumCustomInClass = positionsInClass.reduce((acc, p) => acc + Math.max(0, Number(strat.tickerTargets[p.id]) || 0), 0);

      positionsInClass.forEach(pos => {
        let shareWithinClass = 1 / n;
        let rawIntraPct = 100 / n;
        if (strat.tickerSplitMode === 'equal') {
          shareWithinClass = 1 / n;
          rawIntraPct = 100 / n;
        } else if (strat.tickerSplitMode === 'proportional') {
          shareWithinClass = cValUsd > 0 ? (pos.currentValUsd / cValUsd) : (1 / n);
          rawIntraPct = shareWithinClass * 100;
        } else {
          // 'custom' per-ticker target percentage
          rawIntraPct = Math.max(0, Number(strat.tickerTargets[pos.id]) || 0);
          shareWithinClass = sumCustomInClass > 0 ? (rawIntraPct / sumCustomInClass) : (1 / n);
        }

        items.push({
          id: pos.id,
          isPlaceholderClass: false,
          pos,
          subType: k,
          classMeta,
          currentValUsd: pos.currentValUsd,
          intraClassPct: rawIntraPct,
          normShareWithinClass: shareWithinClass,
          globalWeight: cWeight * shareWithinClass
        });
      });
    });

    // Compute deltaUsd per item according to rebalanceMode ('with_sell' vs 'buy_only')
    const itemDeltaUsd = {};
    if (strat.rebalanceMode === 'with_sell') {
      items.forEach(it => {
        const targetPostUsd = it.globalWeight * postTotalUsd;
        itemDeltaUsd[it.id] = targetPostUsd - it.currentValUsd;
      });
    } else {
      // 'buy_only': water-filling at the individual asset level so no asset is sold (delta >= 0) and sum(delta) == investUsd
      let active = items.filter(it => it.globalWeight > 0);
      items.forEach(it => { itemDeltaUsd[it.id] = 0; });
      if (active.length > 0 && investUsd > 0) {
        for (let iter = 0; iter < items.length + 2; iter++) {
          const sumV = active.reduce((acc, it) => acc + it.currentValUsd, 0);
          const sumW = active.reduce((acc, it) => acc + it.globalWeight, 0);
          const totalPool = investUsd + sumV;
          let clampedAny = false;
          const nextActive = [];

          active.forEach(it => {
            const desiredTotal = sumW > 0 ? totalPool * (it.globalWeight / sumW) : it.currentValUsd;
            const delta = desiredTotal - it.currentValUsd;
            if (delta < -1e-6) {
              itemDeltaUsd[it.id] = 0;
              clampedAny = true;
            } else {
              itemDeltaUsd[it.id] = Math.max(0, delta);
              nextActive.push(it);
            }
          });

          if (!clampedAny || nextActive.length === 0) break;
          active = nextActive;
        }
      }
    }

    // Aggregate class-level deltas and build planRows
    const classDeltaUsd = { equities: 0, bonds: 0, metals: 0 };
    let totalBuyUsd = 0;
    let totalSellUsd = 0;

    const planRows = items.map(it => {
      const dUsd = itemDeltaUsd[it.id] || 0;
      classDeltaUsd[it.subType] += dUsd;
      if (dUsd > 0) totalBuyUsd += dUsd;
      if (dUsd < 0) totalSellUsd += Math.abs(dUsd);

      const postValUsd = Math.max(0, it.currentValUsd + dUsd);
      return {
        ...it,
        currentPct: currentTotalUsd > 0 ? (it.currentValUsd / currentTotalUsd) * 100 : 0,
        targetPct: it.globalWeight * 100,
        postValUsd,
        postPct: postTotalUsd > 0 ? (postValUsd / postTotalUsd) * 100 : (it.globalWeight * 100),
        deltaUsd: dUsd,
        exactShares: (!it.isPlaceholderClass && it.pos.livePriceUsd > 0) ? (dUsd / it.pos.livePriceUsd) : 0
      };
    });

    // Post-investment class shares for summary bar
    const postClassPcts = {};
    classKeys.forEach(k => {
      const postClassUsd = Math.max(0, classValUsd[k] + classDeltaUsd[k]);
      postClassPcts[k] = postTotalUsd > 0 ? (postClassUsd / postTotalUsd) * 100 : (weights[k] * 100);
    });

    const resultsEl = document.getElementById('stocks-rebalance-results');
    if (!resultsEl) return;

    const modeDescription = strat.rebalanceMode === 'buy_only'
      ? `🟢 <strong>Режим без продажу:</strong> жоден існуючий актив не продається. Уся сума нової інвестиції (<strong>${fmtUsd(investUsd)}</strong> / <strong>${fmtUah(investUah)}</strong>) спрямовується у найбільш недокуплені акції та класи активів згідно з їхніми цільовими частками %.`
      : `🔄 <strong>Режим з продажем (повне ребалансування):</strong> активи, частка яких перевищує план, частково продаються (на <strong>${fmtUsd(totalSellUsd)}</strong>), а виручені кошти разом із новою інвестицією (<strong>${fmtUsd(investUsd)}</strong>) спрямовуються на купівлю (разом купівля на <strong>${fmtUsd(totalBuyUsd)}</strong>), щоб досягти точних цільових пропорцій по кожному класу й кожній акції.`;

    resultsEl.innerHTML = `
      <div class="rebalance-summary-banner">
        <div style="flex:1; min-width: 260px;">
          ${modeDescription}
        </div>
        <div class="tabular" style="text-align:right;">
          <div style="font-size:11.5px; color:var(--text-secondary);">Портфель після інвестиції:</div>
          <div style="font-size:15px; font-weight:700; color:var(--text-primary);">${fmtUsd(postTotalUsd)} <span style="color:var(--text-secondary); font-weight:500;">(${fmtUah(postTotalUah)})</span></div>
        </div>
      </div>

      <!-- Stacked Bar Comparison: Current vs Post-Rebalance vs Target -->
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:16px;">
        ${classKeys.map(k => {
          const cm = STOCK_SUBTYPES_META[k];
          const curUsd = classValUsd[k];
          const curPct = currentTotalUsd > 0 ? (curUsd / currentTotalUsd) * 100 : 0;
          const postUsd = Math.max(0, curUsd + classDeltaUsd[k]);
          const postPct = postClassPcts[k];
          const targPct = weights[k] * 100;
          const dUsd = classDeltaUsd[k];
          const actionText = dUsd > 0.5
            ? `<span style="color:var(--positive); font-weight:700;">Разом по класу: +${fmtUsd(dUsd)} (+${fmtUah(dUsd * rates.USD_UAH)})</span>`
            : (dUsd < -0.5
                ? `<span style="color:var(--negative); font-weight:700;">Разом по класу: ${fmtUsd(dUsd)} (${fmtUah(dUsd * rates.USD_UAH)})</span>`
                : `<span style="color:var(--text-muted);">Без змін ($0)</span>`);
          return `
            <div style="padding:10px 12px; border-radius:8px; background:var(--bg-elevated); border:1px solid var(--border-subtle);">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; font-weight:600; margin-bottom:4px;">
                <span>${cm.badge}</span>
                <span class="tabular" style="color:var(--text-secondary);">Ціль: <strong>${targPct.toFixed(1)}%</strong></span>
              </div>
              <div class="tabular" style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">
                Частка: ${curPct.toFixed(1)}% → <strong style="color:var(--text-primary);">${postPct.toFixed(1)}%</strong> (${fmtUsd(postUsd)})
              </div>
              <div class="tabular" style="font-size:12px;">${actionText}</div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Per-Ticker Rebalancing Action Table -->
      <div class="table-container">
        <table class="positions-table">
          <thead>
            <tr>
              <th>Актив / Клас стратегії</th>
              <th class="text-right">Поточна вартість</th>
              <th class="text-right">Частка в класі → У портфелі</th>
              <th class="text-right">Що зробити (Сума $ / ₴)</th>
              <th class="text-right">Кількість до купівлі / продажу</th>
              <th class="text-right">Після ребалансу</th>
            </tr>
          </thead>
          <tbody>
            ${planRows.map(row => {
              if (row.isPlaceholderClass) {
                const dUsd = row.deltaUsd;
                const dUah = dUsd * rates.USD_UAH;
                const isBuy = dUsd > 0.5;
                return `
                  <tr>
                    <td>
                      <div class="asset-cell">
                        <span class="ticker-badge" style="border-left: 3px solid ${row.classMeta.color}">НОВИЙ</span>
                        <div>
                          <div class="asset-name-primary">${row.classMeta.fullLabel}</div>
                          <div class="asset-name-sub">У портфелі ще немає активів цього класу (напр. ${row.classMeta.defaultTickerHint})</div>
                        </div>
                      </div>
                    </td>
                    <td class="text-right">
                      <div class="dual-val-primary">$0.00</div>
                      <div class="dual-val-sub">0 ₴</div>
                    </td>
                    <td class="text-right">
                      <div class="dual-val-primary">0.0% → ${row.targetPct.toFixed(1)}% портфеля</div>
                      <div class="dual-val-sub">Після: ${row.postPct.toFixed(1)}%</div>
                    </td>
                    <td class="text-right">
                      ${isBuy ? `
                        <div class="dual-val-primary" style="color:var(--positive);">🟢 КУПИТИ +${fmtUsd(dUsd)}</div>
                        <div class="dual-val-sub">+${fmtUah(dUah)}</div>
                      ` : `<div class="dual-val-sub">Немає дій</div>`}
                    </td>
                    <td class="text-right">
                      <button type="button" class="btn btn-secondary btn-add-missing-subtype" data-subtype="${row.subType}" style="padding:5px 10px; font-size:12px;">
                        + Додати актив (${row.classMeta.label})
                      </button>
                    </td>
                    <td class="text-right">
                      <div class="dual-val-primary">${fmtUsd(row.postValUsd)}</div>
                      <div class="dual-val-sub">${fmtUah(row.postValUsd * rates.USD_UAH)} (${row.postPct.toFixed(1)}%)</div>
                    </td>
                  </tr>
                `;
              }

              const pos = row.pos;
              const dUsd = row.deltaUsd;
              const dUah = dUsd * rates.USD_UAH;
              const absShares = Math.abs(row.exactShares);
              const wholeShares = Math.floor(absShares + 1e-6);
              const wholeCostUsd = wholeShares * pos.livePriceUsd;

              let actionCellHtml = '';
              let sharesCellHtml = '';

              if (dUsd > 0.5) {
                actionCellHtml = `
                  <div class="dual-val-primary" style="color:var(--positive);">🟢 КУПИТИ +${fmtUsd(dUsd)}</div>
                  <div class="dual-val-sub">+${fmtUah(dUah)}</div>
                `;
                sharesCellHtml = `
                  <div class="dual-val-primary" style="color:var(--positive);">+${absShares.toFixed(2)} шт. <span style="font-size:11.5px; color:var(--text-secondary);">по ${fmtUsd(pos.livePriceUsd)}</span></div>
                  <div class="dual-val-sub">${wholeShares > 0 ? `Цілих лотів: <strong>+${wholeShares} шт.</strong> (${fmtUsd(wholeCostUsd)})` : `Менше 1 цілої акції (дробовий лот)`}</div>
                `;
              } else if (dUsd < -0.5) {
                actionCellHtml = `
                  <div class="dual-val-primary" style="color:var(--negative);">🔴 ПРОДАТИ ${fmtUsd(dUsd)}</div>
                  <div class="dual-val-sub">${fmtUah(dUah)}</div>
                `;
                sharesCellHtml = `
                  <div class="dual-val-primary" style="color:var(--negative);">-${absShares.toFixed(2)} шт. <span style="font-size:11.5px; color:var(--text-secondary);">по ${fmtUsd(pos.livePriceUsd)}</span></div>
                  <div class="dual-val-sub">${wholeShares > 0 ? `Цілих лотів: <strong>-${wholeShares} шт.</strong> (${fmtUsd(wholeCostUsd)})` : `Менше 1 цілої акції`}</div>
                `;
              } else {
                actionCellHtml = `
                  <div class="dual-val-primary" style="color:var(--text-muted);">⚪ Тримати ($0.00)</div>
                  <div class="dual-val-sub">Не потребує докупівлі</div>
                `;
                sharesCellHtml = `
                  <div class="dual-val-primary" style="color:var(--text-muted);">0 шт.</div>
                  <div class="dual-val-sub">Поточна к-сть: ${pos.quantity} шт.</div>
                `;
              }

              return `
                <tr>
                  <td>
                    <div class="asset-cell">
                      <span class="ticker-badge" style="border-left: 3px solid ${row.classMeta.color}">${escapeHtml(pos.ticker)}</span>
                      <div>
                        <div class="asset-name-primary">${escapeHtml(pos.displayName)}</div>
                        <div style="margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                          <select class="subtype-pill-select" data-change-pos-subtype="${pos.id}" title="Клас активу в стратегії">
                            <option value="equities" ${row.subType === 'equities' ? 'selected' : ''}>📈 Акції</option>
                            <option value="bonds" ${row.subType === 'bonds' ? 'selected' : ''}>📜 Облігації</option>
                            <option value="metals" ${row.subType === 'metals' ? 'selected' : ''}>🥇 Золото / Срібло</option>
                          </select>
                          <button type="button" class="btn btn-ghost btn-split-table-pos" data-id="${pos.id}" title="Розбити цю позицію на частини" style="padding:1px 6px; font-size:11px; border:1px solid var(--border-subtle);">
                            ✂️ Частини
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="text-right">
                    <div class="dual-val-primary">${fmtUsd(row.currentValUsd)}</div>
                    <div class="dual-val-sub">${fmtUah(row.currentValUsd * rates.USD_UAH)} (${pos.quantity} шт.)</div>
                  </td>
                  <td class="text-right">
                    <div class="dual-val-primary" style="display:flex; align-items:center; justify-content:flex-end; gap:5px;">
                      <span>В класі:</span>
                      <input type="number" step="0.1" min="0" max="100" class="ticker-pct-inline-input tabular" data-table-ticker-pct="${pos.id}" data-subtype="${row.subType}" value="${Number((row.normShareWithinClass * 100).toFixed(1))}" title="Цільова частка цього активу всередині класу ${row.classMeta.label} (%)" />
                      <span>% → <strong>${row.targetPct.toFixed(1)}%</strong></span>
                    </div>
                    <div class="dual-val-sub">Зараз у портфелі: ${row.currentPct.toFixed(1)}% → Після: <strong>${row.postPct.toFixed(1)}%</strong></div>
                  </td>
                  <td class="text-right">${actionCellHtml}</td>
                  <td class="text-right">${sharesCellHtml}</td>
                  <td class="text-right">
                    <div class="dual-val-primary">${fmtUsd(row.postValUsd)}</div>
                    <div class="dual-val-sub">${fmtUah(row.postValUsd * rates.USD_UAH)}</div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach inline sub-type change handlers
    resultsEl.querySelectorAll('[data-change-pos-subtype]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const posId = sel.dataset.changePosSubtype;
        const targetPos = state.positions.find(p => p.id === posId);
        if (targetPos) {
          targetPos.stockSubType = sel.value;
          await persistPortfolio();
          renderAll();
        }
      });
    });

    // Attach inline split button in rebalancing table
    resultsEl.querySelectorAll('.btn-split-table-pos').forEach(btn => {
      btn.addEventListener('click', () => openSplitPositionPrompt(btn.dataset.id));
    });

    // Attach inline intra-class % change handlers in rebalancing table
    resultsEl.querySelectorAll('[data-table-ticker-pct]').forEach(inp => {
      inp.addEventListener('change', () => {
        const posId = inp.dataset.tableTickerPct;
        const val = Math.max(0, Number(inp.value) || 0);
        if (!state.settings.stockStrategy) state.settings.stockStrategy = { ...DEFAULT_STOCK_STRATEGY };
        if (!state.settings.stockStrategy.tickerTargets) state.settings.stockStrategy.tickerTargets = {};
        state.settings.stockStrategy.tickerTargets[posId] = Math.round(val * 10) / 10;
        persistPortfolio();
        renderAll();
      });
    });

    // Attach "+ Додати актив" button for missing classes
    resultsEl.querySelectorAll('.btn-add-missing-subtype').forEach(btn => {
      btn.addEventListener('click', () => {
        const subType = btn.dataset.subtype || 'equities';
        const defaultTickerBySub = { equities: 'VOO', bonds: 'TLT', metals: 'GLD' };
        const defTicker = defaultTickerBySub[subType] || 'VOO';
        const defQuote = state.quotes.stocks?.[defTicker];
        openPositionModal(null);
        const catSelect = document.getElementById('pos-category');
        if (catSelect) {
          catSelect.value = 'stocks';
          renderModalFormFields('stocks', {
            category: 'stocks',
            stockSubType: subType,
            ticker: defTicker,
            name: defQuote?.name || defTicker,
            buyPriceUsd: defQuote?.priceUsd || 100,
            quantity: 10
          });
        }
      });
    });

    // Render 25-Year Compound Growth Forecast Chart
    renderStockForecastChart(stockPositions, classValUsd, weights, investUsd);
  }

  let selectedForecastYear = 25;

  function renderStockForecastChart(stockPositions, classValUsd, weights, monthlyInvestUsd) {
    const forecastBox = document.getElementById('stocks-forecast-chart-box');
    if (!forecastBox) return;

    const strat = getStockStrategy();
    const isFocusedInside = document.activeElement && forecastBox.contains(document.activeElement);

    if (!forecastBox.dataset.initialized || !isFocusedInside) {
      forecastBox.dataset.initialized = 'true';
      forecastBox.innerHTML = `
        <div class="strategy-box-title" style="flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>📈 4. Прогноз росту фондового портфеля на 25 років (Складний % · Buy & Hold без продажу)</span>
            <span class="pill-badge pill-positive" id="forecast-blended-cagr-badge">Середній CAGR: 7.0% річних</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <button type="button" class="chip-btn" data-forecast-preset="6.5,3.5,4.0" title="Дуже обережний прогноз (6.5% Акції / 3.5% Облігації / 4% Золото)">🛡️ Супер-консервативний</button>
            <button type="button" class="chip-btn" data-forecast-preset="8.0,4.2,5.0" title="Консервативний історичний прогноз з урахуванням реінвестування дивідендів (8% Акції / 4.2% Облігації / 5% Золото)">⚖️ Консервативний (Базовий)</button>
            <button type="button" class="chip-btn" data-forecast-preset="10.0,4.8,6.0" title="Середньоісторичний номінальний ріст S&P 500 (10% Акції / 4.8% Облігації / 6% Золото)">🚀 Історичний S&P 500</button>
          </div>
        </div>
        <div class="strategy-box-sub">
          Моделювання капіталу на 25 років уперед за умови, що <strong>жоден наявний актив фондового ринку не продається роками</strong>, а прибуток та дивіденди працюють за формулою складного відсотка: <code>V(t) = V₀ · (1 + r)<sup>t</sup></code>.
        </div>

        <div class="forecast-rates-row">
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
            <span style="font-size:12px; font-weight:600; color:var(--text-primary);">Консервативна дохідність (% річних у $):</span>
            <label class="forecast-rate-item">
              <span style="color:${STOCK_SUBTYPES_META.equities.color}; font-weight:700;">📈 Акції:</span>
              <input type="number" step="0.1" min="0" max="30" id="forecast-cagr-equities" class="ticker-pct-inline-input" style="width:62px;" value="${strat.forecastEquitiesCagr}" />
              <span>%</span>
            </label>
            <label class="forecast-rate-item">
              <span style="color:${STOCK_SUBTYPES_META.bonds.color}; font-weight:700;">📜 Облігації:</span>
              <input type="number" step="0.1" min="0" max="25" id="forecast-cagr-bonds" class="ticker-pct-inline-input" style="width:62px;" value="${strat.forecastBondsCagr}" />
              <span>%</span>
            </label>
            <label class="forecast-rate-item">
              <span style="color:${STOCK_SUBTYPES_META.metals.color}; font-weight:700;">🥇 Золото/Срібло:</span>
              <input type="number" step="0.1" min="0" max="25" id="forecast-cagr-metals" class="ticker-pct-inline-input" style="width:62px;" value="${strat.forecastMetalsCagr}" />
              <span>%</span>
            </label>
          </div>

          <div style="display:flex; align-items:center; gap:8px;">
            <div class="mode-switch-group" style="margin:0;">
              <button type="button" class="mode-switch-btn ${!strat.forecastIncludeMonthly ? 'active' : ''}" id="btn-forecast-hold-only" style="padding:5px 10px; font-size:11.5px;">
                🔒 Тільки те, що вже є (Без вкладень)
              </button>
              <button type="button" class="mode-switch-btn ${strat.forecastIncludeMonthly ? 'active' : ''}" id="btn-forecast-with-monthly" style="padding:5px 10px; font-size:11.5px;">
                ➕ З урахуванням щомісячних +${fmtUsd(monthlyInvestUsd)}/міс
              </button>
            </div>
          </div>
        </div>

        <div id="forecast-dynamic-view"></div>
      `;

      const eqCagrInp = document.getElementById('forecast-cagr-equities');
      const bdCagrInp = document.getElementById('forecast-cagr-bonds');
      const mtCagrInp = document.getElementById('forecast-cagr-metals');

      const onForecastCagrInput = () => {
        const s = getStockStrategy();
        s.forecastEquitiesCagr = Math.max(0, parseFloat(eqCagrInp.value) || 0);
        s.forecastBondsCagr = Math.max(0, parseFloat(bdCagrInp.value) || 0);
        s.forecastMetalsCagr = Math.max(0, parseFloat(mtCagrInp.value) || 0);
        state.settings.stockStrategy = s;
        schedulePersistStrategy();
        updateStockForecastDynamicView(classValUsd, weights, monthlyInvestUsd);
      };

      [eqCagrInp, bdCagrInp, mtCagrInp].forEach(inp => {
        inp?.addEventListener('input', onForecastCagrInput);
      });

      forecastBox.querySelectorAll('[data-forecast-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
          const parts = (btn.dataset.forecastPreset || '8.0,4.2,5.0').split(',').map(Number);
          if (eqCagrInp) eqCagrInp.value = parts[0] ?? 8.0;
          if (bdCagrInp) bdCagrInp.value = parts[1] ?? 4.2;
          if (mtCagrInp) mtCagrInp.value = parts[2] ?? 5.0;
          onForecastCagrInput();
        });
      });

      document.getElementById('btn-forecast-hold-only')?.addEventListener('click', () => {
        const s = getStockStrategy();
        s.forecastIncludeMonthly = false;
        state.settings.stockStrategy = s;
        schedulePersistStrategy();
        document.getElementById('btn-forecast-hold-only')?.classList.add('active');
        document.getElementById('btn-forecast-with-monthly')?.classList.remove('active');
        updateStockForecastDynamicView(classValUsd, weights, monthlyInvestUsd);
      });

      document.getElementById('btn-forecast-with-monthly')?.addEventListener('click', () => {
        const s = getStockStrategy();
        s.forecastIncludeMonthly = true;
        state.settings.stockStrategy = s;
        schedulePersistStrategy();
        document.getElementById('btn-forecast-hold-only')?.classList.remove('active');
        document.getElementById('btn-forecast-with-monthly')?.classList.add('active');
        updateStockForecastDynamicView(classValUsd, weights, monthlyInvestUsd);
      });
    } else {
      // Update button caption for monthly amount if user changed investAmount
      const monthlyBtn = document.getElementById('btn-forecast-with-monthly');
      if (monthlyBtn) {
        monthlyBtn.textContent = `➕ З урахуванням щомісячних +${fmtUsd(monthlyInvestUsd)}/міс`;
      }
    }

    updateStockForecastDynamicView(classValUsd, weights, monthlyInvestUsd);
  }

  function updateStockForecastDynamicView(classValUsd, weights, monthlyInvestUsd) {
    const viewEl = document.getElementById('forecast-dynamic-view');
    if (!viewEl) return;

    const strat = getStockStrategy();
    const rates = getEffectiveRates();
    const rEq = Math.max(0, Number(strat.forecastEquitiesCagr) || 0) / 100;
    const rBd = Math.max(0, Number(strat.forecastBondsCagr) || 0) / 100;
    const rMt = Math.max(0, Number(strat.forecastMetalsCagr) || 0) / 100;
    const includeMonthly = Boolean(strat.forecastIncludeMonthly);

    const startEq = classValUsd.equities || 0;
    const startBd = classValUsd.bonds || 0;
    const startMt = classValUsd.metals || 0;
    const startTotal = startEq + startBd + startMt;

    // Annual contribution per class if monthly investing is enabled
    const annualAddTotal = includeMonthly ? (monthlyInvestUsd * 12) : 0;
    const annualAddEq = annualAddTotal * (weights.equities || 0);
    const annualAddBd = annualAddTotal * (weights.bonds || 0);
    const annualAddMt = annualAddTotal * (weights.metals || 0);

    // Helper for compound growth of initial lump sum + optional monthly DCA compounded monthly
    function projectClassValue(v0, annualRate, annualContribution, years) {
      const lumpSumFuture = v0 * Math.pow(1 + annualRate, years);
      if (annualContribution <= 0 || years === 0) return lumpSumFuture;
      const monthlyPayment = annualContribution / 12;
      const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
      const months = years * 12;
      if (monthlyRate <= 1e-8) {
        return lumpSumFuture + monthlyPayment * months;
      }
      const dcaFuture = monthlyPayment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
      return lumpSumFuture + dcaFuture;
    }

    const currentCalendarYear = new Date().getFullYear();
    const timeline = [];

    for (let y = 0; y <= 25; y++) {
      const eqUsd = projectClassValue(startEq, rEq, annualAddEq, y);
      const bdUsd = projectClassValue(startBd, rBd, annualAddBd, y);
      const mtUsd = projectClassValue(startMt, rMt, annualAddMt, y);
      const totalUsd = eqUsd + bdUsd + mtUsd;
      const contributedUsd = startTotal + (annualAddTotal * y);
      const compoundProfitUsd = Math.max(0, totalUsd - contributedUsd);
      const multiplier = contributedUsd > 0 ? (totalUsd / contributedUsd) : (startTotal > 0 ? totalUsd / startTotal : 1);

      timeline.push({
        yearOffset: y,
        calendarYear: currentCalendarYear + y,
        eqUsd,
        bdUsd,
        mtUsd,
        totalUsd,
        totalUah: totalUsd * rates.USD_UAH,
        contributedUsd,
        compoundProfitUsd,
        compoundProfitUah: compoundProfitUsd * rates.USD_UAH,
        multiplier
      });
    }

    const y25 = timeline[25];
    // Effective blended annual CAGR over 25 years for pure Buy & Hold
    const pureHold25 = (startEq * Math.pow(1 + rEq, 25)) + (startBd * Math.pow(1 + rBd, 25)) + (startMt * Math.pow(1 + rMt, 25));
    const blendedCagrPct = startTotal > 0
      ? ((Math.pow(pureHold25 / startTotal, 1 / 25) - 1) * 100)
      : ((rEq * weights.equities + rBd * weights.bonds + rMt * weights.metals) * 100);

    const cagrBadge = document.getElementById('forecast-blended-cagr-badge');
    if (cagrBadge) {
      cagrBadge.textContent = `Ефективний CAGR портфеля: ${blendedCagrPct.toFixed(2)}% річних`;
    }

    const maxTotalUsd = Math.max(1, y25.totalUsd);
    const milestoneOffsets = [0, 5, 10, 15, 20, 25];

    if (selectedForecastYear < 0 || selectedForecastYear > 25) {
      selectedForecastYear = 25;
    }
    const selPoint = timeline[selectedForecastYear] || y25;

    viewEl.innerHTML = `
      <!-- Milestone KPI Cards (0, 5, 10, 15, 20, 25 years) -->
      <div class="forecast-kpi-grid">
        ${milestoneOffsets.map(offset => {
          const pt = timeline[offset];
          const is25 = offset === 25;
          const cardBorder = is25 ? 'border-color: var(--accent-primary); box-shadow: 0 0 0 1px rgba(56,189,248,0.25);' : '';
          const titleText = offset === 0 ? `Зараз (${pt.calendarYear})` : `Через ${offset} р. (${pt.calendarYear})`;
          const badgeHtml = offset === 0
            ? `<span style="color:var(--text-muted);">Старт</span>`
            : `<span style="color:var(--positive);">×${pt.multiplier.toFixed(2)}</span>`;
          return `
            <div class="forecast-kpi-card" data-select-forecast-year="${offset}" style="cursor:pointer; ${cardBorder}">
              <div class="forecast-kpi-year">
                <span>${titleText}</span>
                ${badgeHtml}
              </div>
              <div class="forecast-kpi-val">${fmtUsd(pt.totalUsd)}</div>
              <div class="forecast-kpi-sub">${fmtUah(pt.totalUah)}</div>
              ${offset > 0 ? `<div class="forecast-kpi-sub" style="color:var(--positive); font-size:11px;">Складний %: +${fmtUsd(pt.compoundProfitUsd)}</div>` : `<div class="forecast-kpi-sub" style="font-size:11px;">База без продажу</div>`}
            </div>
          `;
        }).join('')}
      </div>

      <!-- 25-Year Stacked Bar Chart with Vertical Y-Axis Sum Markings -->
      <div class="forecast-chart-stage">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px; font-size:11.5px; color:var(--text-secondary);">
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
            <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${STOCK_SUBTYPES_META.equities.color}; margin-right:4px;"></span>Акції (${strat.forecastEquitiesCagr}% річних)</span>
            <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${STOCK_SUBTYPES_META.bonds.color}; margin-right:4px;"></span>Облігації (${strat.forecastBondsCagr}% річних)</span>
            <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${STOCK_SUBTYPES_META.metals.color}; margin-right:4px;"></span>Золото / Срібло (${strat.forecastMetalsCagr}% річних)</span>
          </div>
          <span style="color:var(--text-muted);">Пік (25р): <strong style="color:var(--positive);">${fmtChartAxisVal(y25.totalUsd, rates)}</strong> · Наведіть на стовпчик року для деталізації</span>
        </div>

        <div class="forecast-plot-area">
          <!-- Left Vertical Y-Axis Sum Markings -->
          <div class="forecast-y-axis">
            <div class="forecast-y-tick" style="color:var(--positive); font-weight:700;">${fmtChartAxisVal(maxTotalUsd, rates)}</div>
            <div class="forecast-y-tick">${fmtChartAxisVal(maxTotalUsd * 0.75, rates)}</div>
            <div class="forecast-y-tick">${fmtChartAxisVal(maxTotalUsd * 0.50, rates)}</div>
            <div class="forecast-y-tick">${fmtChartAxisVal(maxTotalUsd * 0.25, rates)}</div>
            <div class="forecast-y-tick">${fmtChartAxisVal(0, rates)}</div>
          </div>

          <!-- Right Bars Stage with Horizontal Grid Lines -->
          <div class="forecast-bars-wrap">
            <div class="forecast-grid-lines">
              <div class="forecast-grid-line"></div>
              <div class="forecast-grid-line"></div>
              <div class="forecast-grid-line"></div>
              <div class="forecast-grid-line"></div>
              <div class="forecast-grid-line" style="border-top:none;"></div>
            </div>

            <div class="forecast-bars-grid">
              ${timeline.map(pt => {
                const totalHeightPct = maxTotalUsd > 0 ? Math.max(2, (pt.totalUsd / maxTotalUsd) * 100) : 2;
                const eqShare = pt.totalUsd > 0 ? (pt.eqUsd / pt.totalUsd) * 100 : 0;
                const bdShare = pt.totalUsd > 0 ? (pt.bdUsd / pt.totalUsd) * 100 : 0;
                const mtShare = pt.totalUsd > 0 ? (pt.mtUsd / pt.totalUsd) * 100 : 0;
                const isActive = pt.yearOffset === selectedForecastYear;
                const isMilestone = pt.yearOffset % 5 === 0;
                const showTopLabel = isMilestone || isActive;

                return `
                  <div
                    class="forecast-bar-col ${isActive ? 'active' : ''}"
                    data-forecast-year-bar="${pt.yearOffset}"
                    title="Рік +${pt.yearOffset} (${pt.calendarYear}): ${fmtUsd(pt.totalUsd)} (${fmtUah(pt.totalUah)}) · Чистий складний приріст: +${fmtUsd(pt.compoundProfitUsd)}"
                  >
                    ${showTopLabel ? `<div class="forecast-bar-top-val">${fmtChartAxisVal(pt.totalUsd, rates, true)}</div>` : ''}
                    <div class="forecast-bar-stack" style="height: ${totalHeightPct.toFixed(1)}%;">
                      <div class="forecast-bar-seg" style="height: ${eqShare.toFixed(1)}%; background: ${STOCK_SUBTYPES_META.equities.color};"></div>
                      <div class="forecast-bar-seg" style="height: ${bdShare.toFixed(1)}%; background: ${STOCK_SUBTYPES_META.bonds.color};"></div>
                      <div class="forecast-bar-seg" style="height: ${mtShare.toFixed(1)}%; background: ${STOCK_SUBTYPES_META.metals.color};"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="forecast-x-labels">
              ${timeline.map(pt => {
                const isMilestone = pt.yearOffset % 5 === 0;
                const label = pt.yearOffset === 0 ? '0р' : `+${pt.yearOffset}р`;
                return `<div class="forecast-x-label ${isMilestone ? 'milestone' : ''}">${label}</div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Selected Year Detailed Breakdown Banner -->
        <div class="forecast-detail-banner" id="forecast-year-detail-banner">
          <div>
            <span style="color:var(--text-secondary);">Обраний горизонт:</span>
            <strong style="font-size:13.5px; color:var(--text-primary); margin-left:4px;">
              ${selPoint.yearOffset === 0 ? `Поточний стан (${selPoint.calendarYear} рік)` : `Через ${selPoint.yearOffset} р. (${selPoint.calendarYear} рік)`}
            </strong>
            <span class="pill-badge pill-positive" style="margin-left:6px;">×${selPoint.multiplier.toFixed(2)} до бази</span>
          </div>

          <div class="tabular" style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
            <span>📈 Акції: <strong>${fmtUsd(selPoint.eqUsd)}</strong></span>
            <span>📜 Облігації: <strong>${fmtUsd(selPoint.bdUsd)}</strong></span>
            <span>🥇 Золото/Срібло: <strong>${fmtUsd(selPoint.mtUsd)}</strong></span>
            <span>Чистий складний %: <strong style="color:var(--positive);">+${fmtUsd(selPoint.compoundProfitUsd)}</strong></span>
            <span style="font-size:14px;">Разом: <strong style="color:var(--accent-primary);">${fmtUsd(selPoint.totalUsd)}</strong> <span style="color:var(--text-secondary);">(${fmtUah(selPoint.totalUah)})</span></span>
          </div>
        </div>
      </div>
    `;

    // Interactive hover & click on year bars and milestone cards
    const bindYearSelection = (offset) => {
      selectedForecastYear = offset;
      updateStockForecastDynamicView(classValUsd, weights, monthlyInvestUsd);
    };

    viewEl.querySelectorAll('[data-forecast-year-bar]').forEach(bar => {
      const yr = parseInt(bar.dataset.forecastYearBar, 10) || 0;
      bar.addEventListener('mouseenter', () => bindYearSelection(yr));
      bar.addEventListener('click', () => bindYearSelection(yr));
    });

    viewEl.querySelectorAll('[data-select-forecast-year]').forEach(card => {
      const yr = parseInt(card.dataset.selectForecastYear, 10) || 0;
      card.addEventListener('click', () => bindYearSelection(yr));
    });
  }

  function renderOverviewBreakdown(allEvaluated, grandTotalUah) {
    const rates = getEffectiveRates();
    const isUsdPrimary = state.primaryCurrency === 'USD';
    const categoriesOrder = ['crypto', 'stocks', 'ovdp', 'deposits', 'cash'];
    const catTotals = {};
    categoriesOrder.forEach(c => {
      catTotals[c] = { uah: 0, usd: 0, count: 0 };
    });

    const currTotals = { UAH: 0, USD: 0, EUR: 0 };

    allEvaluated.forEach(p => {
      if (catTotals[p.category]) {
        catTotals[p.category].uah += p.currentValUah;
        catTotals[p.category].usd += p.currentValUsd;
        catTotals[p.category].count += 1;
      }
      const c = p.nativeCurrency || 'UAH';
      currTotals[c] = (currTotals[c] || 0) + p.currentValUah;
    });

    // 1. Stacked Bar & Category Cards
    const barEl = document.getElementById('allocation-stacked-bar');
    const cardsEl = document.getElementById('allocation-cards-grid');
    barEl.innerHTML = '';
    cardsEl.innerHTML = '';

    categoriesOrder.forEach(cat => {
      const info = CATEGORY_META[cat];
      const stats = catTotals[cat];
      const sharePct = grandTotalUah > 0 ? (stats.uah / grandTotalUah) * 100 : 0;

      if (sharePct > 0) {
        const seg = document.createElement('div');
        seg.className = 'allocation-segment';
        seg.style.width = `${Math.max(2, sharePct)}%`;
        seg.style.backgroundColor = info.color;
        seg.title = `${info.shortName}: ${sharePct.toFixed(1)}%`;
        barEl.appendChild(seg);
      }

      const primaryCatVal = isUsdPrimary ? fmtUsd(stats.usd) : fmtUah(stats.uah);
      const secondaryCatVal = isUsdPrimary ? fmtUah(stats.uah) : fmtUsd(stats.usd);
      const strategyHint = cat === 'stocks'
        ? `<span class="pill-badge pill-positive" style="margin-left:6px; font-size:10.5px;">🎯 Стратегія та калькулятор</span>`
        : '';

      const card = document.createElement('div');
      card.className = 'allocation-item';
      card.innerHTML = `
        <div class="allocation-item-left">
          <span class="cat-dot" style="background: ${info.color}; width:10px; height:10px;"></span>
          <div>
            <div class="allocation-item-name">${info.shortName}${strategyHint}</div>
            <div class="allocation-item-share tabular">${sharePct.toFixed(1)}% портфеля · ${stats.count} поз.</div>
          </div>
        </div>
        <div class="allocation-item-right">
          <div class="allocation-item-uah">${primaryCatVal}</div>
          <div class="allocation-item-usd">${secondaryCatVal}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        setActiveCategory(cat);
      });
      cardsEl.appendChild(card);
    });

    // 2. Currency Exposure Bars
    const currEl = document.getElementById('currency-exposure-list');
    currEl.innerHTML = '';
    const currencyLabels = {
      USD: '🇺🇸 Долар США (USD — Крипта, Акції, Валюта)',
      UAH: '🇺🇦 Українська гривня (UAH — ОВДП, Депозити, Картки)',
      EUR: '🇪🇺 Євро (EUR — Готівка та рахунки)'
    };

    Object.keys(currTotals).sort((a, b) => currTotals[b] - currTotals[a]).forEach(curr => {
      const valUah = currTotals[curr];
      if (valUah <= 0 && curr !== 'UAH' && curr !== 'USD') return;
      const valUsd = rates.USD_UAH > 0 ? valUah / rates.USD_UAH : 0;
      const pct = grandTotalUah > 0 ? (valUah / grandTotalUah) * 100 : 0;
      const amountDisplay = isUsdPrimary
        ? `${fmtUsd(valUsd)} · ${fmtUah(valUah)}`
        : `${fmtUah(valUah)} · ${fmtUsd(valUsd)}`;
      const row = document.createElement('div');
      row.className = 'currency-row';
      row.innerHTML = `
        <div class="currency-row-top">
          <span>${currencyLabels[curr] || curr}</span>
          <span class="tabular"><strong>${pct.toFixed(1)}%</strong> (${amountDisplay})</span>
        </div>
        <div class="currency-progress-bg">
          <div class="currency-progress-fill" style="width: ${pct.toFixed(1)}%;"></div>
        </div>
      `;
      currEl.appendChild(row);
    });
  }

  function renderPositionsTable(positions) {
    const isUsdPrimary = state.primaryCurrency === 'USD';
    const query = state.searchQuery.trim().toLowerCase();
    const filtered = query
      ? positions.filter(p =>
          (p.displayName || '').toLowerCase().includes(query) ||
          (p.ticker || '').toLowerCase().includes(query) ||
          (p.platform || '').toLowerCase().includes(query) ||
          (p.bank || '').toLowerCase().includes(query) ||
          (p.notes || '').toLowerCase().includes(query)
        )
      : positions;

    const meta = CATEGORY_META[state.activeCategory] || CATEGORY_META.all;
    document.getElementById('table-section-title').textContent =
      state.activeCategory === 'all' ? 'Усі активи портфеля' : meta.title;
    document.getElementById('table-section-subtitle').textContent = meta.subtitle;

    const thead = document.getElementById('positions-table-head');
    const tbody = document.getElementById('positions-table-body');

    thead.innerHTML = `
      <tr>
        <th>Актив / Деталі</th>
        <th>Категорія / Платформа</th>
        <th class="text-right">Кількість / Ставка</th>
        <th class="text-right">Ціна купівлі → Поточна</th>
        <th class="text-right">Вартість (${isUsdPrimary ? '$ USD / ₴ UAH' : '₴ UAH / $ USD'})</th>
        <th class="text-right">Прибуток / Нараховано</th>
        <th class="text-right">Дії</th>
      </tr>
    `;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 36px 16px; color: var(--text-muted);">
            Позицій у цій категорії ще немає. Натисніть <strong>«+ Додати актив»</strong>, щоб додати першу інвестицію.
          </td>
        </tr>
      `;
      return;
    }

    // Sort by UAH value descending
    const sorted = [...filtered].sort((a, b) => b.currentValUah - a.currentValUah);

    tbody.innerHTML = sorted.map(pos => {
      const catInfo = CATEGORY_META[pos.category] || CATEGORY_META.all;
      let badgeCode = '';
      let qtyOrRateHtml = '';
      let priceComparisonHtml = '';
      let pnlHtml = '';

      if (pos.category === 'crypto' || pos.category === 'stocks') {
        badgeCode = pos.ticker || 'ASSET';
        const chgSign = pos.change24h >= 0 ? '+' : '';
        const chgColor = pos.change24h >= 0 ? 'var(--positive)' : 'var(--negative)';
        const isStakedCrypto = pos.category === 'crypto' && pos.isStaked && pos.stakingApy > 0;
        const isAaveSync = isStakedCrypto && (pos.stakingAutoSync === 'aave' || /aave/i.test(`${pos.platform || ''} ${pos.notes || ''}`));
        const rewardCoinsStr = isStakedCrypto
          ? Number(pos.stakingRewardCoins || 0).toFixed(5).replace(/\.?0+$/, '') || '0'
          : '';
        const totalCoinsStr = isStakedCrypto
          ? Number(pos.totalQty || pos.quantity || 0).toFixed(5).replace(/\.?0+$/, '') || '0'
          : '';
        const compoundLabel = pos.stakingCompound ? '🔄 Реінвест (APY)' : '📥 Без реінвесту (APR)';
        const aaveBadgeText = isAaveSync ? `👻 Aave Auto · ` : '';
        qtyOrRateHtml = `
          <div class="dual-val-primary">${pos.quantity} шт.${isStakedCrypto ? ` <span class="pill-badge pill-positive" style="margin-left:4px;" title="${isAaveSync ? `Автосинхронізація ставки Aave (${pos.aaveChain || 'Ethereum'}) · ` : ''}${compoundLabel}">⚡ ${pos.stakingApy}% · ${aaveBadgeText}${pos.stakingCompound ? 'Реінвест 🔄' : 'Без реінвесту'}</span>` : ''}</div>
          ${isStakedCrypto ? `<div class="dual-val-sub" style="color:var(--positive);">⚡ +${rewardCoinsStr} ${escapeHtml(pos.ticker)} (${pos.stakingCompound ? `разом ${totalCoinsStr} шт.` : 'на спот'} · ${pos.stakingElapsedDays} дн.)</div>` : ''}
          <div class="dual-val-sub">Вкладено: ${fmtUsd(pos.investedUsd)}</div>
        `;
        priceComparisonHtml = `
          <div class="dual-val-primary">${fmtUsd(pos.livePriceUsd)} <span style="font-size:11px; color:${chgColor};">(${chgSign}${pos.change24h.toFixed(2)}%)</span></div>
          <div class="dual-val-sub">Купівля: ${fmtUsd(pos.buyPriceUsd)}</div>
        `;
        const pnlClass = pos.pnlUsd >= 0 ? 'pill-positive' : 'pill-negative';
        const pnlPrimaryStr = isUsdPrimary ? fmtUsd(pos.pnlUsd, true) : fmtUah(pos.pnlUah, true);
        const pnlSecondaryStr = isUsdPrimary ? fmtUah(pos.pnlUah, true) : fmtUsd(pos.pnlUsd, true);
        pnlHtml = `
          <div class="dual-val-primary" style="color:${pos.pnlUsd >= 0 ? 'var(--positive)' : 'var(--negative)'}">
            ${pnlPrimaryStr}
          </div>
          <div class="dual-val-sub">
            ${pnlSecondaryStr} <span class="pill-badge ${pnlClass}">${fmtPct(pos.pnlPct)}</span>
          </div>
          ${isStakedCrypto ? `<div class="dual-val-sub" style="color:var(--positive); font-size:11px; margin-top:2px;">⚡ Стейкінг: +${fmtUsd(pos.stakingRewardUsd)} (${fmtUah(pos.stakingRewardUah, true)})</div>` : ''}
        `;
      } else if (pos.category === 'ovdp') {
        badgeCode = 'ОВДП';
        qtyOrRateHtml = `
          <div class="dual-val-primary">${pos.annualRate}% річних (${pos.nativeCurrency})</div>
          <div class="dual-val-sub">${pos.bondsCount ? `${pos.bondsCount} шт. · ` : ''}Тіло: ${fmtCurr(pos.principalNative, pos.nativeCurrency)}</div>
        `;
        priceComparisonHtml = `
          <div class="dual-val-primary">Погашення: ${formatDateUkrainian(pos.maturityDate)}</div>
          <div class="dual-val-sub">Пройшло ${pos.elapsedDays} з ${pos.totalDays} дн. (0% податку)</div>
          <div class="maturity-progress"><div class="maturity-progress-bar" style="width:${pos.progressPct.toFixed(0)}%"></div></div>
        `;
        pnlHtml = `
          <div class="dual-val-primary" style="color:var(--positive)">+${fmtCurr(pos.accruedNative, pos.nativeCurrency)}</div>
          <div class="dual-val-sub">Вже нараховано (${isUsdPrimary ? fmtUsd(pos.pnlUsd, true) : fmtUah(pos.pnlUah, true)})</div>
        `;
      } else if (pos.category === 'deposits') {
        badgeCode = 'ДЕП';
        const taxLabel = pos.applyTax ? `Чистими ${pos.netRatePct.toFixed(2)}%` : 'Без податку';
        qtyOrRateHtml = `
          <div class="dual-val-primary">${pos.annualRate}% річних (${pos.nativeCurrency})</div>
          <div class="dual-val-sub">${taxLabel} · Вклад: ${fmtCurr(pos.principalNative, pos.nativeCurrency)}</div>
        `;
        priceComparisonHtml = `
          <div class="dual-val-primary">До: ${formatDateUkrainian(pos.endDate)}</div>
          <div class="dual-val-sub">Пройшло ${pos.elapsedDays} з ${pos.totalDays} дн.</div>
          <div class="maturity-progress"><div class="maturity-progress-bar" style="width:${pos.progressPct.toFixed(0)}%"></div></div>
        `;
        pnlHtml = `
          <div class="dual-val-primary" style="color:var(--positive)">+${fmtCurr(pos.accruedNative, pos.nativeCurrency)}</div>
          <div class="dual-val-sub">Накопичено (${isUsdPrimary ? fmtUsd(pos.pnlUsd, true) : fmtUah(pos.pnlUah, true)})</div>
        `;
      } else {
        // Cash
        badgeCode = pos.nativeCurrency || 'CASH';
        qtyOrRateHtml = `
          <div class="dual-val-primary">${fmtCurr(pos.amountNative, pos.nativeCurrency)}</div>
          <div class="dual-val-sub">Ліквідний резерв</div>
        `;
        priceComparisonHtml = `
          <div class="dual-val-primary">100% ліквідність</div>
          <div class="dual-val-sub">Валюта: ${pos.nativeCurrency}</div>
        `;
        pnlHtml = `
          <div class="dual-val-sub">Готівковий залишок</div>
        `;
      }

      const primaryValueStr = state.primaryCurrency === 'UAH' ? fmtUah(pos.currentValUah) : fmtUsd(pos.currentValUsd);
      const secondaryValueStr = state.primaryCurrency === 'UAH' ? fmtUsd(pos.currentValUsd) : fmtUah(pos.currentValUah);
      const platformText = pos.platform || pos.bank || pos.location || 'Особистий рахунок';
      const stockSubBadge = pos.category === 'stocks' && STOCK_SUBTYPES_META[pos.stockSubType]
        ? ` · <span style="color:${STOCK_SUBTYPES_META[pos.stockSubType].color}; font-weight:600;">${STOCK_SUBTYPES_META[pos.stockSubType].badge}</span>`
        : '';

      return `
        <tr data-pos-id="${pos.id}">
          <td>
            <div class="asset-cell">
              <span class="ticker-badge" style="border-left: 3px solid ${catInfo.color}">${badgeCode}</span>
              <div>
                <div class="asset-name-primary">${escapeHtml(pos.displayName)}</div>
                <div class="asset-name-sub">${escapeHtml(pos.notes || '')}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="dual-val-primary">${catInfo.shortName}${stockSubBadge}</div>
            <div class="dual-val-sub">${escapeHtml(platformText)}</div>
          </td>
          <td class="text-right">${qtyOrRateHtml}</td>
          <td class="text-right">${priceComparisonHtml}</td>
          <td class="text-right">
            <div class="dual-val-primary">${primaryValueStr}</div>
            <div class="dual-val-sub">${secondaryValueStr}</div>
          </td>
          <td class="text-right">${pnlHtml}</td>
          <td class="text-right">
            <div class="row-actions">
              <button type="button" class="btn btn-ghost btn-split-pos" data-id="${pos.id}" title="Розбити актив на частини">✂️</button>
              <button type="button" class="btn btn-ghost btn-edit-pos" data-id="${pos.id}" title="Редагувати">✎</button>
              <button type="button" class="btn btn-ghost btn-delete-pos" data-id="${pos.id}" title="Видалити" style="color:var(--negative);">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Split / Edit / Delete handlers
    tbody.querySelectorAll('.btn-split-pos').forEach(btn => {
      btn.addEventListener('click', () => openSplitPositionPrompt(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-edit-pos').forEach(btn => {
      btn.addEventListener('click', () => openPositionModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-delete-pos').forEach(btn => {
      btn.addEventListener('click', () => deletePosition(btn.dataset.id));
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Ukrainian Date Formatter & Custom Calendar Picker (independent of OS/browser locale)
  const UA_MONTHS_NOMINATIVE = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ];
  const UA_MONTHS_GENITIVE = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];
  const UA_WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

  function formatDateUkrainian(isoStr) {
    if (!isoStr || typeof isoStr !== 'string') return '—';
    const parts = isoStr.slice(0, 10).split('-');
    if (parts.length !== 3) return isoStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d) || m < 0 || m > 11) return isoStr;
    return `${d} ${UA_MONTHS_GENITIVE[m]} ${y} р.`;
  }

  let activeDatepickerPopover = null;

  function closeActiveDatepicker() {
    if (activeDatepickerPopover) {
      activeDatepickerPopover.remove();
      activeDatepickerPopover = null;
    }
  }

  document.addEventListener('mousedown', (e) => {
    if (!activeDatepickerPopover) return;
    if (activeDatepickerPopover.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.ua-dp-trigger')) return;
    closeActiveDatepicker();
  });

  function enhanceUkrainianDateInputs(container) {
    if (!container) return;
    const dateInputs = container.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
      const initialIso = input.value || new Date().toISOString().slice(0, 10);
      input.type = 'hidden';
      input.value = initialIso;

      const wrapper = document.createElement('div');
      wrapper.className = 'ua-dp-wrapper';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'form-input tabular ua-dp-trigger';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = formatDateUkrainian(input.value);
      const iconSpan = document.createElement('span');
      iconSpan.className = 'ua-dp-cal-icon';
      iconSpan.textContent = '📅';
      trigger.appendChild(labelSpan);
      trigger.appendChild(iconSpan);
      wrapper.appendChild(trigger);

      function setIsoDate(newIso) {
        input.value = newIso;
        labelSpan.textContent = formatDateUkrainian(newIso);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      trigger.addEventListener('click', () => {
        if (activeDatepickerPopover && activeDatepickerPopover._ownerTrigger === trigger) {
          closeActiveDatepicker();
          return;
        }
        closeActiveDatepicker();

        const currentParts = (input.value || new Date().toISOString().slice(0, 10)).split('-');
        let viewYear = parseInt(currentParts[0], 10) || new Date().getFullYear();
        let viewMonth = (parseInt(currentParts[1], 10) || (new Date().getMonth() + 1)) - 1;

        const popover = document.createElement('div');
        popover.className = 'ua-dp-popover';
        popover._ownerTrigger = trigger;
        document.body.appendChild(popover);
        activeDatepickerPopover = popover;

        function positionPopover() {
          const rect = trigger.getBoundingClientRect();
          const popHeight = 320;
          const spaceBelow = window.innerHeight - rect.bottom;
          const top = (spaceBelow < popHeight && rect.top > popHeight)
            ? Math.max(8, rect.top - popHeight - 6)
            : Math.min(window.innerHeight - popHeight - 8, rect.bottom + 6);
          const left = Math.min(window.innerWidth - 296, Math.max(8, rect.left));
          popover.style.top = `${top}px`;
          popover.style.left = `${left}px`;
        }

        function renderCalendar() {
          const todayIso = new Date().toISOString().slice(0, 10);
          const selectedIso = input.value;

          const years = [];
          for (let y = 2018; y <= 2036; y++) years.push(y);

          const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
          // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
          const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;
          const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
          const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

          const cells = [];
          for (let i = startWeekday - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            const pm = viewMonth === 0 ? 11 : viewMonth - 1;
            const py = viewMonth === 0 ? viewYear - 1 : viewYear;
            const iso = `${py}-${String(pm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            cells.push({ day: d, iso, other: true });
          }
          for (let d = 1; d <= daysInMonth; d++) {
            const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            cells.push({ day: d, iso, other: false });
          }
          let nextDay = 1;
          while (cells.length < 42) {
            const nm = viewMonth === 11 ? 0 : viewMonth + 1;
            const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
            const iso = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
            cells.push({ day: nextDay++, iso, other: true });
          }

          popover.innerHTML = `
            <div class="ua-dp-header">
              <button type="button" class="ua-dp-nav-btn" data-dp-nav="-1" title="Попередній місяць">‹</button>
              <div class="ua-dp-selects">
                <select class="ua-dp-select" data-dp-month>
                  ${UA_MONTHS_NOMINATIVE.map((mName, idx) => `<option value="${idx}" ${idx === viewMonth ? 'selected' : ''}>${mName}</option>`).join('')}
                </select>
                <select class="ua-dp-select" data-dp-year>
                  ${years.map(y => `<option value="${y}" ${y === viewYear ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
              </div>
              <button type="button" class="ua-dp-nav-btn" data-dp-nav="1" title="Наступний місяць">›</button>
            </div>
            <div class="ua-dp-weekdays">
              ${UA_WEEKDAYS_SHORT.map(w => `<span>${w}</span>`).join('')}
            </div>
            <div class="ua-dp-days">
              ${cells.map(c => {
                const cls = [
                  'ua-dp-day',
                  c.other ? 'other-month' : '',
                  c.iso === todayIso ? 'today' : '',
                  c.iso === selectedIso ? 'selected' : ''
                ].filter(Boolean).join(' ');
                return `<button type="button" class="${cls}" data-dp-pick="${c.iso}">${c.day}</button>`;
              }).join('')}
            </div>
            <div class="ua-dp-footer">
              <button type="button" class="ua-dp-quick-btn" data-dp-quick="today">Сьогодні</button>
              <button type="button" class="ua-dp-quick-btn" data-dp-quick="6m">+6 міс.</button>
              <button type="button" class="ua-dp-quick-btn" data-dp-quick="1y">+1 рік</button>
            </div>
          `;

          popover.querySelectorAll('[data-dp-nav]').forEach(btn => {
            btn.addEventListener('click', () => {
              const delta = parseInt(btn.dataset.dpNav, 10);
              viewMonth += delta;
              if (viewMonth < 0) { viewMonth = 11; viewYear--; }
              if (viewMonth > 11) { viewMonth = 0; viewYear++; }
              renderCalendar();
            });
          });

          popover.querySelector('[data-dp-month]')?.addEventListener('change', (ev) => {
            viewMonth = parseInt(ev.target.value, 10);
            renderCalendar();
          });

          popover.querySelector('[data-dp-year]')?.addEventListener('change', (ev) => {
            viewYear = parseInt(ev.target.value, 10);
            renderCalendar();
          });

          popover.querySelectorAll('[data-dp-pick]').forEach(btn => {
            btn.addEventListener('click', () => {
              setIsoDate(btn.dataset.dpPick);
              closeActiveDatepicker();
            });
          });

          popover.querySelectorAll('[data-dp-quick]').forEach(btn => {
            btn.addEventListener('click', () => {
              const now = new Date();
              const mode = btn.dataset.dpQuick;
              if (mode === '6m') now.setMonth(now.getMonth() + 6);
              if (mode === '1y') now.setFullYear(now.getFullYear() + 1);
              const iso = now.toISOString().slice(0, 10);
              setIsoDate(iso);
              closeActiveDatepicker();
            });
          });
        }

        renderCalendar();
        positionPopover();
      });
    });
  }

  function setActiveCategory(cat) {
    state.activeCategory = cat;
    renderAll();
  }

  // Dynamic Form Fields inside Add/Edit Modal
  function renderModalFormFields(category, existing = null) {
    closeActiveDatepicker();
    const container = document.getElementById('dynamic-form-fields');
    const todayStr = new Date().toISOString().slice(0, 10);
    const nextYearStr = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    if (category === 'crypto' || category === 'stocks') {
      const isCrypto = category === 'crypto';
      const quickList = isCrypto ? QUICK_CRYPTO : QUICK_STOCKS;
      const tickerVal = existing?.ticker || (isCrypto ? 'BTC' : 'VOO');
      const nameVal = existing?.name || '';
      const qtyVal = existing?.quantity ?? (isCrypto ? 0.1 : 10);
      const buyVal = existing?.buyPriceUsd ?? (isCrypto ? 85000 : 520);
      const platVal = existing?.platform || (isCrypto ? 'Binance / Ledger' : 'Interactive Brokers');
      const notesVal = existing?.notes || '';
      const isStakedVal = Boolean(existing?.isStaked);
      const stakingCompoundVal = existing?.stakingCompound !== undefined ? Boolean(existing.stakingCompound) : true;
      const stakingApyVal = existing?.stakingApy ?? 4.5;
      const stakingStartVal = existing?.stakingStartDate || existing?.createdAt || todayStr;
      const stakingEarnedVal = existing?.stakingEarnedCoins ? existing.stakingEarnedCoins : '';
      const autoDetectedAave = existing && (existing.stakingAutoSync === 'aave' || (existing.stakingAutoSync === undefined && /aave/i.test(`${existing.platform || ''} ${existing.notes || ''} ${existing.name || ''}`)));
      const stakingAutoSyncVal = autoDetectedAave ? 'aave' : (existing?.stakingAutoSync || 'manual');
      const aaveChainVal = existing ? inferAaveChainFromText(existing) : 'Ethereum';

      container.innerHTML = `
        <div class="form-group full-width">
          <label class="form-label" for="f-ticker">${isCrypto ? 'Тікер криптовалюти (напр. BTC, ETH, SOL, TON)' : 'Біржовий тікер акції або ETF (напр. VOO, SPY, NVDA, AAPL)'}</label>
          <input type="text" class="form-input mono" id="f-ticker" value="${escapeHtml(tickerVal)}" required placeholder="${isCrypto ? 'BTC' : 'VOO'}" />
          <div class="quick-tickers">
            ${quickList.map(t => `<button type="button" class="chip-btn" data-pick-ticker="${t}">${t}</button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="f-name">Назва активу (необов'язково)</label>
          <input type="text" class="form-input" id="f-name" value="${escapeHtml(nameVal)}" placeholder="Підтягнеться автоматично" />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-platform">${isCrypto ? 'Гаманець / Біржа / Протокол (напр. Aave, Binance)' : 'Брокер'}</label>
          <input type="text" class="form-input" id="f-platform" value="${escapeHtml(platVal)}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-quantity">Кількість (${isCrypto ? 'монет' : 'акцій / лотів'})</label>
          <input type="number" step="any" min="0.00000001" class="form-input tabular" id="f-quantity" value="${qtyVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-buy-price">Середня ціна купівлі за 1 шт. ($ USD)</label>
          <input type="number" step="any" min="0" class="form-input tabular" id="f-buy-price" value="${buyVal}" required />
        </div>
        ${isCrypto ? `
        <div class="form-group full-width" style="padding: 12px 14px; border-radius: var(--radius-md); background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.22);">
          <label class="checkbox-row" style="margin-bottom: 0;">
            <input type="checkbox" id="f-is-staked" ${isStakedVal ? 'checked' : ''} />
            <span>⚡ <strong>Актив у стейкінгу / крипто-депозиті (Earn / Aave)</strong> — нараховувати пасивний дохід</span>
          </label>
          <div id="crypto-staking-fields" class="form-grid" style="display: ${isStakedVal ? 'grid' : 'none'}; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div class="form-group full-width">
              <label class="form-label" for="f-staking-autosync">Джерело ставки (% стейкінгу)</label>
              <select class="form-select" id="f-staking-autosync">
                <option value="manual" ${stakingAutoSyncVal !== 'aave' ? 'selected' : ''}>✍️ Вручну (фіксована ставка %)</option>
                <option value="aave" ${stakingAutoSyncVal === 'aave' ? 'selected' : ''}>👻 Автосинхронізація з Aave (жива ставка зі смарт-контракту Aave)</option>
              </select>
            </div>
            <div id="aave-sync-box" class="form-group full-width" style="display: ${stakingAutoSyncVal === 'aave' ? 'block' : 'none'}; padding: 10px 12px; border-radius: 8px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25);">
              <div style="display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 180px;">
                  <label class="form-label" for="f-aave-chain" style="display:block; margin-bottom:4px;">Мережа / Пул Aave</label>
                  <select class="form-select" id="f-aave-chain">
                    <option value="Ethereum" ${aaveChainVal === 'Ethereum' ? 'selected' : ''}>🌐 Aave V3 Ethereum Mainnet</option>
                    <option value="Arbitrum" ${aaveChainVal === 'Arbitrum' ? 'selected' : ''}>🔵 Aave V3 Arbitrum</option>
                    <option value="Polygon" ${aaveChainVal === 'Polygon' ? 'selected' : ''}>🟣 Aave V3 Polygon</option>
                    <option value="Base" ${aaveChainVal === 'Base' ? 'selected' : ''}>🔷 Aave V3 Base</option>
                    <option value="Optimism" ${aaveChainVal === 'Optimism' ? 'selected' : ''}>🔴 Aave V3 Optimism</option>
                    <option value="Avalanche" ${aaveChainVal === 'Avalanche' ? 'selected' : ''}>🔺 Aave V3 Avalanche</option>
                    <option value="SafetyModule" ${aaveChainVal === 'SafetyModule' ? 'selected' : ''}>🛡️ Aave Safety Module (стейкінг AAVE / stkAAVE)</option>
                  </select>
                </div>
                <button type="button" class="btn btn-secondary" id="btn-fetch-aave-now" style="white-space: nowrap; height: 38px;">
                  🔄 Оновити % з Aave
                </button>
              </div>
              <div id="aave-sync-status" style="font-size: 11.5px; color: var(--text-secondary); margin-top: 6px;">
                Ставка автоматично оновлюється з блокчейну Aave при кожному відкритті та оновленні котирувань.
              </div>
            </div>
            <div class="form-group full-width">
              <label class="form-label" for="f-staking-compound">Тип нарахування стейкінгу (реінвестування)</label>
              <select class="form-select" id="f-staking-compound">
                <option value="true" ${stakingCompoundVal ? 'selected' : ''}>🔄 З реінвестуванням (Auto-Compound / складний відсоток — як aTokens в Aave)</option>
                <option value="false" ${!stakingCompoundVal ? 'selected' : ''}>📥 Без реінвестування (Фіксований APR — нарахування лише на початкову кількість монет)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="f-staking-apy">Річна ставка стейкінгу (% річних)</label>
              <input type="number" step="0.01" min="0" max="500" class="form-input tabular" id="f-staking-apy" value="${stakingApyVal}" placeholder="4.5" />
            </div>
            <div class="form-group">
              <label class="form-label" for="f-staking-start">Дата початку стейкінгу</label>
              <input type="date" class="form-input tabular" id="f-staking-start" value="${stakingStartVal}" />
            </div>
            <div class="form-group full-width">
              <label class="form-label" for="f-staking-earned">Вже нараховано монет (необов'язково — залиште порожнім для авторозрахунку)</label>
              <input type="number" step="any" min="0" class="form-input tabular" id="f-staking-earned" value="${stakingEarnedVal}" placeholder="Авторозрахунок від дати початку" />
            </div>
          </div>
        </div>
        ` : ''}
        <div class="form-group full-width">
          <label class="form-label" for="f-notes">Коментар / Нотатка</label>
          <input type="text" class="form-input" id="f-notes" value="${escapeHtml(notesVal)}" placeholder="Напр. Довгостроковий портфель" />
        </div>
      `;

      if (isCrypto) {
        const stakedCheckbox = document.getElementById('f-is-staked');
        const stakingFieldsBox = document.getElementById('crypto-staking-fields');
        const autoSyncSelect = document.getElementById('f-staking-autosync');
        const aaveSyncBox = document.getElementById('aave-sync-box');
        const aaveChainSelect = document.getElementById('f-aave-chain');
        const btnFetchAave = document.getElementById('btn-fetch-aave-now');
        const aaveStatusEl = document.getElementById('aave-sync-status');
        const apyInput = document.getElementById('f-staking-apy');
        const platformInput = document.getElementById('f-platform');

        async function triggerModalAaveFetch() {
          const sym = (document.getElementById('f-ticker')?.value || '').toUpperCase().trim();
          const ch = aaveChainSelect?.value || 'Ethereum';
          if (aaveStatusEl) {
            aaveStatusEl.style.color = 'var(--text-secondary)';
            aaveStatusEl.textContent = `⏳ Запит актуальної ставки Aave для ${sym} (${ch})...`;
          }
          const res = await fetchLiveAaveApy(sym, ch);
          if (res && typeof res.apy === 'number') {
            if (apyInput) apyInput.value = res.apy;
            if (aaveStatusEl) {
              aaveStatusEl.style.color = 'var(--positive)';
              aaveStatusEl.textContent = `✅ Підтягнуто живу ставку: ${res.apy}% APY (${res.source})`;
            }
          } else if (aaveStatusEl) {
            aaveStatusEl.style.color = 'var(--accent-primary)';
            aaveStatusEl.textContent = `⚠️ Для тікера ${sym} у мережі ${ch} пул не знайдено — оберіть іншу мережу або вкажіть % вручну.`;
          }
        }

        stakedCheckbox?.addEventListener('change', () => {
          stakingFieldsBox.style.display = stakedCheckbox.checked ? 'grid' : 'none';
          if (stakedCheckbox.checked && autoSyncSelect?.value === 'aave') {
            triggerModalAaveFetch();
          }
        });

        autoSyncSelect?.addEventListener('change', () => {
          const isAave = autoSyncSelect.value === 'aave';
          if (aaveSyncBox) aaveSyncBox.style.display = isAave ? 'block' : 'none';
          if (isAave) triggerModalAaveFetch();
        });

        aaveChainSelect?.addEventListener('change', () => {
          if (autoSyncSelect?.value === 'aave') triggerModalAaveFetch();
        });

        btnFetchAave?.addEventListener('click', () => {
          triggerModalAaveFetch();
        });

        // If user types "Aave" in platform field, automatically enable staking + Aave sync
        platformInput?.addEventListener('input', () => {
          if (/aave/i.test(platformInput.value) && autoSyncSelect && autoSyncSelect.value !== 'aave') {
            if (stakedCheckbox && !stakedCheckbox.checked) {
              stakedCheckbox.checked = true;
              stakingFieldsBox.style.display = 'grid';
            }
            autoSyncSelect.value = 'aave';
            if (aaveSyncBox) aaveSyncBox.style.display = 'block';
            triggerModalAaveFetch();
          }
        });

        if (isStakedVal && stakingAutoSyncVal === 'aave') {
          triggerModalAaveFetch();
        }
      }

      if (!isCrypto) {
        const tickerInput = document.getElementById('f-ticker');
        const subTypeSelect = document.getElementById('f-stock-subtype');
        tickerInput?.addEventListener('input', () => {
          if (subTypeSelect) {
            subTypeSelect.value = inferStockSubType(tickerInput.value);
          }
        });
      }

      container.querySelectorAll('[data-pick-ticker]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sym = btn.dataset.pickTicker;
          document.getElementById('f-ticker').value = sym;
          const quoteBook = isCrypto ? state.quotes.crypto : state.quotes.stocks;
          if (quoteBook?.[sym]) {
            document.getElementById('f-name').value = quoteBook[sym].name || sym;
            if (!existing) {
              document.getElementById('f-buy-price').value = quoteBook[sym].priceUsd;
            }
          }
          if (!isCrypto) {
            const subTypeSelect = document.getElementById('f-stock-subtype');
            if (subTypeSelect) subTypeSelect.value = inferStockSubType(sym, quoteBook?.[sym]?.name || '');
          }
        });
      });
      enhanceUkrainianDateInputs(container);
      return;
    }

    if (category === 'ovdp') {
      const currVal = existing?.currency || 'UAH';
      const nameVal = existing?.name || 'Військові ОВДП (Дія / ICU)';
      const countVal = existing?.bondsCount ?? 50;
      const principalVal = existing?.principalAmount ?? 50000;
      const rateVal = existing?.annualRate ?? 16.2;
      const startVal = existing?.startDate || todayStr;
      const matVal = existing?.maturityDate || nextYearStr;
      const platVal = existing?.platform || 'Дія / ICU / Монобанк';
      const notesVal = existing?.notes || '0% податків з інвестиційного доходу';

      container.innerHTML = `
        <div class="form-group full-width">
          <label class="form-label" for="f-name">Назва випуску або ISIN ОВДП</label>
          <input type="text" class="form-input" id="f-name" value="${escapeHtml(nameVal)}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-currency">Валюта облігації</label>
          <select class="form-select" id="f-currency">
            <option value="UAH" ${currVal === 'UAH' ? 'selected' : ''}>🇺🇦 Гривня (UAH)</option>
            <option value="USD" ${currVal === 'USD' ? 'selected' : ''}>🇺🇸 Долар США (USD)</option>
            <option value="EUR" ${currVal === 'EUR' ? 'selected' : ''}>🇪🇺 Євро (EUR)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="f-bonds-count">Кількість облігацій (шт.)</label>
          <input type="number" step="1" min="1" class="form-input tabular" id="f-bonds-count" value="${countVal}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-principal">Загальна сума вкладу (Номінал у валюті)</label>
          <input type="number" step="any" min="1" class="form-input tabular" id="f-principal" value="${principalVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-rate">Річна дохідність (% річних, 0% податку)</label>
          <input type="number" step="0.01" min="0.1" class="form-input tabular" id="f-rate" value="${rateVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-start-date">Дата купівлі</label>
          <input type="date" class="form-input tabular" id="f-start-date" value="${startVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-maturity-date">Дата погашення</label>
          <input type="date" class="form-input tabular" id="f-maturity-date" value="${matVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-platform">Де придбано (Банк / Брокер)</label>
          <input type="text" class="form-input" id="f-platform" value="${escapeHtml(platVal)}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-notes">Нотатка</label>
          <input type="text" class="form-input" id="f-notes" value="${escapeHtml(notesVal)}" />
        </div>
      `;

      const countInput = document.getElementById('f-bonds-count');
      const principalInput = document.getElementById('f-principal');
      countInput.addEventListener('input', () => {
        const c = Number(countInput.value) || 0;
        if (c > 0) principalInput.value = c * 1000;
      });
      enhanceUkrainianDateInputs(container);
      return;
    }

    if (category === 'deposits') {
      const currVal = existing?.currency || 'UAH';
      const nameVal = existing?.name || 'Строковий банківський депозит';
      const bankVal = existing?.bank || 'Монобанк';
      const principalVal = existing?.principalAmount ?? 50000;
      const rateVal = existing?.annualRate ?? 14.5;
      const applyTax = existing?.applyTax !== undefined ? existing.applyTax : true;
      const taxRateVal = existing?.taxRate ?? 23.0;
      const startVal = existing?.startDate || todayStr;
      const endVal = existing?.endDate || nextYearStr;
      const notesVal = existing?.notes || '';

      container.innerHTML = `
        <div class="form-group">
          <label class="form-label" for="f-name">Назва депозиту</label>
          <input type="text" class="form-input" id="f-name" value="${escapeHtml(nameVal)}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-bank">Банк</label>
          <input type="text" class="form-input" id="f-bank" value="${escapeHtml(bankVal)}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-currency">Валюта вкладу</label>
          <select class="form-select" id="f-currency">
            <option value="UAH" ${currVal === 'UAH' ? 'selected' : ''}>🇺🇦 Гривня (UAH)</option>
            <option value="USD" ${currVal === 'USD' ? 'selected' : ''}>🇺🇸 Долар США (USD)</option>
            <option value="EUR" ${currVal === 'EUR' ? 'selected' : ''}>🇪🇺 Євро (EUR)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="f-principal">Сума вкладу (Тіло депозиту)</label>
          <input type="number" step="any" min="1" class="form-input tabular" id="f-principal" value="${principalVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-rate">Річна ставка банку (% річних)</label>
          <input type="number" step="0.01" min="0.01" class="form-input tabular" id="f-rate" value="${rateVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-tax-rate">Податок на відсотки (% ПДФО + ВЗ)</label>
          <input type="number" step="0.1" min="0" max="50" class="form-input tabular" id="f-tax-rate" value="${applyTax ? taxRateVal : 0}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-start-date">Дата відкриття</label>
          <input type="date" class="form-input tabular" id="f-start-date" value="${startVal}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="f-end-date">Дата завершення</label>
          <input type="date" class="form-input tabular" id="f-end-date" value="${endVal}" required />
        </div>
        <div class="form-group full-width">
          <label class="form-label" for="f-notes">Коментар</label>
          <input type="text" class="form-input" id="f-notes" value="${escapeHtml(notesVal)}" />
        </div>
      `;
      enhanceUkrainianDateInputs(container);
      return;
    }

    // Cash
    const currVal = existing?.currency || 'USD';
    const nameVal = existing?.name || 'Готівкові заощадження';
    const locVal = existing?.location || 'Готівка / Сейф / Картка';
    const amtVal = existing?.amount ?? 1000;
    const notesVal = existing?.notes || '';

    container.innerHTML = `
      <div class="form-group full-width">
        <label class="form-label" for="f-name">Назва рахунку або готівки</label>
        <input type="text" class="form-input" id="f-name" value="${escapeHtml(nameVal)}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-currency">Валюта</label>
        <select class="form-select" id="f-currency">
          <option value="USD" ${currVal === 'USD' ? 'selected' : ''}>🇺🇸 Долар США (USD)</option>
          <option value="UAH" ${currVal === 'UAH' ? 'selected' : ''}>🇺🇦 Гривня (UAH)</option>
          <option value="EUR" ${currVal === 'EUR' ? 'selected' : ''}>🇪🇺 Євро (EUR)</option>
          <option value="GBP" ${currVal === 'GBP' ? 'selected' : ''}>🇬🇧 Фунт стерлінгів (GBP)</option>
          <option value="PLN" ${currVal === 'PLN' ? 'selected' : ''}>🇵🇱 Польський злотий (PLN)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-amount">Сума у валюті</label>
        <input type="number" step="any" min="0" class="form-input tabular" id="f-amount" value="${amtVal}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-location">Де зберігається (Банк / Сейф / Гаманець)</label>
        <input type="text" class="form-input" id="f-location" value="${escapeHtml(locVal)}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-notes">Нотатка</label>
        <input type="text" class="form-input" id="f-notes" value="${escapeHtml(notesVal)}" />
      </div>
    `;
  }

  function openPositionModal(editId = null) {
    const modal = document.getElementById('modal-position');
    const posIdInput = document.getElementById('pos-id');
    const catSelect = document.getElementById('pos-category');
    const titleEl = document.getElementById('modal-position-title');

    let existing = null;
    if (editId) {
      existing = state.positions.find(p => p.id === editId) || null;
    }

    if (existing) {
      titleEl.textContent = 'Редагувати актив';
      posIdInput.value = existing.id;
      catSelect.value = existing.category;
      renderModalFormFields(existing.category, existing);
    } else {
      titleEl.textContent = 'Додати інвестиційний актив';
      posIdInput.value = '';
      const defaultCat = state.activeCategory === 'all' ? 'crypto' : state.activeCategory;
      catSelect.value = defaultCat;
      renderModalFormFields(defaultCat, null);
    }

    modal.classList.add('open');
  }

  function closePositionModal() {
    closeActiveDatepicker();
    document.getElementById('modal-position').classList.remove('open');
  }

  async function handleSavePosition(e) {
    e.preventDefault();
    const id = document.getElementById('pos-id').value || ('pos-' + Date.now());
    const category = document.getElementById('pos-category').value;

    let newPos = { id, category };

    if (category === 'crypto' || category === 'stocks') {
      const ticker = document.getElementById('f-ticker').value.toUpperCase().trim();
      const quoteBook = category === 'crypto' ? state.quotes.crypto : state.quotes.stocks;
      const defaultName = quoteBook?.[ticker]?.name || ticker;
      const isStaked = category === 'crypto' ? Boolean(document.getElementById('f-is-staked')?.checked) : false;
      const stakingCompound = category === 'crypto' ? (document.getElementById('f-staking-compound')?.value !== 'false') : true;
      const stakingAutoSync = category === 'crypto' ? (document.getElementById('f-staking-autosync')?.value || 'manual') : 'manual';
      const aaveChain = category === 'crypto' ? (document.getElementById('f-aave-chain')?.value || 'Ethereum') : '';
      const stockSubType = category === 'stocks'
        ? (document.getElementById('f-stock-subtype')?.value || inferStockSubType(ticker, defaultName))
        : undefined;
      newPos = {
        ...newPos,
        ticker,
        name: document.getElementById('f-name').value.trim() || defaultName,
        platform: document.getElementById('f-platform').value.trim(),
        quantity: parseFloat(document.getElementById('f-quantity').value) || 0,
        buyPriceUsd: parseFloat(document.getElementById('f-buy-price').value) || 0,
        notes: document.getElementById('f-notes').value.trim(),
        ...(category === 'stocks' ? { stockSubType } : {}),
        ...(category === 'crypto' ? {
          isStaked,
          stakingCompound,
          stakingAutoSync: isStaked ? stakingAutoSync : 'manual',
          aaveChain: (isStaked && stakingAutoSync === 'aave') ? aaveChain : '',
          stakingApy: isStaked ? (parseFloat(document.getElementById('f-staking-apy')?.value) || 0) : 0,
          stakingStartDate: isStaked ? (document.getElementById('f-staking-start')?.value || '') : '',
          stakingEarnedCoins: isStaked ? (parseFloat(document.getElementById('f-staking-earned')?.value) || 0) : 0
        } : {})
      };
    } else if (category === 'ovdp') {
      newPos = {
        ...newPos,
        name: document.getElementById('f-name').value.trim(),
        currency: document.getElementById('f-currency').value,
        bondsCount: parseInt(document.getElementById('f-bonds-count').value, 10) || 1,
        faceValue: 1000,
        principalAmount: parseFloat(document.getElementById('f-principal').value) || 0,
        annualRate: parseFloat(document.getElementById('f-rate').value) || 0,
        startDate: document.getElementById('f-start-date').value,
        maturityDate: document.getElementById('f-maturity-date').value,
        platform: document.getElementById('f-platform').value.trim(),
        notes: document.getElementById('f-notes').value.trim()
      };
    } else if (category === 'deposits') {
      const taxRate = parseFloat(document.getElementById('f-tax-rate').value) || 0;
      newPos = {
        ...newPos,
        name: document.getElementById('f-name').value.trim(),
        bank: document.getElementById('f-bank').value.trim(),
        currency: document.getElementById('f-currency').value,
        principalAmount: parseFloat(document.getElementById('f-principal').value) || 0,
        annualRate: parseFloat(document.getElementById('f-rate').value) || 0,
        applyTax: taxRate > 0,
        taxRate,
        startDate: document.getElementById('f-start-date').value,
        endDate: document.getElementById('f-end-date').value,
        notes: document.getElementById('f-notes').value.trim()
      };
    } else {
      newPos = {
        ...newPos,
        name: document.getElementById('f-name').value.trim(),
        currency: document.getElementById('f-currency').value,
        amount: parseFloat(document.getElementById('f-amount').value) || 0,
        location: document.getElementById('f-location').value.trim(),
        notes: document.getElementById('f-notes').value.trim()
      };
    }

    const idx = state.positions.findIndex(p => p.id === id);
    if (idx >= 0) {
      state.positions[idx] = newPos;
    } else {
      state.positions.push(newPos);
    }

    closePositionModal();
    await persistPortfolio();
    if (category === 'crypto' || category === 'stocks') {
      await refreshQuotesNow();
    } else {
      renderAll();
    }
  }

  async function deletePosition(id) {
    state.positions = state.positions.filter(p => p.id !== id);
    await persistPortfolio();
    renderAll();
  }

  function openSplitPositionPrompt(posId) {
    const pos = state.positions.find(p => p.id === posId);
    if (!pos) return;

    // Determine quantity/amount field based on category
    let totalQty = 0;
    let unitLabel = 'шт.';
    let fieldKey = 'quantity';

    if (pos.category === 'stocks' || pos.category === 'crypto') {
      totalQty = Number(pos.quantity) || 0;
      unitLabel = 'шт.';
      fieldKey = 'quantity';
    } else if (pos.category === 'ovdp') {
      totalQty = Number(pos.bondsCount) || Math.round((Number(pos.principalAmount) || 0) / (Number(pos.faceValue) || 1000));
      unitLabel = 'облігацій (шт.)';
      fieldKey = 'bondsCount';
    } else if (pos.category === 'deposits') {
      totalQty = Number(pos.principalAmount) || 0;
      unitLabel = pos.currency || 'UAH';
      fieldKey = 'principalAmount';
    } else {
      totalQty = Number(pos.amount) || 0;
      unitLabel = pos.currency || 'USD';
      fieldKey = 'amount';
    }

    if (totalQty <= 0) return;

    let overlay = document.getElementById('modal-split-position');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-split-position';
      overlay.className = 'modal-backdrop';
      document.body.appendChild(overlay);
    }

    const defaultSplitQty = totalQty > 1 && Number.isInteger(totalQty)
      ? Math.floor(totalQty / 2)
      : Number((totalQty / 2).toFixed(4));
    const titleLabel = pos.ticker ? `${pos.ticker} (${pos.name || pos.ticker})` : (pos.name || 'Актив');
    const platformFieldLabel = (pos.category === 'deposits')
      ? 'Банк для відокремленої частини'
      : (pos.category === 'cash' ? 'Місце зберігання для відокремленої частини' : 'Брокер / Платформа для відокремленої частини');
    const currentPlatformVal = pos.platform || pos.bank || pos.location || '';

    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 500px;">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">✂️ Розбити актив на частини</h3>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(titleLabel)} · Всього зараз: <strong>${totalQty} ${escapeHtml(unitLabel)}</strong></div>
          </div>
          <button type="button" class="btn btn-ghost" id="btn-close-split-modal">✕</button>
        </div>
        <form id="form-split-position">
          <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
            <div style="padding:10px 12px; border-radius:8px; background:rgba(59, 130, 246, 0.08); border:1px solid rgba(59, 130, 246, 0.25); font-size:12.5px; color:var(--text-secondary); line-height:1.45;">
              Розбиття дозволяє розділити одну позицію на дві окремі частини (наприклад, між різними брокерами/рахунками, різними лотами купівлі або окремими цілями в стратегії).
            </div>

            <div class="form-group">
              <label class="form-label" for="split-qty-input">Скільки відокремити у нову частину (${escapeHtml(unitLabel)})</label>
              <input type="number" step="any" min="0.000001" max="${totalQty * 0.999999}" class="form-input tabular" id="split-qty-input" value="${defaultSplitQty}" required />
              <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary); margin-top:6px;" class="tabular">
                <span>Залишиться в частині 1: <strong id="split-remain-preview" style="color:var(--text-primary);">${Number((totalQty - defaultSplitQty).toFixed(6))} ${escapeHtml(unitLabel)}</strong></span>
                <span>Нова частина 2: <strong id="split-new-preview" style="color:var(--accent-primary);">${defaultSplitQty} ${escapeHtml(unitLabel)}</strong></span>
              </div>
              <div style="display:flex; gap:6px; margin-top:8px;">
                <button type="button" class="btn btn-secondary btn-split-ratio" data-ratio="0.25" style="padding:3px 8px; font-size:11.5px;">25%</button>
                <button type="button" class="btn btn-secondary btn-split-ratio" data-ratio="0.5" style="padding:3px 8px; font-size:11.5px;">50% (Навпіл)</button>
                <button type="button" class="btn btn-secondary btn-split-ratio" data-ratio="0.75" style="padding:3px 8px; font-size:11.5px;">75%</button>
              </div>
            </div>

            ${(pos.category === 'stocks' || pos.category === 'crypto') ? `
              <div class="form-group">
                <label class="form-label" for="split-buy-price">Ціна купівлі для нової частини ($ USD за 1 шт.)</label>
                <input type="number" step="any" min="0" class="form-input tabular" id="split-buy-price" value="${pos.buyPriceUsd || 0}" required />
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label" for="split-platform-input">${escapeHtml(platformFieldLabel)}</label>
              <input type="text" class="form-input" id="split-platform-input" value="${escapeHtml(currentPlatformVal)}" placeholder="Напр. Interactive Brokers / Freedom24 / Субрахунок 2" />
            </div>

            <div class="form-group">
              <label class="form-label" for="split-notes-input">Коментар / позначка для нової частини</label>
              <input type="text" class="form-input" id="split-notes-input" value="${escapeHtml(pos.notes ? `${pos.notes} (Частина 2)` : 'Частина 2')}" placeholder="Напр. Довгостроковий лот / Частина 2" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-split-modal">Скасувати</button>
            <button type="submit" class="btn btn-primary">✂️ Розділити на 2 частини</button>
          </div>
        </form>
      </div>
    `;

    overlay.classList.add('open');

    const closeSplitModal = () => overlay.classList.remove('open');
    overlay.querySelector('#btn-close-split-modal').addEventListener('click', closeSplitModal);
    overlay.querySelector('#btn-cancel-split-modal').addEventListener('click', closeSplitModal);

    const qtyInput = overlay.querySelector('#split-qty-input');
    const remainPreview = overlay.querySelector('#split-remain-preview');
    const newPreview = overlay.querySelector('#split-new-preview');

    const updateSplitPreview = () => {
      const val = Number(qtyInput.value) || 0;
      const rem = Math.max(0, Number((totalQty - val).toFixed(6)));
      remainPreview.textContent = `${rem} ${unitLabel}`;
      newPreview.textContent = `${Number(val.toFixed(6))} ${unitLabel}`;
    };

    qtyInput.addEventListener('input', updateSplitPreview);

    overlay.querySelectorAll('.btn-split-ratio').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = Number(btn.dataset.ratio) || 0.5;
        const raw = totalQty * r;
        qtyInput.value = (pos.category === 'ovdp' && totalQty > 1)
          ? Math.max(1, Math.round(raw))
          : Number(raw.toFixed(4));
        updateSplitPreview();
      });
    });

    overlay.querySelector('#form-split-position').addEventListener('submit', async (e) => {
      e.preventDefault();
      const splitVal = Number(qtyInput.value) || 0;
      if (splitVal <= 0 || splitVal >= totalQty) {
        alert(`Вкажіть кількість більше 0 та менше ніж ${totalQty} ${unitLabel}.`);
        return;
      }

      const remainVal = Number((totalQty - splitVal).toFixed(6));
      const ratioNew = splitVal / totalQty;
      const ratioRemain = remainVal / totalQty;

      const newPosId = 'pos-' + Date.now();
      const newPlatform = overlay.querySelector('#split-platform-input').value.trim();
      const newNotes = overlay.querySelector('#split-notes-input').value.trim();

      // Clone original position for part 2
      const newPos = JSON.parse(JSON.stringify(pos));
      newPos.id = newPosId;
      newPos.notes = newNotes;

      if (pos.category === 'stocks' || pos.category === 'crypto') {
        pos.quantity = remainVal;
        newPos.quantity = Number(splitVal.toFixed(6));
        const customBuyPrice = parseFloat(overlay.querySelector('#split-buy-price')?.value);
        if (!Number.isNaN(customBuyPrice) && customBuyPrice >= 0) {
          newPos.buyPriceUsd = customBuyPrice;
        }
        newPos.platform = newPlatform;
        if (pos.category === 'crypto' && pos.isStaked && pos.stakingEarnedCoins > 0) {
          const origEarned = Number(pos.stakingEarnedCoins) || 0;
          pos.stakingEarnedCoins = Number((origEarned * ratioRemain).toFixed(6));
          newPos.stakingEarnedCoins = Number((origEarned * ratioNew).toFixed(6));
        }
      } else if (pos.category === 'ovdp') {
        const face = Number(pos.faceValue) || 1000;
        pos.bondsCount = remainVal;
        pos.principalAmount = Math.round((Number(pos.principalAmount) || (totalQty * face)) * ratioRemain);
        newPos.bondsCount = splitVal;
        newPos.principalAmount = Math.round((Number(newPos.principalAmount) || (totalQty * face)) * ratioNew);
        newPos.platform = newPlatform;
      } else if (pos.category === 'deposits') {
        pos.principalAmount = remainVal;
        newPos.principalAmount = splitVal;
        newPos.bank = newPlatform;
      } else {
        pos.amount = remainVal;
        newPos.amount = splitVal;
        newPos.location = newPlatform;
      }

      // If this is a stock with a target percentage in stockStrategy.tickerTargets, split its target percentage proportionally
      if (pos.category === 'stocks' && state.settings?.stockStrategy?.tickerTargets) {
        const tt = state.settings.stockStrategy.tickerTargets;
        if (typeof tt[pos.id] === 'number' && tt[pos.id] > 0) {
          const origTarget = tt[pos.id];
          tt[pos.id] = Math.round(origTarget * ratioRemain * 10) / 10;
          tt[newPosId] = Math.round((origTarget - tt[pos.id]) * 10) / 10;
        }
      }

      // Insert new position right after original
      const origIdx = state.positions.findIndex(p => p.id === pos.id);
      if (origIdx >= 0) {
        state.positions.splice(origIdx + 1, 0, newPos);
      } else {
        state.positions.push(newPos);
      }

      closeSplitModal();
      await persistPortfolio();
      renderAll();
    });
  }

  // Settings Modal
  function openSettingsModal() {
    const rates = getEffectiveRates();
    document.getElementById('set-manual-fx').checked = Boolean(state.settings.manualFxOverride);
    document.getElementById('set-usd-uah').value = rates.USD_UAH;
    document.getElementById('set-eur-uah').value = rates.EUR_UAH;
    const cloudInput = document.getElementById('set-cloud-sync-url');
    if (cloudInput) cloudInput.value = state.cloudSyncUrl || '';
    const cmcKeyInput = document.getElementById('set-cmc-api-key');
    if (cmcKeyInput) cmcKeyInput.value = state.settings.cmcApiKey || '';
    document.getElementById('set-require-auth').checked = Boolean(state.auth?.requireAuth);
    document.getElementById('set-new-password').value = '';
    document.getElementById('modal-settings').classList.add('open');
  }

  function closeSettingsModal() {
    document.getElementById('modal-settings').classList.remove('open');
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    state.settings.manualFxOverride = document.getElementById('set-manual-fx').checked;
    state.settings.fxRates = {
      USD_UAH: parseFloat(document.getElementById('set-usd-uah').value) || 41.65,
      EUR_UAH: parseFloat(document.getElementById('set-eur-uah').value) || 44.80
    };

    const cloudInput = document.getElementById('set-cloud-sync-url');
    if (cloudInput) {
      state.cloudSyncUrl = cloudInput.value.trim();
      safeSetItem('kapital_cloud_sync_url', state.cloudSyncUrl);
    }

    const cmcKeyInput = document.getElementById('set-cmc-api-key');
    if (cmcKeyInput) {
      state.settings.cmcApiKey = cmcKeyInput.value.trim();
    }

    const requireAuth = document.getElementById('set-require-auth').checked;
    const newPassword = document.getElementById('set-new-password').value.trim();

    await persistPortfolio();

    try {
      const authRes = await apiFetch('/api/auth/settings', {
        method: 'POST',
        body: JSON.stringify({ requireAuth, newPassword })
      });
      if (authRes.token) {
        state.token = authRes.token;
        safeSetItem('kapital_auth_token', authRes.token);
      }
      state.auth.requireAuth = requireAuth;
    } catch (_) {}

    closeSettingsModal();
    renderAll();
  }

  function openLoginModal() {
    document.getElementById('modal-login').classList.add('open');
  }

  // Wire up Event Listeners
  function initEvents() {
    // Theme toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      safeSetItem('kapital_theme', next);
    });

    const savedTheme = safeGetItem('kapital_theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Category navigation
    document.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        setActiveCategory(btn.dataset.category);
      });
    });

    // Currency switcher
    document.querySelectorAll('[data-currency]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.primaryCurrency = btn.dataset.currency;
        state.settings.primaryCurrency = state.primaryCurrency;
        persistPortfolio();
        renderAll();
      });
    });

    // Search filter
    document.getElementById('input-search-positions').addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderAll();
    });

    // Refresh quotes
    document.getElementById('btn-refresh-quotes').addEventListener('click', refreshQuotesNow);

    // Add Position Modal
    document.getElementById('btn-add-position').addEventListener('click', () => openPositionModal(null));
    document.getElementById('btn-close-position-modal').addEventListener('click', closePositionModal);
    document.getElementById('btn-cancel-position').addEventListener('click', closePositionModal);
    document.getElementById('pos-category').addEventListener('change', (e) => {
      renderModalFormFields(e.target.value, null);
    });
    document.getElementById('form-position').addEventListener('submit', handleSavePosition);

    // Settings & FX Modal
    document.getElementById('btn-open-settings').addEventListener('click', openSettingsModal);
    document.getElementById('btn-edit-fx').addEventListener('click', openSettingsModal);
    const topbarCloudBtn = document.getElementById('btn-topbar-cloud');
    if (topbarCloudBtn) topbarCloudBtn.addEventListener('click', openSettingsModal);
    document.getElementById('btn-close-settings-modal').addEventListener('click', closeSettingsModal);
    document.getElementById('btn-cancel-settings').addEventListener('click', closeSettingsModal);
    document.getElementById('form-settings').addEventListener('submit', handleSaveSettings);

    const testCloudBtn = document.getElementById('btn-test-cloud-sync');
    if (testCloudBtn) {
      testCloudBtn.addEventListener('click', async () => {
        const hintEl = document.getElementById('cloud-sync-hint');
        const inputEl = document.getElementById('set-cloud-sync-url');
        const urlVal = (inputEl && inputEl.value.trim()) || '';
        if (!urlVal) {
          if (hintEl) {
            hintEl.style.color = 'var(--warning)';
            hintEl.textContent = 'Вставте посилання Web App URL (https://script.google.com/macros/s/.../exec)';
          }
          return;
        }
        state.cloudSyncUrl = urlVal;
        safeSetItem('kapital_cloud_sync_url', urlVal);
        if (hintEl) {
          hintEl.style.color = 'var(--text-secondary)';
          hintEl.textContent = 'Перевірка зв\'язку з Google Диском...';
        }
        try {
          const data = await cloudSyncGet({ action: 'get' });
          if (data && (data.positions || data.settings)) {
            state.cloudSynced = true;
            if (Array.isArray(data.positions) && data.positions.length > 0) {
              state.positions = data.positions;
            } else {
              await cloudSyncPost({ action: 'save', settings: state.settings, positions: state.positions });
            }
            if (hintEl) {
              hintEl.style.color = 'var(--positive)';
              hintEl.textContent = '✅ Зв\'язок встановлено! Дані портфеля синхронізуються з вашим Google Диском.';
            }
            renderAll();
          } else {
            throw new Error('Unexpected response');
          }
        } catch (err) {
          state.cloudSynced = false;
          if (hintEl) {
            hintEl.style.color = 'var(--warning)';
            hintEl.textContent = '⚠️ Google не пускає зовнішній запит. Перевірте у script.google.com: Розгорнути → Керувати розгортаннями → ✎ → Версія: «Нова версія» та Хто має доступ: «Усі» (Anyone).';
          }
          renderAll();
        }
      });
    }

    // Export / Import JSON backup
    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const payload = {
          exportedAt: new Date().toISOString(),
          settings: state.settings,
          positions: state.positions
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kapital-portfolio-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    const importBtn = document.getElementById('btn-import-json');
    const importInput = document.getElementById('input-import-json-file');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed.positions)) {
            state.positions = parsed.positions;
          }
          if (parsed.settings && typeof parsed.settings === 'object') {
            state.settings = { ...state.settings, ...parsed.settings };
          }
          await persistPortfolio();
          closeSettingsModal();
          renderAll();
        } catch (_) {}
        importInput.value = '';
      });
    }

    // Demo reset & clear all
    document.getElementById('btn-reset-demo').addEventListener('click', async () => {
      try {
        if (isGoogleAppsScript()) {
          const res = await gasCall('gasResetDemo');
          if (res && res.positions) state.positions = res.positions;
        } else {
          const res = await apiFetch('/api/portfolio/reset-demo', { method: 'POST' });
          if (res.positions) state.positions = res.positions;
        }
      } catch (_) {
        state.positions = JSON.parse(JSON.stringify(DEFAULT_DEMO_POSITIONS));
        await persistPortfolio();
      }
      closeSettingsModal();
      renderAll();
    });

    document.getElementById('btn-clear-all-data').addEventListener('click', async () => {
      state.positions = [];
      await persistPortfolio();
      closeSettingsModal();
      renderAll();
    });

    // Login Form
    document.getElementById('form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error-msg');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          state.token = data.token;
          safeSetItem('kapital_auth_token', data.token);
          document.getElementById('modal-login').classList.remove('open');
          loadPortfolioFromServer();
        } else {
          errEl.style.display = 'block';
        }
      } catch (_) {
        errEl.style.display = 'block';
      }
    });
  }

  // Render initial state immediately so the UI is never blank while server/Drive loads
  const initialCached = safeGetItem('kapital_backup_state');
  if (initialCached) {
    try {
      const parsed = JSON.parse(initialCached);
      if (parsed.settings) {
        state.settings = { ...state.settings, ...parsed.settings };
        if (!parsed.settings.defaultUsdMigrated) {
          state.settings.primaryCurrency = 'USD';
          state.settings.defaultUsdMigrated = true;
        }
        state.primaryCurrency = state.settings.primaryCurrency || 'USD';
      }
      if (Array.isArray(parsed.positions) && parsed.positions.length > 0) {
        state.positions = parsed.positions;
      } else {
        state.positions = JSON.parse(JSON.stringify(DEFAULT_DEMO_POSITIONS));
      }
    } catch (_) {
      state.positions = JSON.parse(JSON.stringify(DEFAULT_DEMO_POSITIONS));
    }
  } else {
    state.positions = JSON.parse(JSON.stringify(DEFAULT_DEMO_POSITIONS));
  }

  initEvents();
  renderAll();
  loadPortfolioFromServer();
})();
