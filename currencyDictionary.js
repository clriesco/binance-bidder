let currencyDictionary = {
  pairs : { 
    BTCUSD: { symbol: 'BTCUSDT', currency: 'USDT', commodity: 'BTC' },
    BTCUSDT: { symbol: 'BTCUSDT', currency: 'USDT', commodity: 'BTC' },
    LTCBTC: { symbol: 'LTCBTC', currency: 'BTC', commodity: 'LTC' },
    LTCUSD: { symbol: 'LTCUSD', currency: 'USD', commodity: 'LTC' },
    LTCUSDT: { symbol: 'LTCUSDT', currency: 'USDT', commodity: 'LTC' },
    LTCETH: { symbol: 'LTCETH', currency: 'ETH', commodity: 'LTC' },
    ETHUSD: { symbol: 'ETHUSDT', currency: 'USDT', commodity: 'ETH' },
    ETHUSDT: { symbol: 'ETHUSDT', currency: 'USDT', commodity: 'ETH' },
    ETHBTC: { symbol: 'ETHBTC', currency: 'BTC', commodity: 'ETH' }
  },
  currencies: {
    BTC: 'BTC',
    LTC: 'LTC',
    ETH: 'ETH',
    USD: 'USDT',
    USDT: 'USDT',
  }
};
module.exports = currencyDictionary;