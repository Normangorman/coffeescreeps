class RoleMiner

    constructor: (@creep) ->
        console.log("new roleminer #{@creep.name}")

    onTick: ->
        console.log "RoleMiner onTick"
        @creep.say("M")
        @creep.memory.roleState = "mining"

module.exports = RoleMiner
