/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('team.building', '#FFA500');
let TeamBase = require('team.base');
let OrderBook = require('orderbook');
let OrderUnit = require('order.unit');
let Util = require('util');
let Stats = require('stats');

class BuildData {
    static new(type, structureType, buildTargetId, buildTargetPos) {
        let data = {};
        data.type = type; // one of 'build', 'upgrade', 'repair'
        data.structureType = structureType;
        data.buildTargetId = buildTargetId;
        data.buildTargetPos = buildTargetPos; // serialized
        data.priority = 0;
        data.path = [];
        data.workers = [];
        data.primaryStorageId = null;
        data.timeCreated = Game.time;
        data.upgradeLevel = undefined;
        data.roadPath = undefined;
        data.ordered = false; // whether it was taken from order book
        return data;
    }

    static getBuildTarget(data) {
        if (data.buildTargetId) {
            let obj = Game.getObjectById(data.buildTargetId);
            if (obj)
                return obj;
        }

        if (data.buildTargetPos) {
            let pos = Util.deserializeRoomPosition(data.buildTargetPos);
            let sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
            let buildTarget;
            if (sites.length) {
                buildTarget = sites[0];
            }

            let structs = pos.lookFor(LOOK_STRUCTURES);
            if (structs.length) {
                buildTarget = structs[0];
            }

            Log.debug("getBuildTarget pos {}, sites {}, buildTarget {}", pos, sites, structs, buildTarget);

            if (buildTarget) {
                data.buildTargetId = buildTarget.id;
                return buildTarget;
            }

            Log.warn("BuildData getBuildTarget couldn't find the build target");
        }
    }
}

class TeamBuilding extends TeamBase {
    static get type() { return 'building' }
    static get roadBuildThreshold() { return 14 }

    static new(roomName) {
        Log.debug("new: " + roomName);
        let meta = TeamBase.new(this.type, roomName);
        meta.buildData = [];
        meta.lastAssignmentRefresh = Game.time;

        return meta;
    }

    static onAddMember(meta, creep) {
        Log.debug("onAddMember");
        this.refreshAssignments(meta);
    }

    static onRemoveMember(meta, creepName) {
        Log.debug("onRemoveMember");
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

        this.removeFinishedBuilds(meta);
        this.planBuilds(meta);
        if (Util.getTimeSince(meta.lastAssignmentRefresh) > 25 || Game.time == 1) {
            //this.refreshRoads(meta);
            this.refreshStorages(meta);
            this.refreshPaths(meta);
            this.refreshPriorities(meta);
            this.refreshAssignments(meta);
        }
    }

    static removeFinishedBuilds(meta) {
        Log.debug("removeFinishedBuilds");
        for (let i=meta.buildData.length-1; i >= 0; i--) {
            let data = meta.buildData[i];
            if (data.structureType == STRUCTURE_ROAD)
                continue;

            let obj = BuildData.getBuildTarget(data);
            Log.debug("Checking if build finished {}", data);
            if (!obj) {
                Log.warn("Couldn't find target for build!");
                continue;
            }
            Log.debug("obj {}", obj);

            let finished = false;
            if (data.type == 'build') {
                if (obj.hits) {
                    finished = true;
                }
            }
            else if (data.type == 'upgrade') {
                if (obj.level >= data.upgradeLevel) {
                    finished = true;
                }
            }

            if (finished) {
                Log.debug("Build is finished so removing it!", data);
                meta.buildData.splice(i, 1);
            }
            else {
                Log.debug("Build not finished");
            }
        }
    }

    static planBuilds(meta) {
        Log.debug("planBuilds");
        /* Plan:
        Level 2 controller
        5 Extensions
        Road network
        2 links
         */
        // Check for build orders
        let room = Game.rooms[meta.roomName];

        let roadOrders = OrderBook.getNonTakenOrdersByType('road');
        Log.debug("roadOrders: {}", roadOrders);
        while (roadOrders.length) {
            let order = roadOrders.shift();
            let newBuild = BuildData.new('build', STRUCTURE_ROAD);
            newBuild.roadPath = order.path;
            newBuild.ordered = true;
            this.addBuildData(meta, newBuild);

            Log.debug("Taking roadOrder: {}", order);
            OrderBook.takeOrder(order.id);

            for (let pathPiece of Room.deserializePath(order.path)) {
                room.createConstructionSite(pathPiece.x, pathPiece.y, STRUCTURE_ROAD);
            }
        }

        let controller = Game.rooms[meta.roomName].controller;
        let structures = Game.rooms[meta.roomName].find(FIND_MY_STRUCTURES);
        let extensions = [];
        let spawns = [];
        let buildablePositions = Util.getBuildablePositionsNearTo(controller.pos, 1, 4);
        Log.debug("Num buildablePositions: {}", buildablePositions.length);

        for (let struct in structures) {
            if (struct.structureType == STRUCTURE_EXTENSION) {
                extensions.push(struct);
            }
            else if (struct.structureType == STRUCTURE_SPAWN) {
                spawns.push(struct);
            }
        }
        Log.debug("planBuilds: controller {}, extensions {}, spawns {}",
            controller.id, extensions, spawns);

        if (controller.level < 2) {
           if (!this.hasOpenBuildTaskFor(meta, STRUCTURE_CONTROLLER)) {
               let data = BuildData.new('upgrade', STRUCTURE_CONTROLLER, controller.id);
               data.upgradeLevel = 2;
               this.addBuildData(meta, data);
           }
        }
        else if (extensions.length < 5) {
            if (!this.hasOpenBuildTaskFor(meta, STRUCTURE_EXTENSION)) {
                for (let i=0; i < 5 - extensions.length; i++) {
                    if (!buildablePositions.length)
                        break;

                    let buildPos = buildablePositions.pop();
                    Log.debug("Creating construction site at buildPos {}", buildPos);
                    let retCode = room.createConstructionSite(buildPos, STRUCTURE_EXTENSION);
                    Log.unhandledErrCode("createConstructionSite", retCode);
                    let data = BuildData.new('build', STRUCTURE_EXTENSION, null, Util.serializeRoomPosition(buildPos));
                    this.addBuildData(meta, data);
                }
            }
        }
        else if (controller.level < 6) {
            if (!this.hasOpenBuildTaskFor(meta, STRUCTURE_CONTROLLER)) {
                let data = BuildData.new('upgrade', STRUCTURE_CONTROLLER, controller.id);
                data.upgradeLevel = 6;
                this.addBuildData(meta, data);
            }
        }
    }

    static addBuildData(meta, data) {
        Log.info("{} adding build data: {}", meta.roomName, data);
        Log.info("{} has {} queued build tasks", meta.roomName, meta.buildData.length);
        meta.buildData.push(data);
    }

    static hasOpenBuildTaskFor(meta, structureType) {
        for (let data of meta.buildData) {
            if (data.structureType == structureType)
                return true;
        }

        return false;
    }

    static refreshStorages(meta) {
        Log.debug("refreshStorages");

        for (let buildData of meta.buildData) {
            this.refreshBuildDataStorage(meta, buildData);
        }
    }

    static refreshBuildDataStorage(meta, buildData) {
        let site = BuildData.getBuildTarget(buildData);
        Log.debug("refreshBuildDataStorage {} {} {}", meta.id, buildData, site);
        if (site) {
            //Log.debug("refreshBuildDataStorage site={}", site);
            let nearestStorage = Util.getClosestStorage(site);
            Log.debug("refreshBuildDataStorage: nearestStorage {}", nearestStorage);
            buildData.primaryStorageId = nearestStorage.id;
        }
        else {
            Log.debug("refreshBuildDataStorage: couldn't find any available storage for build");
        }
    }

    static refreshPaths(meta) {
        Log.debug("refreshPaths {}", meta.id);

        for (let buildData of meta.buildData) {
            this.refreshBuildDataPath(meta, buildData);
        }
    }

    static refreshBuildDataPath(meta, buildData) {
        Log.debug("refreshBuildDataPath {} {}", meta.id, buildData);

        if (buildData.structureType == STRUCTURE_ROAD) {
            return;
        }
        else if (!buildData.primaryStorageId) {
            Log.error("buildData has no primary storage id");
            return;
        }
        else {
            let room = Game.rooms[meta.roomName];
            let site = BuildData.getBuildTarget(buildData);
            let primaryStorage = Game.getObjectById(buildData.primaryStorageId);
            Log.debug("refreshBuildDataPath site {} primaryStorage {}", site, primaryStorage);
            debugger;
            if (!primaryStorage) {
                Log.error("mine primary storage with id {} could not be found!", buildData.primaryStorageId);
                return;
            }

            let serializedPath = room.findPath(primaryStorage.pos, site.pos, {serialize: true});
            buildData.path = serializedPath;
        }
    }

    static refreshRoads(meta) {
        Log.debug("refreshRoads");
        let recommendedRoadPositions = [];
        let sortedBreakdownData = Stats.getSortedCreepBreakdownData(meta.roomName);
        let room = Game.rooms[meta.roomName];
        /*
        for (let flag of room.find(FIND_FLAGS, {filter: flag => flag.color == COLOR_GREY || flag.color== COLOR_WHITE})) {
            flag.remove();
        }
        */
        let i=0; // for naming flags

        if (sortedBreakdownData) {
            for (let posData of sortedBreakdownData) {
                if (posData.count > this.roadBuildThreshold) {
                    let insertIndex = Util.binaryFind(recommendedRoadPositions, posData.count, item => item.count, -1).index;
                    recommendedRoadPositions.splice(insertIndex, 0, posData);
                    Log.debug("Adding recommended road position: {}", posData);
                    //room.createFlag(posData.x, posData.y, 'R'+(i++), COLOR_GREY);
                }
                else {
                    Log.debug("Position data doesn't meet road build threshold {}", posData);
                    //room.createFlag(posData.x, posData.y, 'R'+(i++), COLOR_WHITE);
                }
            }
        }

        Log.debug("Removing existing road build tasks");
        for (let i=meta.buildData.length-1; i >= 0; i--) {
            let data = meta.buildData[i];
            if (data.structureType == STRUCTURE_ROAD) {
                Log.debug("Removing task: {}", data);
                meta.buildData.splice(i, 1); // delete it
            }
        }

        Log.info("meta.recommendedRoadPositions {}", recommendedRoadPositions);
        for (let j=0; j < recommendedRoadPositions.length; j++) {
            let pos = recommendedRoadPositions[j];
            //Log.debug("Checking for road at: {}", pos);
            // Check the position to see if a road is there already
            let foundConstruction = false;
            let constructionSiteId;
            let foundRoad = false;
            let roadId;
            for (let obj of room.lookAt(pos.x, pos.y)) {
                //Log.debug("Object found: {}", obj);
                if (obj.type == 'constructionSite') {
                    foundConstruction = true;
                    constructionSiteId = obj.constructionSite.id;
                }
                else if (obj.type == 'road') {
                    foundRoad = true;
                    roadId = obj.road.id;
                }
            }

            let newBuild;
            if (foundConstruction) {
                //Log.debug("Adding road build task");
                newBuild = BuildData.new('build', STRUCTURE_ROAD, constructionSiteId);
            }
            else if (foundRoad) {
                Log.debug("Adding road repair task");
                newBuild = BuildData.new('repair', STRUCTURE_ROAD, roadId);
            }
            else {
                Log.debug("Adding road construction site");
                room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
                // get the site id
                //constructionSiteId =
                //meta.buildData.push(BuildData.new('build', STRUCTURE_ROAD, constructionSiteId));
            }

            // Set primary storage
            if (newBuild) {
                let storage = Util.getClosestStorage(BuildData.getBuildTarget(newBuild));
                //Log.debug("primary storage: {}", storage);
                newBuild.primaryStorageId = storage.id;
                newBuild.roadPriority = (recommendedRoadPositions.length - j)/recommendedRoadPositions.length;
                meta.buildData.push(newBuild);
            }
        }
    }

    static refreshPriorities(meta) {
        Log.debug("refreshPriorities");

        for (let buildData of meta.buildData) {
            this.refreshBuildDataPriority(meta, buildData);
        }
    }

    static refreshBuildDataPriority(meta, data) {
        //Log.debug("refreshBuildDataPriority {} {}", meta.id, data);
        if (data.structureType == STRUCTURE_ROAD)
            return;

        let site = BuildData.getBuildTarget(data);
        if (!site) {
            Log.error("data has no buildTargetId!");
            return;
        }

        let priority = Game.time - data.timeCreated;
        let hostiles = site.pos.findInRange(FIND_HOSTILE_CREEPS, 5);
        if (hostiles.length) {
            Log.warn("Hostile creep in proximity of site " + site.id);
            priority = -1;
        }
        else if (!Game.getObjectById(data.primaryStorageId)) {
            Log.info("refreshBuildDataPriority: no primaryStorage found");
            priority = 0;
        }
        else {
            let dist;
            if (data.path && data.path.length) {
                dist = Room.deserializePath(data.path).length;
            }
            else {
                dist = site.pos.getRangeTo(Game.getObjectById(data.primaryStorageId));
            }

            //Log.debug("getSourcePriority dist: " + dist);
            priority += 50 - dist;

            if (data.structureType == STRUCTURE_ROAD) {
                priority += data.roadPriority * 40;
            }
            else {
                // other stuff should come before roads
                priority += 200;
            }
        }

        //Log.debug("Set priority to " + priority);
        data.priority = priority;
    }

    static refreshAssignments(meta) {
        Log.debug("refreshAssignments");
        meta.lastAssignmentRefresh = Game.time;

        let builders = this.getMembersByRole(meta, 'builder');
        let highestPrioBuildData = Util.argMax(meta.buildData, buildData => buildData.priority);
        highestPrioBuildData.workers = [];
        for (let creepName of builders) {
            highestPrioBuildData.workers.push(creepName);
            Log.debug("Assigned builder {} to build task {}", creepName, highestPrioBuildData);

            let creep = Game.creeps[creepName];
            creep.memory.buildTargetId = highestPrioBuildData.buildTargetId;
            creep.memory.buildType = highestPrioBuildData.type;
            creep.memory.path = highestPrioBuildData.path;
            creep.memory.storageId = highestPrioBuildData.primaryStorageId;
            if (highestPrioBuildData.type == STRUCTURE_ROAD) {
                creep.memory.roadPath = highestPrioBuildData.roadPath;
            }
        }
    }

    static onOrderComplete(meta, order, delivery) {
        Log.info("onOrderComplete: meta {}, order {}, delivery {}", meta, order, delivery);
        if (order.type == 'unit') {
            this.addMember(meta, delivery.creepName);
        }
    }

    static recruit(meta, unitType) {
        Log.debug("recruit");
        OrderBook.placeOrder(OrderUnit.new(meta.id, meta.roomName, unitType));
    }

    static shouldRecruit(meta) {
        let builders = this.getMembersByRole(meta, 'builder');
        let distributors = this.getMembersByRole(meta, 'distributor');

        // Make sure the mining team is up and running before recruiting
        let miningTeamSearch = _.filter(Memory.teamList, team => team.type == 'mining' && team.roomName == meta.roomName);
        if (miningTeamSearch.length == 0) {
            Log.error("Error finding mining team in building team shouldRecruit");
            return false;
        }

        let extensions = Game.rooms[meta.roomName].find(FIND_MY_STRUCTURES, {
            filter: {structureType: STRUCTURE_EXTENSION}
        });

        let miningTeam = miningTeamSearch[0];
        Log.debug("shouldRecruit found mining team, it has {} members", miningTeam.members.length);
        if (miningTeam.members.length < 4) {
            return false;
        }
        else if (builders.length < 1)
            return 'builder';
        else if (distributors.length < 1 && extensions.length)
            return 'distributor';
        else
            return false;
    }
}

module.exports = TeamBuilding;
