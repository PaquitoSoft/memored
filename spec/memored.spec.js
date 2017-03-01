'use strict';

/* global describe, beforeEach, after, afterEach, it */
var cluster = require('cluster'),
	expect = require('chai').expect,
	faker = require('faker'),
	async = require('async'),
	memored = require('../index.js');

function _createUser() {
	return {
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

describe('Memored test suite', function() {
	
	if (cluster.isMaster) {
		cluster.fork();
		
		describe('Memored - purge', function() {

			var mockedData = [
				{
					key: 'mock1',
					value: _createUser(),
					ttl: 25
				},
				{
					key: 'mock2',
					value: _createUser(),
					ttl: 75
				},
				{
					key: 'mock3',
					value: _createUser()
				}
			];

			it.only('Should auto-remove old data if configured to purge', function(done) {
				async.series({
					setup: function(next) {
						memored.setup({purgeInterval: 50, mockData: mockedData});
						next();
					},
					getCacheSize: function(next) {
						memored.size(function(err, data) {
							expect(data.size).to.equal(3);
							next();
						});
					},
					wait: function(next) {
						setTimeout(next, 60);
					},
					getCacheSize2: function(next) {
						memored.size(function(err, data) {
							expect(data.size).to.equal(2);
							next();
						});
					},
					waitAgain: function(next) {
						setTimeout(next, 50);
					},
					getCacheSize3: function(next) {
						memored.size(function(err, data) {
							expect(data.size).to.equal(1);
							next();
						});
					},
				}, done);
			});
		});

	} else {

		after(function() {
			process.exit();
		});

		beforeEach(function(done) {
			memored.clean(done);
		});

		describe('Memored - store', function() {

			it('Should store a value in the cache', function(done) {
				var user1 = _createUser();
				memored.store('user1', user1, function(err, expirationTime) {
					expect(err).to.equal(null);
					expect(expirationTime).to.equal(undefined);
					done();
				});
			});
            
            it('Should store accept to store a value with no callback', function(done) {
                var user21 = _createUser();
                memored.store('user21', user21);
                
                memored.size(function(err, count) {
					expect(count).to.equals(1);
                    done();
                });
            });

			it('Should store a value and create an expiration time when ttl is used', function(done) {
				var user2 = _createUser(),
					t1 = Date.now();
				memored.store('user2', user2, 100, function(err, expirationTime) {
					expect(err).to.equals(null);
					expect(expirationTime).to.be.a('number');
					expect(expirationTime).to.be.least(t1 + 100);
					done();
				});
			});

			it('Should store several values at the same time in the cache', function(done) {
				var users = {
					'user1': _createUser(),
					'user2': _createUser(),
					'user3': _createUser()
				};
				
				memored.multiStore(users, function(err, expirationTime) {
                    expect(err).to.equal(null);
                    expect(expirationTime).to.equal(undefined);
                    done();
				});
			});

            it('Should store several values and return an expiration time when ttl is used', function(done) {
                var users = {
						'user4': _createUser(),
						'user5': _createUser(),
						'user6': _createUser()
					},
                    t1 = Date.now();
                
                memored.multiStore(users, 100, function(err, expirationTime) {
                    expect(err).to.equals(null);
					expect(expirationTime).to.be.a('number');
					expect(expirationTime).to.be.least(t1 + 100);
					done();
                });
            });

		});

		describe('Memored - read', function() {

			it('Should read a cache entry', function(done) {
				var user3 = _createUser();
				async.series({
					storeValue: function(next) {
						memored.store('user3', user3, next);
					},
					readValue: function(next) {
						memored.read('user3', function(err, value) {
							expect(err).to.equals(null);
							expect(value).to.eql(user3);
							next();
						});
					}
				}, done);
			});
			
            it('Should read a bunch of cache entries', function(done) {
                var users = {
					'user7': _createUser(),
					'user8': _createUser(),
					'user9': _createUser()
				};
                
                async.series({
					storeValue: function(next) {
						memored.multiStore(users, next);
					},
					readValue: function(next) {
						memored.multiRead(Object.keys(users).concat('foo'), function(err, values) {
							expect(err).to.equals(null);
                            expect(Object.keys(values).length).to.eql(3);
                            expect(Object.keys(values)).to.contain('user7', 'user8', 'user9');
							expect(values['user7'].value).to.eql(users['user7']);
							expect(values['user8'].value).to.eql(users['user8']);
							expect(values['user9'].value).to.eql(users['user9']);
							expect(values['foo']).to.equals(undefined);
							next();
						});
					}
				}, done);
            });
            
            it('Should get independent cache entries when reading a bunch of keys', function(done) {
                var user10 = _createUser(),
                    user11 = _createUser(),
                    t1, t2;
                    
                async.series({
                    storeUser1: function(next) {
                        t1 = Date.now();
                        memored.store('user10', user10, 500, next);
                    },
                    storeUser2: function(next) {
                        t2 = Date.now();
                        memored.store('user11', user11, 1000, next);
                    },
                    readValues: function(next) {
                        memored.multiRead(['user10', 'user11'], function(err, values) {
                            expect(values.user10.value).to.eql(user10);
                            expect(values.user10.expirationTime).to.least(t1 + 500);
                            expect(values.user11.value).to.eql(user11);
                            expect(values.user11.expirationTime).to.least(t1 + 1000);
                            next();
                        });
                    }
                }, done);
            });
            
			it('Should return an undefined entry when looking for a non-existing cache entry', function(done) {
				memored.read('unknownKey', function(err, value) {
					expect(err).to.equals(null);
					expect(value).to.equal(undefined);
					done();
				});
			});
			
			it('Should respect cache entry ttl', function(done) {
				var user4 = _createUser(),
					t1 = Date.now();

				async.series({
					storeValue: function(next) {
						memored.store('user4', user4, 20, next);
					},
					readValue1: function(next) {
						memored.read('user4', function(err, value, expirationTime) {
							expect(err).to.equals(null);
							expect(value).to.eql(user4);
							expect(expirationTime).to.least(t1 + 20);
							next();
						});
					},
					readValue2: function(next) {
						setTimeout(function() {
							memored.read('user4', function(err, value) {
								expect(err).to.equals(null);
								expect(value).to.equal(undefined);
								next();
							});
						}, 30);
					}
				}, done);
			});
			
		});

		describe('Memored - remove', function() {

			it('Should remove a cache entry', function(done) {
				var user5 = _createUser();
				async.series({
					storeValue: function(next) {
						memored.store('user5', user5, next);
					},
					readValue1: function(next) {
						memored.read('user5', function(err, value) {
							expect(err).to.equals(null);
							expect(value).to.eql(user5);
							next();
						});
					},
					removeValue: function(next) {
						memored.remove('user5', next);
					},
					readValue2: function(next) {
						memored.read('user5', function(err, value) {
							expect(err).to.equals(null);
							expect(value).to.equal(undefined);
							next();
						});
					}
				}, done);
			});
            
            it('Should remove several keys at once', function(done) {
                var users = {
					'user1': _createUser(),
					'user2': _createUser(),
					'user3': _createUser()
				};
                    
                async.series({
                    storesValues: function(next) {
                        memored.multiStore(users, next);
                    },
                    checkCache: function(next) {
                        memored.size(function(err, count) {
                            expect(count).to.equals(3);
                            next();
                        });
                    },
                    removeValues: function(next) {
                        memored.multiRemove(Object.keys(users).concat('foo'), next);
                    },
                    checkCacheAgain: function(next) {
                        memored.size(function(err, count) {
                            expect(count).to.equals(0);
                            next();
                        });
                    }
                }, done);
            });

		});

		describe('Memored - clean', function() {
            
            afterEach(function(done) {
                memored.clean(done);
            });
            
			it('Should remove all values in cache', function(done) {
				var user6 = _createUser(),
					user7 = _createUser();
				
				async.series({
					soreValue1: function(next) {
						memored.store('user6', user6, next);
					},
					storeValue2: function(next) {
						memored.store('user7', user7, next);
					},
					readValue1: function(next) {
						memored.read('user6', function(err, value) {
							expect(err).to.equals(null);
							expect(value).to.eql(user6);
							next();
						});
					},
					readValue2: function(next) {
						memored.read('user7', function(err, value) {
							expect(err).to.equals(null);
							expect(value).to.eql(user7);
							next();
						});
					},
					cleanCache: function(next) {
						memored.clean(next);
					},
					readValue4: function(next) {
						memored.read('user6', function(err, value) {
							expect(err).to.equals(null);
							expect(value).to.equal(undefined);
							next();
						});
					},
					readValue5: function(next) {
						memored.read('user7', function(err, value) {
							expect(err).to.equals(null);
							expect(value).to.equal(undefined);
							next();
						});
					},
				}, done);
			});
		});

		describe('Memored - setup -- logger', function() {
			var customLogger = {
				messages: [],
				log: function() {
					this.messages.push(Array.prototype.slice.call(arguments).join(','));
				}
			};
			it('Should use a custom logger when requested', function(done) {
				memored.setup({
					logger: customLogger
				});
				expect(customLogger.messages).to.be.have.length(0);
				memored.store('user8', _createUser(), function() {
					expect(customLogger.messages).to.have.length(1);
					done();
				});
			});
		});
		
		describe('Memored - keys', function() {

			it('Should return keys for entries in the cache', function(done) {
				
				// clean cache to ensure we're measuring against a fresh slate
				memored.clean(function() {

					// create three users with different key prefixes
					async.series({
						createUserOne: function(next) {
							memored.store('abc-user1', _createUser(), next);
						},
						createUserTwo: function(next) {
							memored.store('abc-user2', _createUser(), next);
						},
						createUserThree: function(next) {
							memored.store('def-user3', _createUser(), next);
						}
					}, function(err) {
						expect(err).to.equals(null);

						// find the keys for items in the cache
						memored.keys(function(err, keys) {

							// should be 3 keys total
							expect(keys.length).to.equal(3);

							// count the keys by prefix
							var abcCount = 0;
							var defCount = 0;
							for (var i = 0; i < keys.length; i++) {
								if (keys[i].indexOf("abc-") === 0) {
									abcCount++;
								} else if (keys[i].indexOf("def-") === 0) {
									defCount++;
								}
							}
							
							// two keys that start with "abc-"
							expect(abcCount).to.equal(2);
							
							// one key that starts with "def-"
							expect(defCount).to.equal(1);
							
							done();
						});
					});					
				});
			});

		});
		
	}

});