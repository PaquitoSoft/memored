# Memored

Memored implements an in-memory shared cache to use in nodejs applications which uses [cluster](http://nodejs.org/api/cluster.html) module.

Let's say you want your application to take advantage of multi-core CPUs using nodejs cluster module; you will be able to run several _isolated_ processes which shared nothing but a communication channel with parent process.
If you need a fast volatile cache, common solutions would create an in-memory map for every process you run, so you end up with the same data stored several times in your machine RAM.

Memored uses communication channel between master process and its workers to use a unique in-memory storage, reducing the amount of memory your application uses.

## Getting Started
Install this module with _npm_:
```javascript
npm install memored
```

Store and read values is straightforward:
```javascript
var cluster = require('cluster'),
	memored = require('memored');

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
```

## Invalidation management
By default, _memored_ will evict cache entries (stored with _ttl_) passively. This is, when you read an expired entry, you will get no value on return and _memored_ will delete the value from its internal cache.

You can also configure _memored_ to actively evict expired entries every N milliseconds. For this to work, you need to pass the attribute *purgeInterval* to the *setup* function.
This will trigger an internal function which looks for expired entries and deletes them from its internal cache.

Example:
```javascript
var cluster = require('cluster'),
	async = require('async'),
	memored = require('memored');

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
```

## API
Documentation for every module function:


### setup(options)

This function is used to configure _memored_.

**Arguments**:

- **purgeInterval** {Number} (optional): Configures and triggers _memored_ expired entries auto deletion. Value expressed in milliseconds. _It's only used when called this method from the master process of your application_.
- **logger** {Object} (optional): In you want _memored_ to log something, you must provide an object implementing *log* and *warn* functions.

**Example**:
```javascript
memored.setup({
	purgeInterval: 15000,
	logger: console
});
```

### store(key, value, [ttl], callback)

This function stores a value in the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **key** {String} (required): Key used to lookup the entry
- **value** {Mixed} (required): Whatever you want to store
- **ttl** {Number} (optional): Time to live for this value in the cache (milliseconds)
- **callback** {Function} (optional): Function to be call on store completion. Callback arguments:
	- _data_ {Object}: If _ttl_ is used, this object will contain an *expirationTime* attribute with the timestamp of the moment when this entry will expire. If _ttl_ is not used, this object will be undefined.

**Examples**:
```javascript
memored.store('key1', {firstname: 'Han', lastname: 'Solo'}, function() {
	console.log('Value stored!');
});

memored.store('key2', ['a', 'b', 'c'], 15000, function(data) {
	console.log('This value will expire on:', new Date(data.expirationTime));
});
```

### read(key, callback)

This function reads a value from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **key** {String} (required): Key used to lookup the entry
- **callback** {Function} (required): Function to be called on read completion. Callback arguments:
	- _data_ {Object}: If the value was found and it's not expired, this object will contain an attribute named *value* with the contents of the cached entry. If the value is not found or is expired, the object will be undefined.

**Example**:
```javascript
memored.read('key1', function(data) {
	console.log('Key1 value:', data.value);
});

memored.read('unknownKey', function(data) {
	console.log('No data read?', data === undefined);
});
```

### remove(key, callback)

This function removes an entry from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **key** {String} (required): Key used to lookup the entry
- **callback** {Function} (optional): Function to be called on read completion. No callback arguments.

**Example**:
```javascript
memored.remove('key1', function() {
	console.log('Key removed from the cache.');
});
```

### clean(callback)

This function removes all the entries from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **callback** {Function} (optional): Function to be called on read completion. No callback arguments.

**Example**:
```javascript
memored.clean(function() {
	console.log('All cache entries have been deleted.');
});
```

### size(callback)

This function returns the number of entries in the cache.

**Arguments**:

- **callback** {Function} (required): Function to be called on size calculation is complete. Callback arguments:
	- _data_ {Object}: This object will contain an attribute named *size* with the number of entries in the cache.

**Example**:

```javascript
memored.size(function(data) {
	console.log('Cache size:', data.size);
});
```

### version

This is an attribute wich provides module's version number


## License
Copyright (c) 2014 PaquitoSoft  
Licensed under the MIT license.