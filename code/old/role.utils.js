/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('role.utils');
let RoleMiner = require('role.miner');
let RoleHauler = require('role.hauler');
let RoleBuilder = require('role.builder');
let RoleDistributor = require('role.distributor');

class RoleUtils {
    static getRoleClassByType(type) {
        switch(type) {
            case RoleMiner.type: return RoleMiner;
            case RoleHauler.type: return RoleHauler;
            case RoleBuilder.type: return RoleBuilder;
            case RoleDistributor.type: return RoleDistributor;
            default:
                Log.error("getRoleClassByName couldn't find role class with type: " + type);
                return;
        }
    }
}

module.exports = RoleUtils;