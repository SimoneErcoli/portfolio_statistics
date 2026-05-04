"use client";

import { useId, useState, useTransition } from "react";
import {
  analyzePortfolio,
  formatCurrency,
  formatDateLabel,
  formatNumber,
  formatPercent,
  toneClass
} from "../lib/portfolio";
import {
  DrawdownChart as PortfolioDrawdownChart,
  EtfComparisonChart as PortfolioEtfComparisonChart,
  PerformanceChart,
  RiskReturnChart as PortfolioRiskReturnChart
} from "./performance-chart";

const schemaSnippet = `{
  "portfolio": {
    "name": "ETF Core Portfolio",
    "baseCurrency": "EUR"
  },
  "etfs": [
    {
      "id": "vwce",
      "ticker": "VWCE",
      "name": "Vanguard FTSE All-World UCITS ETF",
      "initialPosition": {
        "date": "2024-12-31",
        "shares": 8,
        "price": 109.1,
        "costBasis": 848.6
      },
      "transactions": [
        {
          "date": "2025-01-10",
          "type": "buy",
          "shares": 12,
          "price": 111.4,
          "fees": 2.9
        }
      ],
      "performanceHistory": [
        {
          "date": "2025-01-31",
          "close": 113.2,
          "dividend": 0
        }
      ]
    }
  ]
}`;

function getSuggestedInitialDate(etf) {
  const dates = [
    ...(Array.isArray(etf.transactions) ? etf.transactions.map((transaction) => transaction.date) : []),
    ...(Array.isArray(etf.performanceHistory)
      ? etf.performanceHistory.map((historyPoint) => historyPoint.date)
      : [])
  ].filter(Boolean);

  return dates.sort()[0] ?? "";
}

function buildInitialPositionEditorState(portfolioData, customEtfIds = []) {
  const customEtfIdSet = new Set(customEtfIds);

  return portfolioData.etfs.map((etf) => ({
    id: etf.id,
    portfolioEtfId: etf.id,
    ticker: etf.ticker,
    name: etf.name,
    isin: etf.isin ?? "",
    assetClass: etf.assetClass ?? "",
    enabled: Boolean(etf.initialPosition),
    isCustom: customEtfIdSet.has(etf.id),
    date: etf.initialPosition?.date ?? getSuggestedInitialDate(etf),
    shares:
      etf.initialPosition?.shares != null ? String(etf.initialPosition.shares) : "",
    price: etf.initialPosition?.price != null ? String(etf.initialPosition.price) : "",
    costBasis:
      etf.initialPosition?.costBasis != null ? String(etf.initialPosition.costBasis) : "",
    fees: etf.initialPosition?.fees != null ? String(etf.initialPosition.fees) : ""
  }));
}

function createEmptyPortfolioData(templateData) {
  return {
    portfolio: {
      name: "Nuovo portafoglio ETF",
      baseCurrency: templateData?.portfolio?.baseCurrency ?? "EUR",
      notes: ""
    },
    etfs: []
  };
}

function normalizeOptionalNumber(value, label) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} deve essere numerico.`);
  }

  return parsed;
}

function normalizeDraftText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getDraftLabel(draft) {
  return normalizeDraftText(draft.ticker) || normalizeDraftText(draft.name) || "il nuovo ETF";
}

function createLocalDraftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTransactionDraft(transaction = {}) {
  return {
    id: createLocalDraftId(),
    date: transaction.date ?? "",
    type: transaction.type ?? "buy",
    shares: transaction.shares != null ? String(transaction.shares) : "",
    price: transaction.price != null ? String(transaction.price) : "",
    fees: transaction.fees != null ? String(transaction.fees) : ""
  };
}

function buildTransactionEditorState(portfolioData) {
  return portfolioData.etfs.map((etf) => ({
    id: etf.id,
    ticker: etf.ticker,
    name: etf.name,
    transactions: Array.isArray(etf.transactions)
      ? etf.transactions.map((transaction) => createTransactionDraft(transaction))
      : []
  }));
}

function createCustomEtfDraft() {
  return {
    id: createLocalDraftId(),
    portfolioEtfId: null,
    ticker: "",
    name: "",
    isin: "",
    assetClass: "",
    enabled: true,
    isCustom: true,
    date: "",
    shares: "",
    price: "",
    costBasis: "",
    fees: ""
  };
}

function buildInitialPositionFromDraft(draft) {
  const draftLabel = getDraftLabel(draft);

  if (!draft.date.trim()) {
    throw new Error(`Inserisci una data iniziale per ${draftLabel}.`);
  }

  const shares = normalizeOptionalNumber(draft.shares, `Le quote iniziali di ${draftLabel}`);
  const price = normalizeOptionalNumber(draft.price, `Il prezzo iniziale di ${draftLabel}`);

  if (shares == null || shares <= 0) {
    throw new Error(`Le quote iniziali di ${draftLabel} devono essere maggiori di zero.`);
  }

  if (price == null || price <= 0) {
    throw new Error(`Il prezzo iniziale di ${draftLabel} deve essere maggiore di zero.`);
  }

  const costBasis = normalizeOptionalNumber(
    draft.costBasis,
    `Il costo storico iniziale di ${draftLabel}`
  );
  const fees = normalizeOptionalNumber(draft.fees, `Le fee iniziali di ${draftLabel}`);

  if (costBasis != null && costBasis < 0) {
    throw new Error(`Il costo storico iniziale di ${draftLabel} non puo essere negativo.`);
  }

  if (fees != null && fees < 0) {
    throw new Error(`Le fee iniziali di ${draftLabel} non possono essere negative.`);
  }

  return {
    date: draft.date.trim(),
    shares,
    price,
    ...(costBasis != null ? { costBasis } : {}),
    ...(fees != null ? { fees } : {})
  };
}

function slugifyEtfId(value) {
  const normalized = normalizeDraftText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "etf";
}

function buildUniqueEtfId(draft, usedIds) {
  const baseId = slugifyEtfId(draft.ticker || draft.name);
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function buildTransactionFromDraft(transactionDraft, draftLabel, index) {
  const transactionLabel = `La transazione ${index + 1} di ${draftLabel}`;
  const date = normalizeDraftText(transactionDraft.date);

  if (!date) {
    throw new Error(`${transactionLabel} deve avere una data.`);
  }

  const type = transactionDraft.type;

  if (!["buy", "sell"].includes(type)) {
    throw new Error(`${transactionLabel} deve essere buy o sell.`);
  }

  const shares = normalizeOptionalNumber(transactionDraft.shares, `Le quote di ${transactionLabel}`);
  const price = normalizeOptionalNumber(transactionDraft.price, `Il prezzo di ${transactionLabel}`);
  const fees = normalizeOptionalNumber(transactionDraft.fees, `Le fee di ${transactionLabel}`);

  if (shares == null || shares <= 0) {
    throw new Error(`Le quote di ${transactionLabel} devono essere maggiori di zero.`);
  }

  if (price == null || price <= 0) {
    throw new Error(`Il prezzo di ${transactionLabel} deve essere maggiore di zero.`);
  }

  if (fees != null && fees < 0) {
    throw new Error(`Le fee di ${transactionLabel} non possono essere negative.`);
  }

  return {
    date,
    type,
    shares,
    price,
    ...(fees != null ? { fees } : {})
  };
}

function buildTransactionsFromDrafts(transactionEditorDraft) {
  const draftLabel = normalizeDraftText(transactionEditorDraft.ticker) || transactionEditorDraft.name;

  return transactionEditorDraft.transactions
    .map((transactionDraft, index) =>
      buildTransactionFromDraft(transactionDraft, draftLabel, index)
    )
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildCustomEtfFromDraft(draft, etfId, baseCurrency, existingEtf = null) {
  const ticker = normalizeDraftText(draft.ticker).toUpperCase();
  const name = normalizeDraftText(draft.name);
  const isin = normalizeDraftText(draft.isin).toUpperCase();
  const assetClass = normalizeDraftText(draft.assetClass) || "Non specificato";

  if (!ticker) {
    throw new Error("Inserisci il ticker del nuovo ETF.");
  }

  if (!name) {
    throw new Error(`Inserisci il nome completo per ${ticker}.`);
  }

  const initialPosition = buildInitialPositionFromDraft(draft);

  return {
    id: etfId,
    ticker,
    name,
    ...(isin ? { isin } : {}),
    assetClass,
    currency: existingEtf?.currency ?? baseCurrency,
    expenseRatio: existingEtf?.expenseRatio ?? 0,
    initialPosition,
    transactions: Array.isArray(existingEtf?.transactions) ? existingEtf.transactions : [],
    performanceHistory:
      Array.isArray(existingEtf?.performanceHistory) && existingEtf.performanceHistory.length > 0
        ? existingEtf.performanceHistory
        : [
            {
              date: initialPosition.date,
              close: initialPosition.price,
              dividend: 0
            }
          ]
  };
}

function buildPortfolioWithInitialPositions(portfolioData, initialPositionEditorState, customEtfIds) {
  const draftsByPortfolioId = new Map(
    initialPositionEditorState
      .filter((draft) => draft.portfolioEtfId)
      .map((draft) => [draft.portfolioEtfId, draft])
  );
  const customEtfIdSet = new Set(customEtfIds);
  const nextCustomEtfIds = [];
  const nextEtfs = portfolioData.etfs.reduce((etfs, etf) => {
    const draft = draftsByPortfolioId.get(etf.id);
    const isCustomEtf = customEtfIdSet.has(etf.id);

    if (!draft) {
      if (!isCustomEtf) {
        etfs.push(etf);
      }

      return etfs;
    }

    if (isCustomEtf) {
      if (!draft.enabled) {
        return etfs;
      }

      nextCustomEtfIds.push(etf.id);
      etfs.push(buildCustomEtfFromDraft(draft, etf.id, portfolioData.portfolio.baseCurrency, etf));
      return etfs;
    }

    if (!draft.enabled) {
      const { initialPosition, ...etfWithoutInitialPosition } = etf;
      etfs.push(etfWithoutInitialPosition);
      return etfs;
    }

    etfs.push({
      ...etf,
      initialPosition: buildInitialPositionFromDraft(draft)
    });

    return etfs;
  }, []);
  const usedIds = new Set(nextEtfs.map((etf) => etf.id));

  for (const draft of initialPositionEditorState.filter(
    (currentDraft) => currentDraft.isCustom && !currentDraft.portfolioEtfId
  )) {
    if (!draft.enabled) {
      continue;
    }

    const etfId = buildUniqueEtfId(draft, usedIds);

    nextCustomEtfIds.push(etfId);
    nextEtfs.push(buildCustomEtfFromDraft(draft, etfId, portfolioData.portfolio.baseCurrency));
  }

  return {
    portfolioData: {
      ...portfolioData,
      etfs: nextEtfs
    },
    customEtfIds: nextCustomEtfIds
  };
}

function buildPortfolioWithTransactions(portfolioData, transactionEditorState) {
  const transactionDraftsByEtfId = new Map(transactionEditorState.map((draft) => [draft.id, draft]));

  return {
    ...portfolioData,
    etfs: portfolioData.etfs.map((etf) => {
      const transactionDraft = transactionDraftsByEtfId.get(etf.id);

      if (!transactionDraft) {
        return etf;
      }

      return {
        ...etf,
        transactions: buildTransactionsFromDrafts(transactionDraft)
      };
    })
  };
}

function downloadJsonFile(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function parseDraftNumber(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function estimateDraftValue(draft) {
  const shares = parseDraftNumber(draft.shares);
  const price = parseDraftNumber(draft.price);

  if (shares == null || price == null || shares <= 0 || price <= 0) {
    return null;
  }

  return shares * price;
}

function estimateDraftCostBasis(draft) {
  const explicitCostBasis = parseDraftNumber(draft.costBasis);

  if (explicitCostBasis != null) {
    return explicitCostBasis;
  }

  const estimatedValue = estimateDraftValue(draft);
  const fees = parseDraftNumber(draft.fees) ?? 0;

  if (estimatedValue == null) {
    return null;
  }

  return estimatedValue + fees;
}

function StatCard({ label, value, detail, tone }) {
  return (
    <article className="stat-card">
      <span className="stat-label">{label}</span>
      <p className={`stat-value ${tone ? toneClass(tone) : ""}`}>{value}</p>
      {detail ? <p className="stat-detail">{detail}</p> : null}
    </article>
  );
}

export function PortfolioDashboard({ sampleData }) {
  const inputId = useId();
  const emptyPortfolioData = createEmptyPortfolioData(sampleData);
  const [portfolioData, setPortfolioData] = useState(() => emptyPortfolioData);
  const [customEtfIds, setCustomEtfIds] = useState([]);
  const [initialPositionEditorState, setInitialPositionEditorState] = useState(() =>
    buildInitialPositionEditorState(emptyPortfolioData, [])
  );
  const [transactionEditorState, setTransactionEditorState] = useState(() =>
    buildTransactionEditorState(emptyPortfolioData)
  );
  const [sourceLabel, setSourceLabel] = useState("Nuovo portafoglio vuoto");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  let analysis = null;
  let analysisError = error;

  try {
    analysis = analyzePortfolio(portfolioData);
  } catch (caughtError) {
    analysisError =
      caughtError instanceof Error ? caughtError.message : "Impossibile analizzare il dataset.";
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const validated = analyzePortfolio(parsed);

      startTransition(() => {
        setPortfolioData(parsed);
        setCustomEtfIds([]);
        setInitialPositionEditorState(buildInitialPositionEditorState(parsed, []));
        setTransactionEditorState(buildTransactionEditorState(parsed));
        setSourceLabel(file.name);
        setFeedback(
          `Caricato ${file.name}: ${validated.etfCount} ETF e ${validated.historyPoints} punti storici.`
        );
        setError("");
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "File JSON non valido.");
      setFeedback("");
    }

    event.target.value = "";
  }

  function resetToEmptyPortfolio() {
    startTransition(() => {
      setPortfolioData(emptyPortfolioData);
      setCustomEtfIds([]);
      setInitialPositionEditorState(buildInitialPositionEditorState(emptyPortfolioData, []));
      setTransactionEditorState(buildTransactionEditorState(emptyPortfolioData));
      setSourceLabel("Nuovo portafoglio vuoto");
      setFeedback("Ripartito da un portafoglio vuoto con 0 ETF.");
      setError("");
    });
  }

  function updateInitialPositionDraft(etfId, field, value) {
    setInitialPositionEditorState((currentState) =>
      currentState.map((draft) => (draft.id === etfId ? { ...draft, [field]: value } : draft))
    );
  }

  function toggleInitialPositionDraft(etfId, enabled) {
    const currentDraft = initialPositionEditorState.find((draft) => draft.id === etfId);
    const etf = portfolioData.etfs.find(
      (currentEtf) => currentEtf.id === currentDraft?.portfolioEtfId
    );

    setInitialPositionEditorState((currentState) =>
      currentState.map((draft) =>
        draft.id === etfId
          ? {
            ...draft,
            enabled,
            date: enabled && !draft.date ? getSuggestedInitialDate(etf ?? {}) : draft.date
          }
          : draft
      )
    );
  }

  function resetInitialPositionEditor() {
    setInitialPositionEditorState(buildInitialPositionEditorState(portfolioData, customEtfIds));
    setFeedback("Campi del portafoglio iniziale riallineati al dataset corrente.");
    setError("");
  }

  function updateTransactionDraft(etfId, transactionId, field, value) {
    setTransactionEditorState((currentState) =>
      currentState.map((draft) =>
        draft.id === etfId
          ? {
              ...draft,
              transactions: draft.transactions.map((transactionDraft) =>
                transactionDraft.id === transactionId
                  ? { ...transactionDraft, [field]: value }
                  : transactionDraft
              )
            }
          : draft
      )
    );
  }

  function addTransactionDraft(etfId) {
    setTransactionEditorState((currentState) =>
      currentState.map((draft) =>
        draft.id === etfId
          ? { ...draft, transactions: [...draft.transactions, createTransactionDraft()] }
          : draft
      )
    );
    setFeedback("Nuova transazione aggiunta alla bozza.");
    setError("");
  }

  function removeTransactionDraft(etfId, transactionId) {
    setTransactionEditorState((currentState) =>
      currentState.map((draft) =>
        draft.id === etfId
          ? {
              ...draft,
              transactions: draft.transactions.filter(
                (transactionDraft) => transactionDraft.id !== transactionId
              )
            }
          : draft
      )
    );
    setFeedback("Transazione rimossa dalla bozza.");
    setError("");
  }

  function resetTransactionEditor() {
    setTransactionEditorState(buildTransactionEditorState(portfolioData));
    setFeedback("Transazioni riallineate al dataset corrente.");
    setError("");
  }

  function addCustomEtfDraft() {
    setInitialPositionEditorState((currentState) => [...currentState, createCustomEtfDraft()]);
    setFeedback("Nuovo ETF aggiunto alla bozza del portafoglio iniziale.");
    setError("");
  }

  function removeCustomEtfDraft(etfId) {
    setInitialPositionEditorState((currentState) =>
      currentState.filter((draft) => draft.id !== etfId)
    );
    setFeedback("ETF rimosso dalla bozza. Applica per aggiornare il dataset.");
    setError("");
  }

  function applyInitialPortfolio() {
    try {
      const { portfolioData: nextPortfolioData, customEtfIds: nextCustomEtfIds } =
        buildPortfolioWithInitialPositions(
          portfolioData,
          initialPositionEditorState,
          customEtfIds
        );
      const validated = analyzePortfolio(nextPortfolioData);

      startTransition(() => {
        setPortfolioData(nextPortfolioData);
        setCustomEtfIds(nextCustomEtfIds);
        setInitialPositionEditorState(
          buildInitialPositionEditorState(nextPortfolioData, nextCustomEtfIds)
        );
        setTransactionEditorState(buildTransactionEditorState(nextPortfolioData));
        setFeedback(
          `Portafoglio iniziale aggiornato: ${validated.initialPositionCount} ETF con posizione iniziale.`
        );
        setError("");
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossibile aggiornare il portafoglio iniziale."
      );
      setFeedback("");
    }
  }

  function applyTransactions() {
    try {
      const nextPortfolioData = buildPortfolioWithTransactions(portfolioData, transactionEditorState);
      const validated = analyzePortfolio(nextPortfolioData);
      const transactionCount = nextPortfolioData.etfs.reduce(
        (total, etf) => total + (Array.isArray(etf.transactions) ? etf.transactions.length : 0),
        0
      );

      startTransition(() => {
        setPortfolioData(nextPortfolioData);
        setTransactionEditorState(buildTransactionEditorState(nextPortfolioData));
        setFeedback(
          `Transazioni aggiornate: ${transactionCount} operazioni distribuite su ${validated.etfCount} ETF.`
        );
        setError("");
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossibile aggiornare le transazioni."
      );
      setFeedback("");
    }
  }

  function exportCurrentPortfolio() {
    const baseName =
      sourceLabel.toLowerCase().endsWith(".json")
        ? sourceLabel.slice(0, -5)
        : sourceLabel.replace(/\s+/g, "-").toLowerCase();

    downloadJsonFile(`${baseName || "portfolio"}-edited.json`, portfolioData);
    setFeedback("JSON corrente esportato con tutte le modifiche fatte da interfaccia.");
    setError("");
  }

  if (!analysis) {
    return (
      <main className="page-shell">
        <section className="hero">
          <p className="eyebrow">ETF Portfolio Observatory</p>
          <h1>Statistiche chiare per il tuo portafoglio di investimenti</h1>
          <p className="hero-copy">
            Carica uno storico con transazioni e prezzi degli ETF. La dashboard ricostruisce il
            portafoglio, misura rendimento, drawdown e contributo di ogni posizione.
          </p>
        </section>
        <section className="panel empty-state">
          <p className="error-copy">
            {analysisError || "Impossibile analizzare il dataset corrente."}
          </p>
        </section>
      </main>
    );
  }

  const summaryCards = [
    {
      label: "Valore attuale",
      value: formatCurrency(analysis.currentValue, analysis.baseCurrency),
      detail: `${analysis.activePositions} posizioni aperte`
    },
    {
      label: "Portafoglio iniziale",
      value: formatCurrency(analysis.initialPortfolioMarketValue, analysis.baseCurrency),
      detail:
        analysis.initialPositionCount > 0
          ? `${analysis.initialPositionCount} ETF iniziali · costo ${formatCurrency(
            analysis.initialPortfolioCostBasis,
            analysis.baseCurrency
          )}`
          : "Nessuna posizione iniziale definita"
    },
    {
      label: "Ricchezza totale",
      value: formatCurrency(analysis.wealth, analysis.baseCurrency),
      detail: `Include ${formatCurrency(
        analysis.returnedCapital + analysis.dividendsReceived,
        analysis.baseCurrency
      )} gia monetizzati`
    },
    {
      label: "Rendimento totale",
      value: formatPercent(analysis.totalReturn),
      detail: formatCurrency(analysis.totalProfit, analysis.baseCurrency),
      tone: analysis.totalReturn
    },
    {
      label: "Time-weighted return",
      value: formatPercent(analysis.timeWeightedReturn),
      detail: `Annualizzato ${formatPercent(analysis.annualizedReturn)}`,
      tone: analysis.timeWeightedReturn
    },
    {
      label: "Volatilita annua",
      value: formatPercent(analysis.volatility),
      detail: `Max drawdown ${formatPercent(-analysis.maxDrawdown)}`,
      tone: -analysis.maxDrawdown
    },
    {
      label: "Dividendi e fee",
      value: formatCurrency(analysis.dividendsReceived, analysis.baseCurrency),
      detail: `Commissioni ${formatCurrency(analysis.feesPaid, analysis.baseCurrency)}`
    }
  ];
  const configuredInitialPositions = initialPositionEditorState.filter((draft) => draft.enabled).length;
  const previewInitialValue = initialPositionEditorState.reduce((total, draft) => {
    if (!draft.enabled) {
      return total;
    }

    return total + (estimateDraftValue(draft) ?? 0);
  }, 0);
  const incompleteInitialDrafts = initialPositionEditorState.filter(
    (draft) => draft.enabled && (!draft.date || estimateDraftValue(draft) == null)
  ).length;
  const totalTransactionDrafts = transactionEditorState.reduce(
    (total, draft) => total + draft.transactions.length,
    0
  );
  const etfsWithTransactionDrafts = transactionEditorState.filter(
    (draft) => draft.transactions.length > 0
  ).length;
  const hasTrackedEtfs = analysis.etfCount > 0;

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">ETF Portfolio Observatory</p>
        <h1>Statistiche chiare per il tuo portafoglio di investimenti</h1>
        <p className="hero-copy">
          Parti da un portafoglio vuoto oppure carica un file JSON. La dashboard ricostruisce la
          cronologia del portafoglio e produce metriche piu affidabili rispetto a un semplice
          snapshot finale.
        </p>
      </section>

      <div className="layout-grid">
        <section className="panel toolbar">
          <div className="toolbar-group">
            <label className="upload-label" htmlFor={inputId}>
              Carica JSON
              <input
                id={inputId}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
              />
            </label>
            <button className="ghost-button" type="button" onClick={resetToEmptyPortfolio}>
              Nuovo portafoglio
            </button>
            <a className="primary-link" href="/api/sample-portfolio">
              Scarica esempio
            </a>
            <button className="ghost-button" type="button" onClick={exportCurrentPortfolio}>
              Scarica JSON corrente
            </button>
          </div>

          <div className="toolbar-group">
            <span className="source-badge">
              Dataset attivo
              <strong>{sourceLabel}</strong>
            </span>
          </div>

          {isPending ? <p className="status-copy">Aggiornamento in corso...</p> : null}
          {!isPending && feedback ? <p className="status-copy">{feedback}</p> : null}
          {analysisError ? <p className="error-copy">{analysisError}</p> : null}
        </section>

        <section className="stats-grid">
          {summaryCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </section>

        <section className="panel">
          <div className="panel-body">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Editor portafoglio iniziale</h2>
                <p className="panel-copy">
                  Imposta da interfaccia le quote gia possedute a inizio periodo. Le modifiche
                  restano nel dataset attivo, puoi aggiungere nuovi ETF e poi esportare tutto di
                  nuovo in JSON.
                </p>
              </div>

              <div className="editor-actions">
                <button className="ghost-button" type="button" onClick={addCustomEtfDraft}>
                  Aggiungi ETF
                </button>
                <button className="ghost-button" type="button" onClick={resetInitialPositionEditor}>
                  Annulla modifiche
                </button>
                <button className="upload-label" type="button" onClick={applyInitialPortfolio}>
                  Applica portafoglio iniziale
                </button>
              </div>
            </div>

            <div className="editor-overview">
              <div className="editor-overview-card">
                <span className="editor-overview-label">ETF configurati</span>
                <strong className="editor-overview-value">
                  {configuredInitialPositions} / {initialPositionEditorState.length}
                </strong>
                <span className="editor-overview-copy">
                  Include sia gli ETF gia presenti sia quelli aggiunti da questo pannello.
                </span>
              </div>
              <div className="editor-overview-card">
                <span className="editor-overview-label">Valore iniziale in bozza</span>
                <strong className="editor-overview-value">
                  {formatCurrency(previewInitialValue, analysis.baseCurrency)}
                </strong>
                <span className="editor-overview-copy">
                  Anteprima basata su quote e prezzo inseriti nel form.
                </span>
              </div>
              <div className="editor-overview-card">
                <span className="editor-overview-label">Stato compilazione</span>
                <strong className="editor-overview-value">
                  {incompleteInitialDrafts === 0 ? "Pronta" : `${incompleteInitialDrafts} incomplete`}
                </strong>
                <span className="editor-overview-copy">
                  Applica solo quando data, quote e prezzo sono completi.
                </span>
              </div>
            </div>

            <div className="initial-editor-grid">
              {initialPositionEditorState.length === 0 ? (
                <article className="editor-empty-state">
                  <strong className="editor-card-title">Portafoglio iniziale vuoto</strong>
                  <p className="editor-card-copy">
                    Parti da 0 ETF. Usa `Aggiungi ETF`, compila i campi e poi premi `Applica
                    portafoglio iniziale`.
                  </p>
                </article>
              ) : null}

              {initialPositionEditorState.map((draft) => {
                const estimatedValue = estimateDraftValue(draft);
                const estimatedCostBasis = estimateDraftCostBasis(draft);

                return (
                  <article
                    className={`editor-card ${draft.enabled ? "editor-card-active" : "editor-card-muted"}`}
                    key={draft.id}
                  >
                    <div className="editor-card-topline">
                      <span
                        className={`editor-status-badge ${draft.enabled ? "editor-status-badge-active" : "editor-status-badge-muted"
                          }`}
                      >
                        {draft.enabled ? "Attiva" : "Spenta"}
                      </span>
                      <span className="editor-ticker-tag">{draft.ticker || "Nuovo ETF"}</span>
                    </div>

                    <div className="editor-card-head">
                      <div>
                        <strong className="editor-card-title">
                          {draft.name || "ETF aggiunto da interfaccia"}
                        </strong>
                        <p className="editor-card-copy">
                          {draft.isCustom
                            ? "Compila metadati e posizione iniziale. Dopo l'applicazione il JSON avra una cronologia minima compatibile con l'analisi."
                            : `Configura la posizione di partenza per ${draft.ticker}.`}
                        </p>
                      </div>

                      <div className="editor-card-actions">
                        {draft.isCustom ? (
                          <button
                            className="editor-inline-button"
                            type="button"
                            onClick={() => removeCustomEtfDraft(draft.id)}
                          >
                            Rimuovi
                          </button>
                        ) : null}

                        <label className={`toggle-line ${draft.enabled ? "toggle-line-on" : ""}`}>
                          <input
                            className="toggle-line-input"
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) =>
                              toggleInitialPositionDraft(draft.id, event.target.checked)
                            }
                          />
                          <span className="toggle-switch" aria-hidden="true">
                            <span className="toggle-thumb" />
                          </span>
                          <span className="toggle-text">Posizione iniziale</span>
                        </label>
                      </div>
                    </div>

                    {draft.isCustom ? (
                      <div className="editor-fields editor-fields-custom">
                        <label className="editor-field">
                          <span>Ticker</span>
                          <input
                            type="text"
                            value={draft.ticker}
                            onChange={(event) =>
                              updateInitialPositionDraft(draft.id, "ticker", event.target.value)
                            }
                          />
                        </label>

                        <label className="editor-field">
                          <span>Nome ETF</span>
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              updateInitialPositionDraft(draft.id, "name", event.target.value)
                            }
                          />
                        </label>

                        <label className="editor-field">
                          <span>ISIN</span>
                          <input
                            type="text"
                            value={draft.isin}
                            onChange={(event) =>
                              updateInitialPositionDraft(draft.id, "isin", event.target.value)
                            }
                          />
                        </label>

                        <label className="editor-field">
                          <span>Categoria</span>
                          <input
                            type="text"
                            value={draft.assetClass}
                            onChange={(event) =>
                              updateInitialPositionDraft(draft.id, "assetClass", event.target.value)
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    <div className="editor-preview">
                      <div className="editor-preview-item">
                        <span className="editor-preview-label">Valore stimato</span>
                        <strong className="editor-preview-value">
                          {estimatedValue == null
                            ? "Inserisci quote e prezzo"
                            : formatCurrency(estimatedValue, analysis.baseCurrency)}
                        </strong>
                      </div>
                      <div className="editor-preview-item">
                        <span className="editor-preview-label">Costo storico</span>
                        <strong className="editor-preview-value">
                          {estimatedCostBasis == null
                            ? "Automatico"
                            : formatCurrency(estimatedCostBasis, analysis.baseCurrency)}
                        </strong>
                      </div>
                      <div className="editor-preview-item">
                        <span className="editor-preview-label">Decorrenza</span>
                        <strong className="editor-preview-value">
                          {draft.date || "Da definire"}
                        </strong>
                      </div>
                    </div>

                    <div className="editor-fields editor-fields-primary">
                      <label className="editor-field">
                        <span>Data iniziale</span>
                        <input
                          type="date"
                          value={draft.date}
                          disabled={!draft.enabled}
                          onChange={(event) =>
                            updateInitialPositionDraft(draft.id, "date", event.target.value)
                          }
                        />
                      </label>

                      <label className="editor-field">
                        <span>Quote</span>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={draft.shares}
                          disabled={!draft.enabled}
                          onChange={(event) =>
                            updateInitialPositionDraft(draft.id, "shares", event.target.value)
                          }
                        />
                      </label>

                      <label className="editor-field">
                        <span>Prezzo iniziale</span>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={draft.price}
                          disabled={!draft.enabled}
                          onChange={(event) =>
                            updateInitialPositionDraft(draft.id, "price", event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <div className="editor-fields editor-fields-secondary">
                      <label className="editor-field">
                        <span>Costo storico</span>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={draft.costBasis}
                          disabled={!draft.enabled}
                          onChange={(event) =>
                            updateInitialPositionDraft(draft.id, "costBasis", event.target.value)
                          }
                        />
                      </label>

                      <label className="editor-field">
                        <span>Fee iniziali</span>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={draft.fees}
                          disabled={!draft.enabled}
                          onChange={(event) =>
                            updateInitialPositionDraft(draft.id, "fees", event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <p className="editor-note">
                      {draft.isCustom
                        ? "Se lasci vuoto `costo storico`, il sistema usa `quote x prezzo + fee`. Per analisi complete aggiungi poi `transactions` e `performanceHistory` nel JSON esportato."
                        : "Se lasci vuoto `costo storico`, il sistema usa `quote x prezzo + fee`."}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-body">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Editor transazioni</h2>
                <p className="panel-copy">
                  Aggiungi acquisti e vendite direttamente da interfaccia. Gli ETF appena creati in
                  bozza compariranno qui dopo l'applicazione del portafoglio iniziale.
                </p>
              </div>

              <div className="editor-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={resetTransactionEditor}
                  disabled={portfolioData.etfs.length === 0}
                >
                  Annulla transazioni
                </button>
                <button
                  className="upload-label"
                  type="button"
                  onClick={applyTransactions}
                  disabled={portfolioData.etfs.length === 0}
                >
                  Applica transazioni
                </button>
              </div>
            </div>

            <div className="editor-overview">
              <div className="editor-overview-card">
                <span className="editor-overview-label">Operazioni in bozza</span>
                <strong className="editor-overview-value">{totalTransactionDrafts}</strong>
                <span className="editor-overview-copy">
                  Somma di acquisti e vendite non ancora applicati al dataset.
                </span>
              </div>
              <div className="editor-overview-card">
                <span className="editor-overview-label">ETF con movimenti</span>
                <strong className="editor-overview-value">
                  {etfsWithTransactionDrafts} / {transactionEditorState.length}
                </strong>
                <span className="editor-overview-copy">
                  Ti aiuta a capire dove hai gia registrato operazioni.
                </span>
              </div>
              <div className="editor-overview-card">
                <span className="editor-overview-label">Stato transazioni</span>
                <strong className="editor-overview-value">
                  {portfolioData.etfs.length === 0
                    ? "Nessun ETF"
                    : totalTransactionDrafts === 0
                      ? "Vuoto"
                      : "Pronte"}
                </strong>
                <span className="editor-overview-copy">
                  Se non vedi ETF qui, applica prima il portafoglio iniziale.
                </span>
              </div>
            </div>

            {portfolioData.etfs.length === 0 ? (
              <div className="transaction-editor-grid">
                <article className="editor-empty-state">
                  <strong className="editor-card-title">Nessun ETF disponibile</strong>
                  <p className="editor-card-copy">
                    Per registrare transazioni devi prima aggiungere almeno un ETF nel portafoglio
                    iniziale e premere `Applica portafoglio iniziale`.
                  </p>
                </article>
              </div>
            ) : (
              <div className="transaction-editor-grid">
                {transactionEditorState.map((etfDraft) => {
                  const buyCount = etfDraft.transactions.filter(
                    (transactionDraft) => transactionDraft.type === "buy"
                  ).length;
                  const sellCount = etfDraft.transactions.filter(
                    (transactionDraft) => transactionDraft.type === "sell"
                  ).length;

                  return (
                    <article
                      className={`editor-card ${
                        etfDraft.transactions.length > 0 ? "editor-card-active" : "editor-card-muted"
                      }`}
                      key={etfDraft.id}
                    >
                      <div className="editor-card-topline">
                        <span
                          className={`editor-status-badge ${
                            etfDraft.transactions.length > 0
                              ? "editor-status-badge-active"
                              : "editor-status-badge-muted"
                          }`}
                        >
                          {etfDraft.transactions.length > 0 ? "Con movimenti" : "Senza movimenti"}
                        </span>
                        <span className="editor-ticker-tag">{etfDraft.ticker}</span>
                      </div>

                      <div className="editor-card-head">
                        <div>
                          <strong className="editor-card-title">{etfDraft.name}</strong>
                          <p className="editor-card-copy">
                            Registra acquisti e vendite. Le modifiche restano in bozza finche non
                            premi `Applica transazioni`.
                          </p>
                        </div>

                        <div className="editor-card-actions">
                          <button
                            className="editor-inline-button"
                            type="button"
                            onClick={() => addTransactionDraft(etfDraft.id)}
                          >
                            Aggiungi transazione
                          </button>
                        </div>
                      </div>

                      <div className="editor-preview">
                        <div className="editor-preview-item">
                          <span className="editor-preview-label">Operazioni</span>
                          <strong className="editor-preview-value">
                            {etfDraft.transactions.length}
                          </strong>
                        </div>
                        <div className="editor-preview-item">
                          <span className="editor-preview-label">Acquisti</span>
                          <strong className="editor-preview-value">{buyCount}</strong>
                        </div>
                        <div className="editor-preview-item">
                          <span className="editor-preview-label">Vendite</span>
                          <strong className="editor-preview-value">{sellCount}</strong>
                        </div>
                      </div>

                      <div className="transaction-list">
                        {etfDraft.transactions.length === 0 ? (
                          <div className="transaction-empty-state">
                            Nessuna transazione in bozza per {etfDraft.ticker}.
                          </div>
                        ) : null}

                        {etfDraft.transactions.map((transactionDraft, index) => (
                          <div className="transaction-row" key={transactionDraft.id}>
                            <div className="transaction-row-head">
                              <strong>Operazione {index + 1}</strong>
                              <button
                                className="editor-inline-button"
                                type="button"
                                onClick={() =>
                                  removeTransactionDraft(etfDraft.id, transactionDraft.id)
                                }
                              >
                                Rimuovi
                              </button>
                            </div>

                            <div className="editor-fields transaction-fields">
                              <label className="editor-field">
                                <span>Data</span>
                                <input
                                  type="date"
                                  value={transactionDraft.date}
                                  onChange={(event) =>
                                    updateTransactionDraft(
                                      etfDraft.id,
                                      transactionDraft.id,
                                      "date",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>

                              <label className="editor-field">
                                <span>Tipo</span>
                                <select
                                  value={transactionDraft.type}
                                  onChange={(event) =>
                                    updateTransactionDraft(
                                      etfDraft.id,
                                      transactionDraft.id,
                                      "type",
                                      event.target.value
                                    )
                                  }
                                >
                                  <option value="buy">buy</option>
                                  <option value="sell">sell</option>
                                </select>
                              </label>

                              <label className="editor-field">
                                <span>Quote</span>
                                <input
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  value={transactionDraft.shares}
                                  onChange={(event) =>
                                    updateTransactionDraft(
                                      etfDraft.id,
                                      transactionDraft.id,
                                      "shares",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>

                              <label className="editor-field">
                                <span>Prezzo</span>
                                <input
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  value={transactionDraft.price}
                                  onChange={(event) =>
                                    updateTransactionDraft(
                                      etfDraft.id,
                                      transactionDraft.id,
                                      "price",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>

                              <label className="editor-field">
                                <span>Fee</span>
                                <input
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  value={transactionDraft.fees}
                                  onChange={(event) =>
                                    updateTransactionDraft(
                                      etfDraft.id,
                                      transactionDraft.id,
                                      "fees",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {hasTrackedEtfs ? (
          <>
            <section className="content-grid">
              <article className="panel">
                <div className="panel-body">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Traiettoria del portafoglio</h2>
                      <p className="panel-copy">
                        Confronto fra ricchezza cumulata e contributi netti. La linea piena somma
                        valore attuale, vendite e dividendi incassati.
                      </p>
                    </div>

                    <div className="legend">
                      <span className="legend-chip">
                        <span className="legend-dot" style={{ background: "var(--text)" }} />
                        Ricchezza
                      </span>
                      <span className="legend-chip">
                        <span className="legend-dot" style={{ background: "var(--accent)" }} />
                        Contributi netti
                      </span>
                    </div>
                  </div>

                  <PerformanceChart data={analysis.history} currency={analysis.baseCurrency} />
                </div>
              </article>

              <article className="panel">
                <div className="panel-body">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Allocazione corrente</h2>
                      <p className="panel-copy">
                        Peso attuale delle posizioni aperte sul valore complessivo del portafoglio.
                      </p>
                    </div>
                  </div>

                  <div className="allocation-list">
                    {analysis.allocation.map((item) => (
                      <div className="allocation-row" key={item.id}>
                        <div className="allocation-head">
                          <strong>{item.ticker}</strong>
                          <span>{formatPercent(item.weight)}</span>
                        </div>
                        <div className="allocation-track" aria-hidden="true">
                          <div className="allocation-fill" style={{ width: `${item.weight * 100}%` }} />
                        </div>
                        <span className="allocation-name">
                          {item.name} · {formatCurrency(item.currentValue, analysis.baseCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </section>

            <section className="content-grid">
              <article className="panel">
                <div className="panel-body">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Drawdown del portafoglio</h2>
                      <p className="panel-copy">
                        Mostra quanto il portafoglio si e allontanato dai suoi massimi nel tempo. E
                        utile per visualizzare la profondita e la durata delle fasi di stress.
                      </p>
                    </div>
                  </div>

                  <PortfolioDrawdownChart data={analysis.history} />
                </div>
              </article>

              <article className="panel">
                <div className="panel-body">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Rischio vs rendimento</h2>
                      <p className="panel-copy">
                        Confronta gli ETF per volatilita annua e rendimento annualizzato. Le bolle piu
                        grandi pesano di piu sul valore attuale del portafoglio.
                      </p>
                    </div>
                  </div>

                  <PortfolioRiskReturnChart etfs={analysis.etfs} />
                </div>
              </article>
            </section>

            <section className="panel">
              <div className="panel-body">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Confronto crescita ETF</h2>
                    <p className="panel-copy">
                      Normalizza l'andamento dei principali ETF e rende immediato vedere quali stanno
                      guidando la performance e quali stanno restando indietro.
                    </p>
                  </div>
                </div>

                <PortfolioEtfComparisonChart etfs={analysis.etfs} />
              </div>
            </section>

            <section className="content-grid">
              <article className="panel">
                <div className="panel-body">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Indicatori rapidi</h2>
                      <p className="panel-copy">
                        Un riepilogo delle posizioni che stanno guidando rischio e rendimento.
                      </p>
                    </div>
                  </div>

                  <div className="insight-list">
                    <div className="insight-row">
                      <span className="insight-label">ETF migliore per TWR</span>
                      <strong>
                        {analysis.bestPerformer.ticker} · {formatPercent(analysis.bestPerformer.timeWeightedReturn)}
                      </strong>
                    </div>
                    <div className="insight-row">
                      <span className="insight-label">ETF peggiore per TWR</span>
                      <strong>
                        {analysis.worstPerformer.ticker} · {formatPercent(analysis.worstPerformer.timeWeightedReturn)}
                      </strong>
                    </div>
                    <div className="insight-row">
                      <span className="insight-label">Maggiore contributo al profitto</span>
                      <strong>
                        {analysis.topProfitContributor.ticker} ·{" "}
                        {formatCurrency(analysis.topProfitContributor.totalProfit, analysis.baseCurrency)}
                      </strong>
                    </div>
                    <div className="insight-row">
                      <span className="insight-label">ETF piu volatile</span>
                      <strong>
                        {analysis.mostVolatile.ticker} · {formatPercent(analysis.mostVolatile.volatility)}
                      </strong>
                    </div>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-body">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Metadati del dataset</h2>
                      <p className="panel-copy">
                        Informazioni utili per capire copertura temporale e densita del JSON caricato.
                      </p>
                    </div>
                  </div>

                  <div className="meta-list">
                    <div className="meta-row">
                      <span className="meta-label">Portafoglio</span>
                      <strong>{analysis.name}</strong>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Valuta base</span>
                      <strong>{analysis.baseCurrency}</strong>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Finestra storica</span>
                      <strong>
                        {formatDateLabel(analysis.firstDate)} - {formatDateLabel(analysis.lastDate)}
                      </strong>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">ETF tracciati</span>
                      <strong>{analysis.etfCount}</strong>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Portafoglio iniziale</span>
                      <strong>
                        {formatCurrency(analysis.initialPortfolioMarketValue, analysis.baseCurrency)}
                      </strong>
                    </div>
                    {analysis.initialPortfolioDate ? (
                      <div className="meta-row">
                        <span className="meta-label">Data iniziale</span>
                        <strong>{formatDateLabel(analysis.initialPortfolioDate)}</strong>
                      </div>
                    ) : null}
                    <div className="meta-row">
                      <span className="meta-label">Punti storici totali</span>
                      <strong>{formatNumber(analysis.historyPoints)}</strong>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Contributi lordi</span>
                      <strong>{formatCurrency(analysis.totalContributed, analysis.baseCurrency)}</strong>
                    </div>
                    {analysis.notes ? (
                      <div className="meta-row">
                        <span className="meta-label">Note</span>
                        <strong>{analysis.notes}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            </section>

            <section className="panel">
              <div className="panel-body">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Analisi ETF</h2>
                    <p className="panel-copy">
                      Per ogni strumento sono mostrati valore, rendimento, rischio e impatto sul
                      portafoglio attuale.
                    </p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="portfolio-table">
                    <thead>
                      <tr>
                        <th>Strumento</th>
                        <th>Quote</th>
                        <th>Valore attuale</th>
                        <th>Profitto totale</th>
                        <th>TWR</th>
                        <th>Totale %</th>
                        <th>Volatilita</th>
                        <th>Drawdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.etfs.map((etf) => (
                        <tr key={etf.id}>
                          <td>
                            <strong>{etf.ticker}</strong>
                            <span className="instrument-meta">{etf.name}</span>
                            <span className="instrument-meta">
                              {etf.isin ? `${etf.isin} · ` : ""}
                              {etf.assetClass}
                            </span>
                            {etf.initialPosition ? (
                              <span className="instrument-meta">
                                Iniziale {formatNumber(etf.initialPosition.shares)} quote da{" "}
                                {formatDateLabel(etf.initialPosition.date)}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <strong>{formatNumber(etf.shares)}</strong>
                            <span className="instrument-meta">
                              Prezzo {formatCurrency(etf.currentPrice, analysis.baseCurrency)}
                            </span>
                          </td>
                          <td>
                            <strong>{formatCurrency(etf.currentValue, analysis.baseCurrency)}</strong>
                            <span className="instrument-meta">
                              <span className="pill">{formatPercent(etf.weight)}</span>
                            </span>
                          </td>
                          <td className={toneClass(etf.totalProfit)}>
                            <strong>{formatCurrency(etf.totalProfit, analysis.baseCurrency)}</strong>
                            <span className="instrument-meta">
                              Realizzato {formatCurrency(etf.realizedPnL, analysis.baseCurrency)}
                            </span>
                          </td>
                          <td className={toneClass(etf.timeWeightedReturn)}>
                            <strong>{formatPercent(etf.timeWeightedReturn)}</strong>
                            <span className="instrument-meta">
                              Annuo {formatPercent(etf.annualizedReturn)}
                            </span>
                          </td>
                          <td className={toneClass(etf.totalReturn)}>
                            <strong>{formatPercent(etf.totalReturn)}</strong>
                            <span className="instrument-meta">
                              Dividendi {formatCurrency(etf.dividendsReceived, analysis.baseCurrency)}
                            </span>
                          </td>
                          <td>
                            <strong>{formatPercent(etf.volatility)}</strong>
                            <span className="instrument-meta">
                              Fee {formatCurrency(etf.feesPaid, analysis.baseCurrency)}
                            </span>
                          </td>
                          <td className={toneClass(-etf.maxDrawdown)}>
                            <strong>{formatPercent(-etf.maxDrawdown)}</strong>
                            <span className="instrument-meta">
                              Costo residuo {formatCurrency(etf.costBasis, analysis.baseCurrency)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="panel">
            <div className="panel-body empty-state">
              <h2 className="panel-title">Portafoglio vuoto</h2>
              <p className="panel-copy">
                L'app parte con 0 ETF. Aggiungi il primo strumento dal pannello qui sopra, compila
                la posizione iniziale e premi `Applica portafoglio iniziale`.
              </p>
              <p className="panel-copy">
                Quando avrai almeno un ETF, grafici, allocazione e tabella analitica compariranno
                automaticamente.
              </p>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-body">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Schema JSON consigliato</h2>
                <p className="panel-copy">
                  Per statistiche affidabili conviene memorizzare portafoglio iniziale, flussi di
                  acquisto/vendita e serie storica dei prezzi. Il campo `dividend` e opzionale ma
                  utile per ETF a distribuzione. Gli ETF aggiunti dall'editor partono invece con
                  una cronologia minima, da arricchire poi nel JSON.
                </p>
              </div>
            </div>

            <div className="schema-grid">
              <div>
                <ol className="schema-list">
                  <li>`portfolio.name` e `portfolio.baseCurrency` identificano il portafoglio.</li>
                  <li>`initialPosition` definisce quote gia presenti all'inizio del periodo.</li>
                  <li>`transactions` serve per ricostruire contributi, costi, vendite e P/L.</li>
                  <li>`performanceHistory` serve per TWR, volatilita, drawdown e grafici.</li>
                  <li>`dividend` permette di includere cash flow distribuiti dagli ETF.</li>
                  <li>`costBasis` nell'initialPosition conserva il costo storico delle quote.</li>
                  <li>`fees` evita di sovrastimare i rendimenti netti.</li>
                  <li>L'editor puo aggiungere nuovi ETF, ma conviene completare poi lo storico.</li>
                </ol>
              </div>

              <pre className="code-block">
                <code>{schemaSnippet}</code>
              </pre>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
