/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('team.mining', '#B0C4DE');
let TeamBase = require('team.base');
let OrderBook = require('orderbook');
let OrderUnit = require('order.unit');
let OrderRoad = require('order.road');
let RoleHauler = require('role.hauler');
let RoleMiner = require('role.miner');
let Util = require('util');

class MineData {
    static new(sourceId, miningSpot, haulingSpot, primaryStorageId) {
        let data = {};
        data.sourceId = sourceId;
        data.miningSpot = miningSpot;
        data.haulingSpot = haulingSpot;
        data.primaryStorageId = primaryStorageId;
        data.priority = 0;
        data.path = null;
        data.miner = null;
        data.hauler = null;
        return data;
    }
}

class TeamMining extends TeamBase {
    static get type() { return 'mining' }

    static new(roomName) {
        Log.debug("new: " + roomName);
        let meta = TeamBase.new(this.type, roomName);
        meta.mineData = [];
        meta.lastAssignmentRefresh = Game.time;

        this.initMines(meta);
        this.refreshStorages(meta);
        this.refreshPaths(meta);
        return meta;
    }

    static onAddMember(meta, creep) {
        Log.debug("onAddMember");
        this.refreshAssignments(meta);
    }

    static onRemoveMember(meta, creepName) {
        Log.debug("onRemoveMember");

        for (let data of meta.mineData) {
            if (data.miner == creepName) {
                data.miner = null;
                Log.debug("Removing miner from mineData {}", data);
            }
            else if (data.hauler == creepName) {
                data.hauler = null;
                Log.debug("Removing hauler from mineData {}", data);
            }
        }
        this.refreshAssignments(meta);
    }

    static onTick(meta) {
        Log.debug('onTick');

        this.errorCheck(meta);

        let openUnitOrders = OrderBook.getOrdersBy(order => order.teamId == meta.id && order.type == 'unit');
        if (!openUnitOrders.length) {
            let unitType = this.shouldRecruit(meta);
            if (unitType)
                this.recruit(meta, unitType);
        }

        if (Util.getTimeSince(meta.lastAssignmentRefresh) > 25 || Game.time == 1) { // in sim spawn doesn't appear til tick 1 so no storage is found
            this.refreshPriorities(meta);
            this.refreshAssignments(meta);
        }
    }

    static errorCheck(meta) {
        TeamBase.errorCheck(meta);
        for (let data of meta.mineData) {
            let miner = data.miner;
            let hauler = data.hauler;

            if (miner && !Game.creeps[miner])
                Log.error("Dead miner assigned to source {}", data.sourceId);
            if (hauler && !Game.creeps[hauler])
                Log.error("Dead hauler assigned to source {}", data.sourceId);
        }
    }

    static initMines(meta) {
        Log.debug("initMines");

        let room = Game.rooms[meta.roomName];
        for (let source of room.find(FIND_SOURCES)) {
            let nearestStorage = Util.getClosestStorage(source);
            let potentialMiningSpots = Util.getWalkablePositionsNearTo(source.pos, 1, 1);
            let miningSpot;

            if (!potentialMiningSpots.length) {
                Log.warn("Source has no potential mining spots: {}", source.id);
                continue;
            }
            else if (nearestStorage) {
                miningSpot = Util.argMin(potentialMiningSpots, pos => pos.getRangeTo(nearestStorage));
            }
            else {
                miningSpot = potentialMiningSpots[Util.getRandomIntInRange(0, potentialMiningSpots.length-1)];
            }

            let potentialHaulingSpots = Util.getWalkablePositionsNearTo(miningSpot, 1, 1);
            let haulingSpot;
            if (!potentialHaulingSpots.length) {
                Log.warn("Source has no potential hauling spots: {}", source.id);
                continue;
            }
            else if (nearestStorage) {
                haulingSpot = Util.argMin(potentialHaulingSpots, pos => pos.getRangeTo(nearestStorage));
            }
            else {
                haulingSpot = potentialHaulingSpots[Util.getRandomIntInRange(0, potentialHaulingSpots.length-1)];
            }

            source.room.createFlag(miningSpot, undefined, COLOR_YELLOW);
            source.room.createFlag(haulingSpot, undefined, COLOR_BROWN);

            let primaryStorageId = nearestStorage ? nearestStorage.id : null;
            Log.info("ADDING NEW MineData: sourceId {}, miningSpot {}, haulingSpot {}, primaryStorageId {}",
                source.id, miningSpot, haulingSpot, primaryStorageId);
            meta.mineData.push(MineData.new(source.id,
                Util.serializeRoomPosition(miningSpot),
                Util.serializeRoomPosition(haulingSpot),
                primaryStorageId));
        }
    }

    static refreshStorages(meta) {
        Log.debug("refreshStorages");

        for (let data of meta.mineData) {
            this.refreshMineDataStorage(meta, data);
        }
    }

    static refreshMineDataStorage(meta, data) {
        Log.debug("refreshMineDataStorage {} {}", meta.id, data);
        let source = Game.getObjectById(data.sourceId);
        let nearestStorage = Util.getClosestStorage(source);
        if (nearestStorage)
            data.primaryStorageId = nearestStorage.id;
        else
            Log.warn("Couldn't find a storage for mine: {}", data);
    }

    static refreshPaths(meta) {
        Log.debug("refreshPaths {}", meta.id);

        for (let data of meta.mineData) {
            this.refreshMineDataPath(meta, data);
            OrderBook.placeOrder(OrderRoad.new(meta.id, meta.roomName, data.path));
        }
    }

    static refreshMineDataPath(meta, data) {
        Log.debug("refreshMineDataPath {} {}", meta.id, data);

        if (!data.primaryStorageId) {
            Log.error("data has no primary storage id");
            return;
        }
        else {
            let room = Game.rooms[meta.roomName];
            let source = Game.getObjectById(data.sourceId);
            let primaryStorage = Game.getObjectById(data.primaryStorageId);
            if (!primaryStorage) {
                Log.error("mine primary storage with id {} could not be found!", data.primaryStorageId);
                return;
            }

            /*
            // Always pick one of the 4 corner positions
            let x = primaryStorage.pos.x;
            let y = primaryStorage.pos.y;
            let possibleStartCoords = [{x: x-1, y: y-1}, {x: x+1, y: y-1},
                                       {x: x-1, y: y+1}, {x: x+1, y: y+1}];

            // Pick the position with the shortest path to the source
            let bestPathLength = Number.MAX_SAFE_INTEGER;
            let bestStartPos;
            let bestPath;
            for (let xy of possibleStartCoords) {
                let pos = new RoomPosition(xy.x, xy.y, room.name);
                let path = pos.findPathTo(Util.deserializeRoomPosition(data.miningSpot), {ignoreCreeps: true});
                Log.debug("pos = {}, path = {}, primaryStorage = {}", pos, path, primaryStorage);
                if (path.length < bestPathLength) {
                    bestPathLength = path.length;
                    bestStartPos = pos;
                    bestPath = path;
                }
            }
            if (!bestPath) {
                Log.error("refreshMineDataPath: no bestStartPos found!");
                return;
            }

            // Insert the starting position into the path too (we don't want to lose it)
            bestPath.splice(0, 1, {
                x: bestStartPos.x,
                y: bestStartPos.y,
                dx: bestPath[0].x - bestStartPos.x,
                dy: bestPath[0].y - bestStartPos.y,
                direction: bestStartPos.getDirectionTo(bestPath[0])
                });

            }
            */
            let bestPath = primaryStorage.pos.findPathTo(Util.deserializeRoomPosition(data.haulingSpot), {ignoreCreeps: true});
            let bestPathLength = bestPath.length;
            let bestStartPos = Util.pathPieceToRoomPos(bestPath[0], source.room.name);

            for (let pathPiece of bestPath)
                source.room.createFlag(pathPiece.x, pathPiece.y, undefined, COLOR_RED);

            Log.debug("refreshMineDataPath: source {}, bestPathLength {}, bestStartPos {}, bestPath {}",
                source.id, bestPathLength, bestStartPos, bestPath);

            // Append mining spot to the end of the path
            let miningSpot = Util.deserializeRoomPosition(data.miningSpot);
            let x = miningSpot.x;
            let y = miningSpot.y;
            let dx = miningSpot.x - bestPath[bestPath.length-1].x;
            let dy = miningSpot.y - bestPath[bestPath.length-1].y;
            let direction = Util.pathPieceToRoomPos(bestPath[bestPath.length-1], source.room.name).getDirectionTo(miningSpot);
            let newPathPiece = {x: x, y: y, dx: dx, dy: dy, direction: direction};
            Log.debug("newPathPiece {}", newPathPiece);
            bestPath.push(newPathPiece);
            data.path = Room.serializePath(bestPath);
        }
    }

    static refreshPriorities(meta) {
        Log.debug("refreshPriorities");

        for (let data of meta.mineData) {
            this.refreshMineDataPriority(meta, data);
        }
    }

    static refreshMineDataPriority(meta, data) {
        Log.debug("refreshMineDataPriority {} {}", meta.id, data);
        if (!data.sourceId) {
            Log.error("data has no sourceId!");
            return;
        }

        let priority = 0;
        let source = Game.getObjectById(data.sourceId);
        let hostiles = source.pos.findInRange(FIND_HOSTILE_CREEPS, 5);
        if (hostiles.length) {
            Log.warn("refreshMineDataPriority: Hostile creep in proximity of source " + source.id);
        }
        else {
            let primaryStorage = Game.getObjectById(data.primaryStorageId);
            if (!primaryStorage) {
                Log.info("refreshMineDataPriority: no primaryStorage found");
                priority = 1;
            }
            else {
                let pathCost = Util.getPathTerrainCost(meta.roomName, Room.deserializePath(data.path));
                Log.debug("refreshMineDataPriority pathCost: {}", pathCost);
                priority = 200 - pathCost;
            }
        }

        Log.debug("Setting new priority to: {}", priority);
        if (priority != data.priority) {
            Log.warn("Changing priority of mine {} from {} to {}", data.sourceId, data.priority, priority);
        }
        data.priority = priority;
    }

    static refreshAssignments(meta) {
        Log.debug("refreshAssignments");
        meta.lastAssignmentRefresh = Game.time;

        let sortedMineData = _(meta.mineData)
            .filter(data => data.priority > 0)
            .sortBy(data => data.priority)
            .value();

        let assignedMiners = {};
        let assignedHaulers = {};
        let availableMiners = [];
        let availableHaulers = [];
        for (let data of sortedMineData) {
            if (data.priority <= 0)
                continue;

            if (data.miner)
                assignedMiners[data.miner] = true;
            if (data.hauler)
                assignedHaulers[data.hauler] = true;
        }

        for (let creepName of meta.members) {
            let creep = Game.creeps[creepName];
            if (creep.memory.role == 'miner' && !assignedMiners[creepName]) {
                availableMiners.push(creepName);
            }
            else if (creep.memory.role == 'hauler' && !assignedHaulers[creepName]) {
                availableHaulers.push(creepName);
            }
        }

        Log.debug("refreshAssignments: sortedMineData {}, assignedMiners {}, assignedHaulers {}, availableMiners {}, availableHaulers{}",
            sortedMineData, assignedMiners, assignedHaulers, availableMiners, availableHaulers);

        while(sortedMineData.length && (availableMiners.length || availableHaulers.length)) {
            let data = sortedMineData.pop();
            Log.debug("Assigning for mine {}", data);
            if (!data.miner && availableMiners.length) data.miner = availableMiners.pop();
            if (data.miner && !data.hauler && availableHaulers.length) data.hauler = availableHaulers.pop();
            Log.debug("Assignments finished: {}", data);

            // Set memory of the assigned creeps
            for (let creepName of [data.miner, data.hauler]) {
                let creep = Game.creeps[creepName];
                if (creep) {
                    if (creep.memory.sourceId && creep.memory.sourceId != data.sourceId) {
                        Log.warn("refreshAssignments reassigned {} from {} to {}",
                            creepName, creep.memory.sourceId, data.sourceId);
                    }

                    creep.memory.sourceId = data.sourceId;
                    creep.memory.storageId = data.primaryStorageId;
                    creep.memory.miningSpot = data.miningSpot;

                    if (creep.memory.role == 'miner') {
                        creep.memory.path = data.path;
                        creep.memory.hasHauler = Boolean(data.hauler);
                    }
                    else { // hauler
                        creep.memory.haulingSpot = data.haulingSpot;
                        // pop mining position off the path
                        let path = Room.deserializePath(data.path);
                        path.pop();
                        creep.memory.path = Room.serializePath(path);
                    }
                }
            }
        }

        let unassigned = availableMiners.concat(availableHaulers);
        for (let creepName of unassigned) {
            Log.warn("refreshAssignments: unassigned creep: " + creepName);

            let creep = Game.creeps[creepName];
            creep.memory.sourceId = undefined;
            creep.memory.storageId = undefined;
        }
    }

    static onOrderComplete(meta, order, delivery) {
        Log.info("onOrderComplete: meta {}, order {}, delivery {}", meta, order, delivery);
        if (order.type == 'unit') {
            this.addMember(meta, delivery.creepName);
        }
    }

    static recruit(meta, unitType) {
        Log.debug("recruit " + unitType);
        OrderBook.placeOrder(OrderUnit.new(meta.id, meta.roomName, unitType));
    }

    static shouldRecruit(meta) {
        let currentMiners = this.getMembersByRole(meta, 'miner').length;
        let currentHaulers = this.getMembersByRole(meta, 'hauler').length;
        let maxMiners = _.filter(meta.mineData, data => data.priority > 0).length;
        let maxHaulers = currentMiners;

        let retVal = false;
        if (currentHaulers < maxHaulers)
            retVal = 'hauler';
        else if (currentMiners < maxMiners)
            retVal = 'miner';

        Log.debug("shouldRecruit returning: " + retVal);
        return retVal;
    }

    static estimateTotalMinedAmountPerTick(meta) {
        let totalEstimate = 0;
        for (let data of meta.mineData) {
            totalEstimate += this.estimateTotalMinedAmountPerTickForMine(data);
        }
        Log.debug("estimateTotalMinedAmountPerTick: " + totalEstimate);
        return totalEstimate;
    }

    static estimateTotalMinedAmountPerTickForMine(data) {
        let estimate = 0;
        if (data.miner) {
            let creep = Game.creeps[data.miner];
            estimate = RoleMiner.estimateMineAmountPerTick(creep);
        }

        Log.info("estimateTotalMinedAmountPerTickForMine {}: {}", data.sourceId, estimate);
        return estimate;
    }

    static estimateTotalHauledAmountPerTick(meta) {
        let totalEstimate = 0;
        for (let data of meta.mineData) {
            totalEstimate += this.estimateTotalHauledAmountPerTickForMine(data);
        }
        Log.debug("estimateTotalHauledAmountPerTick: " + totalEstimate);
        return totalEstimate;
    }

    static estimateTotalHauledAmountPerTickForMine(data) {
        let estimate = 0;
        if (data.hauler) {
            let creep = Game.creeps[data.miner];
            estimate = RoleHauler.estimateHaulAmountPerTick(creep, data.path.length, false);
        }

        Log.info("estimateTotalHauledAmountPerTickForMine {}: {}", data.sourceId, estimate);
        return estimate;
    }
}

module.exports = TeamMining;
