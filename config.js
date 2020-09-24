const config = {
    minAmount: {
        'BTC': 0.001,
        'LTC': 0.01,
        'ETH': 0.001,
        'XRP': 1,
        'XMR': 1,
        'DSH': 0.001,
        'ZEC': 0.001,
        'OMG': 0.01,
        'EOS': 1,
        'IOT': 1,
        'ADA': 1,
        'TRX': 1
        
    },
    currencies: [
        'BTC',
        'LTC',
        'ETH',
        'USD',
        'USDT'
    ],

    fee: 0.00015,
    profitability: 1.0001, //Relative
    measureUnit: 'XRP',
    apiKey: '********************************', //BINACE API KEY
    apiSecret: '********************************', //BINANCE API SECRET

    testing: true

};

module.exports = config;