class Log
    logLevel = 0
    logSpecificSources = []
    logExcludeSources = []
    enableCallerPart = true

    constructor:(@moduleName, @moduleColor) ->

    log: (level, msgs...) ->
        if level >= logLevel
            if logSpecificSources.length and @moduleName not in logSpecificSources
                return
            else if logExcludeSources.length and @moduleName in logExcludeSources
                return
            else
                timePart = Game.time
                levelPart = @stylize(@leftPadTo(@logLevelToString(level), 5), @logLevelToColor(level))
                modulePart = @stylize(@rightPadTo(@moduleName, 13), @moduleColor)
                if enableCallerPart
                    callerString = new Error().stack.split("\n")[3].split(" ")[5].split(".")[1..].join('.')
                    callerPart = @stylize(callerString, @moduleColor)
                else
                    callerPart = ""
                messageParts = (@formatMessagePart(msg) for msg in msgs).join(' ')
                console.log("#{timePart} #{levelPart} #{modulePart}#{callerPart} #{messageParts}")

    debug: (msgs...) -> @log(0, msgs...)
    info: (msgs...) -> @log(1, msgs...)
    warn: (msgs...) -> @log(2, msgs...)
    error: (msgs...) -> @log(3, msgs...)

    formatMessagePart: (msg) ->
        objectKeyRe = /"[a-zA-Z]+":/g
        stylize = @stylize
        if typeof msg == 'object'
            if msg == null or Object.keys(msg).length
                JSON.stringify(msg).replace(objectKeyRe, (match) -> stylize(match, "#ff097a"))
            else
                '{}'
        else
            return msg

    logLevelToColor: (level) ->
        switch level
            when 0 then "#65CF2C"
            when 1 then "#00FFFF"
            when 2 then "#9932CC"
            when 3 then "#FF0000"
            else "#FFFFFF"

    logLevelToString: (level) ->
        switch level
            when 0 then "DEBUG"
            when 1 then "INFO"
            when 2 then "WARN"
            when 3 then "ERROR"
            else "UNKNOWN"

    stylize: (msg, styles...) ->
        stylesString = ""
        for s in styles
            if s == 'bold' then stylesString += "bold;"
            else if s[0] == '#' then stylesString += "color:#{s};"

        "<font style='#{stylesString}'>#{msg}</font>"

    leftPadTo: (msg, length) ->
        ' '.repeat(Math.max(0, length - msg.length)) + msg

    rightPadTo: (msg, length) ->
        msg + ' '.repeat(Math.max(0, length - msg.length))

module.exports = Log
