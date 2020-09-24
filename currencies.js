"use strict";

const debug = require('debug')('bidder:currencies');
const inherits = require('util').inherits;  
const EventEmitter = require('events').EventEmitter;
const config = require('./config');
const currencyDictionary = require('./currencyDictionary');

/**
 * Handles CurrencyBook for trading.
 * @param {sting} APIKey
 * @param {string} APISecret
 * @event
 * @class
 */
const Currencies = function(tradingApi) {
    EventEmitter.call(this)
    this.currencyBook = {};
    this.tradingApi = tradingApi;
    this.fee = config.fee;
    this.currencyDictionary = currencyDictionary;

    this.listenToTickers();
}

inherits(Currencies, EventEmitter);

Currencies.prototype.listenToTickers = function() {
    setInterval(() => {
        this.tradingApi.bookTickers((ticker) => {
            for (let market in ticker) {
                if (~Object.keys(this.currencyDictionary.pairs).indexOf(market.toString())) {
                    //debug('Updating ' + JSON.stringify(ticker[market]) + ' from ' + market);
                    this.updateCurrencyBook(market, ticker[market]);
                }
            }
            this.emit('bookUpdated');
          });
    }, 1000)
}

Currencies.prototype.updateCurrencyBook = function(market, orderBook) {
    let buyCurrency = currencyDictionary.pairs[market].commodity;
    let sellCurrency = currencyDictionary.pairs[market].currency;

    if (this.currencyBook[buyCurrency] == undefined) {
        this.currencyBook[buyCurrency] = {}
    }
    if (this.currencyBook[sellCurrency] == undefined) {
        this.currencyBook[sellCurrency] = {}
    }
    //debug(orderBook.book[market]); 
    // ETH -> USD. Price: 480, amount 2 (960USD)
    this.currencyBook[buyCurrency][sellCurrency] = { 
        price: 1 / orderBook.bid,
        amount: orderBook.bids * orderBook.bid, //Medimos en denominador. En este caso en Dolares
        inverse: 0
    };

    //Para el inverso, también se invierten Bid y Ask. en ETH/USD, por ejemplo al ir de USD a ETH, el orderBook de ask es = que el orderBook de bid de ETH a USD
    //USD -> ETH, Price: 480, amount 2 (960USD)
    this.currencyBook[sellCurrency][buyCurrency] = {
        price: Number(orderBook.ask),
        amount: Number(orderBook.asks),
        inverse: 1
    };
  
    //debug(this.currencyBook);
}

Currencies.prototype.getProfitability = function( currenciesPath) {

    if (this.debugged) {
        return;
    }

    if (Object.keys(this.currencyBook).length <= 2) {
        return;
    } 

    let profitability = 1.0;
    
    debug ('Path: ' + currenciesPath.join(' -> '));
    for (let i = 0; i < currenciesPath.length - 1; i++) {
        let curFrom = currenciesPath[i];
        let curTo = currenciesPath[i + 1];
        if (this.currencyBook[curFrom] !== undefined && this.currencyBook[curFrom][curTo] !== undefined) {
            debug('FROM ' + currenciesPath[i] + ' to ' + currenciesPath[i + 1] + ':');
            debug('Bid: ' + this.currencyBook[curFrom][curTo].price);
            debug('Ask: ' + this.currencyBook[curFrom][curTo].price);
            this.debugged = true;
            profitability = profitability * this.currencyBook[curFrom][curTo].price * (1 - this.fee);
            
        } else {
            this.debugged = false;
            return;
        }
    }
    debug ('Profitability: ' + profitability);
}


Currencies.prototype.getBestPath = function(currency = config.measureUnit) {
    let bestProfitability = 0.0;
    let bestPath = [];
    //Step 0: USD -> A
    for (let key in this.currencyBook[currency]) {
        //Step 1: A -> B
        for (let key2 in (this.currencyBook[key])) {
            //Step 2: B -> USD
            if (this.currencyBook[key2][currency] !== undefined) {
                let profitability = 
                    (1 - this.fee) * 
                    (1 - this.fee) * 
                    (1 - this.fee) / 
                    this.currencyBook[key2][currency].price /
                    this.currencyBook[key][key2].price /
                    this.currencyBook[currency][key].price ;
                if (profitability > bestProfitability ) {
                    bestProfitability = profitability;
                    bestPath = [{
                        from: currency,
                        to: key,
                        price: Number(this.currencyBook[currency][key].price),
                        amount: Number(this.currencyBook[currency][key].amount)
                    }, {
                        from: key,
                        to: key2,
                        price: Number(this.currencyBook[key][key2].price),
                        amount: Number(this.currencyBook[key][key2].amount)
                    }, {
                        from: key2,
                        to: currency,
                        price: Number(this.currencyBook[key2][currency].price),
                        amount: Number(this.currencyBook[key2][currency].amount)
                    }];
                }
                if (profitability < 0.5) {
                    debug('Path: ' + currency + ' - ' + key + ' - ' + key2 + ' - ' + currency + ': ' + profitability);
                    debug(this.currencyBook[currency][key]);
                    debug(this.currencyBook[key][key2]);
                    debug(this.currencyBook[key2][currency]);
                    debug(this.currencyBook);
                    //debug(this.orderBook);
                    process.exit();
                }

                debug('Path: ' + currency + ' - ' + key + ' - ' + key2 + ' - ' + currency + ': ' + profitability);
            }
        }
    }

    debug('------------');
    if (bestProfitability > config.profitability) {
        return { profitability: bestProfitability, path: bestPath };
    } 
    return false;
}

Currencies.prototype.getBestCurrency = function(credit) {
    let path, prof = 0, temp;
    //for (let cur of Object.keys(credit)) {
        let cur = 'BTC'
        temp = this.getBestPath(cur);
        
        if ( temp !== false && temp.profitability > prof) {
            path = temp.path;
            prof = temp.profitability;
        }
    //}
    if (prof < 1) {
        return;
    } else {
        debug('FOUND:');
        debug(path);
        debug('Profit: ' + prof);
    }
    this.emit('profit', path);
}

Currencies.prototype.getMaxAmount = function(creditArray, orderPath) {
    
    let amounts = creditArray;
    creditArray.push(Math.abs(orderPath[0].amount * orderPath[0].price));
    creditArray.push(Math.abs(orderPath[1].amount * orderPath[1].price * orderPath[0].price));
    creditArray.push(Math.abs(orderPath[2].amount * orderPath[2].price * orderPath[1].price * orderPath[0].price));
    debug('precio de ' + orderPath[1].to + ' en ' + orderPath[0].from + ': ' + orderPath[1].price * orderPath[0].price);
    debug(creditArray);
    return Math.min.apply(Math, creditArray.map((x) => {return x*0.98}));
}

Currencies.prototype.getAbsoluteProfit = function(orderPath, profitability) {
    if (orderPath[0].from == config.measureUnit) {
        return this.getMaxAmount([-1], orderPath) * (profitability - 1);
    }
    debug('Unable to measure. Currency: ' + orderPath[0].from + ', Measurement Unit: '  + config.measureUnit);
    return config.absoluteProfit;
}

Currencies.prototype.logOrderBook = function(path) {
    //debug(path);
    //Si no es inverso, por ejemplo, BTCUSD
    if (this.currencyDictionary.pairs[path[0].from+path[0].to] !== undefined) {
        let symbol = this.currencyDictionary.pairs[path[0].from+path[0].to].symbol;
        debug('Vendemos ' + path[0].from + ' por ' + path[0].to)
        try {
            debug(this.orderBook[symbol].bid[0].size + ' ' + path[0].from + 
            ' a ' + this.orderBook[symbol].bid[0].price + ' ' + path[0].to +
            ' (' + this.orderBook[symbol].bid[0].price * this.orderBook[symbol].bid[0].size + 
            path[0].to + ')');
        } catch (e) {
            debug(path[0].from+path[0].to + ' -> ' + this.orderBook[symbol]);process.exit();
        }
    } else {
        let symbol = this.currencyDictionary.pairs[path[0].to+path[0].from].symbol;
        debug('Compramos ' + path[0].to + ' Con ' + path[0].from);
        try {
            debug(this.orderBook[symbol].ask[0].size + ' ' + path[0].to + 
            ' a ' + this.orderBook[symbol].ask[0].price + ' ' + path[0].from + 
            ' (' + this.orderBook[symbol].ask[0].price * this.orderBook[symbol].ask[0].size + 
            path[0].from + ')');
        } catch (e) {
            debug(path[0].to+path[0].from + ' -> ' + this.orderBook[symbol]);process.exit();
        }
    }
    //Si no es inverso, por ejemplo, BTCUSD
    if (this.currencyDictionary.pairs[path[1].from+path[1].to] !== undefined) {
        let symbol = this.currencyDictionary.pairs[path[1].from+path[1].to].symbol;
        debug('Vendemos ' + path[1].from + ' por ' + path[1].to)
        debug(this.orderBook[symbol].bid[0].size + ' ' + path[1].from + 
        ' a ' + this.orderBook[symbol].bid[0].price + ' ' + path[1].to +
        ' (' + this.orderBook[symbol].bid[0].price * this.orderBook[symbol].bid[0].size + 
        path[1].to + ')');
    } else {
        let symbol = this.currencyDictionary.pairs[path[1].to+path[1].from].symbol;
        debug('Compramos ' + path[1].to + ' Con ' + path[1].from)
        debug(this.orderBook[symbol].ask[0].size + ' ' + path[1].to + 
        ' a ' + this.orderBook[symbol].ask[0].price + ' ' + path[1].from + 
        ' (' + this.orderBook[symbol].ask[0].price * this.orderBook[symbol].ask[0].size + 
        path[1].from + ')');
    }
    //Si no es inverso, por ejemplo, BTCUSD
    if (this.currencyDictionary.pairs[path[2].from+path[2].to] !== undefined) {
        let symbol = this.currencyDictionary.pairs[path[2].from+path[2].to].symbol;
        debug('Vendemos ' + path[2].from + ' por ' + path[2].to)
        debug(this.orderBook[symbol].bid[0].size + ' ' + path[2].from + 
        ' a ' + this.orderBook[symbol].bid[0].price + ' ' + path[2].to +
        ' (' + this.orderBook[symbol].bid[0].price * this.orderBook[symbol].bid[0].size + 
        path[2].to + ')');
    } else {
        let symbol = this.currencyDictionary.pairs[path[2].to+path[2].from].symbol;
        debug('Compramos ' + path[2].to + ' Con ' + path[2].from)
        debug(this.orderBook[symbol].ask[0].size + ' ' + path[2].to + 
        ' a ' + this.orderBook[symbol].ask[0].price + ' ' + path[2].from + 
        ' (' + this.orderBook[symbol].ask[0].price * this.orderBook[symbol].ask[0].size + 
        path[2].from + ')');
    }
}

Currencies.prototype.renamePath = function(orderPath) {
    var curs = [];
    for (let order of orderPath) {
        curs.push(this.currencyDictionary.currencies[order.from]);
    }
    return curs;
}

module.exports = Currencies;