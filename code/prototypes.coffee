Log = require("./log.coffee")
log = new Log("prototypes", "#4376ff")
Util = require("./util.coffee")
Test = require("./test.coffee")

RoomPosition::serialize = ->
    "x#{this.x}y#{this.y}r#{this.roomName}"

RoomPosition.deserialize = (serialized) ->
    [all,x,y,room] = serialized.match(/x(\d+)y(\d+)r(.+)/)
    new RoomPosition(x,y,room)

RoomPosition::getDirectionToInterRoom = (otherPos) ->
    if otherPos.roomName == this.roomName
        this.getDirectionTo(otherPos)
    else
        # When moving into a new room then getDirection fails
        # But thankfully it does return a direction that is kind of ok - just 180 degrees wrong. So reverse it
        Util.reverseDirection(this.getDirectionTo(otherPos))

RoomPosition::getRangeToInterRoom = (otherPos) ->
    if this.roomName == otherPos.roomName
        return this.getRangeTo(otherPos)

    direction = this.getDirectionToInterRoom(otherPos)
    otherX = otherPos.x
    otherY = otherPos.y
    if direction in [TOP_LEFT, TOP, TOP_RIGHT]
        otherY -= 50
    else if direction in [BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT]
        otherY += 50

    if direction in [TOP_RIGHT, RIGHT, BOTTOM_RIGHT]
        otherX += 50
    else if direction in [TOP_LEFT, LEFT, BOTTOM_LEFT]
        otherX -= 50

    dx = Math.abs(otherX - this.x)
    dy = Math.abs(otherY - this.y)
    #log.debug(this, otherPos)
    #log.debug("direction:", direction, "otherX: ", otherX, "otherY:", otherY, "dx:", dx, "dy:", dy)
    return Math.max(dx, dy)

RoomPosition::getRoomNameInDirection = (direction) ->
    # Returns the name of the room in the given direction from my position
    if this.roomName == 'sim'
        log.error("Trying to get room outside of sim room")
    else
        # Parse current room name
        re = /(W|E)(\d+)(N|S)(\d+)/
        match = this.roomName.match(re)
        if not match
            log.error("Regex failed to match roomName", match, this.roomName)
        else
            [all, we, long, ns, lat] = match
            [dx, dy] = Util.directionToDeltas(direction)
            # Convert to grid
            southAmount = if ns == 'S' then parseInt(lat) else -parseInt(lat)-1
            eastAmount = if we == 'E' then parseInt(long) else -parseInt(long)-1

            newSouthAmount = southAmount + dy
            newEastAmount = eastAmount + dx

            if newEastAmount < 0
                we2 = 'W'
                long2 = Math.abs(newEastAmount) - 1
            else
                we2 = 'E'
                long2 = newEastAmount

            if newSouthAmount < 0
                ns2 = 'N'
                lat2 = Math.abs(newSouthAmount) - 1
            else
                ns2 = 'S'
                lat2 = newSouthAmount

            return "#{we2}#{long2}#{ns2}#{lat2}"

RoomPosition::getPositionInDirection = (direction) ->
    # Returns the position in the given direction from my position; it may be in a different room.
    [dx, dy] = Util.directionToDeltas(direction)

    if this.x == 0 and dx < 0
        newRoomDirection = LEFT
    else if this.x == 49 and dx > 0
        newRoomDirection = RIGHT
    else if this.y == 0 and dy < 0
        newRoomDirection = TOP
    else if this.y == 49 and dy > 0
        newRoomDirection = BOTTOM
    else
        return new RoomPosition(this.x + dx, this.y + dy, this.roomName)

    if this.roomName == 'sim'
        log.error("Trying to get position outside of sim room")
    else
        return new RoomPosition(Util.mod(this.x + dx, 50), Util.mod(this.y + dy, 50), this.getRoomNameInDirection(newRoomDirection))

RoomPosition::getNearbyPositions = ->
    # Returns a list of positions in the surrounding 9x9 area (including this position)
    nearby = [this]
    for d in [TOP..TOP_LEFT]
        nearby.push(this.getPositionInDirection(d))
    return nearby

module.exports = {
    test: (logPassed=false) ->
        suite = new Test.TestSuite("prototypes", logPassed=false)
        rp = (x,y,name) -> new RoomPosition(x,y,name)

        suite.newSet("getRoomNameInDirection:E0N0")
        pos = rp(0, 0, "E0N0")
        suite.assertEqual(pos.getRoomNameInDirection(TOP), "E0N1", "TOP")
        suite.assertEqual(pos.getRoomNameInDirection(TOP_RIGHT), "E1N1", "TOP_RIGHT")
        suite.assertEqual(pos.getRoomNameInDirection(RIGHT), "E1N0", "RIGHT")
        suite.assertEqual(pos.getRoomNameInDirection(BOTTOM_RIGHT), "E1S0", "BOTTOM_RIGHT")
        suite.assertEqual(pos.getRoomNameInDirection(BOTTOM), "E0S0", "BOTTOM")
        suite.assertEqual(pos.getRoomNameInDirection(BOTTOM_LEFT), "W0S0", "BOTTOM_LEFT")
        suite.assertEqual(pos.getRoomNameInDirection(LEFT), "W0N0", "LEFT")
        suite.assertEqual(pos.getRoomNameInDirection(TOP_LEFT), "W0N1", "TOP_LEFT")

        suite.newSet("getRoomNameInDirection:E24N4")
        pos = rp(0,0, "E24N4")
        suite.assertEqual(pos.getRoomNameInDirection(TOP), "E24N5", "TOP")
        suite.assertEqual(pos.getRoomNameInDirection(TOP_RIGHT), "E25N5", "TOP_RIGHT")
        suite.assertEqual(pos.getRoomNameInDirection(RIGHT), "E25N4", "RIGHT")
        suite.assertEqual(pos.getRoomNameInDirection(BOTTOM_RIGHT), "E25N3", "BOTTOM_RIGHT")
        suite.assertEqual(pos.getRoomNameInDirection(BOTTOM), "E24N3", "BOTTOM")
        suite.assertEqual(pos.getRoomNameInDirection(BOTTOM_LEFT), "E23N3", "BOTTOM_LEFT")
        suite.assertEqual(pos.getRoomNameInDirection(LEFT), "E23N4", "LEFT")
        suite.assertEqual(pos.getRoomNameInDirection(TOP_LEFT), "E23N5", "TOP_LEFT")

        suite.newSet("getPositioninDirection:(0,0,'sim')")
        pos = rp(0,0, "sim")
        pos2 = pos.getPositionInDirection(BOTTOM_RIGHT)
        suite.assertEqual(pos2.x, 1, "x")
        suite.assertEqual(pos2.y, 1, "y")
        suite.assertEqual(pos2.roomName, "sim", "roomName")

        suite.newSet("getPositioninDirection:(25,0,'E13N6')")
        pos = rp(25, 0, "E13N6")
        pos2 = pos.getPositionInDirection(TOP)
        suite.assertEqual(pos2.x, 25, "x")
        suite.assertEqual(pos2.y, 49, "y")
        suite.assertEqual(pos2.roomName, "E13N7", "roomName")

        suite.newSet("getDirectionToInterRoom")
        suite.assertEqual(pos.getDirectionToInterRoom(pos2), TOP)

        suite.newSet("getRangeToInterRoom")
        suite.assertEqual(rp(0,0,"E0S0")
            .getRangeToInterRoom(rp(0, 49, "E0N0")), 1, "(0,0,E0S0) -> (0,49,E0N0)")
        suite.assertEqual(rp(10,11,"E0S0")
            .getRangeToInterRoom(rp(10, 12, "E0S0")), 1, "(10,11,E0S0) -> (10,12,E0S0)")

        suite.newSet("getNearbyPositions")
        centre = rp(2,2,"sim")
        nearby = _.map(centre.getNearbyPositions(), (p) -> p.serialize())
        log.debug("nearby", nearby)
        suite.assert(rp(1,1,"sim").serialize() in nearby)
        suite.assert(rp(2,1,"sim").serialize() in nearby)
        suite.assert(rp(3,1,"sim").serialize() in nearby)
        suite.assert(rp(1,2,"sim").serialize() in nearby)
        suite.assert(rp(2,2,"sim").serialize() in nearby)
        suite.assert(rp(3,2,"sim").serialize() in nearby)
        suite.assert(rp(1,3,"sim").serialize() in nearby)
        suite.assert(rp(2,3,"sim").serialize() in nearby)
        suite.assert(rp(3,3,"sim").serialize() in nearby)
        suite.finish()
}
