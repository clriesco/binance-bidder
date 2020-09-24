"use strict";

process.title = 'bitcoin-bidder';

const config = require('./config');
const Currencies = require('./currencies');
const Trader = require('./trader');
const webSocketServer = require('websocket').server;
const debug = require('debug')('bidder:app');
const http = require('http');
const request = require('request');
const binance = require('node-binance-api');
const currencyDictionary = require('./currencyDictionary');

var connection;
var apiReqInterval;
var bookUpdated = false;
const webSocketsServerPort = 1337;

binance.options({
    'APIKEY':config.apiKey,
    'APISECRET':config.apiSecret
  });
  
var currencies = new Currencies(binance);
var trader = new Trader(currencies);

trader.startTrade();


var server = http.createServer(function(request, response) {});
server.listen(webSocketsServerPort, function() {
    console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});


trader.on('orderCompleted', () => {
    debug('Trade Order Completed');
    debug(trader.credit);
    trader.startTrade();
});

trader.on('orderFailed', () => {
    debug('Trade Order Failed');
    debug(trader.credit);
    trader.startTrade();
});

/**
 * WebSocket server
 */
var wsServer = new webSocketServer({
    httpServer: server
});

wsServer.on('request', function(req) {    
    connection = req.accept(null, req.origin); 
});

wsServer.on('close', () => {
    clearInterval(apiReqInterval);
});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
  });