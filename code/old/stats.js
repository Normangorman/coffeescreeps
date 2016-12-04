/**
 * Created by Ben on 26/11/2016.
 */
let Log = require('logger')('stats', '#000000');
let Util = require('util');

class Stats {
    static get tickHistory() {return 100} // how many ticks to save mining/storing data for
    static get breakdownLogDecayFactor() {return 0.8}
    static get breakdownLogDecayFrequency() {return 300}
    static get breakdownLogDeleteThreshold() {return 3}

    static onInit() {
        Memory.stats = {};
    }

    static onTick() {
        Log.debug("onTick");

        // Update mining/storing data
        for (let roomName in Memory.stats) {
            let data = Memory.stats[roomName];

            if (Util.getTimeSince(data.earliestMemoryTick) > this.tickHistory) {
                data.earliestMemoryTick = Game.time - this.tickHistory;
            }

            for (let type of ['mined', 'stored']) {
                if (data[type].length && data[type][0].tick < Game.time - this.tickHistory) {
                    data[type].shift();
                }
            }
        }

        // Check for  breakdowns
        for (let creepName in Game.creeps) {
            let creep = Game.creeps[creepName];
            if (creep.fatigue > 0) {
                this.logCreepBreakdown(creep.pos);
            }
        }

        // Apply decay to breakdown matrices
        let decay = this.breakdownLogDecayFactor; // might be more optimal?
        if ((Game.time % this.breakdownLogDecayFrequency) == 0) {
            Log.debug("Decaying breakdown log data");
            for (let roomName in Memory.stats) {
                if (!Memory.stats[roomName].breakdowns)
                    continue;

                for (let y in Memory.stats[roomName].breakdowns) {
                    for (let x in Memory.stats[roomName].breakdowns[y]) {
                        Memory.stats[roomName].breakdowns[y][x] *= decay;
                        // Delete cell if below threshold
                        if (Memory.stats[roomName].breakdowns[y][x] < this.breakdownLogDeleteThreshold)
                            delete Memory.stats[roomName].breakdowns[y][x];
                    }

                    // Delete row if all cells have been deleted
                    if (Object.keys(Memory.stats[roomName].breakdowns[y]).length == 0)
                        delete Memory.stats[roomName].breakdowns[y];
                }
            }
        }

        // Log capacities data
        /*
        for (let roomName in Game.rooms) {
            let room = Game.rooms[roomName];
        }
        */


        if (Game.time % 5 == 0)
            this.report();
    }

    static report() {
        for (let roomName in Memory.stats) {
            let minedTotal = this.getLoggedEnergyTotal(roomName, 'mined');
            let storedTotal = this.getLoggedEnergyTotal(roomName, 'stored');
            let minedEt = this.getLoggedEnergyPerTick(roomName, 'mined');
            let storedEt = this.getLoggedEnergyPerTick(roomName, 'stored');
            let theoretical = this.getTheoreticalMaxEnergyPerTick(roomName);
            Log.info("***** STATS REPORT ({}) *****: mined {} ({}), stored {} ({})",
                roomName,
                minedEt, Util.convertToPercentage(minedEt / theoretical),
                storedEt, Util.convertToPercentage(storedEt / minedEt)
                );

            // Debug room breakdowns data
            /*
            if (Memory.stats['sim'].breakdowns) {
                for (let y=0; y < 50; y++) {
                    let line = "";
                    for (let x=0; x < 50; x++) {
                        let strX = ''+x;
                        let strY = ''+y;
                        let addZero = true;
                        if (Memory.stats['sim'].breakdowns[strY]) {
                            let data = Memory.stats['sim'].breakdowns[strY][strX];
                            if (data) {
                                addZero = false;
                                line += data + ',';
                            }
                        }
                        if (addZero) line += '0,';
                    }
                    Log.debug(line);
                }
            }
            */
        }
    }

    static initRoom(roomName) {
        Memory.stats[roomName] = {};
        Memory.stats[roomName].mined = [];
        Memory.stats[roomName].stored = [];
        Memory.stats[roomName].earliestMemoryTick = Game.time;
    }

    static _logEnergy(roomName, amount, minedOrStored) {
        if (!Memory.stats[roomName])
            this.initRoom(roomName);

        Memory.stats[roomName][minedOrStored].push({tick: Game.time, amount: amount});
    }

    static logMinedEnergy(roomName, amount) {
        //Log.debug("STATS logMinedEnergy");
        this._logEnergy(roomName, amount, 'mined');
    }

    static logStoredEnergy(roomName, amount) {
        //Log.debug("STATS logStoredEnergy");
        this._logEnergy(roomName, amount, 'stored');
    }

    static logCreepBreakdown(roomPos) {
        //Log.info("STATS logCreepBreakdown {}", roomPos);
        if (!Memory.stats[roomPos.roomName])
            this.initRoom(roomPos.roomName);

        if (!Memory.stats[roomPos.roomName].breakdowns) {
            Memory.stats[roomPos.roomName].breakdowns = {};
        }

        let breakdownsData = Memory.stats[roomPos.roomName].breakdowns;
        // store in memory as strings because when using integers as keys to an object
        // if say key 10 is created then 1..9 will be too which is inefficient
        let x = '' + roomPos.x;
        let y = '' + roomPos.y;
        if (!breakdownsData[y]) {
            breakdownsData[y] = {};
        }

        if (!breakdownsData[y][x]) {
            breakdownsData[y][x] = 1;
        }
        else {
            breakdownsData[y][x]++;
        }

        //Log.debug("breakdownsData {}", breakdownsData);
    }

    static getSortedCreepBreakdownData(roomName) {
        // Returns data about the breakdowns that creeps have logged recently
        // Data is sorted by the number of times the creeps have stood on that square
        if (!Memory.stats[roomName] || !Memory.stats[roomName].breakdowns) {
            Log.error("getSortedCreepBreakdownData called for {} but no data was found", roomName);
            return false;
        }

        let data = [];
        for (let y in Memory.stats[roomName].breakdowns) {
            for (let x in Memory.stats[roomName].breakdowns[y]) {
                let count = Memory.stats[roomName].breakdowns[y][x];
                let record = {x: parseInt(x), y: parseInt(y), count: count};
                //Log.debug("count {}, record {}", count, record);

                // Insert into appropriate place in data maintaining sort order
                let insertIndex = Util.binaryFind(data, count, item => item.count, -1);
                data.splice(insertIndex, 0, record);
            }
        }
        Log.debug("getSortedCreepBreakdownData: Returning {}", data);
        return data;
    }

    static getLoggedEnergyTotal(roomName, minedOrStored) {
        let data = Memory.stats[roomName];
        let total = 0;
        for (let dataItem of data[minedOrStored])
            total += dataItem.amount;
        return total;
    }

    static getLoggedEnergyPerTick(roomName, minedOrStored) {
        return this.getLoggedEnergyTotal(roomName, minedOrStored) / Util.getTimeSince(Memory.stats[roomName].earliestMemoryTick);
    }

    static getTheoreticalMaxEnergyPerTick(roomName) {
        let sources = Game.rooms[roomName].find(FIND_SOURCES);
        let totalEnergyCapacity = 0;
        for (let source of sources) {
            totalEnergyCapacity += source.energyCapacity;
        }

        return totalEnergyCapacity / 300;
    }
}

module.exports = Stats;