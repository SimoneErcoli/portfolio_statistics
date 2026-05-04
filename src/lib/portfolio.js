const DAY_MS = 24 * 60 * 60 * 1000;
const PERCENT_FORMATTER = new Intl.NumberFormat("it-IT", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const NUMBER_FORMATTER = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("it-IT", {
  notation: "compact",
  maximumFractionDigits: 1
});
const DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  month: "short",
  year: "numeric"
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortByDate(a, b) {
  return a.date.localeCompare(b.date);
}

function toDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data non valida: ${date}`);
  }

  return parsed;
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((toDate(end) - toDate(start)) / DAY_MS));
}

function mean(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - avg) ** 2, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

function averageIntervalInDays(history) {
  if (history.length < 2) {
    return 365;
  }

  const deltas = [];

  for (let index = 1; index < history.length; index += 1) {
    deltas.push(daysBetween(history[index - 1].date, history[index].date));
  }

  return mean(deltas);
}

function normalizeNumber(value, label) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    throw new Error(`${label} deve essere numerico.`);
  }

  return normalized;
}

function normalizeDate(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} deve essere una data in formato YYYY-MM-DD.`);
  }

  toDate(value);
  return value;
}

function uniqueSortedDates(...dateLists) {
  return [...new Set(dateLists.flat())].sort();
}

function groupByDate(items) {
  return items.reduce((groups, item) => {
    const bucket = groups.get(item.date) ?? [];
    bucket.push(item);
    groups.set(item.date, bucket);
    return groups;
  }, new Map());
}

function buildHistoryMap(items) {
  return items.reduce((map, item) => {
    map.set(item.date, item);
    return map;
  }, new Map());
}

function validatePortfolio(portfolioData) {
  if (!isObject(portfolioData)) {
    throw new Error("Il file JSON deve contenere un oggetto principale.");
  }

  if (!isObject(portfolioData.portfolio)) {
    throw new Error("Manca la sezione `portfolio`.");
  }

  if (!portfolioData.portfolio.name) {
    throw new Error("`portfolio.name` e obbligatorio.");
  }

  if (!portfolioData.portfolio.baseCurrency) {
    throw new Error("`portfolio.baseCurrency` e obbligatorio.");
  }

  if (!Array.isArray(portfolioData.etfs) || portfolioData.etfs.length === 0) {
    throw new Error("Il portafoglio deve contenere almeno un ETF in `etfs`.");
  }
}

function parseInitialPosition(etf) {
  if (etf.initialPosition == null) {
    return null;
  }

  if (!isObject(etf.initialPosition)) {
    throw new Error(`initialPosition per ${etf.ticker} deve essere un oggetto.`);
  }

  const date = normalizeDate(etf.initialPosition.date, `initialPosition.date per ${etf.ticker}`);
  const shares = normalizeNumber(etf.initialPosition.shares, `initialPosition.shares per ${etf.ticker}`);
  const price = normalizeNumber(etf.initialPosition.price, `initialPosition.price per ${etf.ticker}`);
  const fees = normalizeNumber(etf.initialPosition.fees ?? 0, `initialPosition.fees per ${etf.ticker}`);

  if (shares <= 0) {
    throw new Error(`initialPosition.shares per ${etf.ticker} deve essere maggiore di zero.`);
  }

  if (price <= 0) {
    throw new Error(`initialPosition.price per ${etf.ticker} deve essere maggiore di zero.`);
  }

  if (fees < 0) {
    throw new Error(`initialPosition.fees per ${etf.ticker} non puo essere negativo.`);
  }

  const marketValue = shares * price;
  const costBasis =
    etf.initialPosition.costBasis == null
      ? marketValue + fees
      : normalizeNumber(etf.initialPosition.costBasis, `initialPosition.costBasis per ${etf.ticker}`);

  if (costBasis < 0) {
    throw new Error(`initialPosition.costBasis per ${etf.ticker} non puo essere negativo.`);
  }

  return {
    date,
    shares,
    price,
    fees,
    marketValue,
    costBasis
  };
}

function analyzeEftSeries(etf, baseCurrency) {
  if (!etf.id || !etf.ticker || !etf.name) {
    throw new Error("Ogni ETF deve avere `id`, `ticker` e `name`.");
  }

  if (!Array.isArray(etf.transactions)) {
    throw new Error(`L'ETF ${etf.ticker} deve contenere ` + "`transactions`.");
  }

  if (!Array.isArray(etf.performanceHistory) || etf.performanceHistory.length === 0) {
    throw new Error(`L'ETF ${etf.ticker} deve contenere ` + "`performanceHistory`.");
  }

  const initialPosition = parseInitialPosition(etf);

  const transactions = etf.transactions
    .map((transaction) => {
      const shares = normalizeNumber(transaction.shares, `shares per ${etf.ticker}`);
      const price = normalizeNumber(transaction.price, `price per ${etf.ticker}`);
      const fees = normalizeNumber(transaction.fees ?? 0, `fees per ${etf.ticker}`);
      const date = normalizeDate(transaction.date, `transaction.date per ${etf.ticker}`);

      if (shares <= 0) {
        throw new Error(`Le quote per ${etf.ticker} devono essere maggiori di zero.`);
      }

      if (!["buy", "sell"].includes(transaction.type)) {
        throw new Error(`La transazione ${transaction.date} di ${etf.ticker} deve essere buy o sell.`);
      }

      return {
        date,
        type: transaction.type,
        shares,
        price,
        fees
      };
    })
    .sort(sortByDate);

  const history = etf.performanceHistory
    .map((entry) => ({
      date: normalizeDate(entry.date, `performanceHistory.date per ${etf.ticker}`),
      close: normalizeNumber(entry.close, `close per ${etf.ticker}`),
      dividend: normalizeNumber(entry.dividend ?? 0, `dividend per ${etf.ticker}`)
    }))
    .sort(sortByDate);

  if (!initialPosition && transactions.length === 0) {
    throw new Error(
      `L'ETF ${etf.ticker} deve contenere almeno una transazione o una initialPosition.`
    );
  }

  if (initialPosition && transactions.some((transaction) => transaction.date < initialPosition.date)) {
    throw new Error(
      `initialPosition per ${etf.ticker} deve essere precedente o uguale alle transazioni successive.`
    );
  }

  const transactionMap = groupByDate(transactions);
  const historyMap = buildHistoryMap(history);
  const allDates = uniqueSortedDates(
    initialPosition ? [initialPosition.date] : [],
    transactions.map((transaction) => transaction.date),
    history.map((entry) => entry.date)
  );

  let shares = 0;
  let costBasis = 0;
  let contributed = 0;
  let returned = 0;
  let dividendsReceived = 0;
  let feesPaid = 0;
  let realizedPnL = 0;
  let latestPrice = initialPosition?.price ?? history[0]?.close ?? transactions[0]?.price ?? 0;
  let initialPositionApplied = false;

  const snapshots = [];

  for (const date of allDates) {
    let externalFlow = 0;

    if (initialPosition && !initialPositionApplied && initialPosition.date === date) {
      shares += initialPosition.shares;
      costBasis += initialPosition.costBasis;
      contributed += initialPosition.costBasis;
      feesPaid += initialPosition.fees;
      latestPrice = initialPosition.price;
      externalFlow += initialPosition.marketValue;
      initialPositionApplied = true;
    }

    const dayTransactions = transactionMap.get(date) ?? [];

    for (const transaction of dayTransactions) {
      const gross = transaction.shares * transaction.price;

      feesPaid += transaction.fees;

      if (transaction.type === "buy") {
        shares += transaction.shares;
        costBasis += gross + transaction.fees;
        contributed += gross + transaction.fees;
        externalFlow += gross + transaction.fees;
      } else {
        if (transaction.shares > shares + 1e-9) {
          throw new Error(
            `L'ETF ${etf.ticker} tenta di vendere ${transaction.shares} quote il ${date}, ma ne possiede ${shares.toFixed(
              2
            )}.`
          );
        }

        const averageCost = shares > 0 ? costBasis / shares : 0;
        const soldCostBasis = averageCost * transaction.shares;
        const proceeds = gross - transaction.fees;

        shares -= transaction.shares;
        costBasis -= soldCostBasis;
        returned += proceeds;
        realizedPnL += proceeds - soldCostBasis;
        externalFlow -= proceeds;
      }

      latestPrice = transaction.price;
    }

    const historyPoint = historyMap.get(date);

    if (historyPoint) {
      latestPrice = historyPoint.close;

      if (historyPoint.dividend > 0 && shares > 0) {
        const dividendCash = shares * historyPoint.dividend;
        dividendsReceived += dividendCash;
        externalFlow -= dividendCash;
      }
    }

    const currentValue = latestPrice * shares;
    const wealth = currentValue + returned + dividendsReceived;
    const netContributions = contributed - returned - dividendsReceived;

    snapshots.push({
      date,
      shares,
      latestPrice,
      currentValue,
      costBasis,
      contributed,
      returned,
      dividendsReceived,
      wealth,
      netContributions,
      externalFlow
    });
  }

  const intervals = [];
  let cumulativeGrowth = 1;
  let peakGrowth = 1;
  let maxDrawdown = 0;

  const performanceHistory = snapshots.map((snapshot, index) => {
    let periodReturn = 0;

    if (index > 0) {
      const previous = snapshots[index - 1];
      const base = previous.currentValue + snapshot.externalFlow;

      if (base > 0) {
        periodReturn = snapshot.currentValue / base - 1;
      }
    }

    if (!Number.isFinite(periodReturn)) {
      periodReturn = 0;
    }

    if (index > 0) {
      intervals.push(periodReturn);
    }

    cumulativeGrowth *= 1 + periodReturn;
    peakGrowth = Math.max(peakGrowth, cumulativeGrowth);
    maxDrawdown = Math.max(maxDrawdown, 1 - cumulativeGrowth / peakGrowth);

    return {
      ...snapshot,
      periodReturn,
      cumulativeGrowth: cumulativeGrowth - 1,
      drawdown: 1 - cumulativeGrowth / peakGrowth
    };
  });

  const firstDate = performanceHistory[0].date;
  const lastDate = performanceHistory[performanceHistory.length - 1].date;
  const years = daysBetween(firstDate, lastDate) / 365;
  const periodsPerYear = 365 / averageIntervalInDays(performanceHistory);
  const volatility = standardDeviation(intervals) * Math.sqrt(periodsPerYear);
  const timeWeightedReturn = cumulativeGrowth - 1;
  const annualizedReturn =
    years > 0 && cumulativeGrowth > 0 ? Math.pow(cumulativeGrowth, 1 / years) - 1 : 0;
  const latest = performanceHistory[performanceHistory.length - 1];
  const totalProfit = latest.wealth - latest.contributed;
  const totalReturn = latest.contributed > 0 ? totalProfit / latest.contributed : 0;
  const unrealizedPnL = latest.currentValue - latest.costBasis;

  return {
    id: etf.id,
    ticker: etf.ticker,
    name: etf.name,
    isin: etf.isin ?? "",
    assetClass: etf.assetClass ?? "Non specificato",
    currency: etf.currency ?? baseCurrency,
    expenseRatio: normalizeNumber(etf.expenseRatio ?? 0, `expenseRatio per ${etf.ticker}`),
    initialPosition: initialPosition
      ? {
          date: initialPosition.date,
          shares: initialPosition.shares,
          price: initialPosition.price,
          fees: initialPosition.fees,
          marketValue: initialPosition.marketValue,
          costBasis: initialPosition.costBasis
        }
      : null,
    openingMarketValue: initialPosition?.marketValue ?? 0,
    openingCostBasis: initialPosition?.costBasis ?? 0,
    shares: latest.shares,
    currentPrice: latest.latestPrice,
    currentValue: latest.currentValue,
    wealth: latest.wealth,
    costBasis: latest.costBasis,
    totalContributed: latest.contributed,
    returnedCapital: latest.returned,
    dividendsReceived: latest.dividendsReceived,
    feesPaid,
    realizedPnL,
    unrealizedPnL,
    totalProfit,
    totalReturn,
    timeWeightedReturn,
    annualizedReturn: Number.isFinite(annualizedReturn) ? annualizedReturn : 0,
    volatility: Number.isFinite(volatility) ? volatility : 0,
    maxDrawdown,
    firstDate,
    lastDate,
    history: performanceHistory
  };
}

export function analyzePortfolio(portfolioData) {
  validatePortfolio(portfolioData);

  const baseCurrency = portfolioData.portfolio.baseCurrency;
  const etfs = portfolioData.etfs
    .map((etf) => analyzeEftSeries(etf, baseCurrency))
    .sort((left, right) => right.currentValue - left.currentValue);

  const globalDates = uniqueSortedDates(...etfs.map((etf) => etf.history.map((point) => point.date)));
  const timelineIndexes = new Map(etfs.map((etf) => [etf.id, 0]));
  const portfolioHistory = [];

  for (const date of globalDates) {
    let currentValue = 0;
    let wealth = 0;
    let totalContributed = 0;
    let returnedCapital = 0;
    let dividendsReceived = 0;
    let costBasis = 0;

    for (const etf of etfs) {
      const currentIndex = timelineIndexes.get(etf.id);
      let nextIndex = currentIndex;

      while (nextIndex + 1 < etf.history.length && etf.history[nextIndex + 1].date <= date) {
        nextIndex += 1;
      }

      timelineIndexes.set(etf.id, nextIndex);

      const snapshot = etf.history[nextIndex];

      if (snapshot.date <= date) {
        currentValue += snapshot.currentValue;
        wealth += snapshot.wealth;
        totalContributed += snapshot.contributed;
        returnedCapital += snapshot.returned;
        dividendsReceived += snapshot.dividendsReceived;
        costBasis += snapshot.costBasis;
      }
    }

    const netContributions = totalContributed - returnedCapital - dividendsReceived;

    portfolioHistory.push({
      date,
      currentValue,
      wealth,
      totalContributed,
      returnedCapital,
      dividendsReceived,
      netContributions,
      costBasis
    });
  }

  const portfolioReturns = [];
  let cumulativeGrowth = 1;
  let peakGrowth = 1;
  let maxDrawdown = 0;

  const enrichedHistory = portfolioHistory.map((point, index) => {
    let periodReturn = 0;

    if (index > 0) {
      const previous = portfolioHistory[index - 1];
      const flow =
        point.totalContributed -
        previous.totalContributed -
        (point.returnedCapital - previous.returnedCapital) -
        (point.dividendsReceived - previous.dividendsReceived);
      const base = previous.currentValue + flow;

      if (base > 0) {
        periodReturn = point.currentValue / base - 1;
      }
    }

    if (!Number.isFinite(periodReturn)) {
      periodReturn = 0;
    }

    if (index > 0) {
      portfolioReturns.push(periodReturn);
    }

    cumulativeGrowth *= 1 + periodReturn;
    peakGrowth = Math.max(peakGrowth, cumulativeGrowth);
    maxDrawdown = Math.max(maxDrawdown, 1 - cumulativeGrowth / peakGrowth);

    return {
      ...point,
      periodReturn,
      cumulativeGrowth: cumulativeGrowth - 1,
      drawdown: 1 - cumulativeGrowth / peakGrowth
    };
  });

  const latest = enrichedHistory[enrichedHistory.length - 1];
  const totalProfit = latest.wealth - latest.totalContributed;
  const totalReturn = latest.totalContributed > 0 ? totalProfit / latest.totalContributed : 0;
  const firstDate = enrichedHistory[0].date;
  const lastDate = enrichedHistory[enrichedHistory.length - 1].date;
  const years = daysBetween(firstDate, lastDate) / 365;
  const periodsPerYear = 365 / averageIntervalInDays(enrichedHistory);
  const volatility = standardDeviation(portfolioReturns) * Math.sqrt(periodsPerYear);
  const timeWeightedReturn = cumulativeGrowth - 1;
  const annualizedReturn =
    years > 0 && cumulativeGrowth > 0 ? Math.pow(cumulativeGrowth, 1 / years) - 1 : 0;
  const currentValue = latest.currentValue;
  const activePositions = etfs.filter((etf) => etf.shares > 0).length;
  const allocation = etfs
    .filter((etf) => etf.currentValue > 0)
    .map((etf) => ({
      id: etf.id,
      ticker: etf.ticker,
      name: etf.name,
      currentValue: etf.currentValue,
      weight: currentValue > 0 ? etf.currentValue / currentValue : 0
    }))
    .sort((left, right) => right.weight - left.weight);

  const etfsWithWeights = etfs.map((etf) => ({
    ...etf,
    weight: currentValue > 0 ? etf.currentValue / currentValue : 0
  }));
  const initialEtfs = etfsWithWeights.filter((etf) => etf.initialPosition);
  const initialPortfolioMarketValue = initialEtfs.reduce(
    (total, etf) => total + etf.openingMarketValue,
    0
  );
  const initialPortfolioCostBasis = initialEtfs.reduce(
    (total, etf) => total + etf.openingCostBasis,
    0
  );
  const initialPortfolioDate =
    initialEtfs.length > 0
      ? [...initialEtfs]
          .map((etf) => etf.initialPosition.date)
          .sort()[0]
      : null;

  return {
    name: portfolioData.portfolio.name,
    baseCurrency,
    notes: portfolioData.portfolio.notes ?? "",
    currentValue,
    wealth: latest.wealth,
    totalContributed: latest.totalContributed,
    returnedCapital: latest.returnedCapital,
    dividendsReceived: latest.dividendsReceived,
    feesPaid: etfsWithWeights.reduce((total, etf) => total + etf.feesPaid, 0),
    costBasis: latest.costBasis,
    totalProfit,
    totalReturn,
    timeWeightedReturn,
    annualizedReturn: Number.isFinite(annualizedReturn) ? annualizedReturn : 0,
    volatility: Number.isFinite(volatility) ? volatility : 0,
    maxDrawdown,
    firstDate,
    lastDate,
    activePositions,
    etfCount: etfs.length,
    historyPoints: etfsWithWeights.reduce((total, etf) => total + etf.history.length, 0),
    initialPositionCount: initialEtfs.length,
    initialPortfolioMarketValue,
    initialPortfolioCostBasis,
    initialPortfolioDate,
    allocation,
    history: enrichedHistory,
    etfs: etfsWithWeights,
    bestPerformer: [...etfsWithWeights].sort(
      (left, right) => right.timeWeightedReturn - left.timeWeightedReturn
    )[0],
    worstPerformer: [...etfsWithWeights].sort(
      (left, right) => left.timeWeightedReturn - right.timeWeightedReturn
    )[0],
    topProfitContributor: [...etfsWithWeights].sort(
      (left, right) => right.totalProfit - left.totalProfit
    )[0],
    mostVolatile: [...etfsWithWeights].sort((left, right) => right.volatility - left.volatility)[0]
  };
}

export function formatCurrency(value, currency) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatCompactCurrency(value, currency) {
  return `${COMPACT_NUMBER_FORMATTER.format(value)} ${currency}`;
}

export function formatPercent(value) {
  return PERCENT_FORMATTER.format(value);
}

export function formatDateLabel(date) {
  return DATE_FORMATTER.format(toDate(date));
}

export function formatNumber(value) {
  return NUMBER_FORMATTER.format(value);
}

export function toneClass(value) {
  if (value > 0) {
    return "tone-positive";
  }

  if (value < 0) {
    return "tone-negative";
  }

  return "";
}
