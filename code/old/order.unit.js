/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('order.unit');
let Order = require('order.base');

class OrderUnit extends Order {
    static get type() { return 'unit' }

    static new(teamId, roomName, unitType) {
        Log.debug('new (' + teamId + ', ' + roomName + ', ' + unitType + ')');
        let meta = super.new(teamId, roomName);
        meta.unitType = unitType;
        return meta;
    }
}

module.exports = OrderUnit;