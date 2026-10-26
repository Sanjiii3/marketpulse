# MarketPulse — Financial News Terminal

A deployable Node.js + Express starter for financial and crypto headlines, trusted-source filtering, headline-based AI impact analysis, browser alerts, and an economic-calendar integration.

## What works in this build
- News discovery through GDELT's public DOC API, refreshed every 60 seconds while the page is open.
- Categories: economy, Forex, Gold, crypto, Fed, geopolitics.
- Trusted publisher filter (Reuters, Bloomberg, CNBC, FT, WSJ, MarketWatch, Investing.com, CoinDesk, The Block, Cointelegraph, AP, BBC). Publisher availability depends on the provider; the filter does not certify factual accuracy.
- AI headline analysis for Gold, USD, and Bitcoin using OpenAI's API, when configured.
- Browser notifications for selected headline keywords while the website tab remains open.
- Economic calendar endpoint via Finnhub, when configured, showing actual, estimate/forecast, and previous values.
- Responsive interface and links to TradingView charts. This starter does not include a licensed real-time price feed.

## Run locally
Requires Node.js 20+.

```bash
npm install
cp .env.example .env
# Edit .env and add API keys as desired
npm start
```
Then open `http://localhost:3000`.

## API keys
- `OPENAI_API_KEY`: Create an API key in the OpenAI platform billing/API dashboard. AI analysis is metered and may incur charges. Set `OPENAI_MODEL` to a model available to your account. Keep the key in server environment variables only.
- `FINNHUB_API_KEY`: Sign up at https://finnhub.io/ and use its economic-calendar API. Check the provider's current plan, quotas, licensing, and field definitions before production use.
- News: GDELT DOC API is used without a key in this starter. Availability and update latency are not guaranteed. GDELT is not a substitute for licensed Reuters/Bloomberg terminal access.

## Deploy online (Render example)
1. Put this folder in a GitHub repository.
2. Create a Web Service at https://render.com/ and connect the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in the host dashboard: `OPENAI_API_KEY`, `OPENAI_MODEL`, `FINNHUB_API_KEY`.
6. Deploy and open the HTTPS URL provided by Render. No secrets belong in the browser files.

Other Node-compatible hosts such as Railway or a VPS can also run it. The host must support outbound HTTPS requests. A static-only host cannot run `server.js` unless the API endpoints are moved to serverless functions.

## Important production gaps
- Alerts currently run only while the page is open; they are not server-side push notifications.
- News feed updates are polling-based and provider-dependent, not guaranteed instant breaking news.
- Calendar provider availability/limits can change; verify its current API documentation and commercial terms.
- For real-time XAU/USD, BTC/USD, and DXY prices, integrate a market-data provider and confirm its latency, exchange coverage, and redistribution rights.
- For production, add caching/rate limits, logging, uptime monitoring, security headers, and a persistent store if users need personal alert preferences.
- AI sentiment is a headline-based estimate, not a guaranteed price forecast or trading advice.
