# Changelog

## 0.0.4

- Check the content type before the status, and name the URL that was requested. 0.0.3 only guarded a 200, so a web page served at a 404 still reached `HttpError`, which reads the body — 200kB of markup in `err.text`, printed by a consumer. The check now runs first, but only when a type is declared, because Freight Club's own 401 and 405 carry none and belong to `HttpError`. The message says what was asked for rather than where a redirect ended up: `Freight Club answered https://api.freightclub.com/Rate/GetRates with text/html;charset=utf-8 rather than JSON, from https://www.freightclub.com/404.`

## 0.0.3

- Refuse a 200 that is not JSON, naming the content type and the URL that answered. Error pages arrive with a 200, and a whole marketing page was once printed as the reason there were no freight quotes.

## 0.0.2

- No functional changes; first release published from CI

## 0.0.1

- Initial release, covering Freight Club API Documentation version 2.4: `bookShipment`, `cancelShipment`, `downloadBol`, `exportOrders`, `getBol`, `getLabel`, `getOrderStatus`, `getRate`, `getRates` and `getShipmentTracking`
