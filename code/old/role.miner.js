/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('role.miner', '#C0C0C0');
let Role = require('role.base');
let Util = require('util');
let Stats = require('stats');

class RoleMiner extends Role {
    static get type() {return 'miner'}

    static get recommendedBody() {
         return [
             {type: WORK, percentage: 0.625, min: 1, max: 5},
             {type: MOVE, percentage: 0.375, min: 1, max: 3},
             {type: CARRY, percentage: 0.0, min: 1, max: 1}
         ]
    }

    static get STATE_MOVING_TO_MINE() { return 0 }
    static get STATE_MINING() { return 1 }
    static get STATE_MOVING_TO_STORE() { return 2 }

    static get bodyLookupTable() {
        // Format is [energyAvailable, [work, carry, move]]
        return [
            [200, [1, 1, 1, 2800]],
            [250, [1, 1, 2, 2750]],
            [300, [2, 1, 1, 5660]],
            [350, [2, 1, 2, 5650]],
            [400, [3, 1, 1, 8480]],
            [450, [3, 1, 2, 8520]],
            [500, [4, 1, 1, 112600]],
            [550, [4, 1, 2, 11370]],
            [600, [5, 1, 1, 14000]],
            [650, [5, 1, 2, 14200]],
            [700, [5, 1, 3, 14233]],
            ]
    }

    static estimateMineAmountPerTick(creep) {
        return Util.countPartsOnBody(creep.body, WORK) * 2;
    }

    static onAssign(creep) {
        Log.debug("onAssign: " + creep.name);
        this.changeState(creep, this.STATE_MOVING_TO_MINE);
    }

    static changeState(creep, newState) {
        Log.debug("changeState {}, {} -> {}", creep.name, creep.memory.roleState, newState);
        creep.memory.roleState = newState;
    }

    static doStateMovingToMine(creep) {
        // these doStateX methods all return true if a state change happened
        Log.debug("{} STATE_MOVING_TO_MINE", creep.name);
        creep.say('MWM');

        let path = this.getPath(creep);
        let source = this.getSourceToMine(creep);
        if (path) {
            let retCode = this.myMoveByPath(creep, path, 1);
            if (retCode == 1) {
                this.changeState(creep, this.STATE_MINING);
                return true;
            }
        }

        return false;
    }

    static doStateMining(creep) {
        Log.debug("{} STATE_MINING", creep.name);

        let miningSpot = this.getMiningSpot(creep);
        if (!miningSpot || !miningSpot.isEqualTo(creep.pos)) {
            Log.error("{} in STATE_MINING but not on mining spot!", creep.name);
        }

        // Mine
        Log.debug("{} attempting to mine. current energy {}", creep.name, creep.carry.energy);
        creep.say("MM");
        let source = this.getSourceToMine(creep);
        if (source) {
            let retCode = creep.harvest(source);
            Log.debug("harvest retCode: " + Util.errCodeToString(retCode));
            if (retCode != 0 && retCode != ERR_NOT_ENOUGH_RESOURCES) {
                Log.warn("onTick unhandled retcode for harvest: " + retCode)
            }
        }

        // If the next tick's harvest will put us > max energy then we must drop early
        let mpt = this.estimateMineAmountPerTick(creep);
        if (creep.carry.energy + mpt >= creep.carryCapacity) {
            Log.debug("{} full or about to be", creep.name);
            Stats.logMinedEnergy(creep.room.name, creep.carry.energy);

            if (creep.memory.hasHauler) {
                Log.debug("{} has hauler", creep.name);
                // Try and find a nearby hauler
                let nearbyHaulers = this.findNonFullNearbyHaulers(creep);

                if (nearbyHaulers.length) {
                    this.offloadToHauler(creep, nearbyHaulers[0]);
                }
                else {
                    Log.debug("{} dropping", creep.name);
                    creep.say("MD");
                    creep.drop(RESOURCE_ENERGY);
                }
            }
            else {
                Log.debug("{} has no hauler", creep.name);
                this.changeState(creep, this.STATE_MOVING_TO_STORE);
                return true;
            }
        }

        return false;
    }

    static doStateMovingToStore(creep) {
        Log.debug("STATE_MOVING_TO_STORE");

        creep.say("MS");
        let storage = this.getStorageToUse(creep);
        let path = this.getPath(creep);
        if (storage) {
            let retCode = this.myMoveByPath(creep, path, -1);
            if (retCode == 1) {
                retCode = creep.transfer(storage, RESOURCE_ENERGY);
                if (retCode == OK || retCode == ERR_NOT_ENOUGH_ENERGY) {
                    Stats.logStoredEnergy(creep.room.name, creep.carry.energy);
                    this.changeState(creep, this.STATE_MOVING_TO_MINE);
                    return true;
                }
                else {
                    Log.unhandledErrCode("transfer", retCode)
                }
            }
            else {
                // check for nearby haulers and offload to them if possible
                let nearbyHaulers = this.findNonFullNearbyHaulers(creep);
                if (nearbyHaulers.length) {
                    this.offloadToHauler(creep, nearbyHaulers[0]);
                    this.changeState(creep, this.STATE_MOVING_TO_MINE);
                    return true;
                }
            }
        }

        return false;
    }

    static doState(creep) {
        switch (creep.memory.roleState) {
            case this.STATE_MOVING_TO_MINE: return this.doStateMovingToMine(creep);
            case this.STATE_MINING: return this.doStateMining(creep);
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

    static getSourceToMine(creep) {
        let sourceId = creep.memory.sourceId;
        if (!sourceId) {
            Log.error("getSourceToMine: creep has no sourceId in memory");
        }
        else {
            return Game.getObjectById(sourceId);
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

    static getPath(creep) {
        let serializedPath = creep.memory.path;
        if (!serializedPath) {
            Log.warn("getPath: creep has no path in memory");
            return;
        }
        else {
            return Room.deserializePath(serializedPath);
        }
    }

    static getMiningSpot(creep) {
        let serializedSpot = creep.memory.miningSpot;
        if (!serializedSpot) {
            Log.warn("getMiningSpot: creep has no mining spot in memory");
            return;
        }
        else {
            return Util.deserializeRoomPosition(serializedSpot);
        }
    }

    static findNonFullNearbyHaulers(creep) {
        return creep.pos.findInRange(FIND_MY_CREEPS, 1, {
            filter: other => other.memory.role == 'hauler' && other.carry.energy < other.carryCapacity});
    }

    static offloadToHauler(creep, hauler) {
        Log.debug("{} attemping transfer to {}", creep, hauler);
        creep.say("MT");
        let transferAmount = Math.min(hauler.carryCapacity - _.sum(hauler.carry), creep.carry.energy);
        let retCode = creep.transfer(hauler, RESOURCE_ENERGY, transferAmount);
        if (retCode != 0) {
            Log.error("Unhandled retcode for transfer {}", Util.errCodeToString(retCode));
            return false;
        }
        else {
            hauler.memory.incomingTransferTime = Game.time;
            hauler.memory.incomingTransferAmount = transferAmount;
            return true;
        }
    }
}

module.exports = RoleMiner;