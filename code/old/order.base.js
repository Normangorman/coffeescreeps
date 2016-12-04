/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('order.base');

class Order {
    static new(teamId, roomName) {
        Log.debug("new");
        return {
            id: this.generateNextOrderId(),
            type: this.type,
            teamId: teamId,
            roomName: roomName,
            timeCreated: Game.time,
            taken: false
        }
    }

    static generateNextOrderId() {
        if (!Memory.nextOrderId)
            Memory.nextOrderId = 1;

        return Memory.nextOrderId++;
    }
}

module.exports = Order;