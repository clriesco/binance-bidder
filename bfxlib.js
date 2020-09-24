const BFX = require('bitfinex-api-node');
const inherits = require('util').inherits;  
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('bidder:bfxlib');
const debError = require('debug')('bidder:ERROR');
const config = require('./config');

const opts = {
  version: 2,
  transform: true
}

const bws = new BFX(config.writeAPIKey, config.writeAPISecret, opts).ws;
const bRest = new BFX(config.readAPIKey, config.readAPISecret, opts).rest;

// ES 6 Map would be also possible
const orderbook = {}

function Bfxlib() {  
    if (! (this instanceof Bfxlib)) return new Bfxlib();
    EventEmitter.call(this);
    const self = this;
    bws.on('open', () => {
        bws.auth();
    });

    bws.on('orderbook', (pair, rec) => {
        self.updateOrderbook(orderbook, rec, pair)
    });

    bws.on('auth', () => {
      self.emit('authenticated');
    });

    bws.on('message', (msg) => {
    
      if (!Array.isArray(msg)) return
    
      const [ cosa, type, payload ] = msg
      
      if (~['wu', 'oc', 'te', 'n', 'ou', 'tu'].indexOf(type) !== 0) {
        switch (type) {
            case 'wu':
              debug('Wallet Update: ' + payload[2] + payload[1]);
            break;
            case 'oc':
              debug('Order Cancel!!: ' + payload[3] + ' ' + payload[13]);
            break;
            case 'te':
              debug('TE Message');
              debug(payload);
            break;
            case 'n':
              debug('N message');
              debug(payload[payload.length-1]);
            break;
            case 'ou':
              debug('Order Update');
              debug(payload[payload.length-1]);
            break;
            case 'tu':
              debug('Trade Update Message');
              debug(payload);
            break;
        }
      }

      if (type === 'wu') {
        self.emit('wu', payload);
      }
      if (type === 'oc') {
        self.emit('tradeExecuted', payload);
      }
      
      if (type === 'ou') { // order update
        self.emit('tradeComplete', payload);
        /*if (payload[2] === cId) {
          const oId = payload[0]
          debug('cancelling order...')
          cancelOrder(oId)
        }
        */
      }

      if (type === 'ws') {
        self.emit('ws', payload)
      }
    })
    
    bws.on('error', (error) => {
      debError('error:');
      debError(error);
    })


    bws.on('trade', (pair, trade) => {
      debug('Trade:', trade)
    })
}

inherits(Bfxlib, EventEmitter);

function isSnapshot (data) {
  return Array.isArray(data)
}

// Trading: if AMOUNT > 0 then bid else ask;
// Funding: if AMOUNT < 0 then bid else ask;
function bidOrAsk (el, type = 't') {
  if (type === 't' && el.AMOUNT > 0) { return 'bid' }
  if (type === 't' && el.AMOUNT < 0) { return 'ask' }

  if (type === 'f' && el.AMOUNT > 0) { return 'ask' }
  if (type === 'f' && el.AMOUNT < 0) { return 'bid' }

  throw new Error('unknown type')
}

function getType (pair) {
  return pair[0]
}

Bfxlib.prototype.subscribeOrderBook = function (pair) {
  bws.subscribeOrderBook(pair);
}

Bfxlib.prototype.addOrder = function (from, market, amount, price, type = 'EXCHANGE LIMIT') {

  const orderId = Date.now();
  //amount = amount * 0.1;

  const payload = [
    0,
    'on',
    null,
    {
      'gid': 1,
      'cid': orderId, // unique client order id
      'type': type,
      'symbol': market,
      'amount': this.sanitize(amount).toString(),
      'price': price.toString(),
      'hidden': 0
    }
  ]
  let to = market.substr(1).replace(from, '');
  debug('FROM: ' + from + ' TO ' + to + ', Trade ' + orderId + ' of ' + amount + ' in market ' + market + ' at price ' + price + ' complete');
  debug(payload);
  bws.send(payload);
  return orderId;
}

 Bfxlib.prototype.testAddOrder = function (from, market, amount, price, type = 'LIMIT') {
  
    const orderId = Date.now().toString() + Math.trunc(Math.random()*1000).toString();
    amount = amount.toString();
    price = parseFloat(price);
    const payload = [
      0,
      'on',
      null,
      {
        'gid': 1,
        'cid': orderId, // unique client order id
        'type': type,
        'symbol': market,
        'amount': amount,
        'price': price,
        'hidden': 0
      }
    ]
    let to = market.substr(1).replace(from, '');
    debug(payload);
    setTimeout(() => {
      debug('FROM: ' + from + ' TO ' + to + ', Trade ' + orderId + ' of ' + amount + ' in market ' + market + ' at price ' + price + ' complete');
      this.emit('wu', ['', from, 0.0496129]);
      this.emit('wu', ['', to, 0.004312006]);
      this.emit('tradeExecuted', ['', '', orderId]);
    }, Math.random() * 3000);
    return orderId;
}

function cancelOrder (orderId) {
  // https://docs.bitfinex.com/v2/reference#ws-input-order-cancel

  const payload = [
    0,
    'oc',
    null,
    {
      'id': orderId

    }
  ]

  bws.send(payload)
}

Bfxlib.prototype.updateOrderbook = function (orderbook, rec, pair) {
  const type = getType(pair)
  if (orderbook[pair] == undefined) {
    orderbook[pair] = {
      bid: {},
      ask: {}
    }
  }
  let updatedBook
  if (isSnapshot(rec)) {
    updatedBook = rec.reduce((acc, el) => {
      const branch = bidOrAsk(el, type)
      orderbook[pair][branch][el.PRICE] = el
      return orderbook
    }, orderbook)

    return
  }

    updatedBook = updateBookEntry(orderbook, rec, pair)
    const prices = sortPrices(updatedBook[pair])
    if (!Array.isArray(prices.bid) || !Array.isArray(prices.ask) || !prices.bid || !prices.ask) {
      return;
    }
    let spread;
    try {
       spread = prices.bid[0].price - prices.ask[0].price
    } catch (e) {
      //debug('bid: ' +  prices.bid + ' ask: ' + prices.ask);
      return;
    }
    //debug(prices.bid);
    const bookinfo = {
        //book: updatedBook, 
        bid: prices.bid[0],
        ask: prices.ask[0],
        spread: spread, 
        pair: pair
    }
    this.emit('bookUpdated', bookinfo);
}

function updateBookEntry (orderbook, rec, pair) {
  const { COUNT, AMOUNT, PRICE } = rec
  // when count = 0 then you have to delete the price level.
  if (COUNT === 0) {
    // if amount = 1 then remove from bids
    if (AMOUNT === 1) {
      delete orderbook[pair].bid[PRICE]
      return orderbook
    } else if (AMOUNT === -1) {
      // if amount = -1 then remove from asks
      delete orderbook[pair].ask[PRICE]
      return orderbook
    }

    console.error('[ERROR] amount not found', rec)
    return orderbook
  }

  // when count > 0 then you have to add or update the price level
  if (COUNT > 0) {
    // 3.1 if amount > 0 then add/update bids
    if (AMOUNT > 0) {
      orderbook[pair].bid[PRICE] = rec
      return orderbook
    } else if (AMOUNT < 0) {
      // 3.2 if amount < 0 then add/update asks
      orderbook[pair].ask[PRICE] = rec
      return orderbook
    }

    console.error('[ERROR] side not found', rec)
    return orderbook
  }
}

function sortPrices (book) {
  const aux = {};
  const res = {};
  aux.bid = Object.keys(book.bid).sort((a, b) => {
    return +a >= +b ? -1 : 1
  })
  aux.ask = Object.keys(book.ask).sort((a, b) => {
    return +a <= +b ? -1 : 1
  })
  res.bid = aux.bid.map(
    (x) => { return {'price': x, 'amount': book.bid[x].AMOUNT}}
  );
  res.ask = aux.ask.map(
    (x) => { return {'price': x, 'amount': book.ask[x].AMOUNT}}
  )

  return res
}

Bfxlib.prototype.sanitize = function(num) {
  return num;
  if (num > 0)
    return Math.floor(num*10000)/10000;
  return -Math.floor(Math.abs(num)*10000)/10000;
}

Bfxlib.prototype.getBalance = function() {
  bRest.wallets((err, res) => {
    if (err !== null) {
      debug(err);
      return;
    }
    debug(res);
  })
}

module.exports = Bfxlib;