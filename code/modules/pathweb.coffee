Log = require("./../log.coffee")
log = new Log("pathweb", "#afffd8")
Util = require("./../util.coffee")
Test = require("./../test.coffee")
Database = require("./database.coffee")
LoadableObject = require("./../loadableobject.coffee")
Structs = require("./../structs.coffee")

class PathData extends LoadableObject
    # An object representing a path between two points

    @create: (start, end, path, cost) ->
        start: start.serialize()
        end: end.serialize()
        path: PathWebBase.serializeRoomPositionPath(path)
        cost: cost

    getPath: (ser=false) ->
        unless ser
            #if not @cachedPath
            #    @cachedPath = PathWebBase.deserializeRoomPositionPath(@meta.path)
            #@cachedPath
            PathWebBase.deserializeRoomPositionPath(@meta.path)
        else
            @meta.path

    getStart: (ser=false) ->
        unless ser
            RoomPosition.deserialize(@meta.start)
        else
            @meta.start

    getEnd: (ser=false) ->
        unless ser
            RoomPosition.deserialize(@meta.end)
        else
            @meta.end

    getCost: -> @meta.cost



class PathGraph extends LoadableObject
    # A graph of paths between points
    # Format is {[start]: {[end]: pathId, ...}}

    ## Public
    @create: -> {}

    addPath: (start, end, pathId) ->
        # Adds a path between start and end to the graph
        log.debug("start #{start} end #{end} pathId #{pathId}")
        # Expect serialized start/end
        if not (_.isString(start) and _.isString(end))
            log.error("Invalid arguments supplied")
            return

        @_addPath(start, end, pathId)
        @_addPath(end, start, pathId)

    hasDirectPath: (start, end) ->
        # Works out whether the graph has a direct path between start/and
        # (i.e. without passing through any nodes apart from start/end)
        # Returns the id of the path if so
        graph = @meta
        return graph[start]?[end]

    hasNode: (node) ->
        graph = @meta
        return Boolean graph[node]

    hasNearbyPath: (start, end) ->
        # Works out whether the graph has a path starting within the 9x9 around start,
        # and ending within the 9x9 around end.
        # Returns the id of the path if so
        nearToStart = RoomPosition.deserialize(start).getNearbyPositions()
        nearToEnd = RoomPosition.deserialize(end).getNearbyPositions()

        for start in nearToStart
            if @hasNode(start)
                for end in nearToEnd
                    pathId = @hasDirectPath(start, end)
                    if pathId then return pathId

        return false

    ## Private
    _addPath: (start, end, pathId) ->
        graph = @meta
        if graph[start]?[end]
            log.warn("addPath is overwriting the existing path between #{start} and #{end}")

        graph[start] = {} if not graph[start]
        graph[start][end] = pathId

class PathWebBase
    dbPathsTableName = "pathweb.paths"
    pathFlagColor = COLOR_PURPLE
    nodeFlagColor = COLOR_WHITE
    useFlags = true

    ## Public
    @findPath: (startPos, endPos) ->
        # Abstract
        # Takes a start position, an end position and returns a path between them

    ## Private
    @onTick: ->
        log.debug("running")
        if not Memory.pathweb then @initMemory()

    @initMemory: ->
        # A database table contains all paths stored as PathData records
        # Memory.pathweb.graph expresses the connections between nodes
        #   e.g. {startNode: {endNode: pathId}, endNode: {startNode: pathId}}
        # Memory.pathweb.costMatrices maps room names to a CostMatrix (serialized)
        Memory.pathweb = {}
        Memory.pathweb.graph = PathGraph.create()
        Memory.pathweb.costMatrices = {}
        Database.createTable(dbPathsTableName)

        @removeFlags()

    @addToDatabase: (pathData) ->
        # Adds the path to the db and returns its id
        return Database.insert(dbPathsTableName, pathData.meta)

    @addToGraph: (pathData, pathId) ->
        log.debug("pathData", pathData, "pathId", pathId)
        graph = PathGraph.load(Memory.pathweb.graph)
        graph.addPath(pathData.getStart(ser=true), pathData.getEnd(ser=true), pathId)

    @generateNewPath: (startPos, endPos, useCostMatrix=true) ->
        # Uses screeps PathFinder to make a path between startPos and endPos
        # 'between' means NOT including startPos and NOT including endPos.
        # The path will start/end within 1 range of each
        # Returns a PathData object
        log.debug(startPos, endPos, useCostMatrix)

        if useCostMatrix then roomCallback = @getCostMatrix
        result = PathFinder.search(startPos, endPos, {
            range: 1
            roomCallback: roomCallback
        })
        log.debug("result", result)

        if result.incomplete
            if _.last(result.path).getRangeToInterRoom(endPos) != 1
                # Path can be marked as incomplete if routing to a solid structure,
                # in which case the last position (the structure's position) is not included in the path.
                # If that's the case then it's fine, but if not then something went wrong.
                log.warn("result returned an incomplete path!")
                return null
        else
            result.path.pop() # don't include last position

        return PathData.load(PathData.create(startPos, endPos, result.path, result.cost))

    @addPath: (pathData) ->
        log.debug("pathData", pathData)

        pathId = @addToDatabase(pathData)
        @addToGraph(pathData, pathId)

        if useFlags
            @markNodeWithFlag(pathData.getStart())
            @markNodeWithFlag(pathData.getEnd())
            @markPathWithFlags(pathData.getPath(), pathId)

        return pathId

    @markPathWithFlags: (path, pathId) ->
        # Marks every position on the path with a coloured flag
        for pos in path
            Game.rooms[pos.roomName].createFlag(pos.x, pos.y, pathId+"."+(i++), pathFlagColor)

    @markNodeWithFlag: (pos) ->
        # Given the position of a node, marks it with a coloured flag
        Game.rooms[pos.roomName].createFlag(pos.x, pos.y, undefined, nodeFlagColor)

    @removeFlags: ->
        for roomName, room of Game.rooms
            for flag in room.find(FIND_FLAGS,
                {filter: (flag) -> flag.color == nodeFlagColor || flag.color == pathFlagColor})
                flag.remove()

    @getCostMatrix: (roomName) ->
        costMatrixSer = Memory.pathweb.costMatrices[roomName]
        if costMatrixSer
            return PathFinder.CostMatrix.deserialize(costMatrixSer)
        else
            # Make a new cost matrix by looking at all the structures in the room
            room = Game.rooms[roomName]
            costs = new PathFinder.CostMatrix()
            for struct in room.find FIND_STRUCTURES
                st = struct.structureType
                if st == STRUCTURE_ROAD
                    # Favor roads over plain tiles
                    costs.set(struct.pos.x, struct.pos.y, 1)
                else if st != STRUCTURE_CONTAINER and st != STRUCTURE_RAMPART
                    costs.set(struct.pos.x, struct.pos.y, 0xff)

            Memory.pathweb.costMatrices[roomName] = costs.serialize()
            return costs

    @serializeRoomPositionPath: (path) ->
        # Takes an array of room positions
        # Returns the path in a serialized format
        # the format is (x{start x}y{start y}r{room name}r{directions}*)+
        # when a room transition occurs the direction from the final position in room A to the first in room B is not saved
        # log.debug("path", path)
        if path.length == 0
            log.warn("called for empty path", path)
            return ""

        strings = []
        addNewRoom = (p) -> strings.push("x#{p.x}y#{p.y}r#{p.roomName}r")

        currentRoomName = null
        for i in [0...path.length]
            pos = path[i]

            if pos.roomName != currentRoomName
                addNewRoom(pos)
                currentRoomName = pos.roomName
            else
                strings.push(path[i-1].getDirectionTo(pos))

            # error check
            if (i > 0 and path[i-1].getRangeToInterRoom(pos) != 1)
                log.error("prev getRangeTo pos != 1, so path is invalid", path[i-1], pos)
                return

        serialized = strings.join('')
        #log.debug("serialized path #{serialized}")
        return serialized


    @deserializeRoomPositionPath: (serialized) ->
        #log.debug(serialized)
        re = /x(\d{1,2})y(\d{1,2})r(sim|[A-Z\d]+)r(\d+)*/g

        path = []

        loop
            match = re.exec(serialized)
            #log.debug(match)
            break if not match
            [all, x, y, roomName, directions] = match
            currentRoomPosition = new RoomPosition(parseInt(x), parseInt(y), roomName)
            path.push(currentRoomPosition)
            if directions
                for d in directions
                    currentRoomPosition = currentRoomPosition.getPositionInDirection parseInt d
                    path.push(currentRoomPosition)

        #log.debug("Final path", path)
        return path

    @test: ->
        suite = new Test.TestSuite("pathwebbase", true)
        @initMemory()

        # Helper funcs
        ser = @serializeRoomPositionPath
        des = @deserializeRoomPositionPath
        rp = (x,y,name) -> new RoomPosition(x,y,name)

        suite.newSet("serialize same room")
        path = []
        suite.assertEqual(ser(path), "", "empty []")
        path = [rp(0,0,'sim')]
        suite.assertEqual(ser(path), "x0y0rsimr", "one position (0,0,sim)")
        path = [rp(0,0,'sim'), rp(0,1,'sim')]
        suite.assertEqual(ser(path), "x0y0rsimr5")
        path = [rp(0,0,'sim'), rp(0,1,'sim'), rp(1,1,'sim')]
        suite.assertEqual(ser(path), "x0y0rsimr53")

        suite.newSet("serialize inter room")
        path = [rp(0,0,'E0S0'), rp(0,49,'E0N0')]
        suite.assertEqual(ser(path), "x0y0rE0S0rx0y49rE0N0r", "[(0,0,E0S0), (0,49,E0N0)]")

        testPath1 = [
            rp(46,0,'W5S57')
            rp(47,0,'W5S57')
            rp(48,1,'W5S57')
            rp(49,2,'W5S57')
            rp(0,2,'W4S57')
            rp(1,2,'W4S57')
            rp(2,3,'W4S57')
        ]

        testPath2 = [
            rp(0,0,'E0S0')
            rp(0,49,'E0N0')
            rp(49,49,'W0N0')
            rp(49,0,'W0S0')
            rp(0,1,'E0S0')
            rp(1,2,'E0S0')
        ]

        for [path, name] in _.zip([testPath1, testPath2], ["testPath1", "testPath2"])
            suite.newSet("serialize and deserialize #{name}")
            serialized = ser(path)
            deserialized = des(serialized)
            for [pieceA, pieceB] in _.zip(path, deserialized)
                suite.assert(pieceA.isEqualTo(pieceB), "pieceA #{pieceA}, pieceB #{pieceB}")

        suite.newSet("addToDatabase saves to database correctly")
        testStart = rp(9,20,'sim')
        testPath = [
            rp(10,20,'sim')
            rp(11,20,'sim')
            rp(12,20,'sim')
            rp(13,20,'sim')
            rp(14,20,'sim')
            rp(15,20,'sim')
        ]
        testEnd = rp(16,20,'sim')
        testPathData = PathData.load(PathData.create(testStart, testEnd, testPath, 7))
        pathStartSer = testPathData.getStart(ser=true)
        pathEndSer = testPathData.getEnd(ser=true)
        pathSer = testPathData.getPath(ser=true)

        pathId = @addToDatabase(testPathData)
        suite.assert(_.isNumber(pathId))
        dbRetrieved = Database.retrieve(dbPathsTableName, pathId)
        dbPathData = PathData.load(dbRetrieved)
        log.debug("dbRetrieved", dbRetrieved, "dbPathData", dbPathData)
        suite.assertEqual(dbPathData.getStart(ser=true), pathStartSer, "dbPathData start")
        suite.assertEqual(dbPathData.getEnd(ser=true), pathEndSer, "dbPathData end")
        suite.assertEqual(dbPathData.getPath(ser=true), pathSer, "dbPathData path")

        suite.newSet("addToGraph saves to graph correctly")
        @addToGraph(testPathData, pathId)
        graph = PathGraph.load(Memory.pathweb.graph)
        suite.assert(graph.hasNode(pathStartSer))
        suite.assert(graph.hasNode(pathEndSer))
        suite.assert(graph.hasDirectPath(pathStartSer, pathEndSer))
        suite.assert(graph.hasDirectPath(pathEndSer, pathStartSer))

        suite.newSet("generateNewPath")
        startPos = rp(20,20,'sim')
        endPos = rp(25,20,'sim')
        resultPathData = @generateNewPath(startPos, endPos)
        console.log(resultPathData)
        suite.assertEqual(resultPathData.getCost(), 5, "path cost 5")
        suite.assertEqual(resultPathData.getPath()[0].getRangeTo(startPos), 1, "first near to first")
        suite.assertEqual(_.last(resultPathData.getPath()).getRangeTo(endPos), 1 , "last near to last")
        suite.assertEqual(resultPathData.getPath().length, 4, "length is 4")

        suite.newSet("generateNewPath 2")
        startPos = rp(14,17,'sim')
        endPos = rp(22,15,'sim')
        resultPathData = @generateNewPath(startPos, endPos)
        suite.assertEqual(resultPathData.getPath()[0].getRangeTo(startPos), 1, "path[0].getRangeTo(startPos) is 1")
        suite.finish()



class PathWebVersioned extends PathWebBase


class PathWebTree extends PathWebBase
    pathChunkSize = 3

    @findPath: (startPos, endPos) ->
        # Takes two RoomPositions and returns a path of RoomPositions
        # The path is guaranteed to start within 2 range of startPos and end within 1 range of endPos
        # startPos and endPos themselves are not included in the path
        log.debug(startPos, endPos)
        graph = Memory.pathweb.graph

        # This case should only happen once, when the very first path is created
        if Object.keys(graph).length == 0
            log.info("no paths exist so generating the first path")
            result = @generateNewPath(startPos, endPos)
            return result.path

        startSer = startPos.serialize()
        endSer = endPos.serialize()
        found = false # whether we have found the complete path yet
        finalPathIds = [] # the final path will be composed of multiple path segments if we need to run Dijkstra
        finalNodes = [] # the list of nodes we go through to the final path, in serialized form

        # Quick check if we already have the exact desired path:
        log.debug("Checking for exact path")
        if graph[startSer]?[endSer]
            log.debug("We have the exact desired path, yay!")
            found = true
            finalPathIds.push(graph[startSer][endSer])
            finalNodes.push(startSer, endSer)

        unless found
            # Check if we have a path from one of the 9 squares near to startPos, to one of the 9 squares near to endPos
            positionsNearToStartSer = (startPos.getPositionInDirection(d).serialize() for d in [TOP..TOP_LEFT]).concat(startSer)
            positionsNearToEndSer = (endPos.getPositionInDirection(d).serialize() for d in [TOP..TOP_LEFT]).concat(endSer)
            log.debug("positionsNearToStartSer", positionsNearToStartSer)
            log.debug("positionsNearToEndSer", positionsNearToEndSer)

            log.debug("Checking for nearby path")
            for [nearStart, nearEnd] in Util.permutations(positionsNearToStartSer, positionsNearToEndSer)
                pathId = graph[nearStart]?[nearEnd]
                if pathId
                    log.debug("We have a path from nearStart #{nearStart} to nearEnd #{nearEnd} with id #{pathId}")
                    found = true
                    finalPathIds.push(pathId)
                    finalNodes.push(startSer, endSer)
                    break

        unless found
            # Check if the start/end positions are connected at all
            log.debug("Checking if connected")
            startConnected = false
            nodeNearestStart = null
            endConnected = false
            nodeNearestEnd = null
            for pos in positionsNearToStartSer
                if graph[pos]
                    startConnected = true
                    nodeNearestStart = pos

            for pos in positionsNearToEndSer
                if graph[pos]
                    endConnected = true
                    nodeNearestEnd = pos

            if not startConnected
                # Get nearest node by range to start and generate a path to it
                nodeNearestStart = Util.argMin(Object.keys(graph),
                    (nodeSer) -> RoomPosition.deserialize(nodeSer).getRangeToInterRoom(startPos))
                log.debug("start not connected so routing it to nearest node: ", nodeNearestStart)
                @generateNewPath(startPos, RoomPosition.deserialize(nodeNearestStart))
                nodeNearestStart = startSer

            if not endConnected
                # Get nearest node by range to end and generate a path to it
                # If start wasn't connected earlier, then this nearest node could be start
                nodeNearestEnd = Util.argMin(Object.keys(graph),
                    (nodeSer) -> RoomPosition.deserialize(nodeSer).getRangeToInterRoom(endPos))
                log.debug("end not connected so routing it to nearest node: ", nodeNearestEnd)
                @generateNewPath(endPos, RoomPosition.deserialize(nodeNearestEnd))
                nodeNearestEnd = endSer

            # Now we can be sure that both the start and end are connected, we can use Dijkstra to get the path between
            # them
            # TODO
            log.debug("Using Dijkstra")
            dGraph = new Structs.DijkstraGraph()
            console.log("DGRAPH", JSON.stringify(dGraph))
            for startNode of graph
                connections = {}
                for endNode, pathId of graph[startNode]
                    connections[endNode] = Database.retrieve(dbPathsTableName, pathId).cost
                log.debug("startNode", startNode, "connections", connections)
                dGraph.addNode(startNode, connections)
            console.log("DGRAPH", JSON.stringify(dGraph))

            log.debug("asking for path between #{nodeNearestStart} and #{nodeNearestEnd}")
            console.log("DGRAPH", JSON.stringify(dGraph))
            finalNodes = dGraph.path(nodeNearestStart, nodeNearestEnd)
            if not finalNodes
                log.error("finalNodes is null, meaning Dijkstra couldn't find a path between #{startSer} #{endSer}")
                debugger
            log.debug("finalNodes", finalNodes, "dGraph", dGraph)
            for [nodeA, nodeB] in Util.daisyChain finalNodes
                finalPathIds.push graph[nodeA][nodeB]

        log.debug("finalPathIds", finalPathIds, "finalNodes", finalNodes)

        finalPath = []
        firstNode = true
        for i in [0...finalPathIds.length]
            node = finalNodes[i]
            pathId = finalPathIds[i]
            pathData = PathData.load(Database.retrieve(dbPathsTableName, pathId))
            #log.debug("pathData", pathData, "node", node, "pathId", pathId)
            pathDeser = pathData.getPath()

            # include the intermediary nodes in the path, but not the first (the start position)
            if i != 0 then finalPath.push(RoomPosition.deserialize(node))

            if node == pathData.meta.start
                finalPath.push(pos) for pos in pathDeser
            else
                finalPath.push(pos) for pos in pathDeser.reverse()

        log.debug("END OF findPath, finalPath =", finalPath)
        return finalPath

    @generateNewPath: (startPos, endPos, useCostMatrix=true) ->
        # Uses screeps PathFinder to make a path between startPos and endPos
        # 'between' means NOT including startPos and NOT including endPos. The path will start/end within 1 range of each
        # Then calls @addPath to save it
        # Returns a object like  {
        #   path: list of RoomPositions, including startPos
        #   cost: number representing cost of path
        #   id: id of new path in database (if save is true)
        #   }
        log.debug(startPos, endPos)

        if useCostMatrix then roomCallback = @getCostMatrix
        result = PathFinder.search(startPos, endPos, {
            range: 1
            roomCallback: roomCallback
        })

        log.debug("result", result)

        if result.incomplete && _.last(result.path).getRangeToInterRoom(endPos) != 1
            # Path can be marked as incomplete if routing to a solid structure,
            # in which case the last position (the structure's position) is not included in the path.
            # If that's the case then it's fine, but if not then something went wrong.
            log.warn("result returned an incomplete path!")
            return null

        # Divide the path into chunks
        chunks = []
        currentChunk =
            start: startPos
            path: []
            end: null
        averageChunkCost = Math.min(pathChunkSize/result.path.length, 1) * result.cost

        for pos in result.path
            if currentChunk.path.length == pathChunkSize
                currentChunk.end = pos
                chunks.push(currentChunk)
                currentChunk = {start: pos, path: []}
            else
                currentChunk.path.push(pos)

        # Check if the current chunk is too short and if so merge it with the previous one
        if currentChunk.path.length <= 1
            if chunks.length == 0
                log.error("chunks are much too short", chunks, currentChunk)
            else if currentChunk.path.length == 1
                # Merge it with 2nd last chunk
                lastChunk = chunks[chunks.length-1]
                currentChunkEnd = currentChunk.path.pop()
                lastChunk.path.push(currentChunk.start)
                lastChunk.path.push(pos) for pos in currentChunk.path
                lastChunk.end = currentChunkEnd
        else
            # Save it
            currentChunk.end = currentChunk.path.pop()
            chunks.push(currentChunk)

        log.debug("chunks", chunks)
        for chunk in chunks
            @addPath(chunk.start, chunk.end, chunk.path, averageChunkCost)

        log.debug("generateNewPath finished")
        return {
            path: result.path
            cost: result.cost
        }

    @test: (logPassed=true) ->
        suite = new Test.TestSuite("pathwebtree", logPassed)
        @initMemory()

        ser = @serializeRoomPositionPath
        des = @deserializeRoomPositionPath
        rp = (x,y,name) -> new RoomPosition(x,y,name)

        suite.newSet("findPath AB")
        @initMemory()
        posA = rp(14,17,'sim')
        posB = rp(22,15,'sim') # the controller in sim room - a solid structure
        posC = rp(35,20,'sim')
        posD = rp(12,35,'sim')
        pathAB = @findPath(posA, posB)

        # since memory was just wiped this is the first path requested
        # so AB will be generated as the first path in the system
        suite.assert(posA.isNearTo(_.head(pathAB)), "pathAB[0] == posA")
        suite.assert(posB.isNearTo(_.last(pathAB)), "posB near to pathAB[-1]")
        suite.assert(Memory.pathweb.graph[posA.serialize()], "posA in graph")
        suite.assert(Memory.pathweb.graph[posA.serialize()][posB.serialize()], "posA -> posB in graph")
        suite.assertEqual(Memory.pathweb.graph[posA.serialize()][posB.serialize()], 1, "posA -> posB == 1")
        suite.assertEqual(Memory.pathweb.graph[posB.serialize()][posA.serialize()], 1, "posA -> posB == 1")
        suite.assert(Memory.pathweb.costMatrices['sim'])
        costs = PathFinder.CostMatrix.deserialize(Memory.pathweb.costMatrices['sim'])
        suite.assertEqual(costs.get(22,15), 0xff, "Controller is 0xff in cost matrix")

        # If we ask for the exact path found again then it should return the saved version
        path = @findPath(posA, posB)
        suite.assertEqual(path.length, pathAB.length, "path.length == pathAB.length")
        suite.assert(_.last(path).isEqualTo(_.last(pathAB)), "last in path == last in pathAB")
        # Shouldn't be duplicated in memory
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posA.serialize()]).length, 1, "1 key for posA in graph")
        suite.assertEqual(Database.query(dbPathsTableName).length, 1, "1 path in DB")

        # Asking for B -> A should be the same
        suite.newSet("findPath B->A")
        path = @findPath(posB, posA)
        suite.assertEqual(path.length, pathAB.length, "path.length == pathAB.length")
        suite.assert(_.head(path).isEqualTo(_.last(pathAB)), "first in path == last in pathAB")
        # Shouldn't be duplicated in memory
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posA.serialize()]).length, 1, "1 key for posA in graph")
        suite.assertEqual(Database.query(dbPathsTableName).length, 1, "1 path in DB")

        # If we ask for a path in the surrounding 9x9 area to A/B it should return the saved version
        suite.newSet("Surrounding 9x9")
        path = @findPath(posA.getPositionInDirection(TOP_LEFT), posB.getPositionInDirection(BOTTOM_RIGHT))
        suite.assertEqual(path.length, pathAB.length, "path.length == pathAB.length")
        suite.assert(_.head(path).isEqualTo(_.last(pathAB)), "first in path == last in pathAB")
        # Shouldn't be duplicated in memory
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posA.serialize()]).length, 1, "1 key for posA in graph")
        suite.assertEqual(Database.query(dbPathsTableName).length, 1, "1 path in DB")

        # Same for B->A
        path = @findPath(posB.getPositionInDirection(BOTTOM_LEFT), posA.getPositionInDirection(BOTTOM))
        suite.assertEqual(path.length, pathAB.length, "path.length == pathAB.length")
        suite.assertEqual(path[0].serialize(), _.last(pathAB).serialize(), "first in path == last in pathAB")
        # Shouldn't be duplicated in memory
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posA.serialize()]).length, 1, "1 key for posA in graph")
        suite.assertEqual(Database.query(dbPathsTableName).length, 1, "1 path in DB")

        suite.newSet("findPath AD")
        path = @findPath(posA, posD)
        suite.assertEqual(posA.getRangeTo(path[0]), 1, "posA nearTo path[0]")
        suite.assertEqual(posD.getRangeTo(_.last(path)), 1, "posD == last(path)")
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posA.serialize()]).length, 2, "2 keys for posA in graph")
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posD.serialize()]).length, 1, "1 key for posD in graph")
        suite.assertEqual(Database.query(dbPathsTableName).length, 2, "2 paths in DB")

        suite.newSet("findPath DB")
        path = @findPath(posD, posB)
        suite.assert(posD.isNearTo(_.head(path)), "posD nearTo path[0]")
        suite.assert(posB.isNearTo(_.last(path)), "posB near to last(path)") # pos B is controller which is solid
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posA.serialize()]).length, 2, "2 keys for posA in graph")
        suite.assertEqual(Object.keys(Memory.pathweb.graph[posD.serialize()]).length, 1, "1 key for posD in graph")
        suite.assertEqual(Database.query(dbPathsTableName).length, 2, "2 paths in DB")

        suite.newSet("findPath DC")
        path = @findPath(posD, posC)
        suite.assert(posD.isNearTo(_.head(path)), "posD nearTo path[0]")
        suite.assert(posC.isNearTo(_.last(path)), "posC nearTo path[-1]")
        log.debug(posC, _.last(path))


        suite.finish()


module.exports = PathWebVersioned