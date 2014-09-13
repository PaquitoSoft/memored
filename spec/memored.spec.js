'use strict';

/* global describe, after, it */
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
					ttl: 25
				},
				{
					key: 'mock3',
					value: _createUser()
				}
			];

			it.only('Should auto-remove old data if configured to purge', function(done) {
				async.series({
					setup: function(next) {
						memored.setup({purgeInterval: 175, mockData: mockedData});
						next();
					},
					getCacheSize: function(next) {
						memored.size(function(data) {
							expect(data.size).to.equal(3);
							next();
						});
					},
					wait: function(next) {
						setTimeout(next, 200);
					},
					getCacheSize2: function(next) {
						memored.size(function(data) {
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

		describe('Memored - store', function() {

			it('Should store a value in the cache', function(done) {
				var user1 = _createUser();
				memored.store('user1', user1, function(data) {
					expect(data).to.equal(undefined);
					done();
				});
			});

			it('Should store a value and create an expiration time when ttl is used', function(done) {
				var user2 = _createUser(),
					t1 = Date.now();
				memored.store('user2', user2, 100, function(data) {
					expect(data).to.be.an('object');
					expect(data).to.have.keys('expirationTime');
					expect(data.expirationTime).to.be.a('number');
					expect(data.expirationTime).to.be.least(t1 + 100);
					done();
				});
			});

		});

		describe('Memored - read', function() {

			it('Should read a cache entry', function(done) {
				var user3 = _createUser();
				async.series({
					storeValue: function(next) {
						memored.store('user3', user3, function() {
							next();
						});
					},
					readValue: function(next) {
						memored.read('user3', function(data) {
							expect(data).to.have.keys('value');
							expect(data.value).to.eql(user3);
							next();
						});
					}
				}, done);
			});
			
			it('Should return a null entry when looking for a non-existing cache entry', function(done) {
				memored.read('unknownKey', function(data) {
					expect(data).to.equal(undefined);
					done();
				});
			});
			
			it('Should respect cache entry ttl', function(done) {
				var user4 = _createUser(),
					t1 = Date.now();

				async.series({
					storeValue: function(next) {
						memored.store('user4', user4, 20, function() {
							next();
						});
					},
					readValue1: function(next) {
						memored.read('user4', function(data) {
							expect(data.value).to.eql(user4);
							expect(data.expirationTime).to.least(t1 + 20);
							next();
						});
					},
					readValue2: function(next) {
						setTimeout(function() {
							memored.read('user4', function(data) {
								expect(data).to.equal(undefined);
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
						memored.store('user5', user5, function() {next();});
					},
					readValue1: function(next) {
						memored.read('user5', function(data) {
							expect(data.value).to.eql(user5);
							next();
						});
					},
					removeValue: function(next) {
						memored.remove('user5', function() {next();});
					},
					readValue2: function(next) {
						memored.read('user5', function(data) {
							expect(data).to.equal(undefined);
							next();
						});
					}
				}, done);
			});

		});

		describe('Memored - clean', function() {
			it('Should remove all values in cache', function(done) {
				var user6 = _createUser(),
					user7 = _createUser();
				
				async.series({
					soreValue1: function(next) {
						memored.store('user6', user6, function() {next();});
					},
					storeValue2: function(next) {
						memored.store('user7', user7, function() {next();});	
					},
					readValue1: function(next) {
						memored.read('user6', function(data) {
							expect(data.value).to.eql(user6);
							next();
						});
					},
					readValue2: function(next) {
						memored.read('user7', function(data) {
							expect(data.value).to.eql(user7);
							next();
						});
					},
					cleanCache: function(next) {
						memored.clean(next);
					},
					readValue4: function(next) {
						memored.read('user6', function(data) {
							expect(data).to.equal(undefined);
							next();
						});
					},
					readValue5: function(next) {
						memored.read('user7', function(data) {
							expect(data).to.equal(undefined);
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
	
	}

});