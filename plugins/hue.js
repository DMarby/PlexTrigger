var async = require('async')
var fs = require('fs')
var hue_api = require('node-hue-api')
var api
var config

var scenes = {}

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

// TODO https://github.com/bstascavage/plexHue/blob/master/bin/hue.rb#L80 Just use brightness etc like here?
// TODO http://www.developers.meethue.com/things-you-need-know
// TODO find and use existing scene rather than always creating new?
var setup_scenes = function (callback) {
  api.getScenes(function (error, result) {
    api.createScene(config.lights, 'PlexTrigger-On', function (error, scene) {
      scenes.off = scene.id

      async.eachSeries(scene.lights, function (light, next) {
        api.setSceneLightState(scene.id, light, hue_api.lightState.create().transition(30000).off(), function (error, result) {
          if (error) {
            console.log('Error setting scene state', error)
          }

          setTimeout(next, 100)
        })
      }, function (error) {
        callback()
      })
    })
  })
}

// TODO Properly make sure to not trigger this if we haven't triggered play first to get a scenes.on!
var stop = function (callback) {
  if (!scenes.on) {
    return callback()
  }

  // TODO use lights filter here to only affect non-modified lights!
  api.activateScene(scenes.on, function (error, result) {
    if (error) {
      console.log('Error turning on!', error)
    }

    callback()
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
                  setup_scenes(callback)
                })
              })
            }
          })
        }

        setup_api()
    })
  },

  play: function (callback) {
    // TODO Grab states from current and remove lights from scene to turn on just in case lights change in between!
    // TODO grab states and modify for slow fadein
    api.createScene(config.lights, 'PlexTrigger-Off', function (error, scene) {
      scenes.on = scene.id

      api.activateScene(scenes.off, function (error, result) {
        if (error) {
          console.log('Error turning off!', error)
        }

        callback()
      })
    })
  }, 

  // TODO dim 50% here instead?
  pause: stop,

  stop: stop
}

// Create temporary scene
// Set lights to it
// Delete scene?
var turnOffLights = function () {

  /*api.getFullState(function (error, config) {
    if (error) {
      throw error
      return console.log('ERROR GETTING FULL STATE!')
    }

    Object.keys(config.lights).forEach(function (light) {
      light = light + ''
      if (lights.indexOf(light) > -1 && config.lights[light].state.on) {
        lightStates[light] = JSON.parse(JSON.stringify(config.lights[light].state))
      }
    })

    if (!Object.keys(lightStates).length) {
      return
    }

    // TODO just create group on startup maybe?
    // Use temp Scene instead?
    api.createGroup('Plex Off', Object.keys(lightStates), function (error, group) {
      api.setGroupLightState(group.id, hue.lightState.create().off(), function (error, result) {
        api.deleteGroup(group.id, function (error, group) {
          console.log('Deleted group!')
        })
      })
    })
  })*/

}

var turnOnLights = function () {
/*  var lights_to_turn_on = []

  api.getFullState(function (error, config) {
    if (error) {
      throw error
      return console.log('ERROR GETTING FULL STATE!')
    }

    Object.keys(config.lights).forEach(function (light) {
      light = light + ''

      if (!config.lights[light].state.on && lightStates[light] && lightStates[light].on) {
        lights_to_turn_on.push(light)
      }
    })

    console.log(lights_to_turn_on)
    console.log(lights_to_turn_on.length)

    // TODO "You can send commands to the lights too fast. If you stay roughly around 10 commands per second to the /lights resource as maximum you should be fine. For /groups commands you should keep to a maximum of 1 per second."
    // Compare each, create scene/smaller groups?
    async.eachSeries(lights_to_turn_on, function (light, next) {
      // See if we can avoid the flicker here
      // TODO remove .on?
      api.setLightState(light, hue.lightState.create(lightStates[light]).on(), function (error, result) {
        setTimeout(next, 100)
      })
    }, function (error) {
      console.log('Turned on!')
    })
  })*/
}