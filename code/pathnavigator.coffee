Log = require("./../log.coffee")
log = new Log("pathnavigator", "#868b86")
Util = require("./util.coffee")

class PathNavigator
    ###
    Routes creeps to where they need to go.
    ###

    @moveCreep: (creep, path) ->

    @_setRandomPath: (creep) ->
        # Randomly sets the destination and path of a creep
        x = Util.getRandomIntInRange(1, 48)
        y = Util.getRandomIntInRange(1, 48)
        dest = new RoomPosition(x, y, 'sim')
        log.debug("Setting #{creep.name} dest to #{JSON.stringify(dest)}")
        creep.memory.destination = dest.serialize()
        creep.memory.path = @serializeRoomPositionPath(@findPath(creep.pos, dest))

    @onTick: ->
        # Used for testing - randomly assigns destinations to creeps
        log.debug("running")
        @initMemory() if !Memory.pathweb
        getRandomFreePos = ->

        for creepName, creep of Game.creeps
            log.debug("Moving " + creepName)
            if not creep.memory.destination
                log.debug("no dest")
                @_setRandomPath(creep)
            else
                log.debug("has dest")
                dest = RoomPosition.deserialize(creep.memory.destination)
                if creep.pos.getRangeTo(dest) <= 1
                    log.debug("close to dest")
                    @_setRandomPath(creep)
                else
                    log.debug("moving on path")
                    path = @deserializeRoomPositionPath(creep.memory.path)
                    log.debug(path)

                    # If the path is weirdly shaped (E shape for example) we might be able to skip some points
                    for i in [path.length-1..0]
                        pos = path[i]
                        #log.debug("considering", pos)
                        if creep.pos.getRangeTo(pos) == 1 or i == 0
#log.debug("targetPos", pos)
                            targetPos = pos
                            break

                    log.debug("targetPos", targetPos)
                    dir = creep.pos.getDirectionTo(targetPos)
                    creep.move(dir)



module.exports = PathNavigator