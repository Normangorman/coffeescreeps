/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('util', '#FFB6FF');

class Util {
    static getClosestStorageFiltered(roomObj, filterFunc) {
        let targets = roomObj.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_EXTENSION ||
                    structure.structureType == STRUCTURE_SPAWN ||
                    structure.structureType == STRUCTURE_TOWER ||
                    structure.structureType == STRUCTURE_CONTAINER) && filterFunc(structure);
            }
        });

        if (targets.length > 0) {
            return targets[0];
        }
        else {
            Log.info("_getClosestStorageFiltered couldn't find a valid storage.");
        }
    }

    static generateNextUnitNameId() {
        if (!Memory.nextUnitNameId)
            Memory.nextUnitNameId = 1;

        return Memory.nextUnitNameId++;
    }

    static getClosestNonFullStorage(roomObj) {
        return this.getClosestStorageFiltered(roomObj, structure => structure.energy < structure.energyCapacity);
    }

    static getClosestNonEmptyStorage(roomObj) {
        return this.getClosestStorageFiltered(roomObj, structure => structure.energy > 0);
    }

    static getClosestStorage(roomObj) {
        return this.getClosestStorageFiltered(roomObj, structure => true); // include all storages
    }


    /*
    static getFreePositionCloseTo(room, centre, minDist, maxDist) {
        //Log.info("getFreePositionCloseTo: " + room.name + ", " + JSON.stringify(centre) + ", " + minDist + ", " + maxDist);
        if (minDist == undefined) minDist = 0;
        if (maxDist == undefined) maxDist = 5;

        let top = centre.y - maxDist;
        let left = centre.x - maxDist;
        let bottom = centre.y + maxDist;
        let right = centre.x + maxDist;

        // Sort by distance to centre (nearest first)
        let data = room.lookAtArea(top, left, bottom, right, false);

        let positionsToCheck = [];
        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                positionsToCheck.push(new RoomPosition(x,y,room.name));
            }
        }
        positionsToCheck = _(positionsToCheck)
            .filter(p => centre.getRangeTo(p) >= minDist)
            .sortBy(p => centre.getRangeTo(p))
            .value();

        for (let pos of positionsToCheck) {
            let objs = data[pos.y][pos.x];
            if (objs.length == 1 && objs[0].type == 'terrain' && objs[0].terrain != 'wall') {
                //Log.info("getFreePositionCloseTo: found suitable position: " + JSON.stringify(pos));
                return pos;
            }
        }

        Log.warn("getFreePositionCloseTo: could not find suitable position");
    }
    */

    static getBodyPartCost(bodyPart) {
        switch(bodyPart) {
            case MOVE: return 50;
            case WORK: return 100;
            case CARRY: return 50;
            case ATTACK: return 80;
            case RANGED_ATTACK: return 150;
            case HEAL: return 250;
            case CLAIM: return 600;
        }
    }

    static getBodyCost(body) {
        return _(body)
            .map(part => this.getBodyPartCost(part.type))
            .sum();
    }

    static countPartsOnBody(body, part) {
        return _.filter(body, p => p.type == part).length;
    }

    static pathPieceToRoomPos(pathPiece, roomName) {
        return new RoomPosition(pathPiece.x, pathPiece.y, roomName);
    }

    static reverseDirection(direction) {
        // one of the DIRECTION_ constants
        return direction == 4 ? 8 : (direction + 4) % 8;
    }

    static _isPositionWalkable(objs) {
        // Takes a list of objects at the position
        // Returns true/false whether the position is walkable
        // Ignores creeps
        //Log.debug("_isPositionsWalkable {}", objs);
        for (let obj of objs) {
            if (obj.type == 'flag' ||
                obj.type == 'constructionSite' ||
                obj.type == 'structure' && obj.structure.structureType == 'road' ||
                obj.type == 'terrain' && obj.terrain != 'wall' ||
                obj.type == 'creep') {
                continue;
            }
            else {
                return false;
            }
        }
        return true;
    }

    static _isPositionBuildable(objs) {
        // Takes a list of objects at the position
        // Returns true/false whether the position is buildable
        for (let obj of objs) {
            if (obj.type == 'flag' ||
                obj.type == 'terrain' && obj.terrain != 'wall' ||
                obj.type == 'creep') {
                continue;
            }
            else {
                return false;
            }
        }
        return true;
    }

    static isPositionWalkable(pos) {
        //Log.debug("isPositionWalkable: {}", pos);
        return this._isPositionWalkable(Game.rooms[pos.roomName].lookAt(pos));
    }

    static isPositionBuildable(pos) {
        return this._isPositionBuildable(Game.rooms[pos.roomName].lookAt(pos));
    }

    static isPositionOccupied(pos) {
        return pos.findInRange(FIND_CREEPS, 0).length;
    }

    static _getPositionsNearTo(pos, minDist, maxDist, filterFunc) {
        Log.debug("_getPositionsNearTo: pos {}, minDist {}, maxDist {}, filterFunc {}",
            pos, minDist, maxDist, '[func]');
        if (minDist == undefined)
            minDist = 0;
        if (maxDist == undefined)
            maxDist = 1;
        let positions = [];
        let nearbyObjs = Game.rooms[pos.roomName].lookAtArea(
            pos.y-maxDist, pos.x-maxDist, pos.y+maxDist, pos.x+maxDist, false);

        for (let y in nearbyObjs) {
            for (let x in nearbyObjs[y]) {
                if (pos.getRangeTo(new RoomPosition(x, y, pos.roomName)) < minDist) {
                    //Log.debug('too near');
                    continue;
                }

                if (filterFunc(nearbyObjs[y][x])) {
                    //Log.debug("Found (walkable/buildable) position at " + x + ", " + y);
                    positions.push(new RoomPosition(x, y, pos.roomName));
                }

                //Log.debug('no match');
            }
        }

        return positions;
    }

    static getPathTerrainCost(roomName, path) {
        Log.debug("getPathTerrainCost roomName={}, path={}", roomName, path);
        let room = Game.rooms[roomName];
        let pathTerrainCost = 0;

        for (let piece of path) {
            let hasRoad = false;
            let terrain;
            for (let obj of room.lookAt(piece.x, piece.y)) {
                //Log.debug("({}, {}) found obj: {}", piece.x, piece.y, obj);
                if (obj.type == 'structure' && obj.structureType == 'road') {
                    hasRoad = true;
                    break;
                }
                else if (obj.type == 'terrain') {
                    terrain = obj.terrain;
                    break;
                }
            }

            if (hasRoad)
                pathTerrainCost += 1;
            else if (terrain == 'plain')
                pathTerrainCost += 2;
            else if (terrain == 'swamp')
                pathTerrainCost += 10;
            else
                Log.error("Unrecognized terrain type: {}", terrain);
        }

        return pathTerrainCost;
    }

    static getWalkablePositionsNearTo(pos, minDist, maxDist) {
        Log.debug("getWalkablePositionsNearTo");
        return this._getPositionsNearTo(pos, minDist, maxDist, this._isPositionWalkable);
    }

    static getBuildablePositionsNearTo(pos, minDist, maxDist) {
        return this._getPositionsNearTo(pos, minDist, maxDist, this._isPositionBuildable);
    }

    static convertToPercentage(num) {
        return (+(Math.round(num + "e+3")  + "e-3")*100)+'%';
    }

    static getTimeSince(tick) {
        return Game.time - tick;
    }

    static getRandomUnitName(roomName, unitType) {
        return roomName + ' ' + unitType + ' ' + this.generateNextUnitNameId();
    }

    static serializeRoomPosition(roomPos) {
        return 'x' + roomPos.x + 'y' + roomPos.y + 'r' + roomPos.roomName;
    }

    static deserializeRoomPosition(serialized) {
        //Log.debug("deserializedRoomPosition: " + serialized);
        let re = /x(\d+)y(\d+)r(.+)/;
        let match = serialized.match(re);
        let x = match[1];
        let y = match[2];
        let room = match[3];
        //Log.debug("returning: {}", new RoomPosition(x,y,room));
        return new RoomPosition(x,y,room);
    }

    static binaryFind(array, searchValue, itemToValue, order) {
        // Takes an array, an value to insert or find, a function which should return the value of an item in the list
        // and either 1 or -1 to specify order (lowest to highest or highest to lowest)
        //Log.debug("binaryFind: {}, {}, {}, {}", array, searchValue, 'func', order);
        if (!array.length) {
            Log.debug("binaryFind: given empty array!");
            return {found: false, index: 0};
        }

        let minIndex = 0;
        let maxIndex = array.length - 1;
        let currentIndex;
        let currentValue;

        let gt = (a,b) => a > b;
        let lt = (a,b) => a < b;
        while (minIndex <= maxIndex) {
            currentIndex = (minIndex + maxIndex) / 2 | 0;
            currentValue = itemToValue(array[currentIndex]);

            if ((order == 1 ? lt : gt)(currentValue, searchValue)) {
                minIndex = currentIndex + 1;
            }
            else if ((order == 1 ? gt : lt)(currentValue, searchValue)) {
                maxIndex = currentIndex - 1;
            }
            else {
                return { // Modification
                    found: true,
                    index: currentIndex
                };
            }
        }

        return { // Modification
            found: false,
            index: (order == 1 ? lt : gt)(currentValue, searchValue) ? currentIndex + 1 : currentIndex
        };
    }

    static argMax(array, valueFunc) {
        //Log.debug("argMax {}, {}", array, 'func');
        let maxVal = Number.MIN_SAFE_INTEGER;
        let maxItem;
        for (let item of array) {
            let value = valueFunc(item);
            //console.log(item, value, maxVal, maxItem);
            if (value > maxVal) {
                maxVal = value;
                maxItem = item;
            }
        }
        return maxItem;
    }

    static argMin(array, valueFunc) {
        return this.argMax(array, x => -valueFunc(x));
    }

    static errCodeToString(err) {
        switch (err) {
            case OK: return "OK";
            case ERR_NOT_IN_RANGE: return "ERR_NOT_IN_RANGE";
            case ERR_BUSY: return "ERR_BUSY";
            case ERR_FULL: return "ERR_FULL";
            case ERR_GCL_NOT_ENOUGH: return "ERR_GCL_NOT_ENOUGH";
            case ERR_INVALID_ARGS: return "ERR_INVALID_ARGS";
            case ERR_INVALID_TARGET: return "ERR_INVALID_TARGET";
            case ERR_NAME_EXISTS: return "ERR_NAME_EXISTS";
            case ERR_NO_BODYPART: return "ERR_NO_BODYPART";
            case ERR_NO_PATH: return "ERR_NO_PATH";
            case ERR_NOT_ENOUGH_ENERGY: return "ERR_NOT_ENOUGH_ENERGY";
            case ERR_NOT_ENOUGH_EXTENSIONS: return "ERR_NOT_ENOUGH_EXTENSIONS";
            case ERR_NOT_ENOUGH_RESOURCES: return "ERR_NOT_ENOUGH_RESOURCES";
            case ERR_NOT_FOUND: return "ERR_NOT_FOUND";
            case ERR_NOT_OWNER: return "ERR_NOT_OWNER";
            case ERR_RCL_NOT_ENOUGH: return "ERR_RCL_NOT_ENOUGH";
            case ERR_TIRED: return "ERR_TIRED";
            default: return "UNKNOWN ERROR CODE";
        }
    }

    static getRandomIntInRange(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static test() {
        Log.info("Running Util tests");
        let assert = function (value, shouldBe, testName) {
            let equal;
            if (typeof value == 'object' && typeof shouldBe == 'object')
                equal = JSON.stringify(value) == JSON.stringify(shouldBe);
            else
                equal = value == shouldBe;

            if (!equal)
                Log.error("Util test failed! {} != {}, {}", value, shouldBe, testName);
        };

        assert(this.getBodyPartCost(MOVE), 50, "getBodyPartCost");
        assert(this.getBodyPartCost(CARRY), 50, "getBodyPartCost");
        assert(this.getBodyPartCost(WORK), 100, "getBodyPartCost");

        let body = [{type: WORK}, {type: WORK}, {type: CARRY}, {type: MOVE}];
        assert(this.getBodyCost(body), 300, "getBodyCost");

        assert(this.countPartsOnBody(body, WORK), 2, "countPartsOnBody");
        assert(this.countPartsOnBody(body, CARRY), 1, "countPartsOnBody");
        assert(this.countPartsOnBody(body, MOVE), 1, "countPartsOnBody");

        assert(this.reverseDirection(TOP_RIGHT), BOTTOM_LEFT, "reverseDirection");
        assert(this.reverseDirection(BOTTOM), TOP, "reverseDirection");
        assert(this.reverseDirection(BOTTOM_RIGHT), TOP_LEFT, "reverseDirection");
        assert(this.reverseDirection(BOTTOM_RIGHT), TOP_LEFT, "reverseDirection");

        let testArr = [{foo:1, value: 5}, {foo: 0, value: 6}, {foo: 1, value: 8}];
        let binaryFindResult = this.binaryFind(testArr, 6, obj => obj.value, 1);
        assert(binaryFindResult.found, true, "binaryFindResult");
        assert(binaryFindResult.index, 1, "binaryFindResult");
        binaryFindResult = this.binaryFind(testArr, 4, obj => obj.value, 1);
        assert(binaryFindResult.found, false, "binaryFindResult");
        assert(binaryFindResult.index, 0, "binaryFindResult");
        binaryFindResult = this.binaryFind(testArr.reverse(), 4, obj => obj.value, -1);
        assert(binaryFindResult.found, false, "binaryFindResult");
        assert(binaryFindResult.index, 3, "binaryFindResult");

        assert(this.argMax([4,5,6], x => x), 6, "argMax");
        assert(this.argMax([{foo: 4}, {foo: 5}, {foo: 6}], x => x.foo), {foo: 6}, "argMax");

        assert(this.getRandomIntInRange(3,3), 3, "getRandomIntInRange");
    }
}

module.exports = Util;