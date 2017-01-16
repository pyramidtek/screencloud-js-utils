function cancellableTimeoutPromise (timeout, err) {
  var ref
  var done = false
  var promise = new Promise(function (_, reject) {
    ref = setTimeout(function () {
      done = true
      if (err === undefined) {
        err = new Error('timeout')
      } else if (err instanceof Error) {
        // nothing to do..
      } else if (typeof err === 'string') {
        err = new Error(err)
      } else {
        // assume its a generator
        err = err()
      }
      reject(err)
    }, timeout)
  })
  promise.cancel = function () {
    if (done) return
    done = true
    clearTimeout(ref)
  }
  return promise
}

function fulfillPromiseOrTimeout (promise, timeout, err) {
  var timeoutPromise = cancellableTimeoutPromise(timeout, err)
  promise = (promise instanceof Promise) ? promise : promise()
  return Promise.race([
    promise,
    timeoutPromise.catch(function (err) {
      if (promise.timeout !== undefined) {
        try {
          promise.timeout()
        } catch(_) {}
      }
      return Promise.reject(err)
    })
  ]).then(function (value, err) {
    timeoutPromise.cancel()
    if (value) {
      return Promise.resolve(value)
    } else {
      return Promise.reject(err)
    }
  })
}

function retryUsingPromiseGenerator (promiseGenerator, opts) {
  opts = opts || {}
  opts = {
    delay: (opts.delay === undefined) ? 100 : opts.delay,
    backoffExponent: opts.backoffExponent || 1.1,
    backoffMax: opts.backoffMax || 60000,
    max: opts.max || 0,
    report: opts.report
  }
  var attempt = 0
  var done = false
  var delay = opts.delay
  var scope = {}
  var promise = new Promise(function (resolve, reject) {
    scope._resolve = function (value) {
      if (done) return
      done = true
      resolve(value)
    }
    scope._reject = function (err) {
      if (done) return
      done = true
      reject(err)
    }
    scope._retry = function (err) {
      if (done) return
      if (opts.report) {
        opts.report(err, attempt)
      }
      if (opts.max && attempt >= opts.max) {
        scope._reject(err)
        return
      }
      if (delay) {
        setTimeout(scope._try, delay)
        if (opts.backoffExponent) {
          delay = delay * opts.backoffExponent
          if (opts.backoffMax && delay > opts.backoffMax) {
            delay = opts.backoffMax
          }
        }
        return
      }
      scope._try()
    }
    scope._try = function () {
      if (done) return
      attempt += 1
      promiseGenerator().then(scope._resolve, scope._retry)
    }
    scope._try()
  })
  promise.cancel = function (err) {
    if (err === false) {
      done = true
      return
    }
    scope._reject(err || new Error('promise cancelled'))
  }
  return promise
}

module.exports = {
  cancellableTimeoutPromise: cancellableTimeoutPromise,
  fulfillPromiseOrTimeout: fulfillPromiseOrTimeout,
  retryUsingPromiseGenerator: retryUsingPromiseGenerator
}
