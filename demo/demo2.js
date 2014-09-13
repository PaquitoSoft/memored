var cluster = require('cluster'),
	async = require('async'),
	memored = require('../index');

if (cluster.isMaster) {

	cluster.fork();
	memored.setup({ purgeInterval: 500});

} else {

	async.series({
		storeValue: function(next) {
			memored.store('key1', 'My simple string value', 100, next);
		},
		readCacheSize: function(next) {
			memored.size(function(err, size) {
				console.log('Current size is 1?', size === 1);
				next();
			});
		},
		wait: function(next) {
			setTimeout(next, 600);
		},
		readCacheSizeAgain: function(next) {
			memored.size(function(err, size) {
				console.log('Current size is 0?', size === 0);
				next();
			});
		}
	}, process.exit);
}