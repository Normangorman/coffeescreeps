/**
 * Created by Ben on 29/11/2016.
 */
let ScreepsWebpackPlugin = require ('screeps-webpack-plugin');
let Secrets = require('./secrets.js');
let path = require('path');

let screepsWebpackOpts = {
    branch: 'default',
    email: Secrets.email,
    password: Secrets.password,
    serverUrl: 'https://screeps.com',
    gzip: false
};

module.exports = {
    target: 'node',
    entry: './code/main.coffee',
    output: {
        path: 'bin',
        filename: 'main'
    },
    watch: true,
    module: {
        loaders: [
            { test: /\.coffee$/, loader: "coffee-loader" }
        ]
    },
    /*resolveLoader: {
        fallback: [
            path.resolve(__dirname, 'loaders'),
            path.join(process.cwd(), 'node_modules')
        ]
    },*/
    plugins: [
        function() {
            this.plugin('watch-run', function(watching, callback) {
                console.log('Begin compile at ' + new Date());
                callback();
            })
        },
        new ScreepsWebpackPlugin(screepsWebpackOpts)
    ]
};