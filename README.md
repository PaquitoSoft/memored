# Memored

Memored implements an in-memory shared cache to use in nodejs applications which uses [cluster](http://nodejs.org/api/cluster.html) module.

Let's say you want your application to take advantage of multi-core CPUs using nodejs cluster module; you will be able to run several _isolated_ processes which shared nothing but a communication channel with parent process.
If you need a fast volatile cache, common solutions would create an in-memory map for every process you run, so you end up with the same data stored several times in your machine RAM.

Memored uses communication channel between master process and its workers to use a unique in-memory storage, reducing the amount of memory your application would use.

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

		memored.read('character1', function(err, value) {
			console.log('Read value:', value);
		});
	});

	// You can also set a ttl (milliseconds)
	memored.store('character2', luke, 1000, function(err, expirationTime) {
		console.log('Value stored until:', new Date(expirationTime));

		setTimeout(function() {
			memored.read('character2', function(err, value) {
				console.log('Value is gone?', value === undefined);

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

### store(key, value, [ttl], [callback])

This function stores a value in the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **key** {String} (required): Key used to lookup the entry
- **value** {Mixed} (required): Whatever you want to store
- **ttl** {Number} (optional): Time to live for this value in the cache (milliseconds)
- **callback** {Function} (optional): Function to be call on store completion. Callback arguments:
	- _err_ {Error}: Optional error
	- _expirationTime_ {Number}: The timestamp of the moment when this entry will expire. If _ttl_ is not used, this value will be undefined.

**Examples**:
```javascript
memored.store('key1', {firstname: 'Han', lastname: 'Solo'}, function() {
	console.log('Value stored!');
});

memored.store('key2', ['a', 'b', 'c'], 15000, function(err, expirationTime) {
	console.log('This value will expire on:', new Date(expirationTime));
});
```

### multiStore(map, [ttl], [callback])

This function stores several values in the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **map** {Object} (required): Map where the keys represents the keys for the entry in the cache and the values represent the data to be stored.
- **ttl** {Number} (optional): Time to live for this value in the cache (milliseconds). All the entries will have the same _ttl_. As all entries will be stored in the same _tick_, its expiration time will be practically the same.
- **callback** {Function} (optional): Function to be call on store completion. Callback arguments:
	- _err_ {Error}: Optional error
	- _expirationTime_ {Number}: The timestamp of the moment when the first of the entries will expire. If _ttl_ is not used, this value will be undefined.

**Examples**:
```javascript
var users = {
    'user1': { name: 'Han Solo' },
    'user2': { name: 'Princess Leia' },
    'user3': { name: 'Luke Skywalker' }
};
memored.multiStore(users, function() {
    console.log('Users saved');
});

memored.multiStore(users, 15000, function(err, expirationTime) {
    console.log('First value will expire on:', new Date(expirationTime));
});
```


### read(key, callback)

This function reads a value from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **key** {String} (required): Key used to lookup the entry
- **callback** {Function} (required): Function to be called on read completion. Callback arguments:
	- _err_ {Error}: Optional error
	- _value_ {Mixed}: Contents of the cached entry. If the value is not found or is expired, it will be undefined.

**Example**:
```javascript
memored.read('key1', function(err, value) {
	console.log('Key1 value:', value);
});

memored.read('key1', function(err, value, expirationTime) {
	console.log('Key1 value:', value);
	console.log('Key1 expiration time:', new Date(expirationTime));
});

memored.read('unknownKey', function(err, value) {
	console.log('No data read?', value === undefined);
});
```

### multiRead(keys, callback)

This function reads several values from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **keys** {Array(string)} (required): List of keys to lookup entries in the cache
- **callback** {Function} (required): Function to be called on read completion. Callback arguments:
	- _err_ {Error}: Optional error
    - _values_ {Object}: An object where its keys will be the keys used in the _keys_ array and their values will be objects representing cached entries with the attributes _value_ and _expirationTime_. If a cache entry is not found for a given key, that key will not be included in the _values_. Only found entries will exist in the result.
    
**Example**;
```javascript
memored.multiRead(['key1', 'key2', 'unknownKey'], function(err, values) {
    console.log('Key1 value:', values.key1.value);
    console.log('Key1 expiration time:', values.key1.expirationTime);
    
    console.log(Object.keys(values)); // ['key1', 'key2']
    
    console.log('unknownKey:', values.unknownKey); // undefined
});
```

### remove(key, callback)

This function removes an entry from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **key** {String} (required): Key for the entry to be removed.
- **callback** {Function} (optional): Function to be called on removal completion.

**Example**:
```javascript
memored.remove('key1', function() {
	console.log('Key removed from the cache.');
});
```

### multiRemove(keys, callback)

This function removes several entries from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **keys** {Array(string)} (required): Keys for the entries to be removed. If any key is not found in the cache, it's just ignored.
- **callback** {Function} (optional): Function to be called on removal completion.

**Example**:
```javascript
memored.multiRemove(['key1', 'key2', 'unknownKey'], function() {
    console.log('Entries foundn in the cache has been removed.')
});
```

### clean(callback)

This function removes all the entries from the cache.
_It is intended to be called from a worker process_.

**Arguments**:

- **callback** {Function} (optional): Function to be called on read completion.

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
	- _err_ {Error}: Optional error
	- _size_ {Number}: The number of entries in the cache.

**Example**:

```javascript
memored.size(function(err, size) {
	console.log('Cache size:', size);
});
```

### keys(callback)

This function returns an array of the keys for objects in the cache.

**Arguments**:

- **callback** {Function} (required): Function to be called when keys calculation is complete. Callback arguments:
	- _err_ {Error}: Optional error
	- _keys_ {Array}: An array of strings for the keys of the entries in the cache.

**Example**:

```javascript
memored.keys(function(err, keys) {
	console.log('Cache keys:', keys);
});
```

### version

This is an attribute which provides module's version number


# Final note
All the callbacks first parameter is an optional error object. Actually, this param will never be an error because there is no expected error in the internal code. There's no function call that can possible throw an expected error that this module would deal with.
The existence of this param is to follow the *convention* about libraries callbacks in nodejs. As everybody expects this first callback parameter to be an optional one, I decided to include it.

- [Nodeguide](http://nodeguide.com/style.html#callbacks)
- [Nodejitsu](http://docs.nodejitsu.com/articles/errors/what-are-the-error-conventions)
- [GoSquared](https://engineering.gosquared.com/node-js-error-handling-callbacks-vs-promises)


## License
Copyright (c) 2014 PaquitoSoft  
Licensed under the MIT license.