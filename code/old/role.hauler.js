/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('role.hauler', '#996515');
let Role = require('role.base');
let Util = require('util');
let Stats = require('stats');

class RoleHauler extends Role {
    static get type() {return 'hauler'}

    static get recommendedBody() {
         return [
             {type: MOVE, percentage: 0.33, min: 1},
             {type: CARRY, percentage: 0.67, min: 1}
         ]
    }

    static get STATE_MOVING_TO_HAUL() { return 0 }
    static get STATE_WAITING() { return 1 }
    static get STATE_MOVING_TO_STORE() { return 2 }

    static estimateHaulAmountPerTick(creep, pathLength, onRoad) {
        // Fatigue = weight * terrainfactor - 2 * moveparts
        let numMoveParts = Util.countPartsOnBody(creep.body, MOVE);
        let bodyWeight = (creep.body.length - numMoveParts)*1.5; // carry parts are active half the time
        let terrainFactor = onRoad ? 1 : 2;

        let fatiguePerTick = bodyWeight * terrainFactor - 2 * numMoveParts;
        let tickDelayCausedByFatigue = (fatiguePerTick * pathLength) / (2 * numMoveParts);
        let journeyTime = pathLength + tickDelayCausedByFatigue;

        let haulPerTick = Util.countPartsOnBody(creep.body, CARRY) * 50 / journeyTime;
        /*
        Log.debug("estimateHaulAmountPerTick: ({}): numMoveParts {}, bodyWeight {}, terrainFactor {}, " +
            "fatiguePerTick {}, tickDelayCausedByFatigue {}, journeyTime {}, haulPerTick {}",
            creep.name, numMoveParts, bodyWeight, terrainFactor, fatiguePerTick, tickDelayCausedByFatigue, journeyTime, haulPerTick);
            */
        return haulPerTick;
    }

    static onAssign(creep) {
        Log.debug("onAssign: " + creep.name);
        this.changeState(creep, this.STATE_MOVING_TO_HAUL);
    }

    static changeState(creep, newState) {
        Log.debug("changeState {}, {} -> {}", creep.name, creep.memory.roleState, newState);
        creep.memory.roleState = newState;
    }

    static doStateMovingToHaul(creep) {
        // these doStateX methods all return true if a state change happened
        Log.debug("{} STATE_MOVING_TO_HAUL", creep.name);
        creep.say('HMH');

        let incomingEnergy = 0;
        if (creep.memory.incomingTransferTime == Game.time) {
            Log.debug("Hauler has an incoming transfer of {}", creep.memory.incomingTransferAmount);
            incomingEnergy += creep.memory.incomingTransferAmount;
        }

        if (_.sum(creep.carry) + incomingEnergy >= creep.carryCapacity) {
            this.changeState(creep, this.STATE_MOVING_TO_STORE);
            return true;
        }

        let path = this.getPath(creep);
        let source = this.getSource(creep);
        if (path) {
            let retCode = this.myMoveByPath(creep, path, 1);
            if (retCode == 1) {
                this.changeState(creep, this.STATE_WAITING);
                return true;
            }
        }

        return false;
    }

    static doStateWaiting(creep) {
        Log.debug("{} STATE_WAITING", creep.name);

        let haulingSpot = this.getHaulingSpot(creep);
        if (!haulingSpot || !haulingSpot.isEqualTo(creep.pos)) {
            Log.error("{} in STATE_WAITING but not on hauling spot!", creep.name);
        }

        Log.debug("{} waiting. current energy {}", creep.name, creep.carry.energy);
        creep.say("HW");
        // Resolve situations where the hauler blocks the miner from getting to the source
        let nearbyMiners = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter: creep => creep.memory.role == 'miner'});
        if (nearbyMiners.length) {
            // If miner is not on mining spot then try and swap positions with him
            let miner = nearbyMiners[0];
            if (miner.fatigue == 0 && !miner.pos.isEqualTo(this.getMiningSpot(creep))) {
                creep.move(creep.pos.getDirectionTo(miner.pos));
                this.changeState(creep, this.STATE_MOVING_TO_HAUL);
                return true;
            }
        }

        // look for dropped energy on mining spot
        let miningSpot = this.getMiningSpot(creep);
        let incomingEnergy = 0;
        let retCode;
        if (miningSpot) {
            let energyResources = miningSpot.lookFor(LOOK_ENERGY);
            if (energyResources.length) {
                Log.debug("Found dropped energy: {}", energyResources[0].amount);
                retCode = creep.pickup(energyResources[0]);
                if (retCode == OK)
                    incomingEnergy += energyResources[0].amount;
            }
        }

        if (creep.memory.incomingTransferTime == Game.time) {
            Log.debug("Hauler has an incoming transfer of {}", creep.memory.incomingTransferAmount);
            incomingEnergy += creep.memory.incomingTransferAmount;
        }

        if (_.sum(creep.carry) + incomingEnergy >= creep.carryCapacity) {
            this.changeState(creep, this.STATE_MOVING_TO_STORE);
            return true;
        }

        return false;
    }

    static doStateMovingToStore(creep) {
        Log.debug("{} STATE_MOVING_TO_STORE", creep.name);

        creep.say("HS");
        let storage = this.getStorageToUse(creep);
        let path = this.getPath(creep);
        if (storage) {
            let retCode = this.myMoveByPath(creep, path, -1);
            if (retCode == 1) {
                retCode = creep.transfer(storage, RESOURCE_ENERGY);
                if (retCode == OK || retCode == ERR_NOT_ENOUGH_ENERGY) {
                    Stats.logStoredEnergy(creep.room.name, creep.carry.energy);
                    this.changeState(creep, this.STATE_MOVING_TO_HAUL);
                    return true;
                }
                else {
                    Log.unhandledErrCode("transfer " + creep.name, retCode)
                }
            }
        }

        return false;
    }

    static doState(creep) {
        switch (creep.memory.roleState) {
            case this.STATE_MOVING_TO_HAUL: return this.doStateMovingToHaul(creep);
            case this.STATE_WAITING: return this.doStateWaiting(creep);
            case this.STATE_MOVING_TO_STORE: return this.doStateMovingToStore(creep);
        }
    }

    static onTick(creep) {
        Log.debug("onTick: {}, roleState {}", creep.name, creep.memory.roleState);
        if (!creep.memory.sourceId) {
            this.doRecycleCreep(creep);
        }

        let stateTransition = this.doState(creep);
        if (stateTransition)
            this.doState(creep);
    }

    static moveToHaulPos(creep, freeHaulingPosition) {
        let retCode = creep.moveTo(freeHaulingPosition);
        if (retCode != 0 && retCode != ERR_TIRED) {
            Log.warn("onTick unhandled retcode for creep.moveTo(freeHaulingPosition): {}" , retCode);
            return false;
        }
    }

    static getSource(creep) {
        let sourceId = creep.memory.sourceId;
        if (!sourceId) {
            Log.error("getSource: creep has no sourceId in memory");
        }
        else {
            return Game.getObjectById(sourceId);
        }
    }

    static getPath(creep) {
        let serializedPath = creep.memory.path;
        if (!serializedPath) {
            Log.warn("getPath: creep has no path in memory");
        }
        else {
            let path = Room.deserializePath(serializedPath);
            return path;
        }
    }

    static getHaulingSpot(creep) {
        let serializedHaulingSpot = creep.memory.haulingSpot;
        if (!serializedHaulingSpot) {
            Log.warn("getPath: creep has no haulingSpot in memory");
        }
        else {
            return Util.deserializeRoomPosition(serializedHaulingSpot);
        }
    }

    static getMiningSpot(creep) {
        let serializedSpot = creep.memory.miningSpot;
        if (!serializedSpot) {
            Log.warn("getMiningSpot: creep has no mining spot in memory");
        }
        else {
            return Util.deserializeRoomPosition(serializedSpot);
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

module.exports = RoleHauler;