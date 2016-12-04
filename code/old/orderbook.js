/**
 * Created by Ben on 25/11/2016.
 */
let Log = require('logger')('orderbook');
let TeamUtils = require('team.utils');

class OrderBook {
    static onInit() {
        Memory.orderBook = [];
    }

    static onTick() {
        //Log.debug('onTick');
    }

    static placeOrder(order) {
        Log.info("placeOrder: " + JSON.stringify(order));
        Memory.orderBook.push(order);
    }

    static takeOrder(orderId) {
        Log.info("takeOrder: " + orderId);
        let orders = this.getOrdersBy(order => order.id == orderId);
        if (orders.length != 1) {
            Log.error("takeOrder found an invalid number of orders with the id {}: {}", orderId, orders);
            return;
        }
        else {
            orders[0].taken = true;
        }
    }

    static completeOrder(order, delivery) {
        Log.info("completeOrder: " + JSON.stringify(order) + ", " + JSON.stringify(delivery));
        let teamMeta = TeamUtils.getTeamClassByType('base').getTeamById(order.teamId);
        if (!teamMeta) {
            Log.error("completeOrder couldn't find relevant team");
        }
        else {
            let teamClass = TeamUtils.getTeamClassByType(teamMeta.type);
            teamClass.onOrderComplete(teamMeta, order, delivery);
        }

        // Delete order from memory
        let orderIndex = _.findIndex(Memory.orderBook, o => o.id == order.id);
        if (orderIndex == -1) {
            Log.error("completeOrder couldn't find order {}", order);
        }
        else {
            Log.info("deleting completed order {}", Memory.orderBook[orderIndex]);
            Memory.orderBook.splice(orderIndex, 1);
        }
    }

    static getOrdersBy(filterFunc) {
        return _.filter(Memory.orderBook, filterFunc);
    }

    static getNonTakenOrdersByType(type) {
        return this.getOrdersBy(order => !order.taken && order.type == type);
    }
}

module.exports = OrderBook;