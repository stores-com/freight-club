# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js SDK for the Freight Club API. It provides a JavaScript interface for LTL and parcel shipping operations including rate quoting, booking, Bill of Lading and label retrieval, tracking, cancellation and order export.

Freight Club's API documentation: https://api.freightclub.com/ApiDoc/index

## Development Commands

### Testing
- `npm test` - Run all tests using the built-in `node:test` runner
- `npm run test:only` - Run only tests marked with `{ only: true }`
- `npm run coveralls` - Do not use this locally. Its final `coveralls < lcov.info` step needs a
  `coveralls` binary that is not declared in either dependency list, so it fails with
  command-not-found. CI does not run this script either; it uploads with `coverallsapp/github-action`.
- For a local coverage report: `node --test --test-force-exit --experimental-test-coverage test`
- To run tests matching a pattern: `node --test --test-force-exit --test-name-pattern "pattern" test`
- Always keep `--test-force-exit`. Do not add `--test-concurrency`.

### Linting
- `npx eslint .` - Run ESLint on the entire codebase
- ESLint configuration uses the new flat config format (eslint.config.js)

## Architecture

### Core Module Structure
The SDK is a single constructor function, `FreightClub` in index.js, with every API method
assigned to `this`. It is not an ES class; there is no `class` keyword in the file.

### Key Components:

1. **Authentication**
   - A static, long-lived API token issued by Freight Club (requested under Manage API Tokens in
     their application). There is no token exchange, refresh or caching — every request sends
     `Authorization: Bearer <api_token>`.
   - The constructor takes the token as `api_token`, without the `Bearer ` prefix.

2. **API Methods** - Every method is an `async function` and returns a promise.

   - `bookShipment()` - Book a shipment at a specific quoted rate (POST /Book/BookShipment)
   - `cancelShipment()` - Cancel before carrier pickup (GET /Cancel/CancelShipment/{confirmationNumber})
   - `downloadBol()` - Download the Bill of Lading document as a Buffer, not JSON (GET /Bol/DownloadBol/{confirmationNumber})
   - `exportOrders()` - Export booked orders, up to a 30-day window (GET /api/orders/export)
   - `getBol()` - Bill of Lading details for LTL shipments (GET /Bol/GetBol/{confirmationNumber})
   - `getLabel()` - Shipping label after booking (GET /Label/GetLabel/{confirmationNumber})
   - `getOrderStatus()` - Order status with shipping dates (GET /api/orders/orderstatus)
   - `getRate()` - Quotes for one Service Level (POST /Rate/GetRate)
   - `getRates()` - Quotes for all Service Levels (POST /Rate/GetRates)
   - `getShipmentTracking()` - Tracking events (GET /api/tracking/ShipmentTracking)

3. **Error Handling**
   - A non-200 response throws an `@stores.com/http-error` `HttpError`
   - `err.message` is `"<status> <statusText>"`; the status is on `err.cause.status`; the body is
     on `err.json` and `err.text`
   - Errors raised before a response exists (unparseable URL, network failure, timeout) are
     whatever `fetch` threw, and have no `cause.status`

### Dependencies
- `@stores.com/http-error` - Error class for non-ok fetch responses

HTTP requests use the built-in `fetch`, so Node.js 18 or later is required and there is no HTTP
dependency. Every request carries `signal: AbortSignal.timeout(_options.timeout || options.timeout)`,
so a per-call `timeout` option wins over the constructor value, which defaults to 60000ms — Freight
Club's rating calls fan out to its carrier network and wait up to 40 seconds (the `maxTime` default)
for the slowest carrier, so don't lower the default below that.

### Testing
- `node:test` with `node:assert`
- Tests located in test/index.js
- Coverage reporting via Coveralls in CI/CD. Coveralls fails the build on any coverage decrease,
  so keep index.js fully covered
- Every test runs against the live Freight Club sandbox API, concurrently, using the testing
  token Freight Club publishes in its API documentation (hardcoded in test/index.js). There are
  no mocks or echo servers. Sandbox rates do not reflect production pricing; sandbox bookings go
  to "FC Test Carrier" and never create live orders
- The lifecycle test rates, books, retrieves the BOL/label/status/export, and cancels one
  sandbox order per run. Unauthorized-request tests use an invalid token and get a real 401
- Booking latency is highly variable: 15 seconds to over 60 seconds. The lifecycle passes
  `{ timeout: 180000 }` to `bookShipment` and the suite timeout is 240000 — a parent timeout
  that expires cancels children, which reports as `fail 0` with exit code 1
- A client-side timeout does NOT roll back the booking: the order can still be created
  server-side (bookings are not idempotent). If a lifecycle run dies mid-test, find the orphan
  via `exportOrders`, get its `ConfirmationNumber` from `getOrderStatus`, and `cancelShipment` it

### Sandbox behavior learned the hard way (all verified live)
- Rate requests require a `ServiceLevel` (Error Code 9036) — even GetRates, which the API
  documentation implies rates all service levels without one
- Booking requires a contact `Email` (Error Code 13010) despite the documentation marking it
  optional
- `exportOrders` requires `from` and `to` despite the documentation saying no-parameter returns
  the current day, and `to` is EXCLUSIVE: `from=today, to=today` returns nothing
- DownloadBol streams the raw document (`%PDF`), not JSON — hence `downloadBol` returns a Buffer
- No shipment has tracking data, including the documentation's own example (Error Code 8100),
  so tracking tests assert the error contract
- The rate response echoes the reference as `OrderReferenceId` (lowercase d); booking and order
  status echo `OrderReferenceID`; `exportOrders` calls it `CustomerPONumber`
- An invalid token returns a plain 401 Unauthorized

## API Configuration

The SDK requires:
- `api_token` - Freight Club API token (the testing token from the API documentation works for sandbox development)
- `timeout` - Milliseconds before a request is aborted (defaults to 60000, overridable per call)
- `url` - API endpoint (defaults to https://api.freightclub.com)

## CI/CD

GitHub Actions workflow (.github/workflows/test.yml):
- Runs on push, PR, and manual dispatch
- Node.js 24.11.0
- Executes linting, testing, and coverage reporting
- Sends Slack notifications for build status
