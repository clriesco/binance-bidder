'use strict';

var _ws = require('ws');
var _crypto = require('crypto');
var debug = require('debug')('bidder:ws');
var _get = require('lodash/fp/get');
var _pipe = require('lodash/fp/pipe');
const EventEmitter = require('events').EventEmitter;

class HitBTCWebsocketClient extends EventEmitter{

  constructor({ key, secret, isDemo = false }) {
    super();
    EventEmitter.call(this);

    this.createLoginPayloadData = message => {
      const nonce = Date.now().toString();
      const params = {
        algo: "HS256",
        pKey: this.key,
        nonce: nonce,
        signature: _crypto.createHmac(`sha256`, this.secret).update(nonce).digest(`hex`)
      };

      message.params = params;
      message.id = 'LOGIN';
      
      return JSON.stringify(message);
    };


    this.key = key;
    this.secret = secret;
    this.baseUrl = `wss://${isDemo ? `demo-api` : `api`}.hitbtc.com/api/2/ws`;
    this.hasCredentials = key && secret;

    this.marketSocket = new _ws(this.baseUrl);
    this.marketSocket.on('message', msg => this.readMarketMessage(msg));

    if (this.hasCredentials) {
      this.tradingSocket = new _ws(this.baseUrl);
      this.tradingSocket.addEventListener(`open`, () => this.tradingSocket.send(this.createLoginPayloadData({ method: 'login'})));
      this.tradingSocket.on('message', msg => this.readTradingMessage(msg));
    }
  }

  subscribeOrderBook(symbol = 'BTCUSD') {
    this.marketSocket.send(JSON.stringify({
      method: 'subscribeOrderbook',
      params: {
        symbol: symbol
      },
      id: 'SUBSC' + symbol
    }));
  }

  readMarketMessage(message) {
    let msgData = JSON.parse(message);

    if (msgData.id != undefined) 
      switch (msgData.id.substr(0,5)) {
        case 'LOGIN': 
          this.emit('login');
          break;
          case 'SUBSC': 
            this.emit('subscribed', msgData.id);
            break;
        default:
          break;
      }
    else 
      switch (msgData.method) {
        case 'snapshotOrderbook':
          this.emit('snapshotOrderbook', msgData.params);
        break;
        case 'updateOrderbook':
          this.emit('updateOrderbook', msgData.params);
        break;
        default:
          debug('ERROR: Unhandled Market method: ' + JSON.stringify(msgData));
        break;
      }
  }

  readTradingMessage(message) {
    let msgData = JSON.parse(message);
    if (msgData.id != undefined) {
      switch (msgData.id.substr(0,5)) {
        case 'LOGIN': 
          this.emit('login');
          break;
        default:
          break;
      }
    } 
  }


}
module.exports = HitBTCWebsocketClient;