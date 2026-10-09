const assert = require('node:assert');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');

const HttpError = require('@stores.com/http-error');

const FreightClub = require('../index');

// The sandbox testing token Freight Club publishes in its API documentation
const apiToken = 'dqhMY4nwmlADEoOHJ1IkYhnT3arc9aZSMYC4iOlYVNz6jFMqwhLWgTEheQLeMRQqlzHtKhNYZeDG0j8INN0GYAZ2ZqR7HCsVwMZQbIw9knXVY5vAy5Kh7CKp3qhPuNrUxpOvhpu19zvb6xLx5bYL4Lk2g_6XtgUqYlweGw2dKZTIJy3WGhOlkrGOAJFjd-Bt_gXTFT4AZAfs9-1xZ8jKQQMXlWyn3OvI_O-mxKtycWFdy-XzMQ1_1bhOTXmb_fWf2vVOfkT4GXdCkgbsKgbQOHlid8LE-qgNJfEPw3tRqrlRzz8IfdHwpPBjm9qINYaUuj7VxYDjJISRE67m6d9v9Zt5IAQjk4hSp_k5YmPrudazuK_leLILjlBwyZBsy_ObmhvXdEwVqrTxAmBoe4EjOao1qF9igfusQ_NOVmI0FWc7X56Ju907qdc6g9ZMWac5qsaeC-te6F2JEKjyQfBc6l4Qxu-Q_ioSt1uBdOVNLhEADYlUyM49hFuBEvrLlAxklt3Z7qrdmqolGpBYfmKYNVQ8PSD0IGnCVgWiKPZSIVxeiukXy-MhJcUkGUCplPAAcLB952BxuNUGZH5as0xh-ces6_Rid2pbqpnbZ1W1dOXrnCCqbIgnwJi6c8v53cHJoUUbQjjqerJ8QC2_eWWjCiuoDtfRj5ODUcO2Ogeh3EdbjHVUrZ3KwfC7lKCCWpOXeo1uTO6noHQyEyBQW_R3AKWAjpl-r-om2VgQKkJRkFs';

const freightClub = new FreightClub({ api_token: apiToken });

// Sandbox bookings go to "FC Test Carrier" and never create live orders. The sandbox requires a
// ServiceLevel on every rate request (Error Code 9036) and a contact Email at booking (Error
// Code 13010), and has tracking data for no shipment (Error Code 8100).
const box = {
    Category: 'CasedGoodsFurniture',
    DeclaredValue: { Unit: 'USD', Value: 500 },
    Description: 'Pack of 4',
    Dimension: { Height: 10, Length: 10, Unit: 'Inch', Width: 10 },
    Quantity: 1,
    Sku: 'SKU12345',
    Weight: { Unit: 'LB', Value: 45 }
};

const dropOffAddress = { Address1: '5678 Destination Street', City: 'Action', Country: 'US', LocationType: 'Residential', ProvinceState: 'MT', ZipCode: '59002' };
const pickupAddress = { Address1: '1234 Source Street', City: 'Seattle', Country: 'US', LocationType: 'Commercial', ProvinceState: 'WA', ZipCode: '98101' };
const pickupDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

const createRateRequest = () => ({
    Accessorials: [],
    Boxes: [box],
    DropOffLocation: dropOffAddress,
    OrderReferenceID: `TEST${crypto.randomUUID()}`,
    PickupDate: pickupDate,
    PickupLocation: pickupAddress,
    ServiceLevel: 'Threshold',
    TotalDeclaredValue: { Unit: 'USD', Value: 500 }
});

test('FreightClub', { concurrency: true, timeout: 240000 }, (t) => {
    t.test('getRates', async () => {
        const rateRequest = createRateRequest();
        const response = await freightClub.getRates(rateRequest);

        assert.strictEqual(response.AllPickupLocationHaveCoverage, true);
        assert.match(response.Quote, /^\d+$/);
        assert.strictEqual(response.OrderReferenceId, rateRequest.OrderReferenceID);
        assert.strictEqual(response.TotalNetCharge.Unit, 'USD');
        assert.ok(response.TotalNetCharge.Value > 0);
        assert.ok(Array.isArray(response.Warnings));
        assert.ok(response.CompositeRateQuote[0].Quotes.length);

        // The response's top-level Quote is the cheapest quote in the list, and TotalNetCharge is its cost
        const cheapestQuote = response.CompositeRateQuote[0].Quotes.find(quote => String(quote.QuoteNumber) === response.Quote);

        assert.ok(cheapestQuote);
        assert.strictEqual(cheapestQuote.NetCharge, response.TotalNetCharge.Value);
        assert.ok(cheapestQuote.CarrierName.length);
        assert.ok(cheapestQuote.ServiceLevelDescription.length);
    });

    // Rating and booking run as setup because every other method needs their output; each API
    // still gets its own test, and a subtest's promise resolves even when it fails, so
    // cancelShipment always runs and no failed assertion strands a booked sandbox order
    t.test('booked shipment', { concurrency: true, timeout: 220000 }, async (t) => {
        const rateRequest = createRateRequest();
        const rate = await freightClub.getRate(rateRequest, { maxTime: 30 });

        // Sandbox carrier registration is slow and highly variable (15s to over 60s)
        const booking = await freightClub.bookShipment({
            DropOffLocation: {
                Address: dropOffAddress,
                Contact: { Email: 'recipient@example.com', Firstname: 'Recipient', Lastname: 'Person', PhoneNumber: '5555555556' }
            },
            Money: { Unit: 'USD', Value: '500' },
            OrderReferenceID: rateRequest.OrderReferenceID,
            PickupDate: pickupDate,
            PickupLocation: {
                Address: pickupAddress,
                Contact: { Email: 'sender@example.com', Firstname: 'Sender', Lastname: 'Person', PhoneNumber: '5555555558' }
            },
            Quote: rate.Quote,
            ShipmentInformation: { Boxes: [box] }
        }, { timeout: 180000 });

        await Promise.all([
            t.test('getRate', () => {
                assert.match(rate.Quote, /^\d+$/);
                assert.strictEqual(rate.OrderReferenceId, rateRequest.OrderReferenceID);
                assert.strictEqual(rate.TotalNetCharge.Unit, 'USD');
                assert.ok(rate.TotalNetCharge.Value > 0);
            }),

            t.test('bookShipment', () => {
                assert.match(booking.ConfirmationNumber, /^FC\d+T\d+$/);
                assert.ok(Number(booking.ShipmentNumber) > 0);
                assert.match(booking.Message, /successfully/);
            }),

            t.test('getBol', async () => {
                const bol = await freightClub.getBol(booking.ConfirmationNumber, { contentBase64Needed: true });

                assert.strictEqual(bol.BookingConfirmationNumber, booking.ConfirmationNumber);
                assert.strictEqual(String(bol.ShipmentNumber), String(booking.ShipmentNumber));
                assert.match(bol.TrackingNumber, /^FCT\d+$/);
                assert.ok(bol.CarrierWayBill.length);
                assert.match(bol.BolURL, /^https:\/\//);
                assert.strictEqual(Buffer.from(bol.ContentBase64, 'base64').subarray(0, 4).toString(), '%PDF');
            }),

            t.test('downloadBol', async () => {
                const bolDocument = await freightClub.downloadBol(booking.ConfirmationNumber, { shipmentlabelFormatType: 'Pdf' });

                assert.ok(Buffer.isBuffer(bolDocument));
                assert.strictEqual(bolDocument.subarray(0, 4).toString(), '%PDF');
            }),

            t.test('getLabel', async () => {
                const label = await freightClub.getLabel(booking.ConfirmationNumber);

                assert.strictEqual(label.BookingConfirmationNumber, booking.ConfirmationNumber);
                assert.strictEqual(String(label.ShipmentNumber), String(booking.ShipmentNumber));
                assert.match(label.LabelURL, /^https:\/\//);
            }),

            t.test('getOrderStatus', async () => {
                const orderStatus = (await freightClub.getOrderStatus({ OrderID: booking.ShipmentNumber }))[0];

                assert.strictEqual(Number(orderStatus.OrderID), Number(booking.ShipmentNumber));
                assert.strictEqual(orderStatus.ConfirmationNumber, booking.ConfirmationNumber);
                assert.strictEqual(orderStatus.OrderReferenceID, rateRequest.OrderReferenceID);
                assert.match(orderStatus.TrackingNo, /^FCT\d+$/);
                assert.ok(orderStatus.Carrier.length);
                assert.match(orderStatus.CurrentStatus, /^(Booked|Pending Pickup)$/);
                assert.strictEqual(orderStatus.Dates.ScheduledPickupDate, `${pickupDate.substring(5, 7)}-${pickupDate.substring(8, 10)}-${pickupDate.substring(0, 4)}`);
            }),

            t.test('exportOrders', async () => {
                // The export's to date is exclusive, and Freight Club dates orders in its own timezone
                // (Pacific), so UTC's date can be a day ahead of the order's — span a day each direction
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
                const dayAfterTomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
                const orders = await freightClub.exportOrders({ from: yesterday, to: dayAfterTomorrow });
                const exportedOrder = orders.find(order => String(order.OrderID) === String(booking.ShipmentNumber));

                assert.ok(exportedOrder);
                assert.strictEqual(exportedOrder.CustomerPONumber, rateRequest.OrderReferenceID);
            })
        ]);

        await t.test('cancelShipment', async () => {
            const cancellation = await freightClub.cancelShipment(booking.ConfirmationNumber);

            assert.match(cancellation.Message, /successfully processed your shipment cancellation/);
        });
    });

    t.test('getShipmentTracking', async () => {
        // The sandbox has tracking data for no shipment, its own documentation's example included, so assert the documented error contract
        await assert.rejects(freightClub.getShipmentTracking({ trackingNo: 'FCT1009624087737139200' }), err => {
            assert.ok(err instanceof HttpError);
            assert.strictEqual(err.cause.status, 400);
            assert.match(err.text, /Error Code 8100/);
            return true;
        });
    });

    t.test('exportOrders without a date range', async () => {
        // The API documentation says an export without parameters returns the current day's orders; the API actually requires from and to
        await assert.rejects(freightClub.exportOrders(), err => {
            assert.ok(err instanceof HttpError);
            assert.strictEqual(err.cause.status, 400);
            assert.match(err.text, /from/);
            return true;
        });
    });

    t.test('should throw an HttpError for an unauthorized request', { concurrency: true }, (t) => {
        const unauthorizedFreightClub = new FreightClub({ api_token: 'invalid' });

        const assertUnauthorized = err => {
            assert.ok(err instanceof HttpError);
            assert.strictEqual(err.cause.status, 401);
            assert.match(err.message, /^401/);
            return true;
        };

        t.test('bookShipment', async () => {
            await assert.rejects(unauthorizedFreightClub.bookShipment({ OrderReferenceID: 'TEST', Quote: '1' }), assertUnauthorized);
        });

        t.test('downloadBol', async () => {
            await assert.rejects(unauthorizedFreightClub.downloadBol('FC59086014T860'), assertUnauthorized);
        });

        t.test('getBol', async () => {
            await assert.rejects(unauthorizedFreightClub.getBol('FC59086014T860'), assertUnauthorized);
        });

        t.test('getLabel', async () => {
            await assert.rejects(unauthorizedFreightClub.getLabel('FC59086014T860', { contentBase64Needed: true, shipmentlabelFormatType: 'Zpl' }), assertUnauthorized);
        });

        t.test('getRate', async () => {
            await assert.rejects(unauthorizedFreightClub.getRate(createRateRequest()), assertUnauthorized);
        });

        t.test('getRates', async () => {
            await assert.rejects(unauthorizedFreightClub.getRates(createRateRequest(), { maxTime: 20 }), assertUnauthorized);
        });
    });
    /*
        The two tests that do not go to the sandbox. Asserting what the live API
        serves today would pin the suite to Freight Club's current routing; what
        these prove is that the client refuses an answer it cannot trust,
        wherever it came from.
    */
    t.test('should throw when a redirect leads somewhere that is not the API', { concurrency: true }, async () => {
        const server = http.createServer((req, res) => {
            if (req.url === '/gone') {
                res.writeHead(404, { 'content-type': 'text/plain' });
                res.end('nope');
                return;
            }

            res.writeHead(301, { location: '/gone' });
            res.end();
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

        try {
            const redirectingFreightClub = new FreightClub({ api_token: apiToken, url: `http://127.0.0.1:${server.address().port}` });

            await assert.rejects(redirectingFreightClub.getRates(createRateRequest(), { maxTime: 20 }), err => {
                assert.ok(!(err instanceof HttpError));
                assert.match(err.message, /^Freight Club redirected to http:\/\/127\.0\.0\.1:\d+\/gone, which answered 404\./);
                assert.match(err.message, /A redirect drops the body of a POST/);
                return true;
            });
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    t.test('should throw when a 200 is not JSON', { concurrency: true }, async () => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><html><head><title>Freight Club</title></head><body></body></html>');
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

        try {
            const htmlFreightClub = new FreightClub({ api_token: apiToken, url: `http://127.0.0.1:${server.address().port}` });

            await assert.rejects(htmlFreightClub.getRates(createRateRequest(), { maxTime: 20 }), err => {
                assert.ok(!(err instanceof HttpError));
                assert.match(err.message, /^Freight Club answered http:\/\/127\.0\.0\.1:\d+\/Rate\/GetRates\?maxTime=20 with text\/html; charset=utf-8 rather than JSON\.$/);
                return true;
            });
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
});
