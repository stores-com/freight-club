# Changelog

## 0.0.3

- Refuse a redirect instead of following it. `fetch` follows one by default and rewrites a POST into a GET doing it, so a retired endpoint answered as a 200 carrying a web page rather than as a failure — `/Rate/GetRates` began answering 301 to the marketing site's 404 in October 2026, and a rate quote read as unparseable HTML. A 3xx now throws `Freight Club redirected <url> to <location>. The endpoint has moved.`

## 0.0.2

- No functional changes; first release published from CI

## 0.0.1

- Initial release, covering Freight Club API Documentation version 2.4: `bookShipment`, `cancelShipment`, `downloadBol`, `exportOrders`, `getBol`, `getLabel`, `getOrderStatus`, `getRate`, `getRates` and `getShipmentTracking`
