$(function () {
    "use strict";

    // for better performance - to avoid searching in DOM
    var contentLayer = $('#content');
    var orderLayer = $('#order');
    var statusLayer = $('#status');
    var currentCurrency = 'USD';
    var fee = 0.0015;
    var totalTrading = 0.0;
    var bestBid = 0.0;
    var bestAccumulatedBid = 0.0;
    var orderBooks = {};

    const dataTypes = {
        CURRENCY: 0,
        ORDERPATH: 1
    }

    // if user is running mozilla then use it's built-in WebSocket
    window.WebSocket = window.WebSocket || window.MozWebSocket;

    // if browser doesn't support WebSocket, just show some notification and exit
    if (!window.WebSocket) {
        addMessage(statusLayer, 'Sorry, but your browser doesn\'t '
        + 'support WebSockets.', 'red');
        return;
    }

    // open connection
    var connection = new WebSocket('ws://127.0.0.1:1337');

    connection.onopen = function () {
        addMessage(statusLayer, 'WebSocket connection opened', 'green');
    };

    connection.onerror = function (error) {
        // just in there were some problems with conenction...
        addMessage(statusLayer, 'Sorry, but there\'s some problem with your '
                                    + 'connection or the server is down.', 'red');
    };

    // most important part - incoming messages
    connection.onmessage = function (message) {
        
        let data = JSON.parse(message.data);

        switch (data.type) {
            case dataTypes.CURRENCY:
                manageCurrencies(data.payload);
            break;
            case dataTypes.ORDERPATH:
            console.log(data);
                manageOrderPath(data.payload);
            break;
        }
    };

    /**
     * This method is optional. If the server wasn't able to respond to the
     * in 3 seconds then show some error message to notify the user that
     * something is wrong.
     */
    setInterval(function() {
        if (connection.readyState !== 1) {
            addMessage(statusLayer, 'ERROR: Unable to communicate with the websocket server', 'red', new Date());
        }
    }, 3000);

    function manageCurrencies(currencies) {
        let output = '';
        for (let key in currencies) {
            for (let key2 in currencies[key]) {
                output += '<span class="">'+key+'/'
                    +key2+':</span><span class="">'
                    +currencies[key][key2].price+'</span><br>';
            }
        }

        addMessage(contentLayer, output, 'black');
    }
    
    function manageOrderPath(pathInfo) {
        let profitability = parseFloat(Math.round(pathInfo.profitability * 10000) / 100).toFixed(2);
        
        let output = '<span class="">' + pathInfo.path.join(' -> ') + ': ' + profitability + '</span>';

        addMessage(orderLayer, output, 'black');
    }

    function manageOrderbook(orderBook) {
        orderBooks[orderBook.pair] = 'Bid: ' + orderBook.bid + ' Ask: ' + orderBook.ask;
        let output = '';
        for (let key in orderBooks) {
            output += '<span style="blue">' + key + ':</span> ' + orderBooks[key] + '<br>';
        }
        addMessage(contentLayer, output, 'black');
    }
    
    /**
     * Add message to document
     */
    function addMessage(layer, message, color) {
        layer.html('<p style="color:' + color + '">' + message + '</p>');
    }
});
