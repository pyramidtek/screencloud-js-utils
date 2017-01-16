// var assert = require('assert')
var chai = require('chai')
var expect = chai.expect
var utils = require('../index.js')
var cancellableTimeoutPromise = utils.promise.cancellableTimeoutPromise
var fulfillPromiseOrTimeout = utils.promise.fulfillPromiseOrTimeout
var retryUsingPromiseGenerator = utils.promise.retryUsingPromiseGenerator

describe('cancellableTimeoutPromise', () => {
  it('should timeout', () => {
    var error = new Error('timeout!')
    var timeout = cancellableTimeoutPromise(20, error)
    var promise = Promise.race([
      timeout,
      (new Promise((resolve, _) => {
        setTimeout(() => resolve('it failed'), 30)
      }))
    ]).catch((err) => {
      expect(err).to.be.equal(error)
    })
    return promise
  })
  it('should be cancellable', () => {
    var timeout = cancellableTimeoutPromise(20)
    var promise = Promise.race([
      timeout,
      (new Promise((resolve, _) => {
        setTimeout(() => resolve('it worked'), 30)
      }))
    ]).then((value, err) => {
      expect(err).to.be.equal(undefined)
      expect(value).to.be.equal('it worked')
    })
    timeout.cancel()
    return promise
  })
  it('should allow passing an error as string', () => {
    var timeout = cancellableTimeoutPromise(20, 'foo')
    var promise = Promise.race([
      timeout,
      (new Promise((resolve, _) => {
        setTimeout(() => resolve('it failed'), 30)
      }))
    ]).catch((err) => {
      expect(err.toString()).to.be.equal('Error: foo')
    })
    return promise
  })
  it('should allow passing an error generator', () => {
    var timeout = cancellableTimeoutPromise(20, () => {
      return new Error('woop')
    })
    var promise = Promise.race([
      timeout,
      (new Promise((resolve, _) => {
        setTimeout(() => resolve('it failed'), 30)
      }))
    ]).catch((err) => {
      expect(err.toString()).to.be.equal('Error: woop')
    })
    return promise
  })
})

describe('fulfillPromiseOrTimeout', () => {
  it('should fulfill is resolved before timeout', () => {
    return fulfillPromiseOrTimeout(Promise.resolve('foo'), 20).then((value) => {
      expect(value).to.equal('foo')
    })
  })
  it('should reject if timeout happens first', () => {
    return fulfillPromiseOrTimeout(new Promise((resolve, reject) => {
      setTimeout(() => resolve('done slowly'), 30)
    }), 20).catch((err) => {
      expect(err.toString()).to.equal('Error: timeout')
    })
  })
  it('should call timeout on other promise if supported', () => {
    var called = false
    var promise = new Promise((resolve, reject) => {
      setTimeout(() => resolve('done slowly'), 30)
    })
    promise.timeout = function () {
      called = true
    }
    return fulfillPromiseOrTimeout(promise, 20).catch((err) => {
      expect(called).to.equal(true)
    })
  })
})

describe('retryUsingPromiseGenerator', () => {
  it('should retry until promise resolves', () => {
    var count = 0
    var promiseGenerator = () => {
      count++
      return new Promise((resolve, reject) => {
        if (count === 5) {
          resolve('woop')
        } else {
          reject('boo')
        }
      })
    }
    return retryUsingPromiseGenerator(promiseGenerator,
      {delay: 5, backoffMax: 10}).then((value) => {
      expect(value).to.equal('woop')
    })
  })
  it('should backoff if configured', () => {
    var count = 0
    var promiseGenerator = () => {
      count++
      return new Promise((resolve, reject) => {
        if (count === 5) {
          resolve('woop')
        } else {
          reject('boo')
        }
      })
    }
    var startTime = (new Date()).getTime()
    return retryUsingPromiseGenerator(promiseGenerator,
      {delay: 3, backoffExponent: 1.5}).then((value) => {
      var endTime = (new Date()).getTime()
      var timeTaken = endTime - startTime
      expect(timeTaken).to.be.above(20)
    })
  })
  it('should respect max', () => {
    var count = 0
    var promiseGenerator = () => {
      count++
      return new Promise((resolve, reject) => {
        reject(new Error('reject ' + count))
      })
    }
    return retryUsingPromiseGenerator(promiseGenerator,
      {delay: 0, max: 100}).catch((err) => {
      expect(err.toString()).to.equal('Error: reject 100')
    })
  })
  it('should report errors', () => {
    var count = 0
    var promiseGenerator = () => {
      count++
      return new Promise((resolve, reject) => {
        if (count === 5) {
          resolve('woop')
        } else {
          reject('boo')
        }
      })
    }
    var reported = 0
    return retryUsingPromiseGenerator(promiseGenerator,
      {delay: 0, report: () => {
        reported += 1}}).then((value) => {
      expect(reported).to.be.equal(4)
    })
  })
})
