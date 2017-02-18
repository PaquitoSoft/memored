var cluster = require('cluster'),
	async = require('async'),
    faker = require('faker'),
    toobusy = require('toobusy-js'),
	memored = require('../index');

var TEST_DURATION = 300 * 1000; // one minute
var TTL = 10 * 1000; // ten seconds
var ITERATION_INTERVAL = 10; // milliseconds
var WORKERS_COUNT = 25;
var PURGE_CACHE = false;
var PURGE_CACHE_INTERVAL = 1000; // milliseconds

function _createUser(id) {
	return {
        id: id,
		firstName: faker.Name.findName(),
		lastName: faker.Name.lastName(),
		email: faker.Internet.email(),
		address: {
			streetAddress: faker.Address.streetName() + ' - ' + faker.Address.streetAddress(),
			zipCode: faker.Address.zipCode(),
			city: faker.Address.city()
		}
	};
}

var endTime = Date.now() + TEST_DURATION;
var counter = 0;
var totalReadTime = 0;

if (cluster.isMaster) {
    console.log('Master process PID:', process.pid);
    
    for (var i = 0; i < WORKERS_COUNT; i++) {
        cluster.fork({
            cacheKeyPrefix: +i
        });
    }
	
    toobusy.maxLag(10);
    toobusy.onLag(function(currentLag) {
        console.log("Event loop lag detected! Latency: " + currentLag + "ms");
    });
    
    setInterval(function () {
        memored.size(function(data) {
            console.log('Cache entries count:', data.size);
            // console.log('Master memory usage:', process.memoryUsage());
        });
    }, 5000).unref();
    if (PURGE_CACHE) {
        memored.setup({ purgeInterval: PURGE_CACHE_INTERVAL});
    }

} else {
    console.log('Worker process PID:', process.pid);
    console.log('Running tests...');
    
    // var memwatch = require('memwatch-next');
    // memwatch.on('leak', function(info) {
    //     console.log(info);
    // });
    // memwatch.on('stats', function(stats) {
    //     console.log(stats);
    // });
    // var hd = new memwatch.HeapDiff();
    
    async.whilst(
        function() { 
            return Date.now() < endTime; 
        },
        function(next) {
            var id = process.env.cacheKeyPrefix + '_' + counter++,
                user = _createUser(id);
            
            memored.store(id, user, TTL, function(err) {
                if (err) return next(err);
                var t2 = Date.now();
                memored.read(id - 1, function(_err, data) {
                    totalReadTime += (Date.now() - t2);
                    if (_err) return next(err);
                    setTimeout(next, ITERATION_INTERVAL);
                    user = undefined;
                });
            })
        },
        function(err) {
            if (err) console.log(err);
            // var diff = hd.end();
            // console.log(require('util').inspect(diff, {depth: 5}));
            console.log('Average read time:', (totalReadTime / counter), '(milliseconds)');
            process.exit(1);
            // memored.size(function(__err, cacheItemsCount) {
            //     if (__err) return next(__err);
            //     console.log('Cache items count:', cacheItemsCount);
            //     console.log('Average read time:', (totalReadTime / counter), '(milliseconds)');
            //     console.log('The End!');
            //     process.exit(1);
            // });
        }
    );
}
