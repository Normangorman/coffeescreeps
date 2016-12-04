/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('controller.utils');
let ControllerSpawn = require('controller.spawn');

class ControllerUtils {
    static getControllerClassByType(type) {
        switch(type) {
            case STRUCTURE_SPAWN: return ControllerSpawn;
            default:
                //Log.error("getControllerClassByType couldn't find controller class with type: " + type);
                return;
        }
    }
}

module.exports = ControllerUtils;
