var plex = require('plex-api')
var async = require('async')
var config = require('./config')

var client = new plex(config.plex.client)

var state = 'stop'
var transitioning = false
var delays = {
  play: 0,
  pause: 0,
  stop: 0
}
var plugins = {}
var triggers

var setup_triggers = function () {
  var trigger = function (type) {
    return function () {
      if (transitioning || state === type) {
        return
      }

      console.log('Triggering:', type)

      transitioning = true

      async.each(Object.keys(config.plugins), function (plugin, next) {
        plugins[plugin][type](next)
      }, function (error) {
        state = type
        transitioning = false
      })
    }
  }

  triggers = {
    play: trigger('play'),
    pause: trigger('pause'),
    stop: trigger('stop')
  }
}

var trigger_state = function (type) {
  console.log('Trigger state:', type)

  for (delay in delays) {
    if (delay !== type) {
      delays[delay] = 0
    }
  }

  if (delays[type] < config.delays[type]) {
    delays[type]++
  } else {
    triggers[type]()
  }
}

var last_offset = 0
var offset_count = 0
var stopped_due_to_offset = false

// TODO Make sure that we don't toggle a turnOn before turnOff is done and vice versa? Just ignore and let it happen afterwards?
// TODO Find a way to find out when state === playing but it's not actually playing! (Like after a movie is done)
var query = function () {
  client.query('/status/sessions').then(function (result) {
    // TODO paused or something as well?
    if (!result._children.length && state !== 'stop') {
      console.log('No sessions!')
      return trigger_state('stop')
    }

    result._children.forEach(function (client) {
      if (!client._children.length && state !== 'stop') {
        console.log('No players!')
        return trigger_state('stop')
      }

      var state_to_trigger

      client._children.forEach(function (child) {
        if (child._elementType === 'Player' && config.plex.machine_identifiers.indexOf(child.machineIdentifier) > -1) {
          if (child.state === 'playing' || child.state === 'buffering') {
            state_to_trigger = 'play'
          } else if (child.state === 'paused') {
            state_to_trigger = 'pause'
          } else {
            console.log('Unknown state!', child.state)
          }
        }
      })

      // TODO This might be redundant?
      /*if (parseInt(client.viewOffset)/parseInt(client.duration) > 0.99 && (state === 'play' || state === 'pause') && (state_to_trigger === 'play' || state_to_trigger === 'pause')) {
        console.log('Did finish watching!')
        state_to_trigger = 'stop'
      }*/

      if (client.viewOffset === last_offset && (state === 'play' || state === 'pause') && (state_to_trigger === 'play' || state_to_trigger === 'pause')) {
        console.log('Same viewoffset!')

        // TODO might need to account for pause not to start playing again when we have disconnected or something?
        if (state_to_trigger !== 'pause') {
          offset_count++
          
          if (offset_count > 2) {
            state_to_trigger = 'stop'
            stopped_due_to_offset = true
          }
        } else {
          offset_count = 0
        }
      } else {
        last_offset = client.viewOffset
        stopped_due_to_offset = false
        offset_count = 0
      }

      if (stopped_due_to_offset && state_to_trigger === 'play') {
        return
      }

      trigger_state(state_to_trigger)
    })

    setTimeout(query, config.interval)
  }, function (error) {
    console.log('PLEX ERROR!', error)
    // Back off strategy?
    setTimeout(query, config.interval)
  })
}

async.each(Object.keys(config.plugins), function (plugin, next) {
  plugins[plugin] = require('./plugins/' + plugin)
  plugins[plugin].init(config.plugins[plugin], next)
}, function (error) {
  setup_triggers()
  query()
})