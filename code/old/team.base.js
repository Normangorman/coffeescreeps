/**
 * Created by Ben on 24/11/2016.
 */
let Log = require('logger')('team.base');

class TeamBase {
    static new(type, roomName) {
        Log.debug("new: " + roomName);
        let meta = {};
        meta.id = this.generateNextTeamId();
        meta.type = type;
        meta.roomName = roomName;
        meta.members = [];
        meta.orderBook = [];

        return meta;
    }

    static save(meta) {
        if (!Memory.teamList)
            Memory.teamList = [];
        Memory.teamList.push(meta);
    }

    static generateNextTeamId() {
        if (!Memory.nextTeamId)
            Memory.nextTeamId = 1;

        return Memory.nextTeamId++;
    }

    static getTeamById(teamId) {
        for (let i = 0; i < Memory.teamList.length; i++) {
            if (Memory.teamList[i].id == teamId) {
                return Memory.teamList[i];
            }
        }
        Log.error("getTeamById couldn't find team with id " + teamId);
    }

    static describe(meta) {
        return ("Team(id = " + meta.id +
            ", members(" + meta.members.length + ") = " + JSON.stringify(meta.members) +
            ", roomName=" + meta.roomName +
            ", type=" + meta.type +
            ")");
    }

    static addMember(meta, creepName) {
        meta.members.push(creepName);
        Memory.creeps[creepName].teamId = meta.id;
        this.onAddMember(meta, creepName);
    }

    static removeMember(meta, creepName) {
        Log.debug("removeMember: " + creepName);
        for (let i=0; i < meta.members.length; i++) {
            if (meta.members[i] == creepName) {
                meta.members.splice(i, 1);
                this.onRemoveMember(meta, creepName);
                return true;
            }
        }

        Log.warn("removeMember: member not successfully removed!");
        return false;
    }

    static onOrderComplete(meta, order, delivery) {
        Log.debug("onOrderComplete: " + JSON.stringify(meta) + ", " + JSON.stringify(order) + ", " + JSON.stringify(delivery));
    }

    static shouldRecruit() {
        return false;
    }

    static getMembersByRole(meta, roleType) {
        return _.filter(meta.members, function(creepName) {
            if (Memory.creeps[creepName])
                return Memory.creeps[creepName].role == roleType;
        })
    }

    static errorCheck(meta) {
        for (let name of meta.members) {
            if (!Game.creeps[name]) {
                Log.error("Dead creep in team: " + name + ", " + JSON.stringify(meta));
                this.removeMember(meta, name);
            }
        }
    }
}

module.exports = TeamBase;