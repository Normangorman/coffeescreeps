/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('role.distributor', '#3A5F0B');
let Role = require('role.base');
let Util = require('util');
let Stats = require('stats');

class RoleDistributor extends Role {
    // The distributor is different from the miner in that it roams freely, taking energy where it needs to go
    static get type() {return 'distributor'}

    static get recommendedBody() {
         return [
             {type: MOVE, percentage: 0.5, min: 1},
             {type: CARRY, percentage: 0.5, min: 1}
         ]
    }

    static get STATE_MOVING_TO_DISTRIBUTE() { return 0 }
    static get STATE_IDLE() { return 1 }
    static get STATE_MOVING_TO_STORE() { return 2 }

    static onAssign(creep) {
        Log.debug("onAssign: " + creep.name);
        this.changeState(creep, this.STATE_IDLE);
    }

    static changeState(creep, newState) {
        Log.debug("changeState {}, {} -> {}", creep.name, creep.memory.roleState, newState);
        creep.memory.roleState = newState;
    }

    static doStateMovingToDistribute(creep) {
        // these doStateX methods all return true if a state change happened
        Log.debug("{} STATE_MOVING_TO_DISTRIBUTE", creep.name);
        creep.say('DMD');

        let target = this.getDistributionTarget(creep);
        let retCode = creep.transfer(target, RESOURCE_ENERGY);
        if (retCode == OK || creep.carry.energy == 0) {
            Log.debug("Successful transfer!");
            this.changeState(creep, this.STATE_IDLE);
            return true;
        }
        else if (retCode == ERR_FULL) {
            Log.debug("Distribution target is full.");
            this.changeState(creep, this.STATE_IDLE);
            return true;
        }
        else if (retCode == ERR_NOT_IN_RANGE) {
            creep.moveTo(target.pos.x, target.pos.y);
        }
        else {
            Log.unhandledErrCode("doStateMovingToDistribute:transfer", retCode);
        }

        return false;
    }

    static doStateIdle(creep) {
        Log.debug("{} STATE_IDLE", creep.name);
        creep.say('DI');
        this.fleeNearbyCreeps(creep);

        // Look for non-full extensions
        let nonFullExtensions = creep.room.find(FIND_MY_STRUCTURES, {
            filter: struct => struct.structureType == STRUCTURE_EXTENSION && struct.energy < struct.energyCapacity
        });

        // Sort on proximity
        nonFullExtensions = _.sortBy(nonFullExtensions, [function(ext) {
            return creep.pos.getRangeTo(ext.pos);
        }]);

        if (nonFullExtensions.length) {
            creep.memory.distributionTargetId = nonFullExtensions[0].id;

            if (creep.carry.energy < creep.carryCapacity/2)
                this.changeState(creep, this.STATE_MOVING_TO_STORE);
            else
                this.changeState(creep, this.STATE_MOVING_TO_DISTRIBUTE);
            return true;
        }

        return false;
    }

    static doStateMovingToStore(creep) {
        Log.debug("STATE_MOVING_TO_STORE");

        creep.say('DMS');

        let storage = this.getStorage(creep);
        let retCode = creep.withdraw(storage, RESOURCE_ENERGY);
        if (retCode == OK || retCode == ERR_FULL) {
            Log.debug("Successful withdraw!")
            if (creep.carry.energy > creep.carryCapacity * 0.8) {
                this.changeState(creep, this.STATE_MOVING_TO_DISTRIBUTE);
                return true;
            }
        }
        else if (retCode == ERR_NOT_IN_RANGE) {
            creep.moveTo(storage.pos.x, storage.pos.y);
        }
        else {
            Log.unhandledErrCode("doStateMovingToStore:withdraw", retCode);
        }

        return false;
    }

    static doState(creep) {
        switch (creep.memory.roleState) {
            case this.STATE_MOVING_TO_DISTRIBUTE: return this.doStateMovingToDistribute(creep);
            case this.STATE_IDLE: return this.doStateIdle(creep);
            case this.STATE_MOVING_TO_STORE: return this.doStateMovingToStore(creep);
        }
    }

    static onTick(creep) {
        Log.debug("onTick: {}, roleState {}", creep.name, creep.memory.roleState);
        if (!creep.memory.storageId) {
            let spawns = creep.room.find(FIND_MY_STRUCTURES, {
                filter: {structureType: STRUCTURE_SPAWN}
            });
            if (spawns.length) {
                creep.memory.storageId = spawns[0].id;
            }
        }

        let stateTransition = this.doState(creep);
        if (stateTransition)
            this.doState(creep);
    }

    static getDistributionTarget(creep) {
        let id = creep.memory.distributionTargetId;
        if (!id) {
            Log.warn("getDistributionTarget: creep has no distribution target id in memory");
        }
        else {
            let target = Game.getObjectById(id);
            if (!target) {
                Log.warn("getDistributionTarget: target couldn't be found");
            }
            return target;
        }
    }

    static getStorage(creep) {
        let storageId = creep.memory.storageId;
        if (!storageId) {
            Log.warn("getStorageToUse: creep has no storageId in memory");
            //return Util.getClosestNonFullStorage(creep);
        }
        else {
            return Game.getObjectById(storageId);
        }
    }
}

module.exports = RoleDistributor;