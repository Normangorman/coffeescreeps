/**
 * Created by Ben on 01/12/2016.
 */

insertLogs = function(source) {
    lines = source.split("\n");
    for (let i=lines.length-1; i >= 0; i--) {
        if (lines[i].match(/^$/)) {
            //console.log("Deleting empty line at " + i)
            lines.splice(i, 1);
        }
    }

    methodRe = /^(\s*)@?(\w+):\s*(\([\w\s,=]+\))?\s*->/;
    funcRe = /^(\w+)\s*=\s*(\([\w\s,=]+\))?\s*->/;
    returnRe = /^(\w+)return/;
    classRe = /^class/;
    whitespaceRe = /^(\s*)[!\s]/;
    returnRe = /^(\s*)return/;

    funcData = []
    currentFuncData = {}; // begin, name and end
    inFunc = false;
    for (var i=0; i < lines.length; i++) {
        var line = lines[i];

        var match = line.match(whitespaceRe);
        var whitespaceLevel;
        if (!match) {
            whitespaceLevel = 0;
        }
        else {
            whitespaceLevel = match[1].length;
        }
        if (inFunc && whitespaceLevel <= currentFuncData.whitespaceLevel) {
            currentFuncData.end = i-1;
            funcData.push(currentFuncData);
            console.log(currentFuncData);
            inFunc = false;
        }
        console.log(i, lines[i], whitespaceLevel);

        match = line.match(methodRe);
        if (match) {
            currentFuncData = {};
            inFunc = true;
            currentFuncData.begin = i;
            currentFuncData.name = match[2];
            currentFuncData.whitespaceLevel = whitespaceLevel;
            continue
        }

        match = line.match(funcRe);
        if (match) {
            currentFuncData = {};
            inFunc = true;
            currentFuncData.begin = i;
            currentFuncData.name = match[1];
            currentFuncData.whitespaceLevel = whitespaceLevel;
            continue
        }
    }

    newLines = []
    ptr = 0
    if (funcData.length == 0) {
        newLines = lines
    }
    else {
        for (var i = 0; i < funcData.length; i++) {
            var data = funcData[i];
            while (ptr < data.begin) {
                newLines.push(lines[ptr++]);
            }

            newLines.push(lines[data.begin]);
            newLines.push(' '.repeat(data.whitespaceLevel + 5) + "log.beginFunc('%m')".replace('%m', data.name));
            for (ptr = data.begin + 1; ptr <= data.end; ptr++) {
                var bodyLine = lines[ptr];
                newLines.push(lines[ptr])
            }
            //newLines.push(' '.repeat(data.whitespaceLevel + 5) + "log.endFunc()");
        }
    }
    //console.log(source);
    //console.log(newLines.join("\n"));

    return newLines.join("\n");
};

module.exports = insertLogs;

test_source = `
Log = require("./log.coffee")
log = new Log("util", "#ff56a8")
Test = require("./test.coffee")

class Util
    # Section 1: Mathematical functions
    @convertToPercentage: (num) ->
        parseFloat(num.toFixed(2)) * 100 + '%'

    @binaryFind: (array, searchValue, itemToValue, order) ->
        log.debug(array, searchValue, 'func', order)
        if not array.length
            return found: false, index: 0

        minIndex = 0
        maxIndex = array.length - 1
        currentIndex = null
        currentValue = null
        gt = (a,b) -> a > b
        lt = (a,b) -> a < b
        while minIndex <= maxIndex
            currentIndex = (minIndex + maxIndex) / 2 | 0
            currentValue = itemToValue(array[currentIndex])

            if (if order == 1 then lt else gt)(currentValue, searchValue)
                minIndex = currentIndex + 1
            else if (if order == 1 then gt else lt)(currentValue, searchValue)
                maxIndex = currentIndex - 1
            else
                return found: true, index: currentIndex

        if order == 1
            if currentValue < searchValue
                returnIndex = currentIndex + 1
            else
                returnIndex = currentIndex
        else
            if currentValue > searchValue
                returnIndex = currentIndex + 1
            else
                returnIndex = currentIndexj
        {
            found: false
            index: returnIndex
        }

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

    @getRandomIntInRange: (min, max) ->
        Math.floor(Math.random() * (max - min + 1)) + min

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
        x = @binaryFind(testArr, 6, ((obj) -> obj.value), 1)
        suite.assertEqual(x.found, true)
        suite.assertEqual(x.index, 1)
        x = @binaryFind(testArr, 4, ((obj) -> obj.value), 1)
        suite.assertEqual(x.found, false)
        suite.assertEqual(x.index, 0)
        x = @binaryFind(testArr.reverse(), 4, ((obj) -> obj.value), -1)
        suite.assertEqual(x.found, false);
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
`
console.log(insertLogs(test_source))
