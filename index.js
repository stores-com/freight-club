const HttpError = require('@stores.com/http-error');

/**
 * Throws for anything that is not a JSON 200 and returns the parsed JSON body otherwise.
 *
 * @private
 * @param {Response} res - A fetch Response.
 * @returns {Promise.<Object>} The parsed JSON body.
 * @throws {Error} If the response was redirected, or is not JSON.
 * @throws {HttpError} If the response status is not 200.
 */
async function parseResponse(res) {
    /*
        Redirects are followed, as they should be — an endpoint that genuinely
        moves says so with a 307 or a 308, and following it keeps us working.
        What a redirect cannot do is carry a POST: a 301, 302 or 303 is rewritten
        into a GET and the body is dropped, so the request never arrives anywhere
        and whatever answers is answering something we did not ask. Saying where
        the answer came from turns "404 Not Found" into something a person can
        act on, which is the difference between reading this error and hunting
        for a path that was never wrong.
    */
    if (res.redirected && res.status !== 200) {
        throw new Error(`Freight Club redirected to ${res.url}, which answered ${res.status}. A redirect drops the body of a POST, so this request never reached an endpoint.`);
    }

    if (res.status !== 200) {
        throw await HttpError.from(res);
    }

    /*
        And a 200 is not an answer either unless it is JSON. An error page from a
        gateway, a WAF challenge or a marketing site arrives with a 200 as often
        as not, and `res.json()` on one throws a parse error naming a character
        offset, which tells the person reading it nothing. In October 2026 this
        was a whole Squarespace page, printed under a purchase order as the
        reason there were no freight quotes.
    */
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('json')) {
        throw new Error(`Freight Club answered ${res.url} with ${contentType || 'no content type'} rather than JSON.`);
    }

    return await res.json();
}

/**
 * A client for the Freight Club API.
 *
 * @param {Object} args - Client options.
 * @param {string} args.api_token - Freight Club API token, without the `Bearer ` prefix.
 * @param {number} [args.timeout=60000] - Milliseconds to wait before aborting a request.
 * @param {string} [args.url='https://api.freightclub.com'] - API endpoint.
 * @see https://api.freightclub.com/ApiDoc/index
 * @example
 * const freightClub = new FreightClub({ api_token: 'your_api_token' });
 */
function FreightClub(args) {
    const _options = Object.assign({
        // Freight Club fans rate requests out to its carrier network and waits up to 40 seconds (the maxTime default) for the slowest carrier
        timeout: 60000,
        url: 'https://api.freightclub.com'
    }, args);

    /**
     * Supplying the quote number returned by GetRate and GetRates, this method books a shipment at that specific quoted rate with the chosen carrier.
     *
     * @param {Object} request - A BookShipment request. Carriers require a contact Email at booking (Error Code 13010), even though Freight Club's API documentation marks it optional.
     * @param {Object} [options] - Per-call options.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Object>} The booking confirmation, including ConfirmationNumber and ShipmentNumber.
     * @throws {HttpError} If the response status is not 200.
     * @see https://api.freightclub.com/ApiDoc/index
     * @example
     * const booking = await freightClub.bookShipment(request, { timeout: 180000 });
     */
    this.bookShipment = async function(request, options = {}) {
        const res = await fetch(`${_options.url}/Book/BookShipment`, {
            body: JSON.stringify(request),
            headers: {
                'Authorization': `Bearer ${_options.api_token}`,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * This method will cancel a shipment, provided it has not yet been picked up by a carrier.
     *
     * @param {string} confirmationNumber - The confirmation number supplied from a successful booking.
     * @param {Object} [options] - Per-call options.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Object>} The cancellation result.
     * @throws {HttpError} If the response status is not 200.
     * @example
     * const cancellation = await freightClub.cancelShipment('FC59086014T860');
     */
    this.cancelShipment = async function(confirmationNumber, options = {}) {
        const res = await fetch(`${_options.url}/Cancel/CancelShipment/${encodeURIComponent(confirmationNumber)}`, {
            headers: {
                'Authorization': `Bearer ${_options.api_token}`
            },
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * This method will download the Bill of Lading (BOL) document itself for LTL shipments based on the confirmation number generated after successful booking of an order.
     *
     * @param {string} confirmationNumber - The confirmation number supplied from a successful booking.
     * @param {Object} [options] - Per-call options.
     * @param {string} [options.shipmentlabelFormatType] - The file format to receive: Pdf or Zpl.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Buffer>} The Bill of Lading document itself.
     * @throws {HttpError} If the response status is not 200.
     * @example
     * const bolDocument = await freightClub.downloadBol('FC59086014T860', { shipmentlabelFormatType: 'Pdf' });
     */
    this.downloadBol = async function(confirmationNumber, options = {}) {
        let url = `${_options.url}/Bol/DownloadBol/${encodeURIComponent(confirmationNumber)}`;

        if (options.shipmentlabelFormatType) {
            url += `?shipmentlabelFormatType=${options.shipmentlabelFormatType}`;
        }

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${_options.api_token}`
            },
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        if (res.status !== 200) {
            throw await HttpError.from(res);
        }

        // DownloadBol streams the document itself rather than a JSON envelope
        return Buffer.from(await res.arrayBuffer());
    };

    /**
     * This method will retrieve all the booked orders for the period you specify, up to a 30-day window. Freight Club's API documentation says the parameters are optional, but the API requires both.
     *
     * @param {Object} query - Export parameters.
     * @param {string} query.from - The starting date from which orders were placed (YYYY-MM-DD).
     * @param {string} query.to - The last date that orders were placed (YYYY-MM-DD), EXCLUSIVE: a single day is from=2022-08-14, to=2022-08-15.
     * @param {Object} [options] - Per-call options.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Array.<Object>>} The booked orders for the period.
     * @throws {HttpError} If the response status is not 200.
     * @example
     * const orders = await freightClub.exportOrders({ from: '2022-08-14', to: '2022-08-20' });
     */
    this.exportOrders = async function(query, options = {}) {
        let url = `${_options.url}/api/orders/export`;
        const queryString = new URLSearchParams(query).toString();

        if (queryString) {
            url += `?${queryString}`;
        }

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${_options.api_token}`
            },
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * This method will return Bill of Lading (BOL) details for LTL shipments based on the confirmation number generated after successful booking of an order.
     *
     * @param {string} confirmationNumber - The confirmation number supplied from a successful booking.
     * @param {Object} [options] - Per-call options.
     * @param {boolean} [options.contentBase64Needed] - Also return the document itself, Base64-encoded in the response's ContentBase64 field.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Object>} Bill of Lading details, including TrackingNumber, CarrierWayBill and BolURL.
     * @throws {HttpError} If the response status is not 200.
     * @example
     * const bol = await freightClub.getBol('FC59086014T860', { contentBase64Needed: true });
     */
    this.getBol = async function(confirmationNumber, options = {}) {
        const query = new URLSearchParams();

        if (options.contentBase64Needed !== undefined) {
            query.set('contentBase64Needed', options.contentBase64Needed);
        }

        let url = `${_options.url}/Bol/GetBol/${encodeURIComponent(confirmationNumber)}`;
        const queryString = query.toString();

        if (queryString) {
            url += `?${queryString}`;
        }

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${_options.api_token}`
            },
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * This method will return the shipping label based on the confirmation number generated after a successful booking.
     *
     * @param {string} confirmationNumber - The confirmation number supplied from a successful booking.
     * @param {Object} [options] - Per-call options.
     * @param {boolean} [options.contentBase64Needed] - Also return the label itself, Base64-encoded in the response's ContentBase64 field.
     * @param {string} [options.shipmentlabelFormatType] - The file format to receive: Pdf or Zpl.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Object>} Label details, including LabelURL.
     * @throws {HttpError} If the response status is not 200.
     * @example
     * const label = await freightClub.getLabel('FC59086014T860', { shipmentlabelFormatType: 'Zpl' });
     */
    this.getLabel = async function(confirmationNumber, options = {}) {
        const query = new URLSearchParams();

        if (options.contentBase64Needed !== undefined) {
            query.set('contentBase64Needed', options.contentBase64Needed);
        }

        if (options.shipmentlabelFormatType) {
            query.set('shipmentlabelFormatType', options.shipmentlabelFormatType);
        }

        let url = `${_options.url}/Label/GetLabel/${encodeURIComponent(confirmationNumber)}`;
        const queryString = query.toString();

        if (queryString) {
            url += `?${queryString}`;
        }

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${_options.api_token}`
            },
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * This method will retrieve the current status of a specific order providing the essential details like important shipping dates and the current status.
     *
     * @param {Object} query - Order status parameters; supply one of them.
     * @param {string} [query.OrderID] - The Freight Club OrderID linked to the shipment.
     * @param {string} [query.OrderReferenceID] - The order reference assigned to the shipment, URL encoded to account for spaces.
     * @param {string} [query.TrackingNo] - The tracking number assigned to the shipment.
     * @param {string} [query.WayBill] - The carrier's waybill value assigned to the shipment.
     * @param {Object} [options] - Per-call options.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Array.<Object>>} The matching orders' statuses, including CurrentStatus, ConfirmationNumber and Dates.
     * @throws {HttpError} If the response status is not 200.
     * @example
     * const statuses = await freightClub.getOrderStatus({ OrderID: '59086014' });
     */
    this.getOrderStatus = async function(query, options = {}) {
        const res = await fetch(`${_options.url}/api/orders/orderstatus?${new URLSearchParams(query)}`, {
            headers: {
                'Authorization': `Bearer ${_options.api_token}`
            },
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * Use GetRate when you're only interested in a specific Service Level. This call is much quicker than the GetRates call and will provide all available rates for carriers that are open to your account for the Service Level you specified.
     *
     * @param {Object} request - A GetRate request. A ServiceLevel is required (Error Code 9036).
     * @param {Object} [options] - Per-call options.
     * @param {number} [options.maxTime] - Seconds to wait for the carrier network to return quotes, 1 to 40 (default 40); Freight Club recommends 10 or greater.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Object>} The quotes, with the cheapest quote number in Quote and its cost in TotalNetCharge.
     * @throws {HttpError} If the response status is not 200.
     * @see https://api.freightclub.com/ApiDoc/index
     * @example
     * const rate = await freightClub.getRate(request, { maxTime: 30 });
     */
    this.getRate = async function(request, options = {}) {
        let url = `${_options.url}/Rate/GetRate`;

        if (options.maxTime) {
            url += `?maxTime=${options.maxTime}`;
        }

        const res = await fetch(url, {
            body: JSON.stringify(request),
            headers: {
                'Authorization': `Bearer ${_options.api_token}`,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * This method will retrieve quotes for all Service Levels, valid for both LTL and Parcel depending on Carriers that are open to your account.
     *
     * @param {Object} request - A GetRates request. Despite rating all Service Levels, a ServiceLevel is still required (Error Code 9036).
     * @param {Object} [options] - Per-call options.
     * @param {number} [options.maxTime] - Seconds to wait for the carrier network to return quotes, 1 to 40 (default 40); Freight Club recommends 10 or greater.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Object>} The quotes, with the cheapest quote number in Quote and its cost in TotalNetCharge.
     * @throws {HttpError} If the response status is not 200.
     * @see https://api.freightclub.com/ApiDoc/index
     * @example
     * const rates = await freightClub.getRates(request, { maxTime: 30 });
     */
    this.getRates = async function(request, options = {}) {
        let url = `${_options.url}/Rate/GetRates`;

        if (options.maxTime) {
            url += `?maxTime=${options.maxTime}`;
        }

        const res = await fetch(url, {
            body: JSON.stringify(request),
            headers: {
                'Authorization': `Bearer ${_options.api_token}`,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };

    /**
     * This method will return a list of tracking information for specific shipments.
     *
     * @param {Object} query - Tracking parameters; supply one of them.
     * @param {string} [query.CustomerNumber] - Your own internal reference number, URL encoded to account for spaces.
     * @param {string} [query.shipmentId] - Internal Freight Club order number (OrderId).
     * @param {string} [query.trackingNo] - Freight Club tracking number.
     * @param {string} [query.wayBillNumber] - Waybill number which Freight Club uses to register the shipment.
     * @param {Object} [options] - Per-call options.
     * @param {number} [options.timeout] - Milliseconds to wait before aborting the request, overriding the constructor value.
     * @returns {Promise.<Array.<Object>>} The shipment's tracking events.
     * @throws {HttpError} If the response status is not 200.
     * @example
     * const tracking = await freightClub.getShipmentTracking({ shipmentId: '59086014' });
     */
    this.getShipmentTracking = async function(query, options = {}) {
        const res = await fetch(`${_options.url}/api/tracking/ShipmentTracking?${new URLSearchParams(query)}`, {
            headers: {
                'Authorization': `Bearer ${_options.api_token}`
            },
            signal: AbortSignal.timeout(options.timeout || _options.timeout)
        });

        return await parseResponse(res);
    };
}

module.exports = FreightClub;
