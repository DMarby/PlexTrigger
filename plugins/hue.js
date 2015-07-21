var async = require('async')
var fs = require('fs')
var hue_api = require('node-hue-api')
var api
var config

var scenes = {}

var states = {}

// TODO remove debug logging
var starts_with = function (str, prefix) {
  return str.indexOf(prefix) === 0
}

var create_user = function (username, ip, api, callback) {
  var try_to_create_user = function () {
    api.createUser(ip, username, 'Plex User', function (error, newuser) {
      if (error) {
        if (error.type === 101) {
          console.log('Please press the link button on your Hue Bridge, retrying in 5s')
          return setTimeout(try_to_create_user, 5000)
        }

        return console.log(error)
      }

      var user = {
        username: newuser
      }

      fs.writeFileSync('user.json', JSON.stringify(user, null, 4))
      callback(user)
    })
  }

  try_to_create_user()
}

var group_id

var setup_groups = function (callback) {
  api.getGroups(function (error, result) {
    result.forEach(function(group) {
      if (group.name === 'PlexTrigger-group') {
        group_id = group.id
      }
    })

    if (!group_id) {
      api.createGroup('PlexTrigger-group', config.lights, function (error, result) {
        if (error) {
          console.log('Error creating group!', group)
          return callback()
        }

        group_id = result.id
        callback()
      })
    } else {
      callback()
    }
  })
}

// TODO https://github.com/bstascavage/plexHue/blob/master/bin/hue.rb#L80 Just use brightness etc like here?
// TODO http://www.developers.meethue.com/things-you-need-know
// TODO find and use existing scene rather than always creating new?
var setup_scenes = function (callback) {
  api.createScene(config.lights, 'PlexTrigger-Off', function (error, scene) {
    scenes.off = scene.id

    async.eachSeries(scene.lights, function (light, next) {
      api.setSceneLightState(scene.id, light, hue_api.lightState.create().transition(config.transition_time).off(), function (error, result) {
        if (error) {
          console.log('Error setting scene state', error)
        }

        setTimeout(next, 100)
      })
    }, function (error) {
      callback()
    })
  })
}

var play = function (callback) {
  states = {}

  api.getFullState(function (error, light_config) {
    if (error) {
      console.error('Error getting full state!', error)
      return callback()
    }

    Object.keys(light_config.lights).forEach(function (light) {
      light = light + ''
      
      if (config.lights.indexOf(light) > -1) {
        states[light] = JSON.parse(JSON.stringify(light_config.lights[light].state))
      }
    })

    // TODO grab states and modify for slow fadein
    api.createScene(config.lights, 'PlexTrigger-On', function (error, scene) {
      scenes.on = scene.id

      api.activateScene(scenes.off, function (error, result) {
        if (error) {
          console.log('Error turning off!', error)
        }

        callback()
      })
    })
  })
}

// TODO Properly make sure to not trigger this if we haven't triggered play first to get a scenes.on!
// TODO Have a timeout before triggering this to make sure that we do get that all lights are on/off since it takes time for the bridge to update
var stop = function (callback) {
  if (!scenes.on) {
    console.log('No on scene!')
    return callback()
  }

  api.getFullState(function (error, light_config) {
    if (error) {
      console.error('Error getting full state!', error)
      return callback()
    }

    var lights_to_turn_on = []

    Object.keys(light_config.lights).forEach(function (light) {
      light = light + ''
      // TODO remove this
      if (config.lights.indexOf(light) > -1) {
        if (light_config.lights[light].state.on) {
          console.log('Light id on', light)
          //console.log('Light config ', light_config.lights[light])
        }

        if (states[light] && !states[light].on) {
          console.log('State not on for light!', light)
          console.log('Name', light_config.lights[light].name)
          console.log('State', states[light])
        }
      
        // TODO make sure this works correctly
        // TODO Check if color has changed etc?
        if (!light_config.lights[light].state.on && states[light] && states[light].on) {
          lights_to_turn_on.push(light)
        }
      }
    })

    console.log(lights_to_turn_on)
    console.log(lights_to_turn_on.length)

    if (!lights_to_turn_on.length) {
      return callback()
    }

    // TODO create and then re-use
    api.updateGroup(group_id, lights_to_turn_on, function (error, result) {
      if (error) {
        console.log('Error updating group!', error)
        return callback()
      }

      // Wait to make sure bridge updates 
      setTimeout(function () {
        // TODO use lights filter here to only affect non-modified lights!
        api.activateScene(scenes.on, group_id, function (error, result) {
          if (error) {
            console.log('Error turning on!', error)
          }

          callback()
        })
      }, 1500)
    })
  })
}

module.exports = {
  init: function (the_config, callback) {
    config = the_config

    var user

    try {
      var user = require('../user.json')
    } catch (error) {
      var user = {
        username: 'plex'
      }
    }

    // TODO use internal instead?
    hue_api.nupnpSearch(function (error, result) {
        if (error) {
          // TODO better error handling
          console.log(error)
          return callback()
        }

        var setup_api = function () {
          api = hue_api.HueApi(result[0].ipaddress, user.username)

          api.config(function (error, config) {
            if (error) {
              // TODO better error handling
              console.log(error)
              return callback()
            }

            // TODO test setup properly
            if (!config.ipaddress) {
              create_user(user.username, result[0].ipaddress, api, function (the_user) {
                user = the_user
                setup_api()
              })
            } else {
              // TODO Test cleaning up of users
              api.registeredUsers(function (error, users) {
                async.each(users.devices, function (device, next) {
                  if (device.name === 'Plex User' && device.username !== user.username) {
                    api.deleteUser(device.username, function (error, user) {
                      next()
                    })
                  } else {
                    next()
                  }
                }, function (error) {
                  setup_groups(function () {
                    setup_scenes(callback)
                  })
                })
              })
            }
          })
        }

        setup_api()
    })
  },

  play: play, 

  // TODO dim 50% here instead?
  pause: stop,

  stop: stop
}