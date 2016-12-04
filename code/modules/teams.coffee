Log = require("./../log.coffee")
log = new Log("teams", "#FFFFFF")

onTick = ->
    log.debug("running")
    Memory.teams = [] if !Memory.teams

module.exports.onTick = onTick
