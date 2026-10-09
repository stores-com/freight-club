# Changelog

## 0.0.3

- Refuse a 200 that is not JSON. A gateway's error page, a WAF challenge and a marketing site all arrive with one, and `res.json()` on any of them throws a parse error naming a character offset — in October 2026 a whole Squarespace page was printed under a purchase order as the reason there were no freight quotes. The error now names the content type and the URL that answered, which is not always the one that was asked for.

## 0.0.2

- No functional changes; first release published from CI

## 0.0.1

- Initial release, covering Freight Club API Documentation version 2.4: `bookShipment`, `cancelShipment`, `downloadBol`, `exportOrders`, `getBol`, `getLabel`, `getOrderStatus`, `getRate`, `getRates` and `getShipmentTracking`
