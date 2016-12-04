/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('role.base');
let Util = require('util');
let Stats = require('stats');

class Role {
    static assign(creep) {
        Log.debug("assign: " + creep.name);
        creep.memory.role = this.type;

        this.onAssign(creep);
    }

    static getMinimumCost() {
        let minimumCost = _(this.recommendedBody)
            .map(partInfo => partInfo.min * Util.getBodyPartCost(partInfo.type))
            .sum();
        Log.debug("minimum cost for unit " + this.type + ": " + minimumCost);
        return minimumCost;
    }

    static doRecycleCreep(creep) {
        Log.info("doRecycleCreep {}", creep.name);
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            if (spawn.recycleCreep(creep) == ERR_NOT_IN_RANGE)
                creep.moveTo(spawn);
        }
    }

    static fleeNearbyCreeps(creep) {
        Log.debug("{} fleeNearbyCreeps", creep.name);

        // If we are next to another creep then move randomly to prevent stopping them from moving
        let nearbyCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter:
            other => other.name != creep.name &&
            (other.memory.role == 'miner' || other.memory.role == 'builder')});
        if (nearbyCreeps.length) {
            // Move to a random empty position
            let freePositions = Util.getWalkablePositionsNearTo(creep.pos, 1, 1);
            if (freePositions.length) {
                let targetPos = freePositions[Util.getRandomIntInRange(0, freePositions.length-1)];
                creep.move(creep.pos.getDirectionTo(targetPos));
            }
            else {
                Log.error("Creep is near to other creeps but there are no free positions to move to!");
            }
        }
    }

    static myMoveByPath(creep, path, direction) {
        // direction should be -1 or 1 depending on which way to go through the path array
        // first find the closest point on the path to the creep
        // (if we find the point which the creep is on then stop searching)
        // returns error codes:
        // 0 = invalid args
        // 1 = creep has finished moving along path
        // 8 -> 20 = creep is on path so this is creep.move(direction) status code + 20
        // 18 -> 30 = creep is not on path so this is creep.moveTo(position) status code + 30
        if (!creep || !path || !path.length || Math.abs(direction) != 1) {
            Log.error("Error in myMoveByPath args: creep: {}, path: {}, direction: {}",
                creep.name ? creep.name : creep, path, direction);
            return 0;
        }
        Log.debug("myMoveByPath args: creep: {}, path: {}, direction: {}",
            creep.name ? creep.name : creep, path, direction);
        //Log.debug("myMoveByPath: {}, {}", creep.name, direction);

        // Case 1: the creep is at the end of the path
        if (creep.pos.isEqualTo(Util.pathPieceToRoomPos(path[path.length-1], creep.room.name)) && direction == 1 ||
            creep.pos.isEqualTo(Util.pathPieceToRoomPos(path[0], creep.room.name)) && direction == -1) {
            Log.debug("Case 1: Creep already at end of path so returning 1");
            return 1;
        }

        // Case 2: the creep is on the path
        let isOnPath = false;
        let currentPathPieceIndex;
        for (let i=0; i < path.length; i++) {
            let pathPos = Util.pathPieceToRoomPos(path[i], creep.room.name);
            if (creep.pos.isEqualTo(pathPos)) {
                isOnPath = true;
                currentPathPieceIndex = i;
                break;
            }
        }

        if (isOnPath) {
            Log.debug("Case 2: Creep is on path");
            // Check to see if the next square is taken by a creep
            let nextPathPiece = path[currentPathPieceIndex + direction];
            let nextPathPos = Util.pathPieceToRoomPos(nextPathPiece, creep.room.name);
            let directionToMove = creep.pos.getDirectionTo(nextPathPos);

            // if next position isn't occupied then just move to it
            if (!Util.isPositionOccupied(nextPathPos)) {
                let retCode = creep.move(directionToMove);
                Log.debug("Case 2: Next spot is not taken! Attempting to move in direction {} ... {}",
                    directionToMove, Util.errCodeToString(retCode));
            }
            else {
                Log.debug("Case 2: Next spot is taken! NOT IMPLEMENTED YET");
                let retCode = creep.move(directionToMove);
                if (retCode != OK && retCode != ERR_TIRED)
                    Log.unhandledErrCode("move", retCode);
            }
        }
        else {
            // Case 3: the creep is not on the path
            Log.debug("Case 3: Creep not on path");

            // Find the closest point on the path to the creep
            let closestDist = Number.MAX_SAFE_INTEGER;
            let closestPos;
            for (let i=0; i < path.length; i++) {
                let pathPos = Util.pathPieceToRoomPos(path[i], creep.room.name);
                let dist = creep.pos.getRangeTo(pathPos);
                Log.debug("closestDist {}, closestPos {}, pathPos {}, dist {}",
                    closestDist, closestPos, pathPos, dist);

                if (dist < closestDist) {
                    closestDist = dist;
                    closestPos = pathPos;
                }
            }

            if (closestDist > 1) {
                Log.warn("Creep {} is more than 1 square off the nearest path position!", creep.name);
                // Fall back to moveTo
                return creep.moveTo(closestPos);
            }
            else {
                Log.debug("Phew, closestPos only 1 square away", creep.name);
                let direction = creep.pos.getDirectionTo(closestPos);
                if (!Util.isPositionOccupied(closestPos)) {
                    Log.debug("And no one is on it, yay!", creep.name);
                    // Easy, just move onto it
                    return creep.move(direction);
                }
                else {
                    Log.debug("But it's occupied... attempting to move anyway", creep.name);
                    creep.move(direction);
                }
            }
        }
    }
}

module.exports = Role;