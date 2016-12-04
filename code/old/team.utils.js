/**
 * Created by Ben on 25/11/2016.
 */
module.exports = {};
let Log = require('logger')('team.utils');

class TeamUtils {
    static getTeamClassByType(type) {
        switch (type) {
            case 'base':
                return require('team.base');
            case 'mining':
                return require('team.mining');
            case 'building':
                return require('team.building');
            default:
                Log.error("getTeamClassByType couldn't find team class with type: " + type);
                return;
        }
    }
}
module.exports = TeamUtils;
