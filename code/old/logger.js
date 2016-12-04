/**
 * Created by Ben on 23/11/2016.
 */
class Logger {
    get logLevel() {return 1}
    get logSpecificSources() {return false}
    get logExcludeSources() {return false}

    constructor(moduleName, logColor) {
        if (logColor)
            this.moduleLogColor = logColor;
        else
            this.moduleLogColor = "#FFFFFF";
        this.moduleName = moduleName;
    }

    // short for debugFormat etc.
    debug() { this.genericLog(0, this.format.apply(null, arguments)) }
    info() { this.genericLog(1, this.format.apply(null, arguments)) }
    warn() { this.genericLog(2, this.format.apply(null, arguments)) }
    error() { this.genericLog(3, this.format.apply(null, arguments)) }

    unhandledErrCode(name, errCode) {
        this.warn("Unhandled errCode for {}: {}", name, this.errCodeToString(errCode));
    }

    genericLog(level, msg) {
        // Color object keys for readability
        let objectKeyRe = /".*":/;
        msg = msg.replace(/"[a-zA-Z]+":/g, match => this.colorize(match, "#FFFDD0"));

        if (level >= this.logLevel) {
            if (this.logSpecificSources && !_.some(this.logSpecificSources, s => s == this.moduleName))
                return;
            else if (this.logExcludeSources && _.some(this.logExcludeSources, s => s == this.moduleName))
                return;
            else
                console.log(Game.time,
                    this.colorize(this.logLevelToString(level), this.logLevelToColour(level)),
                    this.colorize(this.moduleName, this.moduleLogColor),
                    this.leftPad(msg, 17 - this.moduleName.length));
        }
    }

    logLevelToString(level) {
        switch (level) {
            case 0: return "DEBUG |"; break;
            case 1: return " INFO |"; break;
            case 2: return  " WARN |"; break;
            case 3: return "ERROR |"; break;
            default: return "UNKNOWN |"; break;
        }
    }

    logLevelToColour(level) {
        switch (level) {
            case 0: return "#65CF2C";
            case 1: return "#00FFFF";
            case 2: return "#9932CC";
            case 3: return "#FF0000";
        }
    }

    colorize(msg, color) {
        return this.format("<font style='color:{};'>{}</font>", color, msg);
    }

    boldify(msg) {
        return this.format("<b>{}</b>", msg);
    }

    format() {
        var s = arguments[0];
        for (var i = 0; i < arguments.length - 1; i++) {
            let arg = arguments[i+1];
            if (typeof arg == 'object') {
                arg = JSON.stringify(arg);
            }

            var reg = new RegExp("\\{" + i + "\\}", "gm");
            s = s.replace(reg, arg);
            s = s.replace('{}', arg);
        }
        return s;
    }

    leftPad(msg, numSpaces) {
        return ' '.repeat(numSpaces) + msg;
    }

    errCodeToString(err) {
        switch (err) {
            case OK: return "OK";
            case ERR_NOT_IN_RANGE: return "ERR_NOT_IN_RANGE";
            case ERR_BUSY: return "ERR_BUSY";
            case ERR_FULL: return "ERR_FULL";
            case ERR_GCL_NOT_ENOUGH: return "ERR_GCL_NOT_ENOUGH";
            case ERR_INVALID_ARGS: return "ERR_INVALID_ARGS";
            case ERR_INVALID_TARGET: return "ERR_INVALID_TARGET";
            case ERR_NAME_EXISTS: return "ERR_NAME_EXISTS";
            case ERR_NO_BODYPART: return "ERR_NO_BODYPART";
            case ERR_NO_PATH: return "ERR_NO_PATH";
            case ERR_NOT_ENOUGH_ENERGY: return "ERR_NOT_ENOUGH_ENERGY";
            case ERR_NOT_ENOUGH_EXTENSIONS: return "ERR_NOT_ENOUGH_EXTENSIONS";
            case ERR_NOT_ENOUGH_RESOURCES: return "ERR_NOT_ENOUGH_RESOURCES";
            case ERR_NOT_FOUND: return "ERR_NOT_FOUND";
            case ERR_NOT_OWNER: return "ERR_NOT_OWNER";
            case ERR_RCL_NOT_ENOUGH: return "ERR_RCL_NOT_ENOUGH";
            case ERR_TIRED: return "ERR_TIRED";
            default: return "UNKNOWN ERROR CODE";
        }
    }
}

module.exports = function(moduleName, logColor) {return new Logger(moduleName, logColor)};
