var cluster = require('cluster'),
	memored = require('../index');

if (cluster.isMaster) {
	cluster.fork();
} else {
	var han = {
			firstname: 'Han',
			lastname: 'Solo'
		},
		luke = {
			firstname: 'Luke',
			lastname: 'Skywalker'
		};

	// Store and read
	memored.store('character1', han, function() {
		console.log('Value stored!');

		memored.read('character1', function(data) {
			console.log('Read value:', data.value);
		});
	});

	// You can also set a ttl (milliseconds)
	memored.store('character2', luke, 1000, function(data) {
		console.log('Value stored until:', new Date(data.expirationTime));

		setTimeout(function() {
			memored.read('character2', function(data) {
				console.log('Value is gone?', data === undefined);

				process.exit();
			});
		}, 1050);
	});
}