'use strict';

var cluster = require('cluster'),
	packageInfo = require('./package');

var logger = {
	log: function() {},
	warn: function() {}
};

var messagesCounter = 0;

var activeMessages = {};

var purgeIntervalObj;

/*
 message
 - workerPid
 - type
 - requestParams
 */

var cache = {};

var masterMessagesHandlerMap = {
	'read': _readCacheValue,
	'store': _storeCacheValue,
	'remove': _removeCacheValue,
	'clean': _cleanCache,
	'size': _getCacheSize,
	'keys': _getCacheKeys,
    'unknown': function(msg) { logger.warn('Received an invalid message type:', msg.type); }
};

function CacheEntry(data) { // ttl -> milliseconds
	this.key = data.key;
	this.value = data.value;
	this.creationTime = Date.now();
	if (data.ttl) {
		this.ttl = data.ttl;
		this.expirationTime = this.creationTime + data.ttl;
	}
}
CacheEntry.prototype.isExpired = function() {
	return this.expirationTime && Date.now() > this.expirationTime;
};
CacheEntry.prototype.toString = function() {
	return "Key: " + this.key + "; Value: " + this.value + "; Ttl: " + this.ttl;
};

function _findWorkerByPid(workerPid) {
	var i = 0,
		workerIds = Object.keys(cluster.workers),
		len = workerIds.length,
		worker;

	for (; i < len; i++) {
		if (cluster.workers[workerIds[i]].process.pid == workerPid) {
			worker = cluster.workers[workerIds[i]];
			break;
		}
	}

	return worker;
}

function _getResultParamsValues(paramsObj) {
	var result = [null],
		prop;
	if (paramsObj) {
		for (prop in paramsObj) {
			result.push(paramsObj[prop]);
		}
	}
	return result;
}

function _sendMessageToWorker(message) {
	var worker = _findWorkerByPid(message.workerPid);
	worker.send(message);
}

function _sendMessageToMaster(message) {
	message.channel = 'memored';
	message.workerPid = process.pid;
	message.id = process.pid + '::' + messagesCounter++;
	process.send(message);
	if (message.callback) {
		activeMessages[message.id] = message;
	}
}

function _readCacheValue(message) {
	var cacheEntry = cache[message.requestParams.key];
	if (!cacheEntry) return _sendMessageToWorker(message);
	if (cacheEntry.isExpired()) {
		process.nextTick(function() {
			delete cache[message.requestParams.key];
		});
		cacheEntry = null;
	}

	if (cacheEntry) {
		message.responseParams = {
			value: cacheEntry.value
		};
		if (cacheEntry.expirationTime) {
			message.responseParams.expirationTime = cacheEntry.expirationTime;
		}
	}

	_sendMessageToWorker(message);
}

function _storeCacheValue(message) {
	cache[message.requestParams.key] = new CacheEntry(message.requestParams);
	if (message.requestParams.ttl) {
		message.responseParams = {
			expirationTime: cache[message.requestParams.key].expirationTime
		};
	}
	_sendMessageToWorker(message);
}

function _removeCacheValue(message) {
	delete cache[message.requestParams.key];
	_sendMessageToWorker(message);
}

function _cleanCache(message) {
	cache = {};
	_sendMessageToWorker(message);
}

function _getCacheSize(message) {
	message.responseParams = {
		size: Object.keys(cache).length
	};
	_sendMessageToWorker(message);
}

function _getCacheKeys(message) {
	message.responseParams = {
		keys: Object.keys(cache)
	};
	_sendMessageToWorker(message);
}

function _purgeCache() {
	var now = Date.now();
	Object.keys(cache).forEach(function(cacheKey) {
		if (cache[cacheKey].expirationTime && cache[cacheKey].expirationTime < now) {
			delete cache[cacheKey];
		}
	});
}

function _masterIncomingMessagesHandler(message) {
    var handler;
    
	logger.log('Master received message:', message);

	if (!message || message.channel !== 'memored') return false;

    handler = masterMessagesHandlerMap[message.type] || masterMessagesHandlerMap.unknown;

    handler(message);
}

function _workerIncomingMessagesHandler(message) {
	logger.log('Worker received message:', message);

	var pendingMessage;

	if (!message || message.channel !== 'memored') return false;

	pendingMessage = activeMessages[message.id];
	if (pendingMessage && pendingMessage.callback) {
		pendingMessage.callback.apply(null, _getResultParamsValues(message.responseParams));
		delete activeMessages[message.id];
	}

}

if (cluster.isMaster) {

	Object.keys(cluster.workers).forEach(function(workerId) {
		cluster.workers[workerId].on('message', _masterIncomingMessagesHandler);
	});

	// Listen for new workers so we can listen to its messages
	cluster.on('fork', function(worker) {
		worker.on('message', _masterIncomingMessagesHandler);
	});

	// TODO: Only for testing purposes
	// setInterval(function() {
	//	logger.log('\n------------------------------------------');
	//	logger.log(cache);
	//	logger.log('------------------------------------------\n');
	// }, 2000).unref();

} else {

	process.on('message', _workerIncomingMessagesHandler);

}

function _setup(options) {
	options = options || {};
	logger = options.logger || logger;

	if (cluster.isMaster) {

		if (options.mockData) {
			options.mockData.forEach(function(mock) {
				// key, value, ttl
				cache[mock.key] = new CacheEntry(mock);
			});
		}

		if (options.purgeInterval) {
			purgeIntervalObj = setInterval(function() {
				_purgeCache();
			}, options.purgeInterval).unref();
		}
	}
}

function _read(key, callback) {
	if (cluster.isWorker) {
		_sendMessageToMaster({
			type: 'read',
			requestParams: {
				key: key
			},
			callback: callback
		});
	} else {
		logger.warn('Memored::read# Cannot call this function from master process');
	}
}

function _multiRead(keys, callback) {
    var counter = 0,
        results = {};
    
    function _multiReadCallback(err, value, expirationTime) {
        if (value) {
            results[keys[counter]] = {
                value: value,
                expirationTime: expirationTime
            };
        }
        
        if (++counter >= keys.length) {
            callback(err, results);
        }
    }
    
    if (cluster.isWorker) {
        if (!Array.isArray(keys)) {
            return logger.warn('Memored::multiRead# First parameter must be an array');
        }
    
        keys.forEach(function(key) {
            _read(key, _multiReadCallback);
        });
	} else {
		logger.warn('Memored::read# Cannot call this function from master process');
	}
}

function _store(key, value, ttl, callback) {
	if (cluster.isWorker) {
		if (typeof ttl === 'function') {
			callback = ttl;
			ttl = undefined;
		}

		_sendMessageToMaster({
			type: 'store',
			requestParams: {
				key: key,
				value: value,
				ttl: ttl
			},
			callback: callback
		});
	} else {
		logger.warn('Memored::store# Cannot call this function from master process');
	}
}

function _multiStore(map, ttl, callback) {
    var keys,
        _expirationTime,
        counter = 0;
                
    if (cluster.isWorker) {
        if (typeof ttl === 'function') {
			callback = ttl;
			ttl = undefined;
		}
        
        keys = Object.keys(map);
        keys.forEach(function(key) {
            _store(key, map[key], ttl, function _callback(err, expirationTime) {
                counter++;
                if (keys[0] === key) {
                    _expirationTime = expirationTime;
                } else if (counter === keys.length && callback) {
                    callback(err, _expirationTime);
                }
            });
        });
    } else {
        logger.warn('Memored::multiStore# Cannot call this function from master process');
    }
}

function _remove(key, callback) {
	if (cluster.isWorker) {
		_sendMessageToMaster({
			type: 'remove',
			requestParams: {
				key: key
			},
			callback: callback
		});
	} else {
		logger.warn('Memored::remove# Cannot call this function from master process');
	}
}

function _multiRemove(keys, callback) {
    var counter = 0;
    
    function _multiRemoveCallback() {
        if (++counter >= keys.length && callback) {
            callback();
        }
    }
    
    if (cluster.isWorker) {
        if (!Array.isArray(keys)) {
            return logger.warn('Memored::multiRemove# First parameter must be an array');
        }
        
        keys.forEach(function(key) {
            _remove(key, _multiRemoveCallback);
        });
    
	} else {
		logger.warn('Memored::remove# Cannot call this function from master process');
	}
}

function _clean(callback) {
	if (cluster.isWorker) {
		_sendMessageToMaster({
			type: 'clean',
			callback: callback
		});
	} else {
		logger.warn('Memored::clean# Cannot call this function from master process');
	}
}

function _size(callback) {
	if (cluster.isWorker) {
		_sendMessageToMaster({
			type: 'size',
			callback: callback
		});
	} else {
		setImmediate(callback, null, {
			size: Object.keys(cache).length
		});
	}
}

function _reset() {
	if (cluster.isMaster) {
		clearInterval(purgeIntervalObj);
        cache = {};
	} else {
		logger.warn('Memored::reset# Cannot call this function from a worker process');
	}
}

function _keys(callback) {
	if (cluster.isWorker) {
		_sendMessageToMaster({
			type: 'keys',
			callback: callback
		});
	} else {
		setImmediate(callback, {
			keys: Object.keys(cache)
		});
	}
}

module.exports = {
	version: packageInfo.version,
	setup: _setup,
	read: _read,
    multiRead: _multiRead,
	store: _store,
    multiStore: _multiStore,
	remove: _remove,
    multiRemove: _multiRemove,
	clean: _clean,
	size: _size,
	reset: _reset,
	keys: _keys
};
