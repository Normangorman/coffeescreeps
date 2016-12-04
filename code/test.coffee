Log = require("./log.coffee")
log = new Log("test module", "#FFFFFF")

class TestSuite
    constructor: (@moduleName, @logPassed=true) ->
        log.info("--- TESTING #{@moduleName} ---")
        @setName = null
        @numPassed = 0
        @numFailed = 0

    newSet: (setName) ->
        log.info("* Testing #{setName}")
        @setName = setName
        @testNumber = 1

    handleNoSet: ->
        # If there's a suite for a small module then it might not have individual test sets
        # So use the module name as the set name
        @newSet(@moduleName)

    finish: ->
        log.info("--- TESTS FINISHED (#{@moduleName}), passed: #{@numPassed}, failed: #{@numFailed} ---")

    getPassedString: -> "   ✓ #{@testNumber}. passed: "
    getFailedString: -> "   ✗ #{@testNumber}. FAILED: "

    # Give this a short name so it doesn't spam the logs
    t: (x, y, hint, equalFunc, testType) ->
        # hint is an optional extra message
        if not @setName then @handleNoSet()

        if not equalFunc
            equalFunc = (a,b) -> a == b
        areEqual = equalFunc(x,y)

        passed = false
        if areEqual and (testType == "assert" or testType == "assertEqual")
            passed = true
        else if not areEqual and (testType == "assertFalse" or testType == "assertNotEqual")
            passed = true

        ###
        console.log("x: " + x)
        console.log("y: " + y)
        console.log("areEqual: " + areEqual)
        console.log("testType: " + testType)
        console.log("passed: " + passed)
        ###

        testDescriptor = (
            if testType == "assert"
                "assert(#{x})"
            else if testType == "assertFalse"
                "assertFalse(#{x})"
            else
                "#{testType}(#{x}, #{y})"
        )
        hintPart = if hint then " hint: #{hint}" else ""
        if passed
            @numPassed++
            if @logPassed
                log.debug("#{@getPassedString()} #{testDescriptor} #{hintPart}")
        else
            @numFailed++
            log.error("#{@getFailedString()} #{testDescriptor} #{hintPart}")
        @testNumber++

    assertEqual: (x, y, hint, equalFunc) ->
        @t(x, y, hint, equalFunc, "assertEqual")

    assert: (x, hint, equalFunc) ->
        @t(Boolean(x), true, hint, equalFunc, "assert")

    assertFalse: (x, hint, equalFunc) ->
        @t(Boolean(x), true, hint, equalFunc, "assertFalse")

    assertNotEqual: (x, y, hint, equalFunc) ->
        @t(x, y, hint, equalFunc, "assertNotEqual")

module.exports.TestSuite = TestSuite
