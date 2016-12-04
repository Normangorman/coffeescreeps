Log = require("./../log.coffee")
log = new Log("roles", "#00BFFF")
RoleMiner = require './../roles/miner.coffee'

onTick = ->
    log.debug("running")

    for name, creep of Game.creeps
        log.debug(name)
        switch creep.memory.role
            when 'miner' then new RoleMiner(creep).onTick()
            else log.debug("Creep #{creep.name} has no role")

module.exports.onTick = onTick
