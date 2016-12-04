Log = require("./log.coffee")
log = new Log("util", "#ff56a8")
Test = require("./test.coffee")

class Util
    randomSeed = 1

    # Section 1: Mathematical functions
    @convertToPercentage: (num) ->
        parseFloat(num.toFixed(2)) * 100 + '%'

    @binaryFind: (array, searchItem, itemToValueFunc, order=1) ->
        # Given order should be 1 if array is min-max ordered or -1 if max-min ordered
        log.debug(array, searchItem, 'itemToValueFunc', order)
        if not array.length
            return found: false, index: 0

        if not itemToValueFunc then itemToValueFunc = ((x) -> x)
        comparisonFunc = ((a,b) ->
            log.debug("a", a, "b", b)
            [valA, valB] = [itemToValueFunc(a), itemToValueFunc(b)]
            if valA < valB then -order
            else if valA == valB then 0
            else if valA > valB then order
        )

        minIndex = 0
        maxIndex = array.length - 1
        currentIndex = null
        currentItem = null
        iterations = 0
        while minIndex <= maxIndex
            if iterations++ > array.length
                log.error("Too many iterations in binaryFind, did you supply invalid arguments?")
                return

            currentIndex = (minIndex + maxIndex) / 2 | 0
            currentItem = array[currentIndex]

            comparison = comparisonFunc(currentItem, searchItem)
            if comparison == 0
                return found: true, index: currentIndex
            if comparison == -1
                minIndex = currentIndex + 1
            else if comparison == 1
                maxIndex = currentIndex - 1

        # If we haven't found the item by this point then return the index where it should go
        if comparisonFunc(currentItem, searchItem) == -1
            returnIndex = currentIndex + 1
        else
            returnIndex = currentIndex

        return found: false, index: returnIndex

    @argMax: (array, valueFunc) ->
        maxVal = Number.MIN_SAFE_INTEGER
        maxItem = null
        for item in array
            value = valueFunc(item)
            if value > maxVal
                maxVal = value
                maxItem = item

        maxItem

    @argMin: (array, valueFunc) ->
        @argMax(array, (x) -> -valueFunc(x))

    @random: ->
        x = Math.sin(randomSeed++) * 10000
        x - Math.floor(x)

    @getRandomIntInRange: (min, max) ->
        Math.floor(@random() * (max - min + 1)) + min

    # Yup, javascript % is broken
    @mod: (n, m) -> ((n % m) + m) % m

    # Section 2: error codes
    @errCodeToString: (err) ->
        switch err
            when OK then "OK"
            when ERR_NOT_IN_RANGE then "ERR_NOT_IN_RANGE"
            when ERR_BUSY then "ERR_BUSY"
            when ERR_FULL then "ERR_FULL"
            when ERR_GCL_NOT_ENOUGH then "ERR_GCL_NOT_ENOUGH"
            when ERR_INVALID_ARGS then "ERR_INVALID_ARGS"
            when ERR_INVALID_TARGET then "ERR_INVALID_TARGET"
            when ERR_NAME_EXISTS then "ERR_NAME_EXISTS"
            when ERR_NO_BODYPART then "ERR_NO_BODYPART"
            when ERR_NO_PATH then "ERR_NO_PATH"
            when ERR_NOT_ENOUGH_ENERGY then "ERR_NOT_ENOUGH_ENERGY"
            when ERR_NOT_ENOUGH_EXTENSIONS then "ERR_NOT_ENOUGH_EXTENSIONS"
            when ERR_NOT_ENOUGH_RESOURCES then "ERR_NOT_ENOUGH_RESOURCES"
            when ERR_NOT_FOUND then "ERR_NOT_FOUND"
            when ERR_NOT_OWNER then "ERR_NOT_OWNER"
            when ERR_RCL_NOT_ENOUGH then "ERR_RCL_NOT_ENOUGH"
            when ERR_TIRED then "ERR_TIRED"
            else "UNKNOWN ERROR CODE"

    # Section 3: Map helpers
    @reverseDirection: (direction) ->
        # one of the DIRECTION_ constants
        if direction == 4 then 8 else (direction + 4) % 8

    @directionToDeltas: (direction) ->
        [[0,-1], [1,-1], [1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1]][direction-1]

    # Section 4: Ok I can't think of any more section names
    @getTimeSince: (tick) ->
        Game.time - tick

    @permutations: (xs, ys) ->
        # Generates all pairs where the first element is an element from x and the second is an element from y
        result = []
        for x in xs
            for y in ys
                result.push([x,y])
        result

    @daisyChain: (xs) ->
        # Takes a list e.g. [1,2,3,4]
        # Returns a daisy chain e.g. [[1,2], [2,3], [3,4]]
        if xs == null
            log.error("called for xs=null")
        if xs.length == 0 then return []
        if xs.length == 1 then return xs

        result = []
        for i in [1..xs.length-1]
            result.push([xs[i-1], xs[i]])

        return result

    @test: (logPassed=true) ->
        log.info("Running tests")
        suite = new Test.TestSuite("util", logPassed)
        suite.newSet("convertToPercentage")
        suite.assertEqual(@convertToPercentage(0.5), "50%")

        suite.newSet("binaryFind")
        testArr = [
            {foo: 1, value: 5}
            {foo: 0, value: 6}
            {foo: 1, value: 8}
        ]
        x = @binaryFind(testArr, {value: 6}, ((obj) -> obj.value), 1)
        suite.assertEqual(x.found, true)
        suite.assertEqual(x.index, 1)

        x = @binaryFind(testArr, {value: 4}, ((obj) -> obj.value), 1)
        suite.assertEqual(x.found, false)
        suite.assertEqual(x.index, 0)
        x = @binaryFind(testArr.reverse(), {value: 4}, ((obj) -> obj.value), -1)
        suite.assertEqual(x.found, false)
        suite.assertEqual(x.index, 3)

        suite.newSet("argMax")
        max = @argMax(testArr, (obj) -> obj.value)
        suite.assertEqual(max.value, 8)

        suite.newSet("argMin")
        min = @argMin(testArr, (obj) -> obj.value)
        suite.assertEqual(min.value, 5)

        suite.newSet("pairUp")
        perms = @permutations([1,2], ['a', 'b'])
        log.debug("perms: ", perms)

        suite.assertEqual(perms.length, 4)
        suite.assertEqual(perms[0][0], 1)
        suite.assertEqual(perms[0][1], 'a')
        suite.assertEqual(perms[1][0], 1)
        suite.assertEqual(perms[1][1], 'b')
        suite.assertEqual(perms[2][0], 2)
        suite.assertEqual(perms[2][1], 'a')
        suite.assertEqual(perms[3][0], 2)
        suite.assertEqual(perms[3][1], 'b')

        suite.newSet("daisyChain")
        chain = @daisyChain([1,2,3])
        suite.assertEqual(chain[0][0], 1)
        suite.assertEqual(chain[0][1], 2)
        suite.assertEqual(chain[1][0], 2)
        suite.assertEqual(chain[1][1], 3)

        suite.finish()

module.exports = Util