"use strict";

const inherits = require('util').inherits;  
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('bidder:trader');
const config = require('./config');

const Trader = function(currencies) {
    EventEmitter.call(this);
    this.currencies = currencies;
    this.credit = {};

    this.currencies.on('bookUpdated', () => {
        if (this.currencies.listenerCount('profit') > 0) {
            this.currencies.getBestCurrency(this.credit)
        }
    });
}

inherits(Trader, EventEmitter);

Trader.prototype.startTrade = function() {
    this.currencies.tradingApi.balance((balances) => {
        debug('Credit: ');
        for (let currency in balances) {
            if (~config.currencies.indexOf(currency)) {
                debug(currency + ': ' + balances[currency].available);
                this.credit[currency] = Number(balances[currency].available);
            }
        }
        this.currencies.on('profit', (orderPath) => {
            this.currencies.removeAllListeners('profit');
            this.order(orderPath);
        });
    });
}

Trader.prototype.getBestCurrency = function() {
    let acc = 0;
    for (let currency of this.credit) {
        if (currency > acc) {
            return currency;
        }
    }
}

Trader.prototype.testTrade = function(path, fee) {
    let oldCredit = this.credit['USD'];
    let market, amount, price, type = 'LIMIT';
    for (let i = 0; i < path.length; i++) {
        if (this.credit[path[i].from] === undefined) {
            this.credit[path[i].from] = 0.0;
        }
        if (this.credit[path[i].to] === undefined) {
            this.credit[path[i].to] = 0.0;
        }
        if ( this.currencies.currencyBook[path[i].from][path[i].to].inverse) {
            market = 't'+path[i].to+path[i].from
            price = 1/this.currencies.currencyBook[path[i].from][path[i].to].price;
            amount = this.credit[path[i].from] * (1 - fee) / price;
        } else {
            market = 't'+path[i].from+path[i].to
            amount = this.credit[path[i].from]*this.currencies.currencyBook[path[i].from][path[i].to].price * (1 - fee);
            price = this.currencies.currencyBook[path[i].from][path[i].to].price;
        }
        debug('market: ' + market + ', amount: ' + amount + ', price: ' + price);
        this.credit[path[i].to] += amount;
        this.credit[path[i].from] = 0;
    }
    debug(this.credit['USD']);
    debug(this.credit['USD']/oldCredit);

}

Trader.prototype.order = function(orderPath) {
    let renamedCurrencies = this.currencies.renamePath(orderPath);
    for (let i in orderPath) { 
        orderPath[i].from = renamedCurrencies[i]
    }
    let maxAmount = this.currencies.getMaxAmount([
        this.credit[orderPath[0].from] || (this.credit[orderPath[0].from] = 0)], orderPath);
    if (maxAmount < config.minAmount[orderPath[0].from]) {
        debug('ORDER FAILED: ' + maxAmount + ' ' + orderPath[0].from + ' is smaller than min amount (' + config.minAmount[orderPath[0].from] + orderPath[0].from + ')' );
       // this.emit('orderFailed');
        //return;
    }

    let orderConfig = [];
    for (let i = 0; i < orderPath.length; i++) {
        let order = orderPath[i];
        //Reset Credit
        if (this.credit[order.from] === undefined) {
            this.credit[order.from] = 0.0;
        }
        if (this.credit[order.to] === undefined) {
            this.credit[order.to] = 0.0;
        }
        if ( this.currencies.currencyBook[order.from][order.to].inverse) {
            
            orderConfig.push({
                market: this.currencies.currencyDictionary.pairs[order.to + order.from].symbol,
                price: this.currencies.currencyBook[order.from][order.to].price,
                from: order.from,
                to: order.to,
                type: 'buy'
            });
        } else {
            orderConfig.push({
                market: this.currencies.currencyDictionary.pairs[order.from + order.to].symbol,
                price: 1 / this.currencies.currencyBook[order.from][order.to].price,
                from: order.from,
                to: order.to,
                type: 'sell'
            });
        }
    }
    
    let orderDirection = orderPath.map(function(x) {
        return +this.currencies.currencyBook[x.from][x.to].inverse; 
    }.bind(this)).join("");
            
    switch (orderDirection) {
        case '001':
            orderConfig[0].amount = -maxAmount;
            orderConfig[1].amount = orderConfig[0].amount*orderConfig[0].price;
            orderConfig[2].amount = -orderConfig[1].amount*orderConfig[2].price/orderConfig[1].price;
        break;
        case '010':
            orderConfig[0].amount = -maxAmount;
            orderConfig[1].amount = -orderConfig[0].amount*orderConfig[0].price/orderConfig[1].price;
            orderConfig[2].amount = -orderConfig[1].amount;
        break;
        case '011':
            orderConfig[0].amount = -maxAmount;
            orderConfig[1].amount = -orderConfig[0].amount*orderConfig[1].price/orderConfig[0].price;
            orderConfig[2].amount = orderConfig[1].amount/orderConfig[2].price;
        break;
        case '100':
            orderConfig[0].amount = maxAmount/this.currencies.currencyBook[orderConfig[0].from][orderConfig[0].to].price;
            orderConfig[1].amount = -orderConfig[0].amount;
            orderConfig[2].amount = orderConfig[1].amount 
                / this.currencies.currencyBook[orderConfig[1].from][orderConfig[1].to].price ;
        break;
        case '101':
            orderConfig[0].amount = maxAmount/orderConfig[0].price;
            orderConfig[1].amount = -orderConfig[0].amount;
            orderConfig[2].amount = -orderConfig[1].amount * orderConfig[1].price
                / orderConfig[2].price ;
        break;
        case '110':
            orderConfig[0].amount = maxAmount/this.currencies.currencyBook[orderConfig[0].from][orderConfig[0].to].price;
            orderConfig[1].amount = orderConfig[0].amount/this.currencies.currencyBook[orderConfig[1].from][orderConfig[1].to].price;
            orderConfig[2].amount = -orderConfig[1].amount;
        break;
        default:
            debug (orderDirection);
            return;
    }

    this.orderPromise(orderConfig[0]).then(() => {
        return this.orderPromise(orderConfig[1]);
    }).then(() => {
        return this.orderPromise(orderConfig[2]);
    }).then(() => {
        this.emit('orderCompleted');
    }).catch((err) => {
        debug('Ha habido error');
        debug(err);
    });
}

Trader.prototype.updateWallet = function(payload) {
    for (let currencyArray of payload) {
        if (currencyArray[0] === 'exchange') {
            this.credit[currencyArray[1]] = currencyArray[2];
        }
    }
    debug('Crédito en nuestro Wallet: ');
    debug(this.credit);
}

Trader.prototype.updateWalletCurrency = function(currency, amount) {
    this.credit[currency] = amount;
}

Trader.prototype.orderPromise = function (orderConfig) {
    return new Promise((resolve, reject) => {
        let orderAmount = 0;
        let orderId = 0;

        debug ('old orderAmount: ' + orderConfig.amount);
        //inverse
        if (orderConfig.type == 'buy') {
            debug('buying ' + orderConfig.to + ')');
            debug('established amount: ' + orderConfig.amount );
            debug('credit amount: ' + this.credit[orderConfig.from]/orderConfig.price + ' (in '+orderConfig.to + ')' );
            orderAmount = Math.min(orderConfig.amount, this.credit[orderConfig.from]/orderConfig.price);
        } else {
            debug('amount is negative (buying ' + orderConfig.to + ')');
            debug('established amount: ' + Math.abs(orderConfig.amount) );
            debug('credit amount: ' + this.credit[orderConfig.from] + ' (in ' + orderConfig.from + ')' );
            orderAmount = -Math.min(Math.abs(orderConfig.amount), Math.abs(this.credit[orderConfig.from]));
        }
        debug ('new orderAmount: ' + orderAmount);

        if (config.testing) {
            debug('Testing app. Trading is disabled');
            //orderId = this.bfxlib.testAddOrder(orderConfig.from, orderConfig.market, orderAmount, orderConfig.price, orderConfig.type);
        } else if (orderConfig.type == 'buy'){
            this.currencies.tradingApi.buy(orderConfig.market, orderConfig.amount, orderConfig.price, {}, function(response) {
                console.log("Limit Buy response", response);
                console.log("order id: " + response.orderId);
                return resolve();
              });
        } else {
            this.currencies.tradingApi.sell(orderConfig.market, orderConfig.amount, orderConfig.price, {}, function(response) {
                console.log("Limit Buy response", response);
                console.log("order id: " + response.orderId);
                return resolve();
              });
        }
        

       /* this.bfxlib.on('tradeExecuted', (res) => {
            if (res[2] == orderId) {
                return resolve();
            }
        })*/

    });
}



module.exports = Trader;