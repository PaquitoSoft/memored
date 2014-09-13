var cluster = require('cluster'),
	async = require('async'),
	memored = require('../index');

if (cluster.isMaster) {

	cluster.fork();
	memored.setup({ purgeInterval: 500});

} else {

	async.series({
		storeValue: function(next) {
			memored.store('key1', 'My simple string value', 100, function() {
				next();
			});
		},
		readCacheSize: function(next) {
			memored.size(function(data) {
				console.log('Current size is 1?', data.size === 1);
				next();
			});
		},
		wait: function(next) {
			setTimeout(next, 600);
		},
		readCacheSizeAgain: function(next) {
			memored.size(function(data) {
				console.log('Current size is 0?', data.size === 0);
				next();
			});
		}
	}, process.exit);
}