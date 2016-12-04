Log = require("./../log.coffee")
log = new Log("stats", "#000000")

onTick = ->
    log.debug("running")
    Memory.stats = {} if !Memory.stats

module.exports.onTick = onTick
