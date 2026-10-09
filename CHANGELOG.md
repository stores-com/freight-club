# Changelog

## 0.0.3

- Refuse an answer the client cannot trust. Redirects are still followed, but a 301, 302 or 303 rewrites a POST into a GET and drops the body, so the request never reaches an endpoint — a redirected non-200 now says so and names where it landed. And a 200 that is not JSON is refused by content type rather than by a parse error naming a character offset: `/Rate/GetRates` began answering 301 to the marketing site's 404 in October 2026, and the page arrived under a purchase order as the reason there were no freight quotes.

## 0.0.2

- No functional changes; first release published from CI

## 0.0.1

- Initial release, covering Freight Club API Documentation version 2.4: `bookShipment`, `cancelShipment`, `downloadBol`, `exportOrders`, `getBol`, `getLabel`, `getOrderStatus`, `getRate`, `getRates` and `getShipmentTracking`
