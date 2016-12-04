/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('role.builder', '#FF5800');
let Role = require('role.base');
let Util = require('util');
let Stats = require('stats');

class RoleBuilder extends Role {
    static get type() {return 'builder'}

    static get recommendedBody() {
         return [
             {type: WORK, percentage: 0.34, min: 1},
             {type: MOVE, percentage: 0.34, min: 1},
             {type: CARRY, percentage: 0.32, min: 1}
         ]
    }

    static onAssign(creep) {
        Log.debug("onAssign: " + creep.name);
        creep.memory.buildState = 'collecting';
    }

    static onTick(creep) {
        //Log.debug("onTick: " + creep.name);
        this.fleeNearbyCreeps(creep);

        if (creep.memory.buildState == 'building') {
            if (creep.carry.energy == 0) {
                creep.memory.buildState = 'collecting';
                creep.say("BC");
            }
            else {
                // Build
                let buildTarget = this.getTargetToBuild(creep);
                if (!buildTarget) {
                    let roadSites = this.getRoadConstructionSites(creep);
                    if (roadSites.length) {
                        buildTarget = roadSites[0];
                    }
                }

                let retCode;
                if (creep.memory.buildType == 'upgrade') {
                    retCode = creep.upgradeController(buildTarget);
                }
                else if (creep.memory.buildType == 'build') {
                    retCode = creep.build(buildTarget);
                }
                else if (creep.memory.buildType == 'repair') {
                    retCode = creep.repair(buildTarget);
                }
                else {
                    Log.error("Unknown buildType in creep memory: " + creep.memory.buildType);
                }

                if (retCode == ERR_NOT_IN_RANGE)
                    creep.moveTo(buildTarget);
                else if (retCode != 0) {
                    Log.unhandledErrCode(creep.memory.buildType, retCode);
                }
                else {
                    //Log.debug("successfull build");
                }

            }
        }
        else if (creep.memory.buildState == 'collecting') {
            if (creep.carry.energy == creep.carryCapacity) {
                creep.memory.buildState = 'building';
                creep.say("BUILD");
            }
            else {
                let storage = this.getStorageToUse(creep);
                if (storage) {
                    let retCode = creep.withdraw(storage, RESOURCE_ENERGY);
                    if (retCode == ERR_NOT_IN_RANGE)
                        creep.moveTo(storage);
                    else if (retCode != 0) {
                        Log.warn("onTick unhandled retcode for withdraw: " + retCode);
                    }
                }

            }
        }
    }

    static getRoadConstructionSites(creep) {
        let roadSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {filter:
            site => site.structureType == STRUCTURE_ROAD});
        roadSites = _.sortBy(roadSites, site => creep.pos.getRangeTo(site.pos));
        if (!roadSites || !roadSites.length) {
            Log.warn("getRoadConstructionSites couldn't find any road construction sites!");
        }
        else {
            return roadSites;
        }
    }

    static getRoadPath(creep) {
        let roadPath = creep.memory.roadPath;
        if (!roadPath) {
            Log.error("getRoadPath: creep has no roadPath in memory");
        }
        else {
            return Room.deserializePath(roadPath);
        }
    }

    static getTargetToBuild(creep) {
        let buildTargetId = creep.memory.buildTargetId;
        if (!buildTargetId) {
            Log.error("getTargetToBuild: creep has no siteId in memory");
        }
        else {
            return Game.getObjectById(buildTargetId);
        }
    }

    static getStorageToUse(creep) {
        let storageId = creep.memory.storageId;
        if (!storageId) {
            Log.warn("getStorageToUse: creep has no storageId in memory");
            return Util.getClosestNonFullStorage(creep);
        }
        else {
            return Game.getObjectById(storageId);
        }
    }
}

module.exports = RoleBuilder;