module.exports = {
  plex: {
    client: {
      hostname: 'localhost',
      username: '',
      password: ''
    },

    machine_identifiers: ['PLEX_MACHINE_IDENTIFIER']
  }, 

  plugins: {
    hue: {
      lights: [
        '4', // Hallway
        '5',
        '6',
        '10',
        '2', // Vardagsrum golv
        '8', // Vardagsrum 
        '7',
        '9',
        '19',
        '11',
        '12',
        '13',
        '17',
        '16',
        '15',
        '18',
        '14',
        '20' // Glassware
      ]
    }
  },

  interval: 5000, // Interval in milliseconds between polling Plex server

  delays: { // Number of checks that we wait before switching to a state
    play: 5,
    pause: 1,
    stop: 5
  }
}