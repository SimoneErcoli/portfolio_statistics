# Portfolio Statistics

Dashboard Next.js per analizzare un portafoglio di ETF partendo da un file JSON con:

- metadati del portafoglio
- portafoglio iniziale opzionale per ETF gia presenti o aggiunti dall'editor
- transazioni di acquisto/vendita
- storico prezzi/performance per ogni ETF
- dividendi opzionali per rendimenti piu accurati

## Avvio

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`.

All'avvio l'app parte da un portafoglio vuoto con `0` ETF, cosi l'utente puo costruirlo da interfaccia. Il dataset di esempio resta scaricabile da `/api/sample-portfolio`.

Da interfaccia puoi:
- aggiungere ETF al portafoglio iniziale
- aggiungere transazioni `buy` e `sell` agli ETF gia presenti nel dataset attivo

## Struttura del JSON

Ogni ETF deve contenere almeno:

```json
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
```

`initialPosition` e opzionale e serve per rappresentare un ETF gia presente nel portafoglio all'inizio del periodo osservato.

Dall'interfaccia puoi anche aggiungere nuovi ETF direttamente nell'editor del portafoglio iniziale. In quel caso il JSON esportato include una `performanceHistory` minima con un solo punto coerente col prezzo iniziale; per metriche complete conviene poi arricchire manualmente lo storico e le eventuali transazioni.

- `date`: data iniziale del portafoglio per quell'ETF
- `shares`: quote gia detenute
- `price`: prezzo/valore usato come base iniziale del periodo
- `costBasis`: costo storico totale delle quote iniziali, utile per calcolare il profitto complessivo reale

Se `costBasis` non viene fornito, il sistema usa `shares * price` piu eventuali `fees`.

Il progetto include un dataset di esempio in `src/data/sample-portfolio.json`, scaricabile anche da `/api/sample-portfolio`.

## Metriche calcolate

- valore corrente del portafoglio
- ricchezza complessiva incluse vendite e dividendi incassati
- valore del portafoglio iniziale
- rendimento totale
- rendimento time-weighted
- rendimento annualizzato
- volatilita annualizzata
- max drawdown
- analisi per singolo ETF: quote, costo residuo, P/L realizzato e non realizzato, contributo, allocazione

## Nota

Il dataset incluso e illustrativo e non rappresenta una fonte di mercato ufficiale.
