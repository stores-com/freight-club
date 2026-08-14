# freight-club

[![Build Status](https://github.com/stores-com/freight-club/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/stores-com/freight-club/actions?query=workflow%3ATest+branch%3Amain)
[![Coverage Status](https://coveralls.io/repos/github/stores-com/freight-club/badge.svg?branch=main)](https://coveralls.io/github/stores-com/freight-club?branch=main)
[![npm version](https://img.shields.io/npm/v/freight-club)](https://www.npmjs.com/package/freight-club)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The Freight Club API is an interface that allows you to set up an integrated experience between your daily operations and our application. APIs give you the ability to manage all your Parcel or LTL shipments with capabilities that include rating shipments, creating Bills of Lading or parcel labels, booking shipments with carriers and getting tracking information from those bookings.

https://api.freightclub.com/ApiDoc/index

## Requirements

Node.js 18 or later. This package uses the built-in `fetch` and has no HTTP dependency.

## Usage

```javascript
const FreightClub = require('freight-club');

const freightClub = new FreightClub({
    api_token: 'your_api_token'
});
```

| Option | Default | Description |
| --- | --- | --- |
| `api_token` | | Freight Club API token, without the `Bearer ` prefix. Request one under Manage API Tokens in the Freight Club application, or use the testing token from the API documentation. |
| `timeout` | `60000` | Milliseconds to wait before aborting a request. Rating fans out to Freight Club's carrier network and waits up to 40 seconds (the `maxTime` default) for the slowest carrier. |
| `url` | `https://api.freightclub.com` | API endpoint. |

Every method that makes a request also accepts a `timeout` option, which overrides the constructor value for that call only.

```javascript
const response = await freightClub.getRates(request, { timeout: 45000 });
```

### Errors

A response other than 200 produces an [HttpError](https://www.npmjs.com/package/@stores.com/http-error), thrown from the promise.

```javascript
try {
    await freightClub.bookShipment(request);
} catch (err) {
    console.log(err.message);      // '400 Bad Request'
    console.log(err.cause.status); // 400
    console.log(err.json);         // the parsed response body
    console.log(err.text);         // the raw response body
}
```

A request that never reaches Freight Club — an unparseable `url`, a network failure, or a timeout — produces the error `fetch` itself raised, with no `cause.status`.

### freightClub.bookShipment(request, [options])

Supplying the quote number returned by GetRate and GetRates, this method books a shipment at that specific quoted rate with the chosen carrier. Carriers require a contact `Email` at booking (Error Code 13010), even though Freight Club's API documentation marks it optional.

**Example**

```javascript
const response = await freightClub.bookShipment({
    OrderReferenceID: 'SALEID1660782849',
    PickupDate: '2022-08-18',
    Quote: '1151240419',
    DropOffLocation: {
        Address: {
            Address1: '5678 Destination Street',
            City: 'Action',
            Country: 'US',
            LocationType: 'Residential',
            ProvinceState: 'MT',
            ZipCode: '59002'
        },
        Contact: {
            Email: 'recipient@example.com',
            Firstname: 'Recipient',
            Lastname: 'Person',
            PhoneNumber: '5555555556'
        }
    },
    PickupLocation: {
        Address: {
            Address1: '1234 Source Street',
            City: 'Seattle',
            Country: 'US',
            LocationType: 'Commercial',
            ProvinceState: 'WA',
            ZipCode: '98101'
        },
        Contact: {
            Email: 'sender@example.com',
            Firstname: 'Sender',
            Lastname: 'Person',
            PhoneNumber: '5555555558'
        }
    },
    ShipmentInformation: {
        Boxes: [
            {
                Category: 'CasedGoodsFurniture',
                DeclaredValue: {
                    Unit: 'USD',
                    Value: 500
                },
                Description: 'Pack of 4',
                Dimension: {
                    Height: 10,
                    Length: 10,
                    Unit: 'Inch',
                    Width: 10
                },
                Quantity: 1,
                Sku: 'SKU12345',
                Weight: {
                    Unit: 'LB',
                    Value: 45
                }
            }
        ]
    }
});

console.log(response.ConfirmationNumber); // 'FC59086014T860'
```

### freightClub.cancelShipment(confirmationNumber, [options])

This method will cancel a shipment, provided it has not yet been picked up by a carrier.

**Example**

```javascript
const response = await freightClub.cancelShipment('FC59086014T860');

console.log(response.Message); // 'We have successfully processed your shipment cancellation'
```

### freightClub.downloadBol(confirmationNumber, [options])

This method will download the Bill of Lading (BOL) document itself for LTL shipments based on the confirmation number generated after successful booking of an order. It resolves to a `Buffer` containing the document rather than a JSON envelope. Pass `shipmentlabelFormatType` (`Pdf` or `Zpl`) to choose the format.

**Example**

```javascript
const document = await freightClub.downloadBol('FC59086014T860', { shipmentlabelFormatType: 'Pdf' });

fs.writeFileSync('bol.pdf', document);
```

### freightClub.exportOrders([query], [options])

This method will retrieve all the booked orders for the period you specify, up to a 30-day window. Freight Club's API documentation says an export without parameters returns the current day's orders, but the API actually requires `from` and `to` — and `to` is exclusive, so a single day is `{ from: '2022-08-14', to: '2022-08-15' }`.

**Example**

```javascript
const response = await freightClub.exportOrders({ from: '2022-08-14', to: '2022-08-20' });
```

### freightClub.getBol(confirmationNumber, [options])

This method will return Bill of Lading (BOL) details for LTL shipments based on the confirmation number generated after successful booking of an order. Pass `contentBase64Needed: true` to also receive the document itself in the response's `ContentBase64` field.

**Example**

```javascript
const response = await freightClub.getBol('FC59086014T860', { contentBase64Needed: true });

console.log(response.BolURL);
console.log(response.TrackingNumber); // 'FCT1009624087737139200'
```

### freightClub.getLabel(confirmationNumber, [options])

This method will return the shipping label based on the confirmation number generated after a successful booking.

**Example**

```javascript
const response = await freightClub.getLabel('FC59086014T860', { shipmentlabelFormatType: 'Zpl' });

console.log(response.LabelURL);
```

### freightClub.getOrderStatus(query, [options])

This method will retrieve the current status of a specific order providing the essential details like important shipping dates and the current status. Query by `OrderID`, `OrderReferenceID`, `WayBill` or `TrackingNo`.

**Example**

```javascript
const response = await freightClub.getOrderStatus({ OrderID: '59086014' });

console.log(response[0].CurrentStatus);     // 'Pending Pickup'
console.log(response[0].Dates.DeliveryEta); // '08-26-2022'
```

### freightClub.getRate(request, [options])

Use GetRate when you're only interested in a specific Service Level. This call is much quicker than the GetRates call and will provide all available rates for carriers that are open to your account for the Service Level you specified.

Pass `maxTime` (seconds, 1-40, default 40) to trade quote quantity for speed.

**Example**

```javascript
const response = await freightClub.getRate({
    OrderReferenceID: 'SALEID1660782849',
    PickupDate: '2022-08-18',
    ServiceLevel: 'Threshold',
    DropOffLocation: {
        Address1: '5678 Destination Street',
        City: 'Action',
        Country: 'US',
        LocationType: 'Residential',
        ProvinceState: 'MT',
        ZipCode: '59002'
    },
    PickupLocation: {
        Address1: '1234 Source Street',
        City: 'Seattle',
        Country: 'US',
        LocationType: 'Commercial',
        ProvinceState: 'WA',
        ZipCode: '98101'
    },
    TotalDeclaredValue: {
        Unit: 'USD',
        Value: 500
    },
    Accessorials: [],
    Boxes: [
        {
            Category: 'CasedGoodsFurniture',
            DeclaredValue: {
                Unit: 'USD',
                Value: 500
            },
            Description: 'Pack of 4',
            Dimension: {
                Height: 10,
                Length: 10,
                Unit: 'Inch',
                Width: 10
            },
            FreightClass: '50',
            Quantity: 1,
            Sku: 'SKU12345',
            Weight: {
                Unit: 'LB',
                Value: 45
            }
        }
    ]
}, { maxTime: 30 });

console.log(response.Quote);                 // the cheapest quote number
console.log(response.TotalNetCharge.Value);  // its all-in cost
console.log(response.CompositeRateQuote);    // every quote, including per-carrier NetCharge, ExtraServices and transit time
```

### freightClub.getRates(request, [options])

This method will retrieve quotes for all Service Levels, valid for both LTL and Parcel depending on Carriers that are open to your account. The request shape matches `getRate` without the `ServiceLevel` field.

### freightClub.getShipmentTracking(query, [options])

This method will return a list of tracking information for specific shipments. Query by `trackingNo`, `wayBillNumber`, `shipmentId` or `CustomerNumber`.

**Example**

```javascript
const response = await freightClub.getShipmentTracking({ shipmentId: '59086014' });

console.log(response[0].TrackingCategory); // 'Pending Pickup'
console.log(response[0].Description);      // 'WAITING FOR PICKUP'
```
