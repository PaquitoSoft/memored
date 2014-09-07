'use strict';

var cluster = require('cluster'),
	memored = require('../index');

if (cluster.isMaster) {

	for (var i = 0; i < 2; i++) {
		cluster.fork();
	}

} else {
	
	memored.store('user1', {
		name: 'Rollo',
		surname: 'Tomassi'
	}, 1000, function() {
		console.log('User1 stored in cache!');
	});	
	
	setTimeout(function() {
		memored.store('user2', {
			name: 'Han',
			surname: 'Solo'
		}, function() {
			console.log('User2 stored in cache!');
		});
	}, 2000);
}