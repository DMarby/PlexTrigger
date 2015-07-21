var unirest = require('unirest')

var endpoints = {}

var state = function (the_state) {
  return function (callback) {
    if (!endpoints[the_state]) {
      return callback()
    }

    unirest(endpoints[the_state].method, endpoints[the_state].url).followRedirect(false).end(function (response) {
      callback()
    })
  }
}

module.exports = {
  init: function (the_config, callback) {
    Object.keys(the_config).forEach(function (the_state) {
      endpoints[the_state] = the_config[the_state]
    })

    callback()
  },

  play: state('play'),
  pause: state('pause'),
  stop: state('stop')
}