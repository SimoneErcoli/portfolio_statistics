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
import { PerformanceChart } from "./performance-chart";

const schemaSnippet = `{
  "portfolio": {
    "name": "ETF Core Portfolio",
    "baseCurrency": "EUR"
  },
  "etfs": [
    {
      "id": "vwce",
      "ticker": "VWCE",
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

function buildInitialPositionEditorState(portfolioData) {
  return portfolioData.etfs.map((etf) => ({
    id: etf.id,
    ticker: etf.ticker,
    name: etf.name,
    enabled: Boolean(etf.initialPosition),
    date: etf.initialPosition?.date ?? getSuggestedInitialDate(etf),
    shares:
      etf.initialPosition?.shares != null ? String(etf.initialPosition.shares) : "",
    price: etf.initialPosition?.price != null ? String(etf.initialPosition.price) : "",
    costBasis:
      etf.initialPosition?.costBasis != null ? String(etf.initialPosition.costBasis) : "",
    fees: etf.initialPosition?.fees != null ? String(etf.initialPosition.fees) : ""
  }));
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

function buildPortfolioWithInitialPositions(portfolioData, initialPositionEditorState) {
  const draftsById = new Map(initialPositionEditorState.map((draft) => [draft.id, draft]));

  return {
    ...portfolioData,
    etfs: portfolioData.etfs.map((etf) => {
      const draft = draftsById.get(etf.id);

      if (!draft || !draft.enabled) {
        const { initialPosition, ...etfWithoutInitialPosition } = etf;
        return etfWithoutInitialPosition;
      }

      if (!draft.date.trim()) {
        throw new Error(`Inserisci una data iniziale per ${draft.ticker}.`);
      }

      const shares = normalizeOptionalNumber(draft.shares, `Le quote iniziali di ${draft.ticker}`);
      const price = normalizeOptionalNumber(draft.price, `Il prezzo iniziale di ${draft.ticker}`);

      if (shares == null || shares <= 0) {
        throw new Error(`Le quote iniziali di ${draft.ticker} devono essere maggiori di zero.`);
      }

      if (price == null || price <= 0) {
        throw new Error(`Il prezzo iniziale di ${draft.ticker} deve essere maggiore di zero.`);
      }

      const costBasis = normalizeOptionalNumber(
        draft.costBasis,
        `Il costo storico iniziale di ${draft.ticker}`
      );
      const fees = normalizeOptionalNumber(draft.fees, `Le fee iniziali di ${draft.ticker}`);

      if (costBasis != null && costBasis < 0) {
        throw new Error(`Il costo storico iniziale di ${draft.ticker} non puo essere negativo.`);
      }

      if (fees != null && fees < 0) {
        throw new Error(`Le fee iniziali di ${draft.ticker} non possono essere negative.`);
      }

      return {
        ...etf,
        initialPosition: {
          date: draft.date.trim(),
          shares,
          price,
          ...(costBasis != null ? { costBasis } : {}),
          ...(fees != null ? { fees } : {})
        }
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
  const [portfolioData, setPortfolioData] = useState(sampleData);
  const [initialPositionEditorState, setInitialPositionEditorState] = useState(() =>
    buildInitialPositionEditorState(sampleData)
  );
  const [sourceLabel, setSourceLabel] = useState("Dataset di esempio");
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
        setInitialPositionEditorState(buildInitialPositionEditorState(parsed));
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

  function resetToSample() {
    startTransition(() => {
      setPortfolioData(sampleData);
      setInitialPositionEditorState(buildInitialPositionEditorState(sampleData));
      setSourceLabel("Dataset di esempio");
      setFeedback("Ripristinato il dataset dimostrativo incluso nel progetto.");
      setError("");
    });
  }

  function updateInitialPositionDraft(etfId, field, value) {
    setInitialPositionEditorState((currentState) =>
      currentState.map((draft) => (draft.id === etfId ? { ...draft, [field]: value } : draft))
    );
  }

  function toggleInitialPositionDraft(etfId, enabled) {
    const etf = portfolioData.etfs.find((currentEtf) => currentEtf.id === etfId);

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
    setInitialPositionEditorState(buildInitialPositionEditorState(portfolioData));
    setFeedback("Campi del portafoglio iniziale riallineati al dataset corrente.");
    setError("");
  }

  function applyInitialPortfolio() {
    try {
      const nextPortfolioData = buildPortfolioWithInitialPositions(
        portfolioData,
        initialPositionEditorState
      );
      const validated = analyzePortfolio(nextPortfolioData);

      startTransition(() => {
        setPortfolioData(nextPortfolioData);
        setInitialPositionEditorState(buildInitialPositionEditorState(nextPortfolioData));
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

  function exportCurrentPortfolio() {
    const baseName =
      sourceLabel.toLowerCase().endsWith(".json")
        ? sourceLabel.slice(0, -5)
        : sourceLabel.replace(/\s+/g, "-").toLowerCase();

    downloadJsonFile(`${baseName || "portfolio"}-edited.json`, portfolioData);
    setFeedback("JSON corrente esportato con le posizioni iniziali impostate da interfaccia.");
    setError("");
  }

  if (!analysis) {
    return (
      <main className="page-shell">
        <section className="hero">
          <p className="eyebrow">ETF Portfolio Observatory</p>
          <h1>Statistiche chiare dal tuo JSON</h1>
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

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">ETF Portfolio Observatory</p>
        <h1>Statistiche chiare dal tuo JSON</h1>
        <p className="hero-copy">
          Carica un file JSON che tenga traccia di portafoglio iniziale, transazioni, prezzi di
          chiusura e dividendi degli ETF. La dashboard ricostruisce la cronologia del portafoglio
          e produce metriche piu affidabili rispetto a un semplice snapshot finale.
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
            <button className="ghost-button" type="button" onClick={resetToSample}>
              Ripristina esempio
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
                  restano nel dataset attivo e puoi esportarle di nuovo in JSON.
                </p>
              </div>

              <div className="editor-actions">
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
                  Attiva solo le posizioni gia presenti prima del periodo osservato.
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
                        className={`editor-status-badge ${
                          draft.enabled ? "editor-status-badge-active" : "editor-status-badge-muted"
                        }`}
                      >
                        {draft.enabled ? "Attiva" : "Spenta"}
                      </span>
                      <span className="editor-ticker-tag">{draft.ticker}</span>
                    </div>

                    <div className="editor-card-head">
                      <div>
                        <strong className="editor-card-title">{draft.name}</strong>
                        <p className="editor-card-copy">Configura la posizione di partenza per {draft.ticker}.</p>
                      </div>

                      <label className={`toggle-line ${draft.enabled ? "toggle-line-on" : ""}`}>
                        <input
                          className="toggle-line-input"
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) => toggleInitialPositionDraft(draft.id, event.target.checked)}
                        />
                        <span className="toggle-switch" aria-hidden="true">
                          <span className="toggle-thumb" />
                        </span>
                        <span className="toggle-text">Posizione iniziale</span>
                      </label>
                    </div>

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
                      Se lasci vuoto `costo storico`, il sistema usa `quote x prezzo + fee`.
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

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

        <section className="panel">
          <div className="panel-body">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Schema JSON consigliato</h2>
                <p className="panel-copy">
                  Per statistiche affidabili conviene memorizzare portafoglio iniziale, flussi di
                  acquisto/vendita e serie storica dei prezzi. Il campo `dividend` e opzionale ma
                  utile per ETF a distribuzione.
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
