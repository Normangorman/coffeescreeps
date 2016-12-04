/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('main','#FFFFFF');
let TeamUtils = require('team.utils');
let TeamBase = require('team.base');
let TeamMining = require('team.mining');
let TeamBuilding = require('team.building');
let RoleUtils = require('role.utils');
let RoleMiner = require('role.miner');
let RoleHauler = require('role.hauler');
let ControllerUtils = require('controller.utils');
let OrderBook = require('orderbook');
let OrderUnit = require('order.unit');
let Stats = require('stats');
let Util = require('util');

module.exports.loop = function() {
    Log.debug("--------------- main loop ---------------");
    if (!Memory.hasInit) {
        Memory.hasInit = true;

        OrderBook.onInit();
        Stats.onInit();
        Memory.teamList = [];
        initTeams();
    }

    OrderBook.onTick();

    bringOutYourDead();
    controllersOnTick(); // do this first because if we try and spawn units on the same tick as energy is withdrawn from a container shit gets fucked
    teamsOnTick();
    rolesOnTick();

    Stats.onTick();
    errorCheck();
};

function initTeams() {
    Log.info("initTeams");
    for (let roomName in Game.rooms) {
        let room = Game.rooms[roomName];
        let miningTeam = TeamMining.new(roomName);
        TeamMining.save(miningTeam);

        let buildingTeam = TeamBuilding.new(roomName);
        TeamBuilding.save(buildingTeam);
    }
}

function errorCheck() {
    Log.debug("errorCheck");
    for (let creepName in Game.creeps) {
        let creep = Game.creeps[creepName];
        if (creep.spawning)
            continue;
        else if (!creep.memory.teamId) {
            Log.error("Creep has no team: " + creep.name);
        }
        else {
            let team = TeamBase.getTeamById(creep.memory.teamId);
            if (team == undefined) {
                Log.error("Creep's team does not exist: " + JSON.stringify(creep));
            }
            else {
                let found = false;
                for (let member of team.members) {
                    if (member == creep.name) {
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    Log.error("Creep has teamId = " + creep.memory.teamId + " but it's not registered in that team.");
                }
            }
        }
    }
}

function bringOutYourDead() {
    // Bring out your dead!
    for (let name in Memory.creeps) {
        if (!Memory.creeps[name].spawning && !Game.creeps[name]) {
            Log.info("Clearing out dead creep: " + name);
            for (let teamMeta of Memory.teamList) {
                let teamClass = TeamUtils.getTeamClassByType(teamMeta.type);
                teamClass.removeMember(teamMeta, name);
            }
            delete Memory.creeps[name];
        }
    }
}

function teamsOnTick() {
    Log.debug("teamsOnTick");
    for (let teamMeta of Memory.teamList) {
        let teamClass = TeamUtils.getTeamClassByType(teamMeta.type);
        teamClass.onTick(teamMeta);
    }
}

function rolesOnTick() {
    Log.debug("rolesOnTick");
    // Tick miners before haulers to ensure the transfer protocol works
    let miners = [];
    let haulers = [];
    let others = [];
    for (let creepName in Game.creeps) {
        let creep = Game.creeps[creepName];
        if (creep.spawning)
            continue;
        else if (creep.memory.role == "miner")
            miners.push(creep);
        else if (creep.memory.role == "hauler")
            haulers.push(creep);
        else if (creep.memory.role) {
            others.push(creep);
            let roleClass = RoleUtils.getRoleClassByType(creep.memory.role);
            roleClass.onTick(creep)
        }
        else {
            Log.warn("Creep has no role: " + creep.name);
            handleNoRoleCreep(creep.name);
        }
    }

    for (let creep of miners) { RoleMiner.onTick(creep); }
    for (let creep of haulers) { RoleHauler.onTick(creep); }
    for (let creep of others) { RoleUtils.getRoleClassByType(creep.memory.role).onTick(creep); }
}

function controllersOnTick() {
    Log.debug("controllersOnTick");
    for (let roomName in Game.rooms) {
        let room = Game.rooms[roomName];
        for (let structure of room.find(FIND_MY_STRUCTURES)) {
            let controllerClass = ControllerUtils.getControllerClassByType(structure.structureType);

            if (controllerClass) {
                controllerClass.onTick(structure);
            }
        }
    }
}

function handleNoRoleCreep(creep) {
    Log.info("handleNoRoleCreep: NOT IMPLEMENTED YET " + creep.name);
}