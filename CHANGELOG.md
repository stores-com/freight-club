# Changelog

## 0.0.4

- Check the content type before the status. 0.0.3 only checked a 200, so an HTML error page served at a 404 still reached `HttpError` and came back as `err.text`.

## 0.0.3

- Refuse a 200 that is not JSON, naming the content type and the URL that answered. Error pages arrive with a 200, and a whole marketing page was once printed as the reason there were no freight quotes.

## 0.0.2

- No functional changes; first release published from CI

## 0.0.1

- Initial release, covering Freight Club API Documentation version 2.4: `bookShipment`, `cancelShipment`, `downloadBol`, `exportOrders`, `getBol`, `getLabel`, `getOrderStatus`, `getRate`, `getRates` and `getShipmentTracking`
