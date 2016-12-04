/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('controller.spawn', '#FFFF00');
let Controller = require('controller.base');
let OrderBook = require('orderbook');
let RoleUtils = require('role.utils');
let Util = require('util');

class ControllerSpawn extends Controller {
    static onTick(spawn) {
        Log.debug('onTick');
        if (spawn.spawning)
            return;
        else if (spawn.memory.takenOrder) {
            this.completeOrder(spawn);
        }

        let unitOrders = OrderBook.getOrdersBy(order =>
            order.type == 'unit' &&
            order.roomName == spawn.room.name &&
            !order.taken
            );
        for (let order of unitOrders) {
            Log.debug("Deciding whether to take unit order: " + JSON.stringify(order));
            let roleClass = RoleUtils.getRoleClassByType(order.unitType);

            let minUnitCost = roleClass.getMinimumCost();
            let maxUnitCost = 0; // if the unit has a max cost then we don't need to be full energy
            if (order.unitType == 'miner') {
                maxUnitCost = roleClass.bodyLookupTable[roleClass.bodyLookupTable.length-1][0];
                Log.debug("roleClass is miner so using maxUnitCost of " + maxUnitCost);
            }
            Log.debug("minUnitCost {}, maxUnitCost {}", minUnitCost, maxUnitCost);

            let energy = spawn.room.energyAvailable;
            if (Util.getTimeSince(order.timeCreated) > 150 && energy > minUnitCost ||
                maxUnitCost && energy >= maxUnitCost ||
                energy == spawn.room.energyCapacityAvailable) {
                Log.debug("Enough energy ({}/{})", spawn.room.energyAvailable, spawn.room.energyCapacityAvailable);
                this.takeOrder(spawn, order);
                break;
            }
            else {
                Log.debug("Not enough energy ({}/{})", spawn.room.energyAvailable, spawn.room.energyCapacityAvailable);
            }
        }
    }

    static takeOrder(spawn, order) {
        // Take the order from the orderbook and start spawning the relevant unit
        // It can fail if the creep can't be spawned, in which case the order isn't actually taken
        Log.info("takeOrder: {}", order);

        let body = this.calculateOptimalBody(spawn.room.energyAvailable, order.unitType);
        if (this.spawnUnit(spawn, body, order.unitType)) {
            Log.info("Successful spawnUnit so taking order");
            spawn.memory.takenOrder = order;
            OrderBook.takeOrder(order.id);
        }
        else {
            Log.warn("Couldn't spawn unit so not taking order");
        }
    }

    static spawnUnit(spawn, body, unitType) {
        Log.info("spawnUnit (spawn {}) body {}, unitType {}", spawn.id, body, unitType);
        let creepName = Util.getRandomUnitName(spawn.room.name, unitType);

        let errCode = spawn.createCreep(_.map(body, partInfo => partInfo.type), creepName);
        if (_.isString(errCode)) { // string means creep name was returned so unit production success
            spawn.memory.lastCreepSpawned = creepName;
            return true;
        }
        else {
            Log.error("spawnUnit: spawn can't create creep ({})", Util.errCodeToString(errCode));
            return false;
        }
    }

    static completeOrder(spawn) {
        let order = spawn.memory.takenOrder;
        let creepName = spawn.memory.lastCreepSpawned;
        Log.info("completeOrder (spawn id {}, takenOrder {}, lastCreepSpawned {})", spawn.id, order, creepName);

        RoleUtils.getRoleClassByType(order.unitType).assign(Game.creeps[creepName]);
        OrderBook.completeOrder(order, {creepName: creepName});
        spawn.memory.takenOrder = null;
    }

    static calculateOptimalBody(energyAvailable, unitType) {
        Log.debug("calculateOptimalBody: energyAvailable {}, unitType {}", energyAvailable, unitType);

        if (unitType == 'miner') {
            // behave specially using miner body lookup table
            let RoleMiner = RoleUtils.getRoleClassByType('miner');

            let workParts, carryParts, moveParts;
            for (let data of RoleMiner.bodyLookupTable) {
                let energyCost = data[0];
                if (energyCost == energyAvailable) {
                    let body = data[1];
                    workParts = body[0];
                    carryParts = body[1];
                    moveParts = body[2];
                    break;
                }
            }

            if (!workParts) {
                Log.error("Oh dear! miner body lookup table code failed. energyAvailable: {}",
                    energyAvailable);
                return;
            }

            Log.info("Using miner body lookup table");
            let body = _.fill(Array(workParts), {type: WORK})
                .concat(_.fill(Array(carryParts), {type: CARRY}))
                .concat(_.fill(Array(moveParts), {type: MOVE}));
            return body;
        }

        // Else use algorithm
        Log.debug("Using body construction algorithm");
        let recommendedBody = RoleUtils.getRoleClassByType(unitType).recommendedBody;
        let partCounts = {[MOVE]: 0, [WORK]: 0, [CARRY]: 0, [ATTACK]: 0, [RANGED_ATTACK]: 0, [HEAL]: 0, [TOUGH]: 0};
        let partCountsTotal = 0;
        let energyRemaining = energyAvailable;

        // Construct minimal body first then add to it
        for (let partInfo of recommendedBody) {
            for (let i = 0; i < partInfo.min; i++) {
                partCounts[partInfo.type]++;
                partCountsTotal++;
                energyRemaining -= Util.getBodyPartCost(partInfo.type);
            }
        }
        Log.debug("minimal body: {}", partCounts);

        while (energyRemaining > 0 && partCountsTotal < 51) {
            // Find the most desired part on each iteration and add it to the body
            // The most desired part is the part which has a count that differs from the ideal percentage the most
            let mostImportantType;
            let mostPctDiff = -1.0;
            for (let partInfo of recommendedBody) {
                //Log.debug(JSON.stringify(partInfo));
                let partCount = partCounts[partInfo.type];
                if (partCount == partInfo.max || Util.getBodyPartCost(partInfo.type) > energyRemaining)
                    continue;

                let pctDiff = partInfo.percentage - partCount / partCountsTotal;
                //Log.debug("partCount: " + partCount + ", pctDiff: " + pctDiff);
                if (pctDiff > mostPctDiff) {
                    mostPctDiff = pctDiff;
                    mostImportantType = partInfo.type;
                }
            }
            /*
             Log.debug("iteration: energyRemaining=" + energyRemaining +
             ", partCountsTotal=" + partCountsTotal +
             ", partCounts=" + JSON.stringify(partCounts) +
             ", mostImportantType=" + mostImportantType +
             ", mostPctDiff=" + mostPctDiff
             );
            */

            if (mostImportantType) {
                partCounts[mostImportantType]++;
                partCountsTotal++;
                energyRemaining -= Util.getBodyPartCost(mostImportantType);
            }
            else {
                Log.debug("Probably all parts too expensive");
                break;
            }
        }

        let body = [];
        for (let partType in partCounts) {
            let count = partCounts[partType];
            for (let i=0; i < count; i++) {
                body.push({type: partType});
            }
        }

        Log.debug("final energyRemaining {}, final body {}", energyRemaining, body);
        return body;
    }
}

module.exports = ControllerSpawn;